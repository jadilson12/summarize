import { fetchWithTimeout } from '../../../fetch-with-timeout.js'
import { decodeHtmlEntities, sanitizeYoutubeJsonResponse } from '../../utils.js'
import { extractYoutubeiBootstrap } from './api.js'

interface YoutubeTranscriptContext {
  html: string
  originalUrl: string
  videoId: string
}

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

type YoutubePlayerContext = Record<string, unknown> & { client?: unknown }
type CaptionsPayload = Record<string, unknown> & {
  captions?: unknown
  playerCaptionsTracklistRenderer?: unknown
}
type CaptionListRenderer = Record<string, unknown> & {
  captionTracks?: unknown
  automaticCaptions?: unknown
}
type CaptionTrackRecord = Record<string, unknown> & {
  languageCode?: unknown
  kind?: unknown
  baseUrl?: unknown
}
type CaptionEventRecord = Record<string, unknown> & { segs?: unknown }
type CaptionSegmentRecord = Record<string, unknown> & { utf8?: unknown }

export const fetchTranscriptFromCaptionTracks = async (
  fetchImpl: typeof fetch,
  { html, originalUrl, videoId }: YoutubeTranscriptContext
): Promise<string | null> => {
  const bootstrap = extractYoutubeiBootstrap(html)
  if (!bootstrap) {
    return null
  }

  const { apiKey, context } = bootstrap
  if (!apiKey) {
    return null
  }

  const contextRecord = context as YoutubePlayerContext
  const clientContext = isObjectLike(contextRecord.client)
    ? (contextRecord.client as Record<string, unknown>)
    : {}
  const requestBody: Record<string, unknown> = {
    context: {
      ...contextRecord,
      client: {
        ...clientContext,
        originalUrl,
      },
    },
    videoId,
    playbackContext: {
      contentPlaybackContext: {
        html5Preference: 'HTML5_PREF_WANTS',
      },
    },
    contentCheckOk: true,
    racyCheckOk: true,
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      return null
    }

    const raw = await response.text()
    const sanitized = sanitizeYoutubeJsonResponse(raw)
    const parsed: unknown = JSON.parse(sanitized)
    if (!isObjectLike(parsed)) {
      return null
    }
    return await extractTranscriptFromPlayerPayload(fetchImpl, parsed)
  } catch {
    return null
  }
}

const extractTranscriptFromPlayerPayload = async (
  fetchImpl: typeof fetch,
  payload: Record<string, unknown>
): Promise<string | null> => {
  const payloadRecord = payload as CaptionsPayload
  const captionsCandidate = payloadRecord.captions
  const captions = isObjectLike(captionsCandidate) ? (captionsCandidate as CaptionsPayload) : null
  if (!captions) {
    return null
  }

  const rendererCandidate = (captions as CaptionsPayload).playerCaptionsTracklistRenderer
  const renderer = isObjectLike(rendererCandidate)
    ? (rendererCandidate as CaptionListRenderer)
    : null
  const captionTracks = Array.isArray(renderer?.captionTracks)
    ? (renderer?.captionTracks as unknown[])
    : null
  const automaticTracks = Array.isArray(renderer?.automaticCaptions)
    ? (renderer?.automaticCaptions as unknown[])
    : null

  const orderedTracks: Record<string, unknown>[] = []
  if (captionTracks) {
    orderedTracks.push(
      ...captionTracks.filter((track): track is Record<string, unknown> => isObjectLike(track))
    )
  }
  if (automaticTracks) {
    orderedTracks.push(
      ...automaticTracks.filter((track): track is Record<string, unknown> => isObjectLike(track))
    )
  }
  const seenLanguages = new Set<string>()
  const normalizedTracks: Record<string, unknown>[] = []
  for (const candidate of orderedTracks) {
    if (!isObjectLike(candidate)) {
      continue
    }
    const trackRecord = candidate as CaptionTrackRecord
    const languageCandidate = trackRecord.languageCode
    const lang = typeof languageCandidate === 'string' ? languageCandidate.toLowerCase() : ''
    if (lang && seenLanguages.has(lang)) {
      continue
    }
    if (lang) {
      seenLanguages.add(lang)
    }
    normalizedTracks.push(candidate)
  }

  const sortedTracks = [...normalizedTracks].toSorted((a, b) => {
    const aTrack = a as CaptionTrackRecord
    const bTrack = b as CaptionTrackRecord
    const aKind = typeof aTrack.kind === 'string' ? aTrack.kind : ''
    const bKind = typeof bTrack.kind === 'string' ? bTrack.kind : ''
    if (aKind === 'asr' && bKind !== 'asr') {
      return -1
    }
    if (bKind === 'asr' && aKind !== 'asr') {
      return 1
    }
    const aLang = typeof aTrack.languageCode === 'string' ? aTrack.languageCode : ''
    const bLang = typeof bTrack.languageCode === 'string' ? bTrack.languageCode : ''
    if (aLang === 'en' && bLang !== 'en') {
      return -1
    }
    if (bLang === 'en' && aLang !== 'en') {
      return 1
    }
    return 0
  })

  return await findFirstTranscript(fetchImpl, sortedTracks, 0)
}

