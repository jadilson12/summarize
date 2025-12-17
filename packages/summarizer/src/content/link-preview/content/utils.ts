import type { CacheMode, TranscriptDiagnostics } from '../types.js'
import { applyContentBudget, normalizeCandidate, normalizeForPrompt } from './cleaner.js'
import {
  DEFAULT_CACHE_MODE,
  DEFAULT_MAX_CONTENT_CHARACTERS,
  type ExtractedLinkContent,
  type FetchLinkContentOptions,
  type FinalizationArguments,
  type TranscriptResolution,
} from './types.js'

const WWW_PREFIX_PATTERN = /^www\./i
const TRANSCRIPT_LINE_SPLIT_PATTERN = /\r?\n/

export function resolveCacheMode(options?: FetchLinkContentOptions): CacheMode {
  return options?.cacheMode ?? DEFAULT_CACHE_MODE
}

export function resolveMaxCharacters(options?: FetchLinkContentOptions): number {
  const candidate = options?.maxCharacters
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return DEFAULT_MAX_CONTENT_CHARACTERS
  }
  if (candidate <= DEFAULT_MAX_CONTENT_CHARACTERS) {
    return DEFAULT_MAX_CONTENT_CHARACTERS
  }
  return Math.floor(candidate)
}

export function appendNote(existing: string | null | undefined, next: string): string {
  if (!next) {
    return existing ?? ''
  }
  if (!existing || existing.length === 0) {
    return next
  }
  return `${existing}; ${next}`
}

export function safeHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(WWW_PREFIX_PATTERN, '')
  } catch {
    return null
  }
}

export function pickFirstText(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate)
    if (normalized) {
      return normalized
    }
  }
  return null
}

export function selectBaseContent(sourceContent: string, transcriptText: string | null): string {
  if (!transcriptText) {
    return sourceContent
  }
  const normalizedTranscript = normalizeForPrompt(transcriptText)
  if (normalizedTranscript.length === 0) {
    return sourceContent
  }
  return `Transcript:\n${normalizedTranscript}`
}

export function summarizeTranscript(transcriptText: string | null) {
  if (!transcriptText) {
    return { transcriptCharacters: null, transcriptLines: null }
  }
  const transcriptCharacters = transcriptText.length > 0 ? transcriptText.length : null
  const transcriptLinesRaw = transcriptText
    .split(TRANSCRIPT_LINE_SPLIT_PATTERN)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length
  const transcriptLines = transcriptLinesRaw > 0 ? transcriptLinesRaw : null
  return { transcriptCharacters, transcriptLines }
}

export function ensureTranscriptDiagnostics(
  resolution: TranscriptResolution,
  cacheMode: CacheMode
): TranscriptDiagnostics {
  if (resolution.diagnostics) {
    return resolution.diagnostics
  }
  const hasText = typeof resolution.text === 'string' && resolution.text.length > 0
  let cacheStatus: TranscriptDiagnostics['cacheStatus'] = 'unknown'
  if (cacheMode === 'bypass') {
    cacheStatus = 'bypassed'
  } else if (hasText) {
    cacheStatus = 'miss'
  }
  return {
    cacheMode,
    cacheStatus,
    textProvided: hasText,
    provider: resolution.source,
    attemptedProviders: resolution.source ? [resolution.source] : [],
  }
}

export function finalizeExtractedLinkContent({
  url,
  baseContent,
  maxCharacters,
  title,
  description,
  siteName,
  transcriptResolution,
  diagnostics,
}: FinalizationArguments): ExtractedLinkContent {
  const { content, truncated, totalCharacters, wordCount } = applyContentBudget(
    baseContent,
    maxCharacters
  )
  const { transcriptCharacters, transcriptLines } = summarizeTranscript(transcriptResolution.text)

  return {
    url,
    title,
    description,
    siteName,
    content,
    truncated,
    totalCharacters,
    wordCount,
    transcriptCharacters,
    transcriptLines,
    transcriptSource: transcriptResolution.source,
    diagnostics,
  }
}
