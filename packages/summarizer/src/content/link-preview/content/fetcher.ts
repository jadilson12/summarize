import type { FirecrawlScrapeResult, ScrapeWithFirecrawl } from '../deps.js'
import { isYouTubeUrl } from '../transcript/utils.js'
import type { CacheMode, FirecrawlDiagnostics } from '../types.js'

import { appendNote } from './utils.js'

const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

const REQUEST_TIMEOUT_MS = 5000

export interface FirecrawlFetchResult {
  payload: FirecrawlScrapeResult | null
  diagnostics: FirecrawlDiagnostics
}

export async function fetchHtmlDocument(fetchImpl: typeof fetch, url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetchImpl(url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML document (status ${response.status})`)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Fetching HTML document timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchWithFirecrawl(
  url: string,
  cacheMode: CacheMode,
  scrapeWithFirecrawl: ScrapeWithFirecrawl | null
): Promise<FirecrawlFetchResult> {
  const diagnostics: FirecrawlDiagnostics = {
    attempted: false,
    used: false,
    cacheMode,
    cacheStatus: cacheMode === 'bypass' ? 'bypassed' : 'unknown',
    notes: null,
  }

  if (isYouTubeUrl(url)) {
    diagnostics.notes = appendNote(diagnostics.notes, 'Skipped Firecrawl for YouTube URL')
    return { payload: null, diagnostics }
  }

  if (!scrapeWithFirecrawl) {
    diagnostics.notes = appendNote(diagnostics.notes, 'Firecrawl is not configured')
    return { payload: null, diagnostics }
  }

  diagnostics.attempted = true

  try {
    const payload = await scrapeWithFirecrawl(url, { cacheMode })
    if (!payload) {
      diagnostics.notes = appendNote(diagnostics.notes, 'Firecrawl returned no content payload')
      return { payload: null, diagnostics }
    }
    return { payload, diagnostics }
  } catch (error) {
    diagnostics.notes = appendNote(
      diagnostics.notes,
      `Firecrawl error: ${error instanceof Error ? error.message : 'unknown error'}`
    )
    return { payload: null, diagnostics }
  }
}
