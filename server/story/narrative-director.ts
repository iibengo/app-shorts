import type { StoryMode } from '~/models/story'
import type {
  CanonDraft,
  DeepSeekMessage,
  DirectorFinishReason,
  DirectorLogEvent,
  NarrativeBeat,
  NarrativeDraft,
  StoryNarrativeDirector,
} from './director-types'
import { StoryError } from './errors'
import {
  validateBeats,
  validateCanon,
  validateNarrativeDraft,
} from './canon-validator'
import {
  storyBeatsRepairMessages,
  storyBeatsSystemPrompt,
  storyBeatsTruncationRepairMessages,
  storyBeatsUserMessage,
  storyCanonRepairMessages,
  storyCanonSystemPrompt,
  storyCanonTruncationRepairMessages,
  storyCanonUserMessage,
} from './narrative-prompt'
import type { DeepSeekClient, DeepSeekUsage } from './deepseek-client'

export const CANON_MAX_TOKENS = 8_000
export const CANON_REPAIR_MAX_TOKENS = 8_000
export const BEATS_MAX_TOKENS = 8_000
export const BEATS_REPAIR_MAX_TOKENS = 8_000
export const CANON_TIMEOUT_MS = 60_000
export const BEATS_TIMEOUT_MS = 60_000

export function directorTemperature(mode: StoryMode): number {
  return mode === 'creative' ? 0.7 : 0.4
}

export interface NarrativeDirectorOptions {
  readonly client: DeepSeekClient
  readonly onEvent?: (event: DirectorLogEvent) => void
  readonly canonTimeoutMs?: number
  readonly beatsTimeoutMs?: number
}

type Stage = 'canon' | 'beats'

interface StageSuccess<T> {
  readonly ok: true
  readonly value: T
}

interface StageFailure {
  readonly ok: false
  readonly reason: string
}

type StageValidation<T> = StageSuccess<T> | StageFailure

