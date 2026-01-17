import { createMarkdownStreamer, render as renderMarkdownAnsi } from 'markdansi'

import type { ExtractedLinkContent } from '../../../content/index.js'
import type { SummaryLength } from '../../../shared/contracts.js'
import type { SlideExtractionResult, SlideImage, SlideSourceKind } from '../../../slides/index.js'
import { prepareMarkdownForTerminalStreaming } from '../../markdown.js'
import { createSlidesInlineRenderer } from '../../slides-render.js'
import { createStreamOutputGate, type StreamOutputMode } from '../../stream-output.js'
import type { SummaryStreamHandler } from '../../summary-engine.js'
import { isRichTty, markdownRenderWidth, supportsColor } from '../../terminal.js'
import {
  buildTimestampUrl,
  findSlidesSectionStart,
  formatOsc8Link,
  formatTimestamp,
  getTranscriptTextForSlide,
  parseSlideSummariesFromMarkdown,
  parseTranscriptTimedText,
  resolveSlideTextBudget,
  resolveSlideWindowSeconds,
  type SlideTimelineEntry,
} from './slides-text.js'

type SlideState = SlideTimelineEntry & { imagePath: string | null }

function createSlideOutputState(initialSlides: SlideExtractionResult | null | undefined) {
  const slidesByIndex = new Map<number, SlideState>()
  const pending = new Map<number, Array<(value: SlideState | null) => void>>()
  let order: number[] = []
  let slidesDir = initialSlides?.slidesDir ?? ''
  let sourceUrl = initialSlides?.sourceUrl ?? ''
  let done = false

  const updateSlideEntry = (slide: SlideImage) => {
    const existing = slidesByIndex.get(slide.index)
    const next: SlideState = {
      index: slide.index,
      timestamp:
        Number.isFinite(slide.timestamp) && slide.timestamp >= 0
          ? slide.timestamp
          : (existing?.timestamp ?? 0),
      imagePath: slide.imagePath ? slide.imagePath : (existing?.imagePath ?? null),
    }
    slidesByIndex.set(slide.index, next)
    if (slide.imagePath) {
      const waiters = pending.get(slide.index)
      if (waiters && waiters.length > 0) {
        pending.delete(slide.index)
        for (const resolve of waiters) {
          resolve(next)
        }
      }
    }
  }

  const setMeta = (meta: { slidesDir?: string | null; sourceUrl?: string | null }) => {
    if (meta.slidesDir) slidesDir = meta.slidesDir
    if (meta.sourceUrl) sourceUrl = meta.sourceUrl
  }

  const updateFromSlides = (slides: SlideExtractionResult) => {
    slidesDir = slides.slidesDir
    sourceUrl = slides.sourceUrl
    const ordered = slides.slides
      .filter((slide) => Number.isFinite(slide.timestamp))
      .map((slide) => ({ index: slide.index, timestamp: slide.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp)
    order = ordered.map((slide) => slide.index)
    for (const slide of slides.slides) {
      updateSlideEntry(slide)
    }
  }

  if (initialSlides) updateFromSlides(initialSlides)

  const markDone = () => {
    if (done) return
    done = true
    for (const [index, waiters] of pending.entries()) {
      const entry = slidesByIndex.get(index) ?? null
      for (const resolve of waiters) {
        resolve(entry)
      }
    }
    pending.clear()
  }

  const waitForSlide = (index: number): Promise<SlideState | null> => {
    const existing = slidesByIndex.get(index)
    if (existing?.imagePath) return Promise.resolve(existing)
    if (done) return Promise.resolve(existing ?? null)
    return new Promise((resolve) => {
      const list = pending.get(index) ?? []
      list.push(resolve)
      pending.set(index, list)
    })
  }

  return {
    setMeta,
    updateFromSlides,
    updateSlideEntry,
    waitForSlide,
    markDone,
    getSlides: () => order.map((index) => slidesByIndex.get(index)).filter(Boolean) as SlideState[],
    getSlide: (index: number) => slidesByIndex.get(index) ?? null,
    getOrder: () => order.slice(),
    getSlidesDir: () => slidesDir,
    getSourceUrl: () => sourceUrl,
    isDone: () => done,
  }
}

export type SlidesTerminalOutput = {
  onSlidesExtracted: (slides: SlideExtractionResult) => void
  onSlidesDone: (result: { ok: boolean; error?: string | null }) => void
  onSlideChunk: (chunk: {
    slide: SlideImage
    meta: {
      slidesDir: string
      sourceUrl: string
      sourceId: string
      sourceKind: SlideSourceKind
      ocrAvailable: boolean
    }
  }) => void
  streamHandler: SummaryStreamHandler
  renderFromSummary: (summary: string) => Promise<void>
}

export function createSlidesTerminalOutput({
  io,
  flags,
  extracted,
  slides,
  enabled,
  outputMode,
  clearProgressForStdout,
  restoreProgressAfterStdout,
  onProgressText,
}: {
  io: {
    env: Record<string, string | undefined>
    envForRun: Record<string, string | undefined>
    stdout: NodeJS.WritableStream
    stderr: NodeJS.WritableStream
  }
  flags: {
    plain: boolean
    lengthArg: { kind: 'preset'; preset: SummaryLength } | { kind: 'chars'; maxCharacters: number }
  }
  extracted: ExtractedLinkContent
  slides: SlideExtractionResult | null | undefined
  enabled: boolean
  outputMode?: StreamOutputMode | null
  clearProgressForStdout: () => void
  restoreProgressAfterStdout?: (() => void) | null
  onProgressText?: ((text: string) => void) | null
}): SlidesTerminalOutput | null {
  if (!enabled) return null
  const inlineRenderer = !flags.plain
    ? createSlidesInlineRenderer({ mode: 'auto', env: io.envForRun, stdout: io.stdout })
    : null
  const inlineProtocol = inlineRenderer?.protocol ?? 'none'
  const inlineEnabled = inlineProtocol !== 'none'
  const inlineNoticeEnabled = !flags.plain && !inlineEnabled
  let inlineNoticeShown = false

  const state = createSlideOutputState(slides)
  state.setMeta({ sourceUrl: extracted.url })
  const transcriptSegments = parseTranscriptTimedText(extracted.transcriptTimedText)

  const noteInlineUnsupported = (nextSlides: SlideExtractionResult) => {
    if (!inlineNoticeEnabled || inlineNoticeShown) return
    if (!nextSlides.slidesDir) return
    inlineNoticeShown = true
    const reason = isRichTty(io.stdout)
      ? 'terminal does not support inline images'
      : 'stdout is not a TTY'
    clearProgressForStdout()
    io.stderr.write(
      `Slides saved to ${nextSlides.slidesDir}. Inline images unavailable (${reason}).\n`
    )
    const urlArg = JSON.stringify(nextSlides.sourceUrl)
    const dirArg = JSON.stringify(nextSlides.slidesDir)
    io.stderr.write(`Use summarize slides ${urlArg} --output ${dirArg} to export only.\n`)
    restoreProgressAfterStdout?.()
  }

  const onSlidesExtracted = (nextSlides: SlideExtractionResult) => {
    state.updateFromSlides(nextSlides)
    noteInlineUnsupported(nextSlides)
  }

  const onSlideChunk = (chunk: {
    slide: SlideImage
    meta: { slidesDir: string; sourceUrl: string }
  }) => {
    state.setMeta({ slidesDir: chunk.meta?.slidesDir, sourceUrl: chunk.meta?.sourceUrl })
    state.updateSlideEntry(chunk.slide)
  }

  const onSlidesDone = (_result: { ok: boolean; error?: string | null }) => {
    state.markDone()
  }

  const streamHandler: SummaryStreamHandler = createSlidesSummaryStreamHandler({
    stdout: io.stdout,
    env: io.env,
    envForRun: io.envForRun,
    plain: flags.plain,
    outputMode: outputMode ?? 'line',
    clearProgressForStdout,
    restoreProgressAfterStdout,
  })

  const renderFromSummary = async (summary: string) => {
    const slideSummaryByIndex = parseSlideSummariesFromMarkdown(summary)
    const slidesInOrder = state.getSlides()
    if (slidesInOrder.length === 0) return

    const budget = resolveSlideTextBudget({
      lengthArg: flags.lengthArg,
      slideCount: slidesInOrder.length,
    })
    const windowSeconds = resolveSlideWindowSeconds({ lengthArg: flags.lengthArg })

    const slideTexts = new Map<number, string>()
    for (let i = 0; i < slidesInOrder.length; i += 1) {
      const slide = slidesInOrder[i]
      const nextSlide = slidesInOrder[i + 1] ?? null
      const modelText = slideSummaryByIndex.get(slide.index) ?? ''
      if (modelText) {
        slideTexts.set(slide.index, modelText)
        continue
      }
      const fallback = getTranscriptTextForSlide({
        slide,
        nextSlide,
        segments: transcriptSegments,
        budget,
        windowSeconds,
      })
      slideTexts.set(slide.index, fallback)
    }

    const total = slidesInOrder.length
    let rendered = 0

    clearProgressForStdout()
    io.stdout.write('\n')
    restoreProgressAfterStdout?.()

    for (const slide of slidesInOrder) {
      const text = slideTexts.get(slide.index) ?? ''
      const timestampLabel = formatTimestamp(slide.timestamp)
      const timestampUrl = buildTimestampUrl(state.getSourceUrl(), slide.timestamp)
      const timeLink = formatOsc8Link(
        timestampLabel,
        timestampUrl,
        isRichTty(io.stdout) && !flags.plain
      )
      const label = `Slide ${slide.index} · ${timeLink}`

      let imagePath = slide.imagePath ?? null
      if (inlineEnabled) {
        const ready = await state.waitForSlide(slide.index)
        imagePath = ready?.imagePath ?? null
      }

      clearProgressForStdout()
      if (inlineEnabled && imagePath && inlineRenderer) {
        await inlineRenderer.renderSlide(
          { index: slide.index, timestamp: slide.timestamp, imagePath },
          null
        )
      }
      io.stdout.write(`${label}\n`)
      if (text) {
        io.stdout.write(`${text}\n`)
      }
      io.stdout.write('\n')
      restoreProgressAfterStdout?.()

      rendered += 1
      if (onProgressText) {
        onProgressText(`Slides ${rendered}/${total}`)
      }
    }
  }

  return {
    onSlidesExtracted,
    onSlidesDone,
    onSlideChunk,
    streamHandler,
    renderFromSummary,
  }
}

export function createSlidesSummaryStreamHandler({
  stdout,
  env,
  envForRun,
  plain,
  outputMode,
  clearProgressForStdout,
  restoreProgressAfterStdout,
}: {
  stdout: NodeJS.WritableStream
  env: Record<string, string | undefined>
  envForRun: Record<string, string | undefined>
  plain: boolean
  outputMode: StreamOutputMode
  clearProgressForStdout: () => void
  restoreProgressAfterStdout?: (() => void) | null
}): SummaryStreamHandler {
  const shouldRenderMarkdown = !plain && isRichTty(stdout)
  const outputGate = !shouldRenderMarkdown
    ? createStreamOutputGate({
        stdout,
        clearProgressForStdout,
        restoreProgressAfterStdout: restoreProgressAfterStdout ?? null,
        outputMode,
        richTty: isRichTty(stdout),
      })
    : null
  const streamer = shouldRenderMarkdown
    ? createMarkdownStreamer({
        render: (markdown) =>
          renderMarkdownAnsi(prepareMarkdownForTerminalStreaming(markdown), {
            width: markdownRenderWidth(stdout, env),
            wrap: true,
            color: supportsColor(stdout, envForRun),
            hyperlinks: true,
          }),
        spacing: 'single',
      })
    : null

  let wroteLeadingBlankLine = false

  const getVisible = (value: string) => {
    const start = findSlidesSectionStart(value)
    if (start == null) return value
    return value.slice(0, start)
  }

  const handleMarkdownChunk = (visible: string, prevVisible: string) => {
    if (!streamer) return
    const appended = visible.slice(prevVisible.length)
    if (!appended) return
    const out = streamer.push(appended)
    if (!out) return
    clearProgressForStdout()
    if (!wroteLeadingBlankLine) {
      stdout.write(`\n${out.replace(/^\n+/, '')}`)
      wroteLeadingBlankLine = true
    } else {
      stdout.write(out)
    }
    restoreProgressAfterStdout?.()
  }

  return {
    onChunk: ({ streamed, prevStreamed }) => {
      const visible = getVisible(streamed)
      const prevVisible = getVisible(prevStreamed)
      if (outputGate) {
        outputGate.handleChunk(visible, prevVisible)
        return
      }
      handleMarkdownChunk(visible, prevVisible)
    },
    onDone: (finalText) => {
      const visible = getVisible(finalText)
      if (outputGate) {
        outputGate.finalize(visible)
        return
      }
      const out = streamer?.finish()
      if (out) {
        clearProgressForStdout()
        if (!wroteLeadingBlankLine) {
          stdout.write(`\n${out.replace(/^\n+/, '')}`)
          wroteLeadingBlankLine = true
        } else {
          stdout.write(out)
        }
        restoreProgressAfterStdout?.()
      } else if (visible && !wroteLeadingBlankLine) {
        clearProgressForStdout()
        stdout.write(`\n${visible.trim()}\n`)
        restoreProgressAfterStdout?.()
      }
    },
  }
}
