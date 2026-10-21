import type {
  DeepSeekChatRequest,
  DeepSeekMessage,
  DirectorPlan,
  StoryDirector,
} from './director-types'
import {
  storyDirectorRepairMessages,
  storyDirectorSystemPrompt,
  storyDirectorUserMessage,
} from './director-prompt'
import { StoryError } from './errors'
import { validateDirectorPlan } from './plan-validator'

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = 'deepseek-flash'
export const DIRECTOR_TEMPERATURE = 0.4
export const DIRECTOR_MAX_TOKENS = 1_400

export interface StoryDirectorOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

interface CompletionResult {
  readonly content: string
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

  constructor(options: StoryDirectorOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 45_000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
  }): Promise<DirectorPlan> {
    const messages: DeepSeekMessage[] = [
      { role: 'system', content: storyDirectorSystemPrompt(input.sceneCount) },
      storyDirectorUserMessage(input.premise, input.referenceUrl),
    ]
    const first = await this.complete(messages)
    const firstAttempt = this.parse(first.content, input.sceneCount)

    if (firstAttempt.ok) {
      return firstAttempt.plan
    }

    const repairMessages: DeepSeekMessage[] = [
      ...messages,
      { role: 'assistant', content: first.content },
      ...storyDirectorRepairMessages(input.sceneCount, first.content, firstAttempt.reason),
    ]
    const repaired = await this.complete(repairMessages)
    const secondAttempt = this.parse(repaired.content, input.sceneCount)

    if (secondAttempt.ok) {
      return secondAttempt.plan
    }

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

  private async complete(messages: readonly DeepSeekMessage[]): Promise<CompletionResult> {
    const body: DeepSeekChatRequest = {
      model: DEEPSEEK_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: DIRECTOR_TEMPERATURE,
      max_tokens: DIRECTOR_MAX_TOKENS,
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

    const content = readMessageContent(payload)

    if (!content) {
      throw new StoryError('director-invalid-output')
    }

    return { content }
  }
}

export function createStoryDirector(options: StoryDirectorOptions): StoryDirector {
  return new NativeStoryDirector(options)
}
