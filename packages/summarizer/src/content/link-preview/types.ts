import type { CacheMode as ContractCacheMode } from '../../shared/contracts.js'

export type TranscriptSource =
  | 'youtubei'
  | 'captionTracks'
  | 'apify'
  | 'html'
  | 'unavailable'
  | 'unknown'

export type CacheMode = ContractCacheMode

export type CacheStatus = 'hit' | 'miss' | 'expired' | 'bypassed' | 'fallback' | 'unknown'

export interface TranscriptDiagnostics {
  cacheMode: CacheMode
  cacheStatus: CacheStatus
  textProvided: boolean
  provider: TranscriptSource | null
  attemptedProviders: TranscriptSource[]
  notes?: string | null
}

export interface FirecrawlDiagnostics {
  attempted: boolean
  used: boolean
  cacheMode: CacheMode
  cacheStatus: CacheStatus
  notes?: string | null
}

export interface ContentFetchDiagnostics {
  strategy: 'firecrawl' | 'html'
  firecrawl: FirecrawlDiagnostics
  transcript: TranscriptDiagnostics
}

export interface TranscriptResolution {
  text: string | null
  source: TranscriptSource | null
  diagnostics?: TranscriptDiagnostics
}

export { CACHE_MODES } from '../../shared/contracts.js'
