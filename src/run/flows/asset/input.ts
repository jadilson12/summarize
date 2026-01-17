import fs from 'node:fs/promises'
import {
  classifyUrl,
  type InputTarget,
  loadLocalAsset,
  loadRemoteAsset,
} from '../../../content/asset.js'
import { formatBytes } from '../../../tty/format.js'
import { startOscProgress } from '../../../tty/osc-progress.js'
import { startSpinner } from '../../../tty/spinner.js'
import { assertAssetMediaTypeSupported } from '../../attachments.js'
import { ansi } from '../../terminal.js'
import type { SummarizeAssetArgs } from './summary.js'

/**
 * Check if a media type should route through transcription.
 */
function isTranscribableMediaType(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase()
  return normalized.startsWith('audio/') || normalized.startsWith('video/')
}

export type AssetInputContext = {
  env: Record<string, string | undefined>
  stderr: NodeJS.WritableStream
  progressEnabled: boolean
  timeoutMs: number
  trackedFetch: typeof fetch
  summarizeAsset: (args: SummarizeAssetArgs) => Promise<void>
  summarizeMediaFile?: (args: SummarizeAssetArgs) => Promise<void>
  setClearProgressBeforeStdout: (fn: (() => undefined | (() => void)) | null) => void
  clearProgressIfCurrent: (fn: () => void) => void
}

type UrlAssetHandler = (args: {
  loaded: Awaited<ReturnType<typeof loadRemoteAsset>>
  spinner: ReturnType<typeof startSpinner>
  clearProgressLine: () => void
}) => Promise<void>

export async function handleFileInput(
  ctx: AssetInputContext,
  inputTarget: InputTarget
): Promise<boolean> {
  if (inputTarget.kind !== 'file') return false

  let sizeLabel: string | null = null
  try {
    const stat = await fs.stat(inputTarget.filePath)
    if (stat.isFile()) {
      sizeLabel = formatBytes(stat.size)
    }
  } catch {
    // Ignore size preflight; loadLocalAsset will throw a user-friendly error if needed.
  }

  const stopOscProgress = startOscProgress({
    label: 'Loading file',
    indeterminate: true,
    env: ctx.env,
    isTty: ctx.progressEnabled,
    write: (data: string) => ctx.stderr.write(data),
  })
  const spinner = startSpinner({
    text: sizeLabel ? `Loading file (${sizeLabel})…` : 'Loading file…',
    enabled: ctx.progressEnabled,
    stream: ctx.stderr,
  })
  let stopped = false
  const stopProgress = () => {
    if (stopped) return
    stopped = true
    spinner.stopAndClear()
    stopOscProgress()
  }
  const pauseProgressLine = () => {
    spinner.pause()
    return () => spinner.resume()
  }
  ctx.setClearProgressBeforeStdout(pauseProgressLine)
  try {
    const loaded = await loadLocalAsset({ filePath: inputTarget.filePath })
    assertAssetMediaTypeSupported({ attachment: loaded.attachment, sizeLabel })

    const isTranscribable = isTranscribableMediaType(loaded.attachment.mediaType)
    const handler =
      isTranscribable && ctx.summarizeMediaFile ? ctx.summarizeMediaFile : ctx.summarizeAsset

    const dim = (value: string) => ansi('90', value, ctx.progressEnabled)
    const accent = (value: string) => ansi('36', value, ctx.progressEnabled)

    if (ctx.progressEnabled) {
      const mt = loaded.attachment.mediaType
      const name = loaded.attachment.filename
      const details = sizeLabel ? `${mt}, ${sizeLabel}` : mt
      const action = isTranscribable ? 'Transcribing' : 'Summarizing'
      const meta = name ? `${name} ${dim('(')}${details}${dim(')')}` : details
      spinner.setText(`${action} ${meta}…`)
    }

    await handler({
      sourceKind: 'file',
      sourceLabel: loaded.sourceLabel,
      attachment: loaded.attachment,
      onModelChosen: (modelId) => {
        if (!ctx.progressEnabled) return
        const mt = loaded.attachment.mediaType
        const name = loaded.attachment.filename
        const details = sizeLabel ? `${mt}, ${sizeLabel}` : mt
        const meta = name ? `${name} ${dim('(')}${details}${dim(')')}` : details
        spinner.setText(
          `Summarizing ${meta} ${dim('(')}${dim('model: ')}${accent(modelId)}${dim(')')}…`
        )
      },
    })
    return true
  } finally {
    ctx.clearProgressIfCurrent(pauseProgressLine)
    stopProgress()
  }
}

export async function withUrlAsset(
  ctx: AssetInputContext,
  url: string,
  isYoutubeUrl: boolean,
  handler: UrlAssetHandler
): Promise<boolean> {
  if (!url || isYoutubeUrl) return false

  const kind = await classifyUrl({ url, fetchImpl: ctx.trackedFetch, timeoutMs: ctx.timeoutMs })
  if (kind.kind !== 'asset') return false

  const stopOscProgress = startOscProgress({
    label: 'Downloading file',
    indeterminate: true,
    env: ctx.env,
    isTty: ctx.progressEnabled,
    write: (data: string) => ctx.stderr.write(data),
  })
  const spinner = startSpinner({
    text: 'Downloading file…',
    enabled: ctx.progressEnabled,
    stream: ctx.stderr,
  })
  let stopped = false
  const stopProgress = () => {
    if (stopped) return
    stopped = true
    spinner.stopAndClear()
    stopOscProgress()
  }
  const pauseProgressLine = () => {
    spinner.pause()
    return () => spinner.resume()
  }
  ctx.setClearProgressBeforeStdout(pauseProgressLine)
  try {
    const loaded = await (async () => {
      try {
        return await loadRemoteAsset({ url, fetchImpl: ctx.trackedFetch, timeoutMs: ctx.timeoutMs })
      } catch (error) {
        if (error instanceof Error && /HTML/i.test(error.message)) {
          return null
        }
        throw error
      }
    })()

    if (!loaded) return false
    assertAssetMediaTypeSupported({ attachment: loaded.attachment, sizeLabel: null })
    await handler({ loaded, spinner, clearProgressLine: pauseProgressLine })
    return true
  } finally {
    ctx.clearProgressIfCurrent(pauseProgressLine)
    stopProgress()
  }
}

export async function handleUrlAsset(
  ctx: AssetInputContext,
  url: string,
  isYoutubeUrl: boolean
): Promise<boolean> {
  return withUrlAsset(ctx, url, isYoutubeUrl, async ({ loaded, spinner }) => {
    const dim = (value: string) => ansi('90', value, ctx.progressEnabled)
    const accent = (value: string) => ansi('36', value, ctx.progressEnabled)
    if (ctx.progressEnabled) spinner.setText(`Summarizing ${dim('file')}…`)
    await ctx.summarizeAsset({
      sourceKind: 'asset-url',
      sourceLabel: loaded.sourceLabel,
      attachment: loaded.attachment,
      onModelChosen: (modelId) => {
        if (!ctx.progressEnabled) return
        spinner.setText(
          `Summarizing ${dim('file')} ${dim('(')}${dim('model: ')}${accent(modelId)}${dim(')')}…`
        )
      },
    })
  })
}
