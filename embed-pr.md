## What does this PR do?

Sizes inline HTML `::preview` frames to their content, bounded by the message column. **Builds on #136590 by @Domanffe (Alexander Krylov)**: its commit `843d8af207` is cherry-picked as the first commit, with authorship preserved, not rewritten. The new commit adds small-content height measurement, growing fixed widths, and a safe fallback for truncated file reads.

I rechecked #136590 before starting: it is still open at the original head and has not merged. The width solution here is that PR's existing fluid/fixed distinction, not another competing width setting.

## Related Issue

Fixes #124769. Refs #112877 and #139520; removes the hard 640px ceiling rather than adding a per-widget configuration option. Builds on #136590; related alternatives #142874, #139525 and #112881. Strict-meta-CSP measurement (#141601) remains separate.

## Type of Change

- [x] 🐛 Bug fix (non-breaking change that fixes an issue)

## Changes Made

- **Width, from #136590:** report viewport width alongside intrinsic content width. First measurable report chooses fluid/full-column or fixed/intrinsic width. Remove the 640px cap; `max-w-full` still bounds the frame. CSS tracks window resizing for fluid widgets.
- **Fixed widths may grow, never shrink:** later wider content is accommodated, but narrower reports cannot start the percentage-width feedback spiral.
- **Height:** use the root content box rather than blindly taking `scrollHeight`, whose viewport floor kept a 41px widget inside a 280px frame. Preserve genuinely overflowing content (`scrollHeight > clientHeight`), including a `height:100%` root with a taller child. Add the horizontal scrollbar height when needed. A measured height may be below 120px; explicit `height=`/placeholder behavior and the 1200px runaway cap stay intact.
- **Truncation:** honor the file reader's `truncated` flag. Files over the preview read's 512KiB limit show the existing file card rather than a half-rendered HTML page with a missing script. No larger file read or new IPC capability.
- Tests execute the actual injected scripts, mount the actual directive with file-reader responses, and measure real sandboxed `srcdoc` frames in Electron.

Sandbox remains `allow-scripts` with an opaque origin. Existing message/token validation and intent bridge are unchanged. No external navigation, storage or filesystem permissions added.

## How to Test

1. Preview the [wide widget](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/wide-widget.html) and [fluid widget](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/fluid-widget.html) using `::preview{file="/path/to/widget.html"}`. At a wide window, the 836px widget should not be squeezed into a 640px frame. The 41px fluid widget should not leave 239px of empty height.
2. Mount the fluid widget in a narrow window, then widen it: it should follow the column. A fixed widget wider than a narrow column should scroll inside its own frame. Check a `html,body{height:100%}` page containing a 600px child still expands to its content.
3. Preview an HTML file over 512KiB: it should become a file card, not execute the truncated prefix.
4. From `apps/desktop`: `npx vitest run --project ui src/components/assistant-ui/inline-preview-directive.test.ts src/components/assistant-ui/inline-preview-sizing.test.tsx`, then `npx playwright test e2e/inline-preview-height.spec.ts --workers=1`.

### Before / after measurements

Interactive research and implemented-downstream smoke, at a 1280px window:

| Fixture | Stock | Fixed |
|---|---|---|
| 836×244px wide widget | 640×265px frame, fourth card behind horizontal scroll | 836×244px frame |
| 41px-high fluid widget | 640×280px frame | fills available frame slot, 41px high |
| fluid widget mounted at 760, widened to 1280 | remains 432px wide | 432→952px |
| 1.1MB HTML widget | truncated DOM, script absent | file card |

At an 800px window, the wide widget fits the available 472px frame slot and scrolls horizontally inside it: 244px high with overlay scrollbars, 259px with a 15px classic scrollbar. A frame slot is slightly narrower than the outer message-column box due to its existing padding.

Fresh upstream-source regressions on `19949783b2`:
- All **3 new unit regressions fail on main and on #136590 alone**, and pass here. Failures are the 280px height floor, the old 640px width / 120px height floor, and an iframe being rendered for a truncated read.
- Real Electron `srcdoc` measurements: main `[280, 600]`, fixed `[41, 600]` for the short widget and the viewport-height-root/overflow fixture. The browser test is red on main and green here.

## Checklist

### Code

- [x] I've read the Contributing Guide.
- [x] Conventional Commit messages; original contributor's commit preserved.
- [x] Searched open/closed issues and PRs; credit and continuation of the existing width fix, not an uncredited duplicate.
- [x] Only changes related to inline-preview sizing/read fallback.
- [ ] Full Python `pytest tests/ -q` suite — not run; renderer-only change. The documented Python runner would be `scripts/run_tests.sh`.
- [x] `python scripts/check`: all 13 checks pass, no blocking/advisory findings.
- [x] New tests proven red on main.
- [x] Tested on macOS 26.6: 34 focused unit tests; all 906 UI tests across assistant-ui/chat; real Electron frame-height regression (4 consecutive passes), production desktop build, `npm run typecheck`, changed-file ESLint.

### Documentation & Housekeeping

- [x] Relevant docs: inline sizing contract comments updated.
- [x] Configuration keys: N/A.
- [x] Architecture/workflow docs: N/A.
- [x] Cross-platform impact considered, including classic horizontal scrollbars; no native platform changes.
- [x] Tool descriptions/schemas: N/A.

## Screenshots / Logs

Cropped synthetic widget screenshots from the initial investigation. “After” uses injected target sizing; the implementation was then reverified in a downstream build and the regressions above on upstream sources. All business metrics are **fictional fixture values**.

| | Before | After |
|---|---|---|
| Wide | ![Wide widget cropped at 640px](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/emb-before-wide-widget-1280.webp) | ![Wide widget fits at 836px](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/emb-after-wide-widget-1280.webp) |
| Fluid | ![Fluid widget with empty vertical space](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/emb-before-fluid-widget-1280.webp) | ![Fluid widget at content height](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/emb-after-fluid-widget-1280.webp) |

GitHub-hosted CI is separate from the local checks above; fork workflows may require maintainer approval.