interface StageInput<T> {
  readonly stage: Stage
  readonly messages: readonly DeepSeekMessage[]
  readonly mode: StoryMode
  readonly maxTokens: number
  readonly repairMaxTokens: number
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  readonly validate: (content: string) => StageValidation<T>
  readonly repairMessages: (reason: string, previousContent: string | null) => readonly DeepSeekMessage[]
  readonly truncationMessages: (maxTokens: number) => readonly DeepSeekMessage[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function usageFields(usage: DeepSeekUsage | undefined): { readonly completionTokens?: number; readonly reasoningTokens?: number } {
  return usage === undefined
    ? {}
    : { completionTokens: usage.completionTokens, reasoningTokens: usage.reasoningTokens }
}

export class NativeStoryNarrativeDirector implements StoryNarrativeDirector {
  private readonly client: DeepSeekClient
  private readonly onEvent: (event: DirectorLogEvent) => void
  private readonly canonTimeoutMs: number
  private readonly beatsTimeoutMs: number

  constructor(options: NarrativeDirectorOptions) {
    this.client = options.client
    this.onEvent = options.onEvent ?? (() => undefined)
    this.canonTimeoutMs = options.canonTimeoutMs ?? CANON_TIMEOUT_MS
    this.beatsTimeoutMs = options.beatsTimeoutMs ?? BEATS_TIMEOUT_MS
  }

  async createNarrative(input: Parameters<StoryNarrativeDirector['createNarrative']>[0]): Promise<NarrativeDraft> {
    const canon = await this.runStage<CanonDraft>({
      stage: 'canon',
      mode: input.mode,
      messages: [
        { role: 'system', content: storyCanonSystemPrompt(input.mode) },
        storyCanonUserMessage(input.premise, input.referenceUrl, input.context),
      ],
      maxTokens: CANON_MAX_TOKENS,
      repairMaxTokens: CANON_REPAIR_MAX_TOKENS,
      timeoutMs: this.canonTimeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      validate: (content) => {
        const parsed = parseJson(content)

        if (parsed === undefined) return { ok: false, reason: 'json inválido' }
        if (!isRecord(parsed)) return { ok: false, reason: 'canon: forma inválida' }

        const validation = validateCanon(parsed, { mode: input.mode })

        return validation.ok
          ? { ok: true, value: validation.canon }
          : validation
      },
      repairMessages: storyCanonRepairMessages,
      truncationMessages: storyCanonTruncationRepairMessages,
    })

    const beats = await this.runStage<readonly NarrativeBeat[]>({
      stage: 'beats',
      mode: input.mode,
      messages: [
        { role: 'system', content: storyBeatsSystemPrompt(input.sceneCount, input.mode) },
        storyBeatsUserMessage(input.premise, JSON.stringify(canon)),
      ],
      maxTokens: BEATS_MAX_TOKENS,
      repairMaxTokens: BEATS_REPAIR_MAX_TOKENS,
      timeoutMs: this.beatsTimeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      validate: (content) => {
        const parsed = parseJson(content)

        if (parsed === undefined) return { ok: false, reason: 'json inválido' }

        const validation = validateBeats(parsed, {
          sceneCount: input.sceneCount,
          canon,
        })

        return validation.ok
          ? { ok: true, value: validation.beats }
          : validation
      },
      repairMessages: storyBeatsRepairMessages,
      truncationMessages: storyBeatsTruncationRepairMessages,
    })

    const draft: NarrativeDraft = {
      ...canon,
      beats,
    }
    const validation = validateNarrativeDraft(draft, {
      sceneCount: input.sceneCount,
      mode: input.mode,
    })

    if (!validation.ok) {
      this.fail('beats', 2, 'unknown', 'director-invalid-output', input.mode, 'draft final inválido')
      throw new StoryError('director-invalid-output')
    }

    return validation.draft
  }

  private async runStage<T>(input: StageInput<T>): Promise<T> {
    this.emit({
      event: 'story.narrative.start',
      pass: 'narrative',
      stage: input.stage,
      attempt: 1,
      finishReason: 'unknown',
      mode: input.mode,
    })

    const first = await this.client.complete({
      messages: input.messages,
      temperature: directorTemperature(input.mode),
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      thinking: { mode: 'disabled' },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    if (first.content === null) {
      if (first.finishReason === 'content_filter') {
        this.fail(input.stage, 1, first.finishReason, 'content-blocked', input.mode, 'contenido bloqueado', first.usage)
        throw new StoryError('content-blocked')
      }

      const truncated = first.finishReason === 'length'
      const reason = truncated ? 'respuesta truncada por max_tokens' : 'respuesta vacía'

      this.fail(input.stage, 1, first.finishReason, 'director-invalid-output', input.mode, reason, first.usage)
      const repaired = await this.client.complete({
        messages: truncated
          ? [...input.messages, ...input.truncationMessages(input.repairMaxTokens)]
          : [...input.messages, ...input.repairMessages(reason, null)],
        temperature: directorTemperature(input.mode),
        maxTokens: input.repairMaxTokens,
        timeoutMs: input.timeoutMs,
        thinking: { mode: 'disabled' },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })

      return this.finishStage(repaired, input)
    }

    const validation = input.validate(first.content)
    const truncated = first.finishReason === 'length'

    if (validation.ok && !truncated) {
      this.ok(input.stage, 1, first.finishReason, input.mode, first.usage)
      return validation.value
    }

    const reason = truncated ? 'respuesta truncada por max_tokens' : validation.reason

    this.fail(input.stage, 1, first.finishReason, 'director-invalid-output', input.mode, reason, first.usage)
    const repaired = await this.client.complete({
      messages: truncated
        ? [...input.messages, ...input.truncationMessages(input.repairMaxTokens)]
        : [...input.messages, ...input.repairMessages(reason, first.content)],
      temperature: directorTemperature(input.mode),
      maxTokens: input.repairMaxTokens,
      timeoutMs: input.timeoutMs,
      thinking: { mode: 'disabled' },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    return this.finishStage(repaired, input)
  }

  private async finishStage<T>(
    repaired: Awaited<ReturnType<DeepSeekClient['complete']>>,
    input: StageInput<T>,
  ): Promise<T> {
    if (repaired.content === null) {
      this.fail(
        input.stage,
        2,
        repaired.finishReason,
        'director-invalid-output',
        input.mode,
        repaired.finishReason === 'length' ? 'respuesta truncada por max_tokens' : undefined,
        repaired.usage,
      )
      throw new StoryError('director-invalid-output')
    }

    if (repaired.finishReason === 'length') {
      this.fail(input.stage, 2, repaired.finishReason, 'director-invalid-output', input.mode, 'respuesta truncada por max_tokens', repaired.usage)
      throw new StoryError('director-invalid-output')
    }

    const validation = input.validate(repaired.content)

    if (validation.ok) {
      this.ok(input.stage, 2, repaired.finishReason, input.mode, repaired.usage)
      return validation.value
    }

    this.fail(input.stage, 2, repaired.finishReason, 'director-invalid-output', input.mode, validation.reason, repaired.usage)
    throw new StoryError('director-invalid-output')
  }

  private emit(event: DirectorLogEvent): void {
    this.onEvent(event)
  }

  private ok(
    stage: Stage,
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    mode: StoryMode,
    usage?: DeepSeekUsage,
  ): void {
    this.emit({
      event: 'story.narrative.ok',
      pass: 'narrative',
      stage,
      attempt,
      finishReason,
      mode,
      ...usageFields(usage),
    })
  }

  private fail(
    stage: Stage,
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    errorCode: string,
    mode: StoryMode,
    reason?: string,
    usage?: DeepSeekUsage,
  ): void {
    this.emit({
      event: 'story.narrative.failed',
      pass: 'narrative',
      stage,
      attempt,
      finishReason,
      errorCode,
      mode,
      ...(reason === undefined ? {} : { reason }),
      ...usageFields(usage),
    })
  }
}

export function createStoryNarrativeDirector(
  options: NarrativeDirectorOptions,
): StoryNarrativeDirector {
  return new NativeStoryNarrativeDirector(options)
}
