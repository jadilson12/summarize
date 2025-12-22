import type { AutoRule, AutoRuleKind, SummarizeConfig } from './config.js'
import { normalizeGatewayStyleModelId, parseGatewayStyleModelId } from './llm/model-id.js'
import type { LiteLlmCatalog } from './pricing/litellm.js'
import {
  resolveLiteLlmMaxInputTokensForModelId,
  resolveLiteLlmPricingForModelId,
} from './pricing/litellm.js'

export type AutoSelectionInput = {
  kind: AutoRuleKind
  promptTokens: number | null
  desiredOutputTokens: number | null
  requiresVideoUnderstanding: boolean
  env: Record<string, string | undefined>
  config: SummarizeConfig | null
  catalog: LiteLlmCatalog | null
  openrouterProvidersFromEnv: string[] | null
}

export type AutoModelAttempt = {
  userModelId: string
  llmModelId: string
  openrouterProviders: string[] | null
  forceOpenRouter: boolean
  requiredEnv:
    | 'XAI_API_KEY'
    | 'OPENAI_API_KEY'
    | 'GEMINI_API_KEY'
    | 'ANTHROPIC_API_KEY'
    | 'OPENROUTER_API_KEY'
  debug: string
}

const DEFAULT_RULES: AutoRule[] = [
  {
    when: ['video'],
    candidates: ['google/gemini-3-flash-preview', 'google/gemini-2.5-flash-lite-preview-09-2025'],
  },
  {
    when: ['youtube'],
    candidates: [
      'openai/gpt-5-nano',
      'google/gemini-3-flash-preview',
      'xai/grok-4-fast-non-reasoning',
    ],
  },
  {
    when: ['website'],
    candidates: ['openai/gpt-5-nano', 'openai/gpt-5.2', 'xai/grok-4-fast-non-reasoning'],
  },
  {
    when: ['text'],
    candidates: ['openai/gpt-5-nano', 'openai/gpt-5.2', 'xai/grok-4-fast-non-reasoning'],
  },
  {
    candidates: [
      'openai/gpt-5-nano',
      'google/gemini-3-flash-preview',
      'xai/grok-4-fast-non-reasoning',
    ],
  },
]

function isCandidateOpenRouter(modelId: string): boolean {
  return modelId.trim().toLowerCase().startsWith('openrouter/')
}

function requiredEnvForCandidate(modelId: string): AutoModelAttempt['requiredEnv'] {
  if (isCandidateOpenRouter(modelId)) return 'OPENROUTER_API_KEY'
  const parsed = parseGatewayStyleModelId(normalizeGatewayStyleModelId(modelId))
  return parsed.provider === 'xai'
    ? 'XAI_API_KEY'
    : parsed.provider === 'google'
      ? 'GEMINI_API_KEY'
      : parsed.provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : 'OPENAI_API_KEY'
}

function envHasKey(
  env: Record<string, string | undefined>,
  requiredEnv: AutoModelAttempt['requiredEnv']
): boolean {
  if (requiredEnv === 'GEMINI_API_KEY') {
    return Boolean(
      env.GEMINI_API_KEY?.trim() ||
        env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
        env.GOOGLE_API_KEY?.trim()
    )
  }
  return Boolean(env[requiredEnv]?.trim())
}

function tokenMatchesBand({
  promptTokens,
  band,
}: {
  promptTokens: number | null
  band: NonNullable<AutoRule['bands']>[number]
}): boolean {
  const token = band.token
  if (!token) return true
  if (typeof promptTokens !== 'number' || !Number.isFinite(promptTokens)) {
    return typeof token.min !== 'number' && typeof token.max !== 'number'
  }
  const min = typeof token.min === 'number' ? token.min : 0
  const max = typeof token.max === 'number' ? token.max : Number.POSITIVE_INFINITY
  return promptTokens >= min && promptTokens <= max
}

function resolveRuleCandidates({
  kind,
  promptTokens,
  config,
}: {
  kind: AutoRuleKind
  promptTokens: number | null
  config: SummarizeConfig | null
}): string[] {
  const rules = (() => {
    const model = config?.model
    if (
      model &&
      'mode' in model &&
      model.mode === 'auto' &&
      Array.isArray(model.rules) &&
      model.rules.length > 0
    ) {
      return model.rules
    }
    return DEFAULT_RULES
  })()

  for (const rule of rules) {
    const when = rule.when
    if (Array.isArray(when) && when.length > 0 && !when.includes(kind)) {
      continue
    }

    if (Array.isArray(rule.candidates) && rule.candidates.length > 0) {
      return rule.candidates
    }

    const bands = rule.bands
    if (Array.isArray(bands) && bands.length > 0) {
      for (const band of bands) {
        if (tokenMatchesBand({ promptTokens, band })) {
          return band.candidates
        }
      }
    }
  }

  const fallback = DEFAULT_RULES[DEFAULT_RULES.length - 1]
  return fallback.candidates ?? []
}

