import type { StoryMode } from '~/models/story'
import type {
  DeepSeekMessage,
  DirectorFinishReason,
  DirectorLogEvent,
  ShotListDraft,
  StoryShotDirector,
} from './director-types'
import type { DeepSeekClient, DeepSeekUsage } from './deepseek-client'
import { StoryError } from './errors'
import { directorTemperature } from './narrative-director'
import { hasSignificantNarrationCopy } from './prompt-guard'
import {
  REEL_SHOT_TIMEOUT_MS,
  reelShotMaxTokens,
  reelShotRepairMaxTokens,
  reelShotRepairMessages,
  reelShotSystemPrompt,
  reelShotTruncationRepairMessages,
  reelShotUserMessage,
} from './reel-shot-prompt'
import { validateShotList } from './shot-plan-validator'

export {
  REEL_SHOT_MAX_TOKENS_LIMIT,
  reelShotMaxTokens,
  reelShotRepairMaxTokens,
} from './reel-shot-prompt'

export interface ReelShotDirectorOptions {
  readonly client: DeepSeekClient
  readonly onEvent?: (event: DirectorLogEvent) => void
  readonly timeoutMs?: number
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

export class NativeReelShotDirector implements StoryShotDirector {
  private readonly client: DeepSeekClient
  private readonly onEvent: (event: DirectorLogEvent) => void
  private readonly timeoutMs: number

  constructor(options: ReelShotDirectorOptions) {
    this.client = options.client
    this.onEvent = options.onEvent ?? (() => undefined)
    this.timeoutMs = options.timeoutMs ?? REEL_SHOT_TIMEOUT_MS
  }

  async createShotList(
    input: Parameters<StoryShotDirector['createShotList']>[0],
  ): Promise<ShotListDraft> {
    const startedAt = Date.now()
    const preset = input.preset ?? 'fast'
    const messages: readonly DeepSeekMessage[] = [
      { role: 'system', content: reelShotSystemPrompt(input.mode, input.durationPlan, preset) },
      reelShotUserMessage(input.premise, input.narrative, input.durationPlan),
    ]
    const baseMaxTokens = reelShotMaxTokens(input.durationPlan)

    this.emit({
      event: 'story.shot.start',
      pass: 'visual',
      stage: 'shots',
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
        this.fail(1, first.finishReason, 'content-blocked', input.mode, startedAt, 'contenido bloqueado', first.usage)
        throw new StoryError('content-blocked')
      }

      const truncated = first.finishReason === 'length'
      const reason = truncated ? 'respuesta truncada por max_tokens' : 'respuesta vacía'

      this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason, first.usage)
      const repaired = await this.client.complete({
        messages: truncated
          ? [...messages, ...reelShotTruncationRepairMessages(reelShotRepairMaxTokens(baseMaxTokens))]
          : [...messages, ...reelShotRepairMessages(reason, null)],
        temperature: directorTemperature(input.mode),
        maxTokens: reelShotRepairMaxTokens(baseMaxTokens),
        timeoutMs: this.timeoutMs,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })

      return this.finishRepair(repaired, input, startedAt)
    }

    const validation = this.validate(first.content, input)
    const truncated = first.finishReason === 'length'

    if (validation.ok && !truncated) {
      this.ok(1, first.finishReason, input.mode, startedAt, first.usage)
      return validation.draft
    }

    const reason = truncated ? 'respuesta truncada por max_tokens' : validation.reason

    this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason, first.usage)
    const repaired = await this.client.complete({
      messages: truncated
        ? [...messages, ...reelShotTruncationRepairMessages(reelShotRepairMaxTokens(baseMaxTokens))]
        : [...messages, ...reelShotRepairMessages(reason, first.content)],
      temperature: directorTemperature(input.mode),
      maxTokens: reelShotRepairMaxTokens(baseMaxTokens),
      timeoutMs: this.timeoutMs,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    return this.finishRepair(repaired, input, startedAt)
  }

  private async finishRepair(
    repaired: Awaited<ReturnType<DeepSeekClient['complete']>>,
    input: Parameters<StoryShotDirector['createShotList']>[0],
    startedAt: number,
  ): Promise<ShotListDraft> {
    if (repaired.content === null) {
      this.fail(
        2,
        repaired.finishReason,
        'director-invalid-output',
        input.mode,
        startedAt,
        repaired.finishReason === 'length' ? 'respuesta truncada por max_tokens' : undefined,
        repaired.usage,
      )
      throw new StoryError('director-invalid-output')
    }

    if (repaired.finishReason === 'length') {
      this.fail(2, repaired.finishReason, 'director-invalid-output', input.mode, startedAt, 'respuesta truncada por max_tokens', repaired.usage)
      throw new StoryError('director-invalid-output')
    }

    const validation = this.validate(repaired.content, input)

    if (validation.ok) {
      this.ok(2, repaired.finishReason, input.mode, startedAt, repaired.usage)
      return validation.draft
    }

    this.fail(2, repaired.finishReason, 'director-invalid-output', input.mode, startedAt, validation.reason, repaired.usage)
    throw new StoryError('director-invalid-output')
  }

  private validate(
    content: string,
    input: Parameters<StoryShotDirector['createShotList']>[0],
  ): ReturnType<typeof validateShotList> {
    const parsed = parseJson(content)

    if (parsed === undefined) return { ok: false, reason: 'json inválido' }

    const validation = validateShotList(parsed, {
      durationPlan: input.durationPlan,
      narrative: input.narrative,
      preset: input.preset ?? 'fast',
    })

    if (!validation.ok) return validation

    for (const scene of validation.draft.scenes) {
      const narrativeScene = input.narrative.scenes.find(
        (value) => value.order === scene.order,
      )

      if (!narrativeScene) return { ok: false, reason: `scenes[${scene.order - 1}]: escena inexistente` }

      for (const shot of scene.shots) {
        if (hasSignificantNarrationCopy(shot.visualPrompt, narrativeScene.narration)) {
          return {
            ok: false,
            reason: `scenes[${scene.order - 1}].shots[${shot.indexInScene - 1}].visualPrompt: copia la narración`,
          }
        }
      }
    }

    return validation
  }

  private emit(event: DirectorLogEvent): void {
    this.onEvent(event)
  }

  private ok(
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    mode: StoryMode,
    startedAt: number,
    usage?: DeepSeekUsage,
  ): void {
    this.emit({
      event: 'story.shot.ok',
      pass: 'visual',
      stage: 'shots',
      attempt,
      finishReason,
      mode,
      latencyMs: Date.now() - startedAt,
      ...usageFields(usage),
    })
  }

  private fail(
    attempt: 1 | 2,
    finishReason: DirectorFinishReason,
    errorCode: string,
    mode: StoryMode,
    startedAt: number,
    reason?: string,
    usage?: DeepSeekUsage,
  ): void {
    this.emit({
      event: 'story.shot.failed',
      pass: 'visual',
      stage: 'shots',
      attempt,
      finishReason,
      errorCode,
      mode,
      ...(reason === undefined ? {} : { reason }),
      latencyMs: Date.now() - startedAt,
      ...usageFields(usage),
    })
  }
}

export function createReelShotDirector(
  options: ReelShotDirectorOptions,
): StoryShotDirector {
  return new NativeReelShotDirector(options)
}
