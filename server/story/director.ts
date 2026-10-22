import type {
  DeepSeekChatRequest,
  DeepSeekMessage,
  DirectorContext,
  DirectorFinishReason,
  DirectorPlan,
  StoryDirector,
} from './director-types'
import {
  storyDirectorRepairMessages,
  storyDirectorSystemPrompt,
  storyDirectorTruncationRepairMessages,
  storyDirectorUserMessage,
} from './director-prompt'
import { StoryError, isStoryError } from './errors'
import { validateDirectorPlan } from './plan-validator'

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-flash'
export const DIRECTOR_TEMPERATURE = 0.4
export const DIRECTOR_MAX_TOKENS = 6_000
export const DIRECTOR_MAX_TOKENS_LIMIT = 8_000
export const DIRECTOR_REPAIR_TOKEN_INCREMENT = 800

const DIRECTOR_TOKENS_BY_SCENE_COUNT: Readonly<Record<number, number>> = {
  4: 5_000,
  5: 6_000,
  6: 7_000,
}

/**
 * Output budget per scene count, capped by the global limit.
 */
export function directorMaxTokens(sceneCount: number): number {
  const base = DIRECTOR_TOKENS_BY_SCENE_COUNT[sceneCount] ?? DIRECTOR_MAX_TOKENS

  return Math.min(base, DIRECTOR_MAX_TOKENS_LIMIT)
}

/**
 * Budget for the single repair: a larger slice when the first answer was
 * truncated, always capped by the global limit.
 */
export function directorRepairMaxTokens(baseMaxTokens: number): number {
  return Math.min(
    DIRECTOR_MAX_TOKENS_LIMIT,
    baseMaxTokens + DIRECTOR_REPAIR_TOKEN_INCREMENT,
  )
}

export interface StoryDirectorLogEvent {
  readonly event: 'story.plan.ok' | 'story.plan.failed'
  readonly attempt: 1 | 2
  readonly finishReason: DirectorFinishReason
  readonly errorCode?: string
  /** Stable validation reason. Never contains plan, prompt or model content. */
  readonly reason?: string
}

export interface StoryDirectorOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
  readonly onEvent?: (event: StoryDirectorLogEvent) => void
}

interface CompletionResult {
  readonly content: string | null
  readonly finishReason: DirectorFinishReason
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isContentBlocked(payload: unknown): boolean {
  if (!isRecord(payload)) return false

  const text = JSON.stringify(payload).toLowerCase()

  return ['nsfw', 'policy', 'moderation', 'safety', 'blocked'].some((needle) =>
    text.includes(needle),
  )
}

function readMessageContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null
  }

  const choice = payload.choices[0]

  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null
  }

  const content = choice.message.content

  return typeof content === 'string' && content.length > 0 ? content : null
}

function readFinishReason(payload: unknown): DirectorFinishReason {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return 'unknown'
  }

  const choice = payload.choices[0]

  if (!isRecord(choice)) {
    return 'unknown'
  }

  const reason = choice.finish_reason

  if (reason === 'stop' || reason === 'length' || reason === 'content_filter') {
    return reason
  }

  return 'unknown'
}

function errorCodeOf(error: unknown): string {
  return isStoryError(error) ? error.code : 'internal-error'
}

