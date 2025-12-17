import type { TranscriptCache, TranscriptCacheGetResult } from '../deps.js'
import type { TranscriptDiagnostics, TranscriptResolution, TranscriptSource } from '../types.js'

export type TranscriptService = 'youtube' | 'twitter' | 'podcast' | 'generic'

export interface ProviderContext {
  url: string
  html: string | null
  resourceKey: string | null
}

export interface ProviderFetchOptions {
  fetch: typeof fetch
  apifyApiToken: string | null
}

export interface ProviderResult extends TranscriptResolution {
  metadata?: Record<string, unknown>
  attemptedProviders: TranscriptSource[]
}

export interface ProviderModule {
  id: TranscriptService
  canHandle(context: ProviderContext): boolean
  fetchTranscript(context: ProviderContext, options: ProviderFetchOptions): Promise<ProviderResult>
}

export interface CacheReadResult {
  resolution: TranscriptResolution | null
  diagnostics: Pick<TranscriptDiagnostics, 'cacheStatus' | 'notes' | 'provider' | 'textProvided'>
}

export interface CacheLookupOutcome {
  cached: TranscriptCacheGetResult | null
  result: CacheReadResult
}

export interface CacheWritePayload {
  url: string
  service: TranscriptService
  resourceKey: string | null
  result: ProviderResult
  transcriptCache: TranscriptCache | null
}

export type { TranscriptSource } from '../types.js'
