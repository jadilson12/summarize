import { fetchWithTimeout } from '../../../fetch-with-timeout.js'
import { normalizeApifyTranscript } from '../../normalize.js'
import { isRecord } from '../../utils.js'

type ApifyTranscriptItem = Record<string, unknown> & {
  transcript?: unknown
  transcriptText?: unknown
  text?: unknown
}

export const fetchTranscriptWithApify = async (
  fetchImpl: typeof fetch,
  apifyApiToken: string | null,
  url: string
): Promise<string | null> => {
  if (!apifyApiToken) {
    return null
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://api.apify.com/v2/acts/dB9f4B02ocpTICIEY/run-sync-get-dataset-items?token=${apifyApiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [url],
          includeTimestamps: 'No',
        }),
      },
      45_000
    )

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    if (!Array.isArray(payload)) {
      return null
    }

    for (const item of payload) {
      if (!isRecord(item)) {
        continue
      }
      const recordItem = item as ApifyTranscriptItem
      const normalized =
        normalizeApifyTranscript(recordItem.transcript) ??
        normalizeApifyTranscript(recordItem.transcriptText) ??
        normalizeApifyTranscript(recordItem.text)
      if (normalized) {
        return normalized
      }
    }

    return null
  } catch {
    return null
  }
}
