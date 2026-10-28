## What does this PR do?

Keeps markdown table words intact and gives short row-label columns useful width, including tables inside tool details. This completes #128590's stated intent: **“cells already wrap at word boundaries”**; `overflow-wrap:anywhere` **“starves the short columns”**.

The actual assistant-message and CompactMarkdown wrappers carry `wrap-anywhere`, which their body cells inherit. `anywhere` contributes character-level break opportunities to min-content sizing. The old browser test hand-built a table without that ancestor, so it did not catch the mismatch.

## Related Issue

Fixes #145797. Follow-up to #128590 / #70451.

## Type of Change

- [x] 🐛 Bug fix (non-breaking change that fixes an issue)

## Changes Made

- `markdown-table.tsx`: `MarkdownTd` overrides inherited wrapping with `wrap-break-word`; links still break anywhere. An inner span gives first-column labels their natural width capped at `30cqi`, only in automatic layout. The scroll wrapper is the size container; the span can still fill a wider cell.
- `markdown-text.tsx`: uses that cell renderer, retaining decorated text.
- `compact-markdown.tsx`: applies the same word/link wrap rule to tool-body cells. File-preview cells already compute normal wrapping; no change there.
- Resized tables retain the user's layout. Stored column widths get a 48px floor using container-relative lengths (Chromium does not resolve mixed `%`/px `max()` on columns). Drag math uses the same wrapper reference, so a drag does not jump when the floors have made the table wider than its wrapper.
- `e2e/markdown-overflow.spec.ts`: adds the missing ancestor and bundles the **actual production renderers** for geometry assertions, rather than duplicating their markup. Covers ordinary word width, a one-line short label, transcript containment, and dragging a previously resized/narrowed table. Also recognizes the current `main-*.css` bundle name.

Trade-off: at very narrow widths, preserving words can make the table scroll horizontally **inside its own card**. No transcript-wide horizontal scroll and no forced equal-width columns.

## How to Test

1. Ask for a four-column markdown table, with an empty first header, labels `Upstream files touched` and `Short label`, and long prose in the other three columns.
2. Narrow the message column to 584px and 384px. Repeat in a tool body. Words should stay intact; the short transcript label should stay on one line where it fits. Drag a column, narrow the window, then drag again: the seam must follow the pointer without a jump.
3. From `apps/desktop`: `npm run build`, then `npx playwright test e2e/markdown-overflow.spec.ts --workers=1`.

### Before / after

Fresh upstream-source regression on main `19949783b2` versus this branch (cell **content width**, excluding padding):

| Renderer / column | Main | This PR | Required longest word |
|---|---:|---:|---:|
| transcript / 584px | 21px, short label 4 lines | 150px, 1 line | 63px |
| transcript / 384px | 17px, 6 lines | 115px, 1 line | 63px |
| compact / 584px | 19px, 4 lines | 56px, 2 lines | 53px |
| compact / 384px | 15px, 6 lines | 53px, 2 lines | 53px |

The new regression fails on main for the intended assertions, not an import/setup failure. The original containment test passes on both. On the fix, both Playwright tests pass.

The original interactive research used a different four-column comparison fixture: first-column **outer** width 101→173px at a 1280px window, 62→173px at 900, 52→161px at 800, 42→131px at 700. At 700px the decided cost is 65px of table-local horizontal scroll. Those measurements were reverified in an implemented downstream build before this port.

## Checklist

### Code

- [x] I've read the Contributing Guide.
- [x] Commit messages follow Conventional Commits.
- [x] I searched open and closed issues/PRs; no matching table fix is on main.
- [x] Only changes related to this fix.
- [ ] Full Python `pytest tests/ -q` suite — not run; renderer-only change. The documented Python runner would be `scripts/run_tests.sh`.
- [x] `python scripts/check`: all 13 checks pass, 0 blocking/advisory findings.
- [x] Added regression tests, proven red on main.
- [x] Tested on macOS 26.6: production desktop build, Chromium geometry, `npm run typecheck`, changed-source ESLint, and 898 UI tests across the assistant-ui/chat directories.

### Documentation & Housekeeping

- [x] Relevant documentation: inline implementation comments; no public API change.
- [x] Configuration keys: N/A.
- [x] Architecture/workflow docs: N/A.
- [x] Cross-platform impact considered: Chromium layout, table-local scroll, no native platform changes.
- [x] Tool descriptions/schemas: N/A.

## Screenshots / Logs

Cropped research screenshots at a 900px window. The “after” image shows the proposed rules injected during the initial investigation; the same geometry was subsequently reproduced with the implemented fix. These are an illustrative implementation-comparison table, not application/sidebar state.

| Before | After |
|---|---|
| ![Before: row labels break into fragments](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/cmp-v0-900.webp) | ![After: row labels retain their width](https://raw.githubusercontent.com/curiouscleo/hermes-agent/9c40041d039d03047a4bc2989ec286df40fe113f/cmp-v9-900.webp) |

The Playwright spec attaches measured geometry as JSON. GitHub-hosted CI is separate from the local checks above; fork workflows may require maintainer approval.
