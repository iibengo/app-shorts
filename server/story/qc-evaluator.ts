import type { StoryQCErrorCode } from '~/models/story'
import type {
  QCEvaluation,
  StoryQCEvaluator,
} from './qc-types'
import type {
  DeepSeekContentPart,
  DeepSeekMessage,
} from './director-types'
import type { DeepSeekClient } from './deepseek-client'
import { createDeepSeekClient } from './deepseek-client'
import { StoryError } from './errors'
import { QC_SYSTEM_PROMPT, storyQcUserPrompt } from './qc-prompt'
import { validateQCObservation } from './qc-validator'

export const QC_EVALUATOR_MODEL = 'deepseek-flash'
export const QC_EVALUATOR_MAX_TOKENS = 800
export const QC_EVALUATOR_TIMEOUT_MS = 30_000

export interface StoryQCEvaluatorOptions {
  readonly client?: DeepSeekClient
  readonly apiKey?: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim()
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    : trimmed

  try {
    return JSON.parse(withoutFence)
  } catch {
    return undefined
  }
}

function qcErrorCode(error: unknown): StoryQCErrorCode {
  if (error instanceof StoryError) {
    if (error.code === 'director-timeout') return 'qc-evaluator-timeout'
    if (error.code === 'director-unavailable') return 'qc-evaluator-unavailable'
    if (error.code === 'director-invalid-output' || error.code === 'content-blocked') {
      return 'qc-evaluator-invalid-output'
    }
  }

  return 'qc-evaluator-unavailable'
}

class DeepSeekQCEvaluator implements StoryQCEvaluator {
  private readonly client: DeepSeekClient
  private readonly timeoutMs: number

  constructor(options: StoryQCEvaluatorOptions) {
    this.timeoutMs = options.timeoutMs ?? QC_EVALUATOR_TIMEOUT_MS
    this.client = options.client ?? createDeepSeekClient({
      apiKey: options.apiKey ?? '',
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    })
  }

  async evaluate(input: Parameters<StoryQCEvaluator['evaluate']>[0]): Promise<QCEvaluation> {
    const text = storyQcUserPrompt({
      bible: input.bible,
      expectation: input.expectation,
      previous: input.previous,
    })
    const content: readonly DeepSeekContentPart[] = [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: input.imageUrl } },
    ]
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: QC_SYSTEM_PROMPT },
      { role: 'user', content },
    ]

    const first = await this.complete(messages, input.signal)

    if (first.kind === 'error') {
      return { kind: 'unavailable', errorCode: first.errorCode }
    }

    const firstValidation = first.content === null
      ? { ok: false as const, reason: 'qc: contenido vacío' }
      : validateQCObservation(parseJsonObject(first.content), input.bible)

    if (firstValidation.ok) {
      return {
        kind: 'observed',
        observed: firstValidation.observed!,
        confidence: firstValidation.confidence!,
      }
    }

    const repairMessages: DeepSeekMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content ?? '' },
      {
        role: 'user',
        content: 'El JSON anterior no cumple el esquema. Devuelve solo el objeto JSON corregido, '
          + 'con las claves exactas y ids de la biblia.',
      },
    ]
    const repaired = await this.complete(repairMessages, input.signal)

    if (repaired.kind === 'error') {
      return { kind: 'unavailable', errorCode: repaired.errorCode }
    }
    if (repaired.content === null) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-invalid-output' }
    }

    const secondValidation = validateQCObservation(
      parseJsonObject(repaired.content),
      input.bible,
    )

    if (!secondValidation.ok) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-invalid-output' }
    }

    return {
      kind: 'observed',
      observed: secondValidation.observed!,
      confidence: secondValidation.confidence!,
    }
  }

  private async complete(
    messages: readonly DeepSeekMessage[],
    externalSignal?: AbortSignal,
  ): Promise<
    | { readonly kind: 'content'; readonly content: string | null }
    | { readonly kind: 'error'; readonly errorCode: StoryQCErrorCode }
  > {
    try {
      const completion = await this.client.complete({
        messages,
        temperature: 0,
        maxTokens: QC_EVALUATOR_MAX_TOKENS,
        timeoutMs: this.timeoutMs,
        thinking: { mode: 'disabled' },
        ...(externalSignal === undefined ? {} : { signal: externalSignal }),
      })

      return { kind: 'content', content: completion.content }
    } catch (error) {
      return { kind: 'error', errorCode: qcErrorCode(error) }
    }
  }
}

export class NullQCEvaluator implements StoryQCEvaluator {
  async evaluate(): Promise<QCEvaluation> {
    return { kind: 'unavailable', errorCode: 'qc-not-configured' }
  }
}

export function createStoryQCEvaluator(
  options: StoryQCEvaluatorOptions | null,
): StoryQCEvaluator {
  if (!options) return new NullQCEvaluator()
  if (!options.client && (options.apiKey ?? '').trim().length === 0) {
    return new NullQCEvaluator()
  }

  return new DeepSeekQCEvaluator(options)
}
