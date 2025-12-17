export const CACHE_MODES = ['default', 'bypass'] as const
export type CacheMode = (typeof CACHE_MODES)[number]

export const SUMMARY_LENGTHS = ['short', 'medium', 'long', 'xl', 'xxl'] as const
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number]
