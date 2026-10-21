import type { StoryQCErrorCode } from '~/models/story'
import type {
  QCEvaluation,
  StoryQCEvaluator,
} from './qc-types'
import type {
  DeepSeekContentPart,
  DeepSeekMessage,
} from './director-types'
import { QC_SYSTEM_PROMPT, storyQcUserPrompt } from './qc-prompt'
import { validateQCObservation } from './qc-validator'

export const QC_EVALUATOR_MODEL = 'deepseek-flash'
export const QC_EVALUATOR_MAX_TOKENS = 800
export const QC_EVALUATOR_TIMEOUT_MS = 30_000

export interface StoryQCEvaluatorOptions {
  readonly apiKey: string
  readonly baseUrl: string
  readonly model?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

interface CompletionResult {
  readonly content: string | null
  readonly timedOut: boolean
  readonly unavailable: boolean
  readonly invalid: boolean
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

class DeepSeekQCEvaluator implements StoryQCEvaluator {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: StoryQCEvaluatorOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.model = options.model === QC_EVALUATOR_MODEL
      ? options.model
      : QC_EVALUATOR_MODEL
    this.timeoutMs = options.timeoutMs ?? QC_EVALUATOR_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async evaluate(input: Parameters<StoryQCEvaluator['evaluate']>[0]): Promise<QCEvaluation> {
    if (this.apiKey.length === 0) {
      return { kind: 'unavailable', errorCode: 'qc-not-configured' }
    }

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

    if (first.timedOut) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-timeout' }
    }

    if (first.unavailable) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-unavailable' }
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

    if (repaired.timedOut) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-timeout' }
    }

    if (repaired.unavailable || repaired.content === null) {
      return { kind: 'unavailable', errorCode: 'qc-evaluator-invalid-output' }
    }

    const secondValidation = validateQCObservation(
      parseJsonObject(repaired.content ?? ''),
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
  ): Promise<CompletionResult> {
    const controller = new AbortController()
    let timedOut = false
    const onAbort = (): void => {
      timedOut = true
      controller.abort()
    }
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    externalSignal?.addEventListener('abort', onAbort, { once: true })

    if (externalSignal?.aborted) {
      onAbort()
    }

    let response: Response

    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: QC_EVALUATOR_MAX_TOKENS,
          stream: false,
        }),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      return {
        content: null,
        timedOut,
        unavailable: !timedOut,
        invalid: false,
      }
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      return {
        content: null,
        timedOut: false,
        unavailable: response.status === 401
          || response.status === 403
          || response.status === 429
          || response.status >= 500,
        invalid: response.status === 400 || response.status === 422,
      }
    }

    const content = this.readContent(payload)

    return {
      content,
      timedOut: false,
      unavailable: false,
      invalid: false,
    }
  }

  private readContent(payload: unknown): string | null {
    if (typeof payload !== 'object' || payload === null) return null

    const choices = (payload as { readonly choices?: unknown }).choices

    if (!Array.isArray(choices) || choices.length === 0) return null

    const choice = choices[0]

    if (typeof choice !== 'object' || choice === null) return null

    const message = (choice as { readonly message?: unknown }).message

    if (typeof message !== 'object' || message === null) return null

    const content = (message as { readonly content?: unknown }).content

    return typeof content === 'string' && content.length > 0 ? content : null
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
  if (!options || options.apiKey.trim().length === 0) {
    return new NullQCEvaluator()
  }

  return new DeepSeekQCEvaluator(options)
}
