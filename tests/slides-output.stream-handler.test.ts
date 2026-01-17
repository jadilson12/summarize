import { describe, expect, it } from 'vitest'
import type { ExtractedLinkContent } from '../packages/core/src/content/link-preview/content/types.js'
import {
  createSlidesSummaryStreamHandler,
  createSlidesTerminalOutput,
} from '../src/run/flows/url/slides-output.js'

const makeStdout = (isTTY: boolean) => {
  const chunks: string[] = []
  const stream = {
    isTTY,
    write: (chunk: string) => {
      chunks.push(String(chunk))
      return true
    },
  } as unknown as NodeJS.WritableStream
  return { stream, chunks }
}

describe('slides summary stream handler', () => {
  it('renders markdown in rich TTY and hides slides section', () => {
    const { stream, chunks } = makeStdout(true)
    const handler = createSlidesSummaryStreamHandler({
      stdout: stream,
      env: { TERM: 'xterm' },
      envForRun: { TERM: 'xterm' },
      plain: false,
      outputMode: 'line',
      clearProgressForStdout: () => {},
    })

    const payload = 'Hello world\n\n### Slides\n[slide:1] hidden'
    handler.onChunk({ streamed: payload, prevStreamed: '' })
    handler.onDone(payload)

    const output = chunks.join('')
    expect(output).toContain('Hello')
    expect(output).not.toContain('Slides')
  })

  it('streams visible text through the output gate', () => {
    const { stream, chunks } = makeStdout(false)
    const handler = createSlidesSummaryStreamHandler({
      stdout: stream,
      env: {},
      envForRun: {},
      plain: true,
      outputMode: 'line',
      clearProgressForStdout: () => {},
    })

    const payload = 'Intro line\n\n### Slides\n[slide:1] hidden'
    handler.onChunk({ streamed: payload, prevStreamed: '' })
    handler.onDone(payload)

    const output = chunks.join('')
    expect(output).toContain('Intro line')
    expect(output).not.toContain('Slides')
  })

  it('handles delta output mode and appends a newline on finalize', () => {
    const { stream, chunks } = makeStdout(false)
    const handler = createSlidesSummaryStreamHandler({
      stdout: stream,
      env: {},
      envForRun: {},
      plain: true,
      outputMode: 'delta',
      clearProgressForStdout: () => {},
    })

    handler.onChunk({ streamed: 'First', prevStreamed: '' })
    handler.onChunk({ streamed: 'Reset', prevStreamed: 'First' })
    handler.onDone('Reset')

    const output = chunks.join('')
    expect(output).toContain('First')
    expect(output).toContain('Reset')
    expect(output.endsWith('\n')).toBe(true)
  })

  it('returns null when slides output is disabled', () => {
    const { stream } = makeStdout(false)
    const extracted: ExtractedLinkContent = {
      url: 'https://example.com',
      title: null,
      description: null,
      siteName: null,
      content: '',
      truncated: false,
      totalCharacters: 0,
      wordCount: 0,
      transcriptCharacters: null,
      transcriptLines: null,
      transcriptWordCount: null,
      transcriptSource: null,
      transcriptionProvider: null,
      transcriptMetadata: null,
      transcriptSegments: null,
      transcriptTimedText: null,
      mediaDurationSeconds: null,
      video: null,
      isVideoOnly: false,
      diagnostics: {},
    }

    const output = createSlidesTerminalOutput({
      io: { env: {}, envForRun: {}, stdout: stream, stderr: stream },
      flags: { plain: true, lengthArg: { kind: 'preset', preset: 'short' } },
      extracted,
      slides: null,
      enabled: false,
      clearProgressForStdout: () => {},
    })

    expect(output).toBeNull()
  })

  it('renders slide summaries with transcript fallback', async () => {
    const { stream, chunks } = makeStdout(false)
    const extracted: ExtractedLinkContent = {
      url: 'https://example.com',
      title: null,
      description: null,
      siteName: null,
      content: '',
      truncated: false,
      totalCharacters: 0,
      wordCount: 0,
      transcriptCharacters: null,
      transcriptLines: null,
      transcriptWordCount: null,
      transcriptSource: null,
      transcriptionProvider: null,
      transcriptMetadata: null,
      transcriptSegments: null,
      transcriptTimedText: '[00:15] Fallback text',
      mediaDurationSeconds: null,
      video: null,
      isVideoOnly: false,
      diagnostics: {},
    }

    const slides = {
      sourceUrl: 'https://example.com',
      sourceKind: 'youtube',
      sourceId: 'abc',
      slidesDir: '/tmp/slides',
      slidesDirId: null,
      sceneThreshold: 0.3,
      autoTuneThreshold: false,
      autoTune: { enabled: false, chosenThreshold: 0, confidence: 0, strategy: 'none' },
      maxSlides: 10,
      minSlideDuration: 5,
      ocrRequested: false,
      ocrAvailable: false,
      slides: [
        { index: 1, timestamp: 10, imagePath: '/tmp/1.png' },
        { index: 2, timestamp: 20, imagePath: '/tmp/2.png' },
      ],
      warnings: [],
    }

    const output = createSlidesTerminalOutput({
      io: { env: {}, envForRun: {}, stdout: stream, stderr: stream },
      flags: { plain: true, lengthArg: { kind: 'preset', preset: 'short' } },
      extracted,
      slides,
      enabled: true,
      clearProgressForStdout: () => {},
    })

    expect(output).not.toBeNull()
    await output?.renderFromSummary(['### Slides', '[slide:1] Model text', '[slide:2]'].join('\n'))

    const outputText = chunks.join('')
    expect(outputText).toContain('Slide 1')
    expect(outputText).toContain('Model text')
    expect(outputText).toContain('Fallback text')
  })
})
