import type { StoryMode } from '~/models/story'
import type {
  CanonDraft,
  DeepSeekMessage,
  DirectorContext,
  DirectorFinishReason,
  DirectorLogEvent,
  NarrativeDraft,
  StoryNarrativeDirector,
} from './director-types'
import { validateCanon } from './canon-validator'
import type { DeepSeekClient, DeepSeekUsage } from './deepseek-client'
import { StoryError } from './errors'
import { directorTemperature } from './narrative-director'
import { analyzePremise } from './premise-brief'
import {
  reelCanonRepairMessages,
  reelCanonSystemPrompt,
  reelCanonTruncationRepairMessages,
  reelCanonUserMessage,
  reelScenesRepairMessages,
  reelScenesSystemPrompt,
  reelScenesTruncationRepairMessages,
  reelScenesUserMessage,
} from './reel-narrative-prompt'
import {
  validateReelNarrativeDraft,
  validateReelScenes,
} from './reel-narrative-validator'

export const REEL_CANON_MAX_TOKENS = 8_000
export const REEL_CANON_REPAIR_MAX_TOKENS = 8_000
export const REEL_SCENES_MAX_TOKENS = 8_000
export const REEL_SCENES_REPAIR_MAX_TOKENS = 8_000
export const REEL_CANON_TIMEOUT_MS = 60_000
export const REEL_SCENES_TIMEOUT_MS = 60_000

export interface ReelNarrativeDirectorOptions {
  readonly client: DeepSeekClient
  readonly onEvent?: (event: DirectorLogEvent) => void
  readonly canonTimeoutMs?: number
  readonly scenesTimeoutMs?: number
}

type Stage = 'canon' | 'scenes'

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

function usageFields(
  usage: DeepSeekUsage | undefined,
): { readonly completionTokens?: number; readonly reasoningTokens?: number } {
  return usage === undefined
    ? {}
    : { completionTokens: usage.completionTokens, reasoningTokens: usage.reasoningTokens }
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

export class NativeReelNarrativeDirector implements StoryNarrativeDirector {
  private readonly client: DeepSeekClient
  private readonly onEvent: (event: DirectorLogEvent) => void
  private readonly canonTimeoutMs: number
  private readonly scenesTimeoutMs: number

  constructor(options: ReelNarrativeDirectorOptions) {
    this.client = options.client
    this.onEvent = options.onEvent ?? (() => undefined)
    this.canonTimeoutMs = options.canonTimeoutMs ?? REEL_CANON_TIMEOUT_MS
    this.scenesTimeoutMs = options.scenesTimeoutMs ?? REEL_SCENES_TIMEOUT_MS
  }

  async createNarrative(
    input: Parameters<StoryNarrativeDirector['createNarrative']>[0],
  ): Promise<NarrativeDraft> {
    const context = this.contextFor(input)
    const canon = await this.runStage<CanonDraft>({
      stage: 'canon',
      mode: input.mode,
      messages: [
        { role: 'system', content: reelCanonSystemPrompt(input.mode, input.durationPlan) },
        reelCanonUserMessage(input.premise, input.durationPlan, input.referenceUrl, context),
      ],
      maxTokens: REEL_CANON_MAX_TOKENS,
      repairMaxTokens: REEL_CANON_REPAIR_MAX_TOKENS,
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
      repairMessages: reelCanonRepairMessages,
      truncationMessages: reelCanonTruncationRepairMessages,
    })

    const scenes = await this.runStage<readonly NarrativeDraft['scenes'][number][]>({
      stage: 'scenes',
      mode: input.mode,
      messages: [
        { role: 'system', content: reelScenesSystemPrompt(input.mode, input.durationPlan) },
        reelScenesUserMessage(input.premise, JSON.stringify(canon), input.durationPlan),
      ],
      maxTokens: REEL_SCENES_MAX_TOKENS,
      repairMaxTokens: REEL_SCENES_REPAIR_MAX_TOKENS,
      timeoutMs: this.scenesTimeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      validate: (content) => {
        const parsed = parseJson(content)

        if (parsed === undefined) return { ok: false, reason: 'json inválido' }

        const validation = validateReelScenes(parsed, {
          canon,
          durationPlan: input.durationPlan,
        })

        return validation.ok
          ? { ok: true, value: validation.scenes }
          : validation
      },
      repairMessages: reelScenesRepairMessages,
      truncationMessages: reelScenesTruncationRepairMessages,
    })

    const draft: NarrativeDraft = {
      ...canon,
      scenes,
    }
    const validation = validateReelNarrativeDraft(draft, {
      mode: input.mode,
      durationPlan: input.durationPlan,
    })

    if (!validation.ok) {
      this.fail('scenes', 2, 'unknown', 'director-invalid-output', input.mode, 'draft final inválido')
      throw new StoryError('director-invalid-output')
    }

    return validation.draft
  }

  private contextFor(
    input: Parameters<StoryNarrativeDirector['createNarrative']>[0],
  ): DirectorContext | undefined {
    if (input.context) return input.context

    const brief = analyzePremise(input.premise).brief

    return brief.applied ? { brief } : undefined
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

export function createReelNarrativeDirector(
  options: ReelNarrativeDirectorOptions,
): StoryNarrativeDirector {
  return new NativeReelNarrativeDirector(options)
}