const findFirstTranscript = async (
  fetchImpl: typeof fetch,
  tracks: readonly Record<string, unknown>[],
  index: number
): Promise<string | null> => {
  if (index >= tracks.length) {
    return null
  }
  const candidate = await downloadCaptionTrack(fetchImpl, tracks[index] ?? {})
  if (candidate) {
    return candidate
  }
  return findFirstTranscript(fetchImpl, tracks, index + 1)
}

const downloadCaptionTrack = async (
  fetchImpl: typeof fetch,
  track: Record<string, unknown>
): Promise<string | null> => {
  const trackRecord = track as CaptionTrackRecord
  const baseUrl = typeof trackRecord.baseUrl === 'string' ? trackRecord.baseUrl : null
  if (!baseUrl) {
    return null
  }

  const transcriptUrl = (() => {
    try {
      const parsed = new URL(baseUrl)
      parsed.searchParams.set('fmt', 'json3')
      parsed.searchParams.set('alt', 'json')
      return parsed.toString()
    } catch {
      const separator = baseUrl.includes('?') ? '&' : '?'
      return `${baseUrl}${separator}fmt=json3&alt=json`
    }
  })()

  try {
    const response = await fetchWithTimeout(fetchImpl, transcriptUrl)
    if (!response.ok) {
      return null
    }

    const text = await response.text()
    const jsonResult = parseJsonTranscript(text)
    if (jsonResult) {
      return jsonResult
    }
    return parseXmlTranscript(text)
  } catch {
    return null
  }
}

type CaptionPayload = { events?: unknown }

const parseJsonTranscript = (raw: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isObjectLike(parsed)) {
      return null
    }
    const payloadRecord = parsed as CaptionPayload
    const eventsUnknown = payloadRecord.events
    if (!Array.isArray(eventsUnknown)) {
      return null
    }
    const events = eventsUnknown
    const lines: string[] = []
    for (const event of events) {
      if (!isObjectLike(event)) {
        continue
      }
      const eventRecord = event as CaptionEventRecord
      const segs = Array.isArray(eventRecord.segs) ? (eventRecord.segs as unknown[]) : null
      if (!segs) {
        continue
      }
      const text = segs
        .map((seg) => {
          if (!isObjectLike(seg)) {
            return ''
          }
          const segRecord = seg as CaptionSegmentRecord
          return typeof segRecord.utf8 === 'string' ? segRecord.utf8 : ''
        })
        .join('')
        .trim()
      if (text.length > 0) {
        lines.push(text)
      }
    }
    const transcript = lines.join('\n').trim()
    return transcript.length > 0 ? transcript : null
  } catch {
    return null
  }
}

const parseXmlTranscript = (xml: string): string | null => {
  const pattern = /<text[^>]*>([\s\S]*?)<\/text>/gi
  const lines: string[] = []
  let match: RegExpExecArray | null = pattern.exec(xml)
  while (match) {
    const content = match[1] ?? ''
    const decoded = decodeHtmlEntities(content).replaceAll(/\s+/g, ' ').trim()
    if (decoded.length > 0) {
      lines.push(decoded)
    }
    match = pattern.exec(xml)
  }
  const transcript = lines.join('\n').trim()
  return transcript.length > 0 ? transcript : null
}
