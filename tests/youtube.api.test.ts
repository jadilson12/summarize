import { describe, expect, it } from 'vitest'

import {
  extractTranscriptFromTranscriptEndpoint,
  extractYoutubeiTranscriptConfig,
} from '../packages/summarizer/dist/esm/content/link-preview/transcript/providers/youtube/api.js'

describe('YouTube transcript parsing', () => {
  it('extracts youtubei transcript config from bootstrap HTML', () => {
    const html =
      '<!doctype html><html><head>' +
      '<script>ytcfg.set({"INNERTUBE_API_KEY":"TEST_KEY","INNERTUBE_CONTEXT":{"client":{"clientName":"WEB","clientVersion":"1.0"}}});</script>' +
      '<script>var ytInitialPlayerResponse = {"getTranscriptEndpoint":{"params":"TEST_PARAMS"}};</script>' +
      '</head><body></body></html>'

    const config = extractYoutubeiTranscriptConfig(html)
    expect(config).toEqual(
      expect.objectContaining({
        apiKey: 'TEST_KEY',
        params: 'TEST_PARAMS',
      })
    )
  })

  it('returns null when transcript payload is missing segments', () => {
    expect(extractTranscriptFromTranscriptEndpoint({ actions: [] })).toBeNull()
    expect(extractTranscriptFromTranscriptEndpoint(null)).toBeNull()
  })

  it('extracts transcript lines from youtubei payload', () => {
    const payload = {
      actions: [
        {
          updateEngagementPanelAction: {
            content: {
              transcriptRenderer: {
                content: {
                  transcriptSearchPanelRenderer: {
                    body: {
                      transcriptSegmentListRenderer: {
                        initialSegments: [
                          {
                            transcriptSegmentRenderer: {
                              snippet: { runs: [{ text: 'Line 1' }] },
                            },
                          },
                          {
                            transcriptSegmentRenderer: {
                              snippet: { runs: [{ text: 'Line 2' }] },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    }

    expect(extractTranscriptFromTranscriptEndpoint(payload)).toBe('Line 1\nLine 2')
  })
})
