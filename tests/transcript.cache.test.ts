import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_TTL_MS,
  mapCachedSource,
  NEGATIVE_TTL_MS,
  readTranscriptCache,
  writeTranscriptCache,
} from '../packages/summarizer/dist/esm/content/link-preview/transcript/cache.js'

describe('transcript cache helpers', () => {
  it('treats missing cache as a miss', async () => {
    const result = await readTranscriptCache({
      url: 'https://example.com',
      cacheMode: 'default',
      transcriptCache: null,
    })
    expect(result.cached).toBeNull()
    expect(result.result.resolution).toBeNull()
    expect(result.result.diagnostics.cacheStatus).toBe('miss')
  })

  it('returns cached transcript on hit', async () => {
    const transcriptCache = {
      get: vi.fn().mockResolvedValue({
        content: 'Cached',
        source: 'youtubei',
        expired: false,
        metadata: null,
      }),
      set: vi.fn().mockResolvedValue(undefined),
    }

    const result = await readTranscriptCache({
      url: 'https://example.com',
      cacheMode: 'default',
      transcriptCache,
    })

    expect(transcriptCache.get).toHaveBeenCalledWith({ url: 'https://example.com' })
    expect(result.result.resolution?.text).toBe('Cached')
    expect(result.result.diagnostics.cacheStatus).toBe('hit')
    expect(result.result.diagnostics.provider).toBe('youtubei')
    expect(result.result.diagnostics.textProvided).toBe(true)
  })

  it('ignores cached transcript when bypass requested', async () => {
    const transcriptCache = {
      get: vi.fn().mockResolvedValue({
        content: 'Cached',
        source: 'youtubei',
        expired: false,
        metadata: null,
      }),
      set: vi.fn().mockResolvedValue(undefined),
    }

    const result = await readTranscriptCache({
      url: 'https://example.com',
      cacheMode: 'bypass',
      transcriptCache,
    })

    expect(result.result.resolution).toBeNull()
    expect(result.result.diagnostics.cacheStatus).toBe('bypassed')
    expect(result.result.diagnostics.notes).toContain(
      'Cached transcript ignored due to bypass request'
    )
  })

  it('marks expired cached transcript as expired', async () => {
    const transcriptCache = {
      get: vi.fn().mockResolvedValue({
        content: 'Cached',
        source: 'youtubei',
        expired: true,
        metadata: null,
      }),
      set: vi.fn().mockResolvedValue(undefined),
    }

    const result = await readTranscriptCache({
      url: 'https://example.com',
      cacheMode: 'default',
      transcriptCache,
    })

    expect(result.result.resolution).toBeNull()
    expect(result.result.diagnostics.cacheStatus).toBe('expired')
    expect(result.result.diagnostics.notes).toContain(
      'Cached transcript expired; fetching fresh copy'
    )
  })

  it('maps unknown cached sources to unknown', () => {
    expect(mapCachedSource('youtubei')).toBe('youtubei')
    expect(mapCachedSource('something-else')).toBe('unknown')
    expect(mapCachedSource(null)).toBeNull()
  })

  it('writes transcript cache with default TTL for positive hits', async () => {
    const transcriptCache = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    }

    await writeTranscriptCache({
      url: 'https://example.com',
      service: 'youtube',
      resourceKey: 'abc',
      result: {
        text: 'Hello',
        source: 'youtubei',
        attemptedProviders: ['youtubei'],
        metadata: { provider: 'youtubei' },
      },
      transcriptCache,
    })

    expect(transcriptCache.set).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com',
        service: 'youtube',
        resourceKey: 'abc',
        ttlMs: DEFAULT_TTL_MS,
        content: 'Hello',
        source: 'youtubei',
      })
    )
  })

  it('writes transcript cache with negative TTL for misses', async () => {
    const transcriptCache = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    }

    await writeTranscriptCache({
      url: 'https://example.com',
      service: 'youtube',
      resourceKey: null,
      result: {
        text: null,
        source: 'unavailable',
        attemptedProviders: ['unavailable'],
        metadata: { provider: 'youtube' },
      },
      transcriptCache,
    })

    expect(transcriptCache.set).toHaveBeenCalledWith(
      expect.objectContaining({
        ttlMs: NEGATIVE_TTL_MS,
        content: null,
        source: 'unavailable',
      })
    )
  })
})
