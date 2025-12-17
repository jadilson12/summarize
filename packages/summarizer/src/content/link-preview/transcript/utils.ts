import { load } from 'cheerio'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const isYouTubeUrl = (rawUrl: string): boolean => {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    return hostname.includes('youtube.com') || hostname.includes('youtu.be')
  } catch {
    const lower = rawUrl.toLowerCase()
    return lower.includes('youtube.com') || lower.includes('youtu.be')
  }
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/watch')) {
        return url.searchParams.get('v')
      }
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] ?? null
      }
    }
  } catch {
    // Ignore parsing errors for malformed URLs
  }
  return null
}

export function sanitizeYoutubeJsonResponse(input: string): string {
  const trimmed = input.trimStart()
  if (trimmed.startsWith(")]}'")) {
    return trimmed.slice(4)
  }
  return trimmed
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&#x2F;', '/')
    .replaceAll('&nbsp;', ' ')
}

export function extractYoutubeBootstrapConfig(html: string): Record<string, unknown> | null {
  try {
    const $ = load(html)
    const scripts = $('script').toArray()

    for (const script of scripts) {
      const source = $(script).html()
      if (!source) {
        continue
      }

      const config = parseBootstrapFromScript(source)
      if (config) {
        return config
      }
    }
  } catch {
    // fall through to legacy regex
  }

  return parseBootstrapFromScript(html)
}

// Regex only runs on YouTube bootstrap blobs we download ourselves.
// eslint-disable-next-line security/detect-unsafe-regex
const YTCFG_SET_REGEX = /ytcfg\.set\s*\(\s*(?:\)\]\}'\s*)?(\{[\s\S]*?\})\s*\);?/
// eslint-disable-next-line security/detect-unsafe-regex
const YTCFG_VAR_REGEX = /var\s+ytcfg\s*=\s*(\{[\s\S]*?\});?/

function parseBootstrapFromScript(source: string): Record<string, unknown> | null {
  const sanitizedSource = sanitizeYoutubeJsonResponse(source.trimStart())

  const setMatch = sanitizedSource.match(YTCFG_SET_REGEX)
  if (setMatch?.[1]) {
    const sanitized = sanitizeYoutubeJsonResponse(setMatch[1])
    try {
      const parsed: unknown = JSON.parse(sanitized)
      if (isRecord(parsed)) {
        return parsed
      }
    } catch {
      // continue to next pattern
    }
  }

  const variableMatch = sanitizedSource.match(YTCFG_VAR_REGEX)
  if (variableMatch?.[1]) {
    const snippet = variableMatch[1].endsWith(';')
      ? variableMatch[1].slice(0, -1)
      : variableMatch[1]
    const sanitized = sanitizeYoutubeJsonResponse(snippet)
    try {
      const parsed: unknown = JSON.parse(sanitized)
      if (isRecord(parsed)) {
        return parsed
      }
    } catch {
      return null
    }
  }

  return null
}
