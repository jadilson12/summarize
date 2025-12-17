import type { ProviderContext, ProviderFetchOptions, ProviderResult } from '../types.js'

const PODCAST_URL_PATTERN = /rss|podcast|spotify\.com/i

export const canHandle = ({ url }: ProviderContext): boolean => PODCAST_URL_PATTERN.test(url)

export const fetchTranscript = async (
  _context: ProviderContext,
  _options: ProviderFetchOptions
): Promise<ProviderResult> => {
  await Promise.resolve()
  return {
    text: null,
    source: null,
    attemptedProviders: [],
    metadata: { provider: 'podcast', reason: 'not_implemented' },
  }
}
