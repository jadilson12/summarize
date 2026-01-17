import { describe, expect, it } from 'vitest'

import { parseSlideSummariesFromMarkdown } from '../src/run/flows/url/slides-text.js'

describe('parseSlideSummariesFromMarkdown', () => {
  it('extracts slide summaries from Slides section', () => {
    const markdown = `
Intro paragraph.

### Slides
[slide:1] First summary line.
More detail.

[slide:3] Third summary.

### Next
Other section
`
    const map = parseSlideSummariesFromMarkdown(markdown)
    expect(map.get(1)).toBe('First summary line. More detail.')
    expect(map.get(3)).toBe('Third summary.')
  })
})
