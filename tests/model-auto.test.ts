import { describe, expect, it } from 'vitest'

import type { SummarizeConfig } from '../src/config.js'
import { buildAutoModelAttempts } from '../src/model-auto.js'

describe('auto model selection', () => {
  it('preserves candidate order (native then OpenRouter fallback)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [{ candidates: ['openai/gpt-5.2', 'xai/grok-4-fast-non-reasoning'] }],
      },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5.2')
    expect(attempts[1]?.userModelId).toBe('openrouter/openai/gpt-5.2')
    expect(attempts[2]?.userModelId).toBe('xai/grok-4-fast-non-reasoning')
    expect(attempts[3]?.userModelId).toBe('openrouter/xai/grok-4-fast-non-reasoning')
  })

  it('adds an OpenRouter fallback attempt when OPENROUTER_API_KEY is set', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['openai/gpt-5.2'] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.some((a) => a.forceOpenRouter)).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5.2')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5.2')).toBe(true)
  })

  it('does not add an OpenRouter fallback when video understanding is required', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['google/gemini-3-flash-preview'] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'video',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: true,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: ['groq'],
    })

    expect(attempts.every((a) => a.forceOpenRouter === false)).toBe(true)
  })

  it('respects explicit openrouter/... candidates (no native attempt)', () => {
    const config: SummarizeConfig = {
      model: { mode: 'auto', rules: [{ candidates: ['openrouter/openai/gpt-5-nano'] }] },
    }
    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 100,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: { OPENROUTER_API_KEY: 'sk-or-test' },
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts.some((a) => a.userModelId === 'openrouter/openai/gpt-5-nano')).toBe(true)
    expect(attempts.some((a) => a.userModelId === 'openai/gpt-5-nano')).toBe(false)
  })

  it('selects candidates via token bands (first match wins)', () => {
    const config: SummarizeConfig = {
      model: {
        mode: 'auto',
        rules: [
          {
            when: ['text'],
            bands: [
              { token: { max: 100 }, candidates: ['openai/gpt-5-nano'] },
              { token: { max: 1000 }, candidates: ['openai/gpt-5.2'] },
              { candidates: ['xai/grok-4-fast-non-reasoning'] },
            ],
          },
        ],
      },
    }

    const attempts = buildAutoModelAttempts({
      kind: 'text',
      promptTokens: 200,
      desiredOutputTokens: 50,
      requiresVideoUnderstanding: false,
      env: {},
      config,
      catalog: null,
      openrouterProvidersFromEnv: null,
    })

    expect(attempts[0]?.userModelId).toBe('openai/gpt-5.2')
  })
})
