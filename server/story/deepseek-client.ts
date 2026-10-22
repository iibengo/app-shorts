import type { DeepSeekMessage } from './director-types'
import type { DirectorFinishReason } from './director-types'
import { StoryError } from './errors'

export const DEEPSEEK_MODEL = 'deepseek-flash'
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export interface DeepSeekClientOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

export interface DeepSeekCompletionRequest {
  readonly messages: readonly DeepSeekMessage[]
  readonly temperature: number
  readonly maxTokens: number
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface DeepSeekUsage {
  readonly promptTokens: number
  readonly completionTokens: number
  readonly reasoningTokens: number
}

export interface DeepSeekCompletion {
  readonly content: string | null
  readonly finishReason: DirectorFinishReason
  readonly httpStatus: number
  readonly usage?: DeepSeekUsage
}

export interface DeepSeekClient {
  complete(input: DeepSeekCompletionRequest): Promise<DeepSeekCompletion>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMessageContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null

  const choice = payload.choices[0]

  if (!isRecord(choice) || !isRecord(choice.message)) return null

  const content = choice.message.content

  return typeof content === 'string' && content.length > 0 ? content : null
}

function readFinishReason(payload: unknown): DirectorFinishReason {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return 'unknown'

  const choice = payload.choices[0]

  if (!isRecord(choice)) return 'unknown'

  const reason = choice.finish_reason

  return reason === 'stop' || reason === 'length' || reason === 'content_filter'
    ? reason
    : 'unknown'
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readUsage(payload: unknown): DeepSeekUsage | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined

  const usage = payload.usage
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : null

  return {
    promptTokens: readNumber(usage.prompt_tokens) ?? 0,
    completionTokens: readNumber(usage.completion_tokens) ?? 0,
    reasoningTokens: readNumber(usage.reasoning_tokens)
      ?? (completionDetails === null
        ? 0
        : readNumber(completionDetails.reasoning_tokens) ?? 0),
  }
}

function isContentBlocked(payload: unknown): boolean {
  if (!isRecord(payload)) return false

  const text = JSON.stringify(payload).toLowerCase()

  return ['nsfw', 'policy', 'moderation', 'safety', 'blocked'].some((needle) =>
    text.includes(needle),
  )
}

export class NativeDeepSeekClient implements DeepSeekClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: DeepSeekClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async complete(input: DeepSeekCompletionRequest): Promise<DeepSeekCompletion> {
    const controller = new AbortController()
    let timedOut = false
    const onAbort = (): void => {
      timedOut = true
      controller.abort()
    }
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, input.timeoutMs)

    input.signal?.addEventListener('abort', onAbort, { once: true })

    if (input.signal?.aborted) onAbort()

    let response: Response

    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: input.messages,
          response_format: { type: 'json_object' },
          temperature: input.temperature,
          max_tokens: input.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      if (timedOut) throw new StoryError('director-timeout')

      throw new StoryError('director-unavailable')
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', onAbort)
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 422) {
        if (isContentBlocked(payload)) throw new StoryError('content-blocked')

        throw new StoryError('director-invalid-output')
      }

      throw new StoryError('director-unavailable')
    }

    const usage = readUsage(payload)

    return {
      content: readMessageContent(payload),
      finishReason: readFinishReason(payload),
      httpStatus: response.status,
      ...(usage === undefined ? {} : { usage }),
    }
  }
}

export function createDeepSeekClient(options: DeepSeekClientOptions): DeepSeekClient {
  return new NativeDeepSeekClient(options)
}
