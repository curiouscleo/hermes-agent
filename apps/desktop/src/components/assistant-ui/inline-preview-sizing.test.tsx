import { act, cleanup, render, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, expect, it, vi } from 'vitest'

import type { HermesReadFileTextResult } from '@/global'

import { InlinePreviewDirective, withInlineChrome } from './inline-preview-directive'

const readDesktopFileText = vi.fn<(path: string) => Promise<HermesReadFileTextResult>>()
vi.mock('@/lib/desktop-fs', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readDesktopFileText: (path: string) => readDesktopFileText(path)
}))
vi.mock('@/app/chat/session-view', () => ({
  useSessionView: () => ({ $cwd: atom(''), $storedId: atom(''), $runtimeId: atom('') })
}))

afterEach(() => {
  cleanup()
  readDesktopFileText.mockReset()
})

it('measures short content independently of the viewport, including classic horizontal scrollbars', () => {
  for (const [boxHeight, clientWidth, scrollWidth, scrollbar, contentHeight, expected] of [
    [40.2, 900, 900, 0, 280, 41],
    [244, 484, 836, 15, 265, 259],
    [244, 900, 900, 15, 265, 244],
    [280, 900, 900, 0, 600, 600]
  ]) {
    const posted: Array<{ height: number }> = []

    const doc = {
      body: { children: [], scrollHeight: 280 },
      documentElement: {
        clientHeight: 280 - scrollbar,
        clientWidth,
        scrollWidth,
        scrollHeight: contentHeight,
        getBoundingClientRect: () => ({ height: boxHeight })
      }
    }

    // Execute the actual scripts sent to srcdoc, not a copy of the sizing algorithm.
    const html = withInlineChrome('<body></body>', 'tok', '')

    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      new Function('document', 'parent', 'window', 'addEventListener', 'ResizeObserver', 'innerHeight', script[1])(
        doc,
        { postMessage: (data: { height: number }) => posted.push(data) },
        {},
        () => {},
        undefined,
        280
      )
    }

    expect(posted[0].height).toBe(expected)
  }
})

it('applies small heights and grows fixed frames without shrinking on a reflow report', async () => {
  readDesktopFileText.mockResolvedValue({ path: '/work/widget.html', text: '<body>widget</body>' })
  const { container } = render(<InlinePreviewDirective attrs={{ file: '/work/widget.html' }} streaming={false} />)

  const frame = await waitFor(() => {
    const found = container.querySelector('iframe')
    expect(found).not.toBeNull()

    return found!
  })

  const token = /var t="([^"]+)"/.exec(frame.srcdoc)![1]
  const box = frame.parentElement!

  for (const [height, width, expectedWidth] of [
    [244, 836, 836],
    [41, 600, 836],
    [41, 900, 900]
  ]) {
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { height, width, viewport: 964, token, type: 'hermes-inline-preview-size' }
        })
      )
    )
    expect(box.style.width).toBe(`${expectedWidth}px`)
    expect(box.style.height).toBe(`${height}px`)
  }
})

it('falls back to the file card instead of executing a truncated HTML document', async () => {
  readDesktopFileText.mockResolvedValue({ path: '/work/widget.html', text: '<body>cut off', truncated: true })
  const { container } = render(<InlinePreviewDirective attrs={{ file: '/work/widget.html' }} streaming={false} />)
  await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull())
  expect(readDesktopFileText).toHaveBeenCalledWith('/work/widget.html')
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.textContent).toContain('widget.html')
})
