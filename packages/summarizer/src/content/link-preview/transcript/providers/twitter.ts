import type { ProviderContext, ProviderFetchOptions, ProviderResult } from '../types.js'

const TWITTER_URL_PATTERN = /twitter\.com|x\.com/i

export const canHandle = ({ url }: ProviderContext): boolean => TWITTER_URL_PATTERN.test(url)

export const fetchTranscript = async (
  _context: ProviderContext,
  _options: ProviderFetchOptions
): Promise<ProviderResult> => {
  await Promise.resolve()
  return {
    text: null,
    source: null,
    attemptedProviders: [],
    metadata: { provider: 'twitter', reason: 'not_implemented' },
  }
}
