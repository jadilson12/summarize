import { buildLinkSummaryPrompt, SUMMARY_LENGTH_TO_TOKENS } from '@steipete/summarizer/prompts'
import { describe, expect, it } from 'vitest'

describe('buildLinkSummaryPrompt', () => {
  it('includes share guidance when no shares provided', () => {
    const prompt = buildLinkSummaryPrompt({
      url: 'https://example.com',
      title: 'Hello',
      siteName: 'Example',
      description: 'Desc',
      content: 'Body',
      truncated: false,
      hasTranscript: false,
      summaryLength: 'short',
      shares: [],
    })

    expect(prompt).toContain('Source URL: https://example.com')
    expect(prompt).toContain('Title: Hello')
    expect(prompt).toContain('Site: Example')
    expect(prompt).toContain('Page description: Desc')
    expect(prompt).toContain('You are not given any quotes from people who shared this link.')
    expect(prompt).not.toContain('Tweets from sharers:')
  })

  it('renders sharer lines with metrics and timestamp', () => {
    const prompt = buildLinkSummaryPrompt({
      url: 'https://example.com',
      title: null,
      siteName: null,
      description: null,
      content: 'Body',
      truncated: true,
      hasTranscript: true,
      summaryLength: 'xl',
      shares: [
        {
          author: 'Peter',
          handle: 'steipete',
          text: 'Worth reading',
          likeCount: 1200,
          reshareCount: 45,
          replyCount: 2,
          timestamp: '2025-12-17',
        },
      ],
    })

    expect(prompt).toContain('Note: Content truncated')
    expect(prompt).toContain('Tweets from sharers:')
    expect(prompt).toContain(
      '- @steipete (2025-12-17) [1,200 likes, 45 reshares, 2 replies]: Worth reading'
    )
    expect(prompt).toContain('append a brief subsection titled "What sharers are saying"')
    expect(prompt).toContain('Use level-3 Markdown headings (###)')
  })

  it('keeps token map stable', () => {
    expect(SUMMARY_LENGTH_TO_TOKENS).toEqual({
      short: 256,
      medium: 512,
      long: 1024,
      xl: 2048,
      xxl: 4096,
    })
  })
})