function estimateCostUsd({
  pricing,
  promptTokens,
  outputTokens,
}: {
  pricing: { inputUsdPerToken: number; outputUsdPerToken: number } | null
  promptTokens: number | null
  outputTokens: number | null
}): number | null {
  if (!pricing) return null
  if (typeof pricing.inputUsdPerToken !== 'number' || typeof pricing.outputUsdPerToken !== 'number')
    return null
  const inTok =
    typeof promptTokens === 'number' && Number.isFinite(promptTokens) && promptTokens > 0
      ? promptTokens
      : 0
  const outTok =
    typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens > 0
      ? outputTokens
      : 0
  const cost = inTok * pricing.inputUsdPerToken + outTok * pricing.outputUsdPerToken
  return Number.isFinite(cost) ? cost : null
}

function isVideoUnderstandingCapable(modelId: string): boolean {
  try {
    const parsed = parseGatewayStyleModelId(normalizeGatewayStyleModelId(modelId))
    return parsed.provider === 'google'
  } catch {
    return false
  }
}

export function buildAutoModelAttempts(input: AutoSelectionInput): AutoModelAttempt[] {
  const candidates = resolveRuleCandidates({
    kind: input.kind,
    promptTokens: input.promptTokens,
    config: input.config,
  })

  const attempts: AutoModelAttempt[] = []
  for (const modelRawEntry of candidates) {
    const modelRaw = modelRawEntry.trim()
    if (modelRaw.length === 0) continue

    const explicitOpenRouter = isCandidateOpenRouter(modelRaw)

    const shouldSkipForVideo =
      input.requiresVideoUnderstanding &&
      (explicitOpenRouter || !isVideoUnderstandingCapable(modelRaw))
    if (shouldSkipForVideo) {
      continue
    }

    const addAttempt = (
      modelId: string,
      options: { openrouter: boolean; openrouterProviders: string[] | null }
    ) => {
      const required = requiredEnvForCandidate(modelId)
      const hasKey = envHasKey(input.env, required)

      const catalog = input.catalog
      const maxIn = catalog
        ? resolveLiteLlmMaxInputTokensForModelId(
            catalog,
            options.openrouter ? modelId.slice('openrouter/'.length) : modelId
          )
        : null
      const promptTokens = input.promptTokens
      if (
        typeof promptTokens === 'number' &&
        Number.isFinite(promptTokens) &&
        typeof maxIn === 'number' &&
        Number.isFinite(maxIn) &&
        maxIn > 0 &&
        promptTokens > maxIn
      ) {
        return
      }

      const pricing = catalog
        ? resolveLiteLlmPricingForModelId(
            catalog,
            options.openrouter ? modelId.slice('openrouter/'.length) : modelId
          )
        : null
      const estimated = estimateCostUsd({
        pricing,
        promptTokens: input.promptTokens,
        outputTokens: input.desiredOutputTokens,
      })

      const userModelId = options.openrouter ? modelId : normalizeGatewayStyleModelId(modelId)
      const openrouterModelId = options.openrouter
        ? normalizeGatewayStyleModelId(modelId.slice('openrouter/'.length).trim())
        : null
      const llmModelId = options.openrouter
        ? `openai/${openrouterModelId}`
        : normalizeGatewayStyleModelId(modelId)
      const debugParts = [
        `model=${options.openrouter ? `openrouter/${openrouterModelId}` : userModelId}`,
        `order=${attempts.length + 1}`,
        `key=${hasKey ? 'yes' : 'no'}(${required})`,
        `promptTok=${typeof input.promptTokens === 'number' ? input.promptTokens : 'unknown'}`,
        `maxIn=${typeof maxIn === 'number' ? maxIn : 'unknown'}`,
        `estUsd=${typeof estimated === 'number' ? estimated.toExponential(2) : 'unknown'}`,
      ]

      attempts.push({
        userModelId: options.openrouter ? `openrouter/${openrouterModelId}` : userModelId,
        llmModelId,
        openrouterProviders: options.openrouterProviders,
        forceOpenRouter: options.openrouter,
        requiredEnv: required,
        debug: debugParts.join(' '),
      })
    }

    if (explicitOpenRouter) {
      addAttempt(modelRaw, {
        openrouter: true,
        openrouterProviders: input.openrouterProvidersFromEnv,
      })
      continue
    }

    addAttempt(modelRaw, {
      openrouter: false,
      openrouterProviders: input.openrouterProvidersFromEnv,
    })

    const canAddOpenRouterFallback =
      !input.requiresVideoUnderstanding && envHasKey(input.env, 'OPENROUTER_API_KEY')
    if (canAddOpenRouterFallback) {
      const slug = normalizeGatewayStyleModelId(modelRaw)
      addAttempt(`openrouter/${slug}`, {
        openrouter: true,
        openrouterProviders: input.openrouterProvidersFromEnv,
      })
    }
  }

  const seen = new Set<string>()
  const unique: AutoModelAttempt[] = []
  for (const a of attempts) {
    const key = `${a.forceOpenRouter ? 'or' : 'native'}:${a.userModelId}:${a.openrouterProviders?.join(',') ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(a)
  }
  return unique
}
