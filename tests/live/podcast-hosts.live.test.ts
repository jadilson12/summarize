import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { runCli } from '../../src/run.js'

const LIVE = process.env.SUMMARIZE_LIVE_TEST === '1'

const collectStream = () => {
  let text = ''
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  return { stream, getText: () => text }
}

const silentStderr = new Writable({
  write(_chunk, _encoding, callback) {
    callback()
  },
})

;(LIVE ? describe : describe.skip)('live podcast hosts', () => {
  const timeoutMs = 180_000

  it(
    'podbean share prefers description-sized content',
    async () => {
      const out = collectStream()
      await runCli(
        [
          '--extract',
          '--json',
          '--timeout',
          '120s',
          'https://www.podbean.com/media/share/dir-6wa7k-29a23114',
        ],
        {
          fetch: globalThis.fetch.bind(globalThis),
          stdout: out.stream,
          stderr: silentStderr,
          env: process.env,
        }
      )

      const payload = JSON.parse(out.getText()) as {
        extracted?: { content?: string; description?: string }
      }
      const description = payload.extracted?.description ?? ''
      const content = payload.extracted?.content ?? ''
      expect(description.length).toBeGreaterThan(80)
      expect(content).toContain(description.slice(0, 60))
      expect(content.length).toBeLessThan(description.length + 40)
    },
    timeoutMs
  )

  it(
    'amazon music episode prefers description-sized content (requires Firecrawl)',
    async () => {
      const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY?.trim() ?? ''
      if (!FIRECRAWL_API_KEY) {
        it.skip('requires FIRECRAWL_API_KEY', () => {})
        return
      }

      const out = collectStream()
      await runCli(
        [
          '--extract',
          '--json',
          '--timeout',
          '120s',
          'https://music.amazon.de/podcasts/61e4318e-659a-46b8-9380-c268b487dc68/episodes/07a8b875-a1d2-4d00-96ea-0bd986c2c7bd/die-j%C3%A4gerin-s2f2-nur-verlierer',
        ],
        {
          fetch: globalThis.fetch.bind(globalThis),
          stdout: out.stream,
          stderr: silentStderr,
          env: process.env,
        }
      )

      const payload = JSON.parse(out.getText()) as {
        extracted?: { content?: string; description?: string }
      }
      const description = payload.extracted?.description ?? ''
      const content = payload.extracted?.content ?? ''
      expect(description.length).toBeGreaterThan(80)
      expect(content).toContain(description.slice(0, 60))
      expect(content.length).toBeLessThan(description.length + 40)
    },
    timeoutMs
  )
})