function parsePlanJson(content: string): unknown {
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

export class NativeStoryDirector implements StoryDirector {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly onEvent: ((event: StoryDirectorLogEvent) => void) | undefined

  constructor(options: StoryDirectorOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 45_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.onEvent = options.onEvent
  }

  async createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
  }): Promise<DirectorPlan> {
    const baseMaxTokens = directorMaxTokens(input.sceneCount)
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: storyDirectorSystemPrompt(input.sceneCount) },
      storyDirectorUserMessage(input.premise, input.referenceUrl, input.context),
    ]
    const first = await this.attempt(messages, baseMaxTokens, 1)

    if (first.content === null) {
      if (first.finishReason !== 'length') {
        this.emitFailure(1, first.finishReason)

        throw new StoryError('director-invalid-output')
      }

      const truncationReason = 'respuesta truncada por max_tokens'
      this.emitFailure(1, first.finishReason, truncationReason)

      const repairMaxTokens = directorRepairMaxTokens(baseMaxTokens)
      const repaired = await this.attempt(
        [
          ...messages,
          ...storyDirectorTruncationRepairMessages(input.sceneCount, repairMaxTokens),
        ],
        repairMaxTokens,
        2,
      )

      if (repaired.content === null) {
        this.emitFailure(
          2,
          repaired.finishReason,
          repaired.finishReason === 'length' ? truncationReason : undefined,
        )

        throw new StoryError('director-invalid-output')
      }

      const secondAttempt = this.parse(repaired.content, input.sceneCount)

      if (secondAttempt.ok) {
        this.emitSuccess(2, repaired.finishReason)

        return secondAttempt.plan
      }

      this.emitFailure(2, repaired.finishReason, secondAttempt.reason)

      throw new StoryError('director-invalid-output')
    }

    const firstAttempt = this.parse(first.content, input.sceneCount)

    if (firstAttempt.ok) {
      this.emitSuccess(1, first.finishReason)

      return firstAttempt.plan
    }

    this.emitFailure(1, first.finishReason, firstAttempt.reason)

    const truncated = first.finishReason === 'length'
    const repairMaxTokens = directorRepairMaxTokens(baseMaxTokens)
    const repairMessages: DeepSeekMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      ...storyDirectorRepairMessages(
        input.sceneCount,
        first.content,
        firstAttempt.reason,
        truncated,
      ),
    ]
    const repaired = await this.attempt(repairMessages, repairMaxTokens, 2)

    if (repaired.content === null) {
      this.emitFailure(2, repaired.finishReason)

      throw new StoryError('director-invalid-output')
    }

    const secondAttempt = this.parse(repaired.content, input.sceneCount)

    if (secondAttempt.ok) {
      this.emitSuccess(2, repaired.finishReason)

      return secondAttempt.plan
    }

    this.emitFailure(2, repaired.finishReason, secondAttempt.reason)

    throw new StoryError('director-invalid-output')
  }

  private parse(
    content: string,
    sceneCount: number,
  ): ReturnType<typeof validateDirectorPlan> {
    const parsed = parsePlanJson(content)

    if (parsed === undefined) {
      return { ok: false, reason: 'json inválido' }
    }

    return validateDirectorPlan(parsed, sceneCount)
  }

  private emit(event: StoryDirectorLogEvent): void {
    this.onEvent?.(event)
  }

  private emitSuccess(attempt: 1 | 2, finishReason: DirectorFinishReason): void {
    this.emit({ event: 'story.plan.ok', attempt, finishReason })
  }

  private emitFailure(
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    reason?: string,
  ): void {
    this.emit({
      event: 'story.plan.failed',
      attempt,
      finishReason,
      errorCode: 'director-invalid-output',
      ...(reason === undefined ? {} : { reason }),
    })
  }

  /**
   * Runs one HTTP attempt. Transport failures are reported once with the
   * stable Story error code and an unknown finish reason, then rethrown.
   */
  private async attempt(
    messages: readonly DeepSeekMessage[],
    maxTokens: number,
    attempt: 1 | 2,
  ): Promise<CompletionResult> {
    try {
      return await this.complete(messages, maxTokens)
    } catch (error) {
      this.emit({
        event: 'story.plan.failed',
        attempt,
        finishReason: 'unknown',
        errorCode: errorCodeOf(error),
      })

      throw error
    }
  }

  private async complete(
    messages: readonly DeepSeekMessage[],
    maxTokens: number,
  ): Promise<CompletionResult> {
    const body: DeepSeekChatRequest = {
      model: DEEPSEEK_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: DIRECTOR_TEMPERATURE,
      max_tokens: maxTokens,
      stream: false,
    }

    const controller = new AbortController()
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)

    let response: Response

    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch {
      if (timedOut) {
        throw new StoryError('director-timeout')
      }

      throw new StoryError('director-unavailable')
    } finally {
      clearTimeout(timer)
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 422) {
        if (isContentBlocked(payload)) {
          throw new StoryError('content-blocked')
        }

        throw new StoryError('director-invalid-output')
      }

      throw new StoryError('director-unavailable')
    }

    return {
      content: readMessageContent(payload),
      finishReason: readFinishReason(payload),
    }
  }
}

export function createStoryDirector(options: StoryDirectorOptions): StoryDirector {
  return new NativeStoryDirector(options)
}
