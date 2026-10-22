import type { StoryMode } from '~/models/story'
import type {
  DirectorFinishReason,
  DirectorLogEvent,
  NarrativeDraft,
  StoryNarrativeDirector,
} from './director-types'
import { StoryError } from './errors'
import { validateNarrativeDraft } from './canon-validator'
import {
  storyNarrativeRepairMessages,
  storyNarrativeSystemPrompt,
  storyNarrativeTruncationRepairMessages,
  storyNarrativeUserMessage,
} from './narrative-prompt'
import type { DeepSeekClient } from './deepseek-client'

export const NARRATIVE_TOKENS_BY_SCENE: Readonly<Record<number, number>> = {
  4: 6_000,
  5: 7_000,
  6: 7_800,
}
export const NARRATIVE_MAX_TOKENS = 7_000
export const NARRATIVE_MAX_TOKENS_LIMIT = 8_000
export const NARRATIVE_REPAIR_INCREMENT = 400
export const NARRATIVE_TIMEOUT_MS = 40_000

export function narrativeMaxTokens(sceneCount: number): number {
  return Math.min(
    NARRATIVE_TOKENS_BY_SCENE[sceneCount] ?? NARRATIVE_MAX_TOKENS,
    NARRATIVE_MAX_TOKENS_LIMIT,
  )
}

export function narrativeRepairMaxTokens(base: number): number {
  return Math.min(NARRATIVE_MAX_TOKENS_LIMIT, base + NARRATIVE_REPAIR_INCREMENT)
}

export function directorTemperature(mode: StoryMode): number {
  return mode === 'creative' ? 0.7 : 0.4
}

export interface NarrativeDirectorOptions {
  readonly client: DeepSeekClient
  readonly onEvent?: (event: DirectorLogEvent) => void
  readonly timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(content: string): unknown {
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

export class NativeStoryNarrativeDirector implements StoryNarrativeDirector {
  private readonly client: DeepSeekClient
  private readonly onEvent: (event: DirectorLogEvent) => void
  private readonly timeoutMs: number

  constructor(options: NarrativeDirectorOptions) {
    this.client = options.client
    this.onEvent = options.onEvent ?? (() => undefined)
    this.timeoutMs = options.timeoutMs ?? NARRATIVE_TIMEOUT_MS
  }

  async createNarrative(input: Parameters<StoryNarrativeDirector['createNarrative']>[0]): Promise<NarrativeDraft> {
    const startedAt = Date.now()
    const messages = [
      {
        role: 'system' as const,
        content: storyNarrativeSystemPrompt(input.sceneCount, input.mode),
      },
      storyNarrativeUserMessage(input.premise, input.referenceUrl, input.context),
    ]
    const baseMaxTokens = narrativeMaxTokens(input.sceneCount)

    this.emit({
      event: 'story.narrative.start',
      pass: 'narrative',
      attempt: 1,
      finishReason: 'unknown',
      mode: input.mode,
    })

    const first = await this.client.complete({
      messages,
      temperature: directorTemperature(input.mode),
      maxTokens: baseMaxTokens,
      timeoutMs: this.timeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    if (first.content === null) {
      if (first.finishReason === 'content_filter') {
        this.fail(1, first.finishReason, 'content-blocked', input.mode, startedAt)
        throw new StoryError('content-blocked')
      }

      const truncated = first.finishReason === 'length'
      const reason = truncated
        ? 'respuesta truncada por max_tokens'
        : 'respuesta vacía'

      this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason)
      const repaired = await this.client.complete({
        messages: truncated
          ? [...messages, ...storyNarrativeTruncationRepairMessages(narrativeRepairMaxTokens(baseMaxTokens))]
          : [...messages, ...storyNarrativeRepairMessages(reason, null)],
        temperature: directorTemperature(input.mode),
        maxTokens: narrativeRepairMaxTokens(baseMaxTokens),
        timeoutMs: this.timeoutMs,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })

      return this.finishRepair(repaired, input, startedAt)
    }

    const validation = this.validate(first.content, input.sceneCount, input.mode)
    const truncated = first.finishReason === 'length'

    if (validation.ok && !truncated) {
      this.ok(1, first.finishReason, input.mode, startedAt)
      return validation.draft
    }

    const reason = truncated ? 'respuesta truncada por max_tokens' : validation.reason

    this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason)
    const repaired = await this.client.complete({
      messages: truncated
        ? [...messages, ...storyNarrativeTruncationRepairMessages(narrativeRepairMaxTokens(baseMaxTokens))]
        : [...messages, ...storyNarrativeRepairMessages(reason, first.content)],
      temperature: directorTemperature(input.mode),
      maxTokens: narrativeRepairMaxTokens(baseMaxTokens),
      timeoutMs: this.timeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    return this.finishRepair(repaired, input, startedAt)
  }

  private async finishRepair(
    repaired: Awaited<ReturnType<DeepSeekClient['complete']>>,
    input: Parameters<StoryNarrativeDirector['createNarrative']>[0],
    startedAt: number,
  ): Promise<NarrativeDraft> {
    if (repaired.content === null) {
      this.fail(
        2,
        repaired.finishReason,
        'director-invalid-output',
        input.mode,
        startedAt,
        repaired.finishReason === 'length' ? 'respuesta truncada por max_tokens' : undefined,
      )
      throw new StoryError('director-invalid-output')
    }

    if (repaired.finishReason === 'length') {
      this.fail(
        2,
        repaired.finishReason,
        'director-invalid-output',
        input.mode,
        startedAt,
        'respuesta truncada por max_tokens',
      )
      throw new StoryError('director-invalid-output')
    }

    const validation = this.validate(repaired.content, input.sceneCount, input.mode)

    if (validation.ok) {
      this.ok(2, repaired.finishReason, input.mode, startedAt)
      return validation.draft
    }

    this.fail(2, repaired.finishReason, 'director-invalid-output', input.mode, startedAt, validation.reason)
    throw new StoryError('director-invalid-output')
  }

  private validate(
    content: string,
    sceneCount: number,
    mode: StoryMode,
  ): ReturnType<typeof validateNarrativeDraft> {
    const parsed = parseJson(content)

    if (parsed === undefined) return { ok: false, reason: 'json inválido' }
    if (!isRecord(parsed)) return { ok: false, reason: 'plan: forma inválida' }

    return validateNarrativeDraft(parsed, { sceneCount, mode })
  }

  private emit(event: DirectorLogEvent): void {
    this.onEvent(event)
  }

  private ok(
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    mode: StoryMode,
    startedAt: number,
  ): void {
    this.emit({
      event: 'story.narrative.ok',
      pass: 'narrative',
      attempt,
      finishReason,
      mode,
      latencyMs: Date.now() - startedAt,
    })
  }

  private fail(
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    errorCode: string,
    mode: StoryMode,
    startedAt: number,
    reason?: string,
  ): void {
    this.emit({
      event: 'story.narrative.failed',
      pass: 'narrative',
      attempt,
      finishReason,
      errorCode,
      mode,
      ...(reason === undefined ? {} : { reason }),
      latencyMs: Date.now() - startedAt,
    })
  }
}

export function createStoryNarrativeDirector(
  options: NarrativeDirectorOptions,
): StoryNarrativeDirector {
  return new NativeStoryNarrativeDirector(options)
}
