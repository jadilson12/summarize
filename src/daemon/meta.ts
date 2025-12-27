import { formatCompactCount, formatDurationSecondsSmart } from '../tty/format.js'

export type InputSummaryArgs = {
  kindLabel: string | null
  durationSeconds: number | null
  words: number | null
  characters: number | null
  isDurationApproximate?: boolean
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function formatInputSummary({
  kindLabel,
  durationSeconds,
  words,
  characters,
  isDurationApproximate,
}: InputSummaryArgs): string | null {
  const parts: string[] = []

  if (kindLabel) {
    if (durationSeconds != null && durationSeconds > 0) {
      const base = formatDurationSecondsSmart(durationSeconds)
      const duration = isDurationApproximate ? `~${base}` : base
      parts.push(`${duration} ${kindLabel}`)
    } else {
      parts.push(kindLabel)
    }
  }

  if (typeof words === 'number' && Number.isFinite(words) && words > 0) {
    parts.push(`${formatCompactCount(words)} words`)
  }
  if (typeof characters === 'number' && Number.isFinite(characters) && characters > 0) {
    parts.push(`${formatCompactCount(characters)} chars`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}
