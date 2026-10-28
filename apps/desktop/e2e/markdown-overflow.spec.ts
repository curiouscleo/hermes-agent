import fs from 'node:fs'
import path from 'node:path'

import { build } from 'esbuild'

import { type NoProviderFixture, setupNoProvider } from './fixtures'
import { expect, test } from './test'

const LONG_TOKEN = 'x'.repeat(500)

function rendererCss(): string {
  const assetsDir = path.resolve(import.meta.dirname, '..', 'dist', 'assets')
  const stylesheet = fs.readdirSync(assetsDir).find(file => /^(?:index|main)-.*\.css$/.test(file))

  if (!stylesheet) {
    throw new Error(`Desktop renderer stylesheet not found in ${assetsDir}`)
  }

  return fs.readFileSync(path.join(assetsDir, stylesheet), 'utf8')
}

let fixture: NoProviderFixture | null = null

test.beforeAll(async () => {
  fixture = await setupNoProvider()
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test('constrains prose while tables and code scroll inside their own cards', async () => {
  const page = fixture!.page

  await page.setContent(`
    <style>${rendererCss()}</style>
    <main
      class="aui-md prose w-full min-w-0 max-w-none overflow-hidden wrap-anywhere"
      data-testid="markdown"
      style="width: 320px"
    >
      <p class="wrap-anywhere">${LONG_TOKEN}</p>
      <div class="aui-md-table my-2 max-w-full overflow-x-auto">
        <table class="m-0 w-full min-w-[18rem] border-collapse">
          <thead>
            <tr><th class="wrap-anywhere">Header with a long value</th><th>Other</th></tr>
          </thead>
          <tbody>
            <tr><td class="wrap-break-word">${LONG_TOKEN}</td><td>value</td></tr>
          </tbody>
        </table>
      </div>
      <div data-slot="code-card">
        <div class="[&_pre]:overflow-x-auto [&_pre]:scrollbar-overlay" data-slot="code-card-body">
          <div class="scrollbar-overlay overflow-y-auto overflow-x-auto">
            <pre class="m-0 overflow-hidden" data-testid="code-scroller">
              <code class="block whitespace-pre">${LONG_TOKEN}</code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  `)

  const metrics = await page.getByTestId('markdown').evaluate(async element => {
    const root = element as HTMLElement

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const prose = root.querySelector('p') as HTMLElement
    const tableWrapper = root.querySelector('.aui-md-table') as HTMLElement
    const codeScroller = root.querySelector('[data-testid="code-scroller"]') as HTMLElement

    return {
      codeClientWidth: codeScroller.clientWidth,
      codeOverflowX: getComputedStyle(codeScroller).overflowX,
      codeScrollWidth: codeScroller.scrollWidth,
      proseClientWidth: prose.clientWidth,
      proseScrollWidth: prose.scrollWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      tableClientWidth: tableWrapper.clientWidth,
      tableOverflowX: getComputedStyle(tableWrapper).overflowX,
      tableScrollWidth: tableWrapper.scrollWidth
    }
  })

  expect(metrics.rootClientWidth).toBe(320)
  expect(metrics.rootScrollWidth).toBe(metrics.rootClientWidth)
  expect(metrics.proseScrollWidth).toBe(metrics.proseClientWidth)
  expect(metrics.tableOverflowX).toBe('auto')
  expect(metrics.tableScrollWidth).toBeGreaterThan(metrics.tableClientWidth)
  expect(metrics.codeOverflowX).toBe('auto')
  expect(metrics.codeScrollWidth).toBeGreaterThan(metrics.codeClientWidth)
})

// Unlike hand-written table markup, this bundles the production markdown renderers.
// The message/tool ancestor matters: overflow-wrap is inherited by table cells.
test('table labels keep whole words inside a wrap-anywhere message', async () => {
  const testInfo = test.info()
  const page = fixture!.page

  const bundle = await build({
    stdin: {
      resolveDir: import.meta.dirname,
      loader: 'tsx',
      contents: `
        import { createRoot } from 'react-dom/client'
        import { MarkdownTextContent } from '../src/components/assistant-ui/markdown-text'
        import { CompactMarkdown } from '../src/components/chat/compact-markdown'
        import { markdownTableKey, writeTableWidths } from '../src/lib/markdown-table-widths'
        const prose = 'A longer description with several ordinary words explains the choice and its consequences. '.repeat(4)
        const row = label => '| ' + label + ' | ' + [prose, prose, prose].join(' | ') + ' |'
        const text = ['| | A | B | C |', '| --- | --- | --- | --- |', row('Upstream files touched'), row('Short label')].join('\\n')
        const root = createRoot(document.getElementById('tables'))
        root.render(<>
          <section data-testid="transcript-table"><MarkdownTextContent isRunning={false} text={text} /></section>
          <section data-testid="compact-table"><CompactMarkdown text={text} /></section>
        </>)
        window.addEventListener('test-stored-widths', () => {
          writeTableWidths(markdownTableKey(['', 'A', 'B', 'C']), [5, 5, 45, 45])
          root.render(<MarkdownTextContent key="resized" isRunning={false} text={text} />)
        })
      `
    },
    bundle: true,
    jsx: 'automatic',
    format: 'iife',
    minify: true,
    write: false,
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{}', 'import.meta.hot': 'undefined', 'process.env.NODE_ENV': '"production"' }
  })

  await page.setContent(`<style>${rendererCss()}</style>
    <main id="tables" class="wrap-anywhere" style="width:584px;--conversation-text-font-size:14px;--conversation-caption-font-size:12px"></main>`)
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await expect(page.locator('#tables tbody tr')).toHaveCount(4)

  for (const width of [584, 384]) {
    await page.locator('#tables').evaluate((element, value) => { element.style.width = `${value}px` }, width)

    for (const renderer of ['transcript-table', 'compact-table']) {
      const metrics = await page.getByTestId(renderer).evaluate(async element => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const cell = element.querySelector('tbody td') as HTMLElement
        const label = element.querySelector('tbody tr:nth-child(2) td') as HTMLElement
        const style = getComputedStyle(cell)
        const probe = document.createElement('span')
        probe.textContent = 'Upstream'
        probe.style.cssText = `position:absolute;white-space:nowrap;font:${style.font}`
        document.body.append(probe)
        const longestWord = probe.getBoundingClientRect().width
        probe.remove()
        const range = document.createRange()
        range.selectNodeContents(label.querySelector('[data-md-cell]') ?? label)
        const lines = new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size

        return {
          available: cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          longestWord,
          lines,
          rootWidth: element.clientWidth,
          rootScrollWidth: element.scrollWidth
        }
      })

      console.log('table label metrics', { width, renderer, ...metrics })
      await testInfo.attach(`${renderer}-${width}.json`, { body: JSON.stringify(metrics), contentType: 'application/json' })
      expect.soft(metrics.available).toBeGreaterThanOrEqual(metrics.longestWord - 1)
      expect.soft(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootWidth + 1)

      if (renderer === 'transcript-table' && width === 584) {
        expect.soft(metrics.lines).toBe(1)
      }
    }
  }

  // Stored percentages hit the pixel floors after narrowing. A subsequent drag
  // must use the same wrapper-relative coordinates, not snap the table smaller.
  await page.locator('#tables').evaluate(element => { element.style.width = '400px' })
  await page.evaluate(() => window.dispatchEvent(new Event('test-stored-widths')))
  await expect(page.locator('#tables col')).toHaveCount(4)
  const cells = page.locator('#tables th')
  const before = await cells.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width))
  expect(before[0]).toBeGreaterThanOrEqual(48)
  expect(before[1]).toBeGreaterThanOrEqual(48)
  const handle = page.locator('#tables [data-md-col-handle]').nth(2)
  const bounds = (await handle.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 2, y)
  await page.mouse.up()
  const after = await cells.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width))
  expect(Math.abs(after.reduce((a, b) => a + b) - before.reduce((a, b) => a + b))).toBeLessThan(2)
  expect(after[2] - before[2]).toBeCloseTo(2, 0)
})
