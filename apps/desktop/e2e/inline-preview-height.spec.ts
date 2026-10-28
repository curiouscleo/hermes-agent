import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { build } from 'esbuild'

import { resolveElectronBinary } from './electron-binary'
import { _electron, expect, test } from './test'

// Native layout is essential here: scrollHeight has a viewport floor, whereas
// the root's border box can be shorter OR hide taller overflowing children.
test('inline preview height follows short content and viewport-height roots with overflow', async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), 'hermes-inline-height-'))
  const main = path.join(temporary, 'main.cjs')
  writeFileSync(main, `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(temporary, 'user-data'))});
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1000, height: 800,
    webPreferences: { sandbox: true, contextIsolation: true } });
  window.loadURL('about:blank');
});`)

  const bundle = await build({
    entryPoints: [path.resolve('src/components/assistant-ui/inline-preview-directive.tsx')],
    bundle: true, format: 'iife', globalName: 'InlinePreview', minify: true, write: false,
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{}', 'import.meta.hot': 'undefined', 'process.env.NODE_ENV': '"production"' }
  })

  const app = await _electron.launch({
    executablePath: resolveElectronBinary([path.resolve('.'), path.resolve('../..')]),
    args: ['--no-sandbox', main]
  })

  try {
    const page = await app.firstWindow()
    await page.addScriptTag({ content: bundle.outputFiles[0].text })

    const heights = await page.evaluate(async () => {
      const api = (window as unknown as {
        InlinePreview: {
          withInlineChrome: (doc: string, token: string, prelude: string) => string
          frameSizeFromMessage: (data: unknown, token: string) => { height: number } | null
        }
      }).InlinePreview

      const results: number[] = []

      for (const [css, content] of [
        ['', '<div style="height:41px">short</div>'],
        ['html,body{height:100%}', '<div style="height:600px">tall</div>']
      ]) {
        const frame = document.createElement('iframe')
        frame.setAttribute('sandbox', 'allow-scripts')
        frame.style.cssText = 'width:900px;height:280px;border:0'

        const height = new Promise<number>(resolve => {
          const listener = (event: MessageEvent) => {
            const report = api.frameSizeFromMessage(event.data, 'test')

            if (event.source === frame.contentWindow && report) {
              window.removeEventListener('message', listener)
              resolve(report.height)
            }
          }

          window.addEventListener('message', listener)
        })

        frame.srcdoc = api.withInlineChrome(`<!doctype html><style>html,body{margin:0;padding:0}${css}</style><body>${content}</body>`, 'test', '')
        document.body.append(frame)
        results.push(await height)
        frame.remove()
      }

      return results
    })

    console.log('actual srcdoc heights', heights)
    expect(heights).toEqual([41, 600])
  } finally {
    await app.close()
    rmSync(temporary, { recursive: true, force: true })
  }
})
