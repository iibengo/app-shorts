import type { StoryMode } from '~/models/story'
import type {
  DirectorFinishReason,
  DirectorLogEvent,
  StoryboardDraft,
  StoryVisualDirector,
} from './director-types'
import { StoryError } from './errors'
import { directorTemperature } from './narrative-director'
import { assembleStoryPlan, validateStoryboardDraft } from './storyboard-validator'
import {
  STORY_PROMPT_MAX_LENGTH,
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  storyPromptComposer,
} from './story-prompt-composer'
import {
  storyVisualRepairMessages,
  storyVisualSystemPrompt,
  storyVisualTruncationRepairMessages,
  storyVisualUserMessage,
} from './visual-prompt'
import type { DeepSeekClient, DeepSeekUsage } from './deepseek-client'
import { hasSignificantNarrationCopy } from './prompt-guard'

export const VISUAL_TOKENS_BY_SCENE: Readonly<Record<number, number>> = {
  4: 2_400,
  5: 2_800,
  6: 3_200,
}
export const VISUAL_MAX_TOKENS = 2_800
export const VISUAL_MAX_TOKENS_LIMIT = 4_000
export const VISUAL_REPAIR_INCREMENT = 300
export const VISUAL_TIMEOUT_MS = 40_000

export function visualMaxTokens(sceneCount: number): number {
  return Math.min(
    VISUAL_TOKENS_BY_SCENE[sceneCount] ?? VISUAL_MAX_TOKENS,
    VISUAL_MAX_TOKENS_LIMIT,
  )
}

export function visualRepairMaxTokens(base: number): number {
  return Math.min(VISUAL_MAX_TOKENS_LIMIT, base + VISUAL_REPAIR_INCREMENT)
}

export interface VisualDirectorOptions {
  readonly client: DeepSeekClient
  readonly onEvent?: (event: DirectorLogEvent) => void
  readonly timeoutMs?: number
}

function usageFields(usage: DeepSeekUsage | undefined): { readonly completionTokens?: number; readonly reasoningTokens?: number } {
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

export class NativeStoryVisualDirector implements StoryVisualDirector {
  private readonly client: DeepSeekClient
  private readonly onEvent: (event: DirectorLogEvent) => void
  private readonly timeoutMs: number

  constructor(options: VisualDirectorOptions) {
    this.client = options.client
    this.onEvent = options.onEvent ?? (() => undefined)
    this.timeoutMs = options.timeoutMs ?? VISUAL_TIMEOUT_MS
  }

  async createStoryboard(input: Parameters<StoryVisualDirector['createStoryboard']>[0]): Promise<StoryboardDraft> {
    const startedAt = Date.now()
    const messages = [
      { role: 'system' as const, content: storyVisualSystemPrompt() },
      storyVisualUserMessage(input.premise, input.mode, input.narrative),
    ]
    const baseMaxTokens = visualMaxTokens(input.narrative.beats.length)

    this.emit({
      event: 'story.visual.start',
      pass: 'visual',
      attempt: 1,
      finishReason: 'unknown',
      mode: input.mode,
    })

    const first = await this.client.complete({
      messages,
      temperature: directorTemperature(input.mode),
      maxTokens: baseMaxTokens,
      timeoutMs: this.timeoutMs,
      thinking: { mode: 'disabled' },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    if (first.content === null) {
      if (first.finishReason === 'content_filter') {
        this.fail(1, first.finishReason, 'content-blocked', input.mode, startedAt, undefined, first.usage)
        throw new StoryError('content-blocked')
      }

      const truncated = first.finishReason === 'length'
      const reason = truncated
        ? 'respuesta truncada por max_tokens'
        : 'respuesta vacía'

      this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason, first.usage)
      const repaired = await this.client.complete({
        messages: truncated
          ? [...messages, ...storyVisualTruncationRepairMessages(visualRepairMaxTokens(baseMaxTokens))]
          : [...messages, ...storyVisualRepairMessages(reason, null)],
        temperature: directorTemperature(input.mode),
        maxTokens: visualRepairMaxTokens(baseMaxTokens),
        timeoutMs: this.timeoutMs,
        thinking: { mode: 'disabled' },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })

      return this.finishRepair(repaired, input, startedAt)
    }

    const validation = this.validate(first.content, input.narrative)
    const truncated = first.finishReason === 'length'

    if (validation.ok && !truncated) {
      this.ok(1, first.finishReason, input.mode, startedAt, first.usage)
      return validation.draft
    }

    const reason = truncated ? 'respuesta truncada por max_tokens' : validation.reason

    this.fail(1, first.finishReason, 'director-invalid-output', input.mode, startedAt, reason, first.usage)
    const repaired = await this.client.complete({
      messages: truncated
        ? [...messages, ...storyVisualTruncationRepairMessages(visualRepairMaxTokens(baseMaxTokens))]
        : [...messages, ...storyVisualRepairMessages(reason, first.content)],
      temperature: directorTemperature(input.mode),
      maxTokens: visualRepairMaxTokens(baseMaxTokens),
      timeoutMs: this.timeoutMs,
      thinking: { mode: 'disabled' },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    return this.finishRepair(repaired, input, startedAt)
  }

  private async finishRepair(
    repaired: Awaited<ReturnType<DeepSeekClient['complete']>>,
    input: Parameters<StoryVisualDirector['createStoryboard']>[0],
    startedAt: number,
  ): Promise<StoryboardDraft> {
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
      this.fail(
        2,
        repaired.finishReason,
        'director-invalid-output',
        input.mode,
        startedAt,
        'respuesta truncada por max_tokens',
        repaired.usage,
      )
      throw new StoryError('director-invalid-output')
    }

    const validation = this.validate(repaired.content, input.narrative)

    if (validation.ok) {
      this.ok(2, repaired.finishReason, input.mode, startedAt, repaired.usage)
      return validation.draft
    }

    this.fail(2, repaired.finishReason, 'director-invalid-output', input.mode, startedAt, validation.reason, repaired.usage)
    throw new StoryError('director-invalid-output')
  }

  private validate(
    content: string,
    narrative: Parameters<StoryVisualDirector['createStoryboard']>[0]['narrative'],
  ): ReturnType<typeof validateStoryboardDraft> {
    const parsed = parseJson(content)

    if (parsed === undefined) return { ok: false, reason: 'json inválido' }

    const validation = validateStoryboardDraft(parsed, {
      sceneCount: narrative.beats.length,
    })

    if (!validation.ok) return validation

    const plan = assembleStoryPlan(narrative, validation.draft)

    for (const beat of plan.beats) {
      if (hasSignificantNarrationCopy(beat.visualPrompt, beat.narration)) {
        return {
          ok: false,
          reason: `beats[${beat.order - 1}].visualPrompt: copia la narración`,
        }
      }

      const keyframe = storyPromptComposer.composeKeyframe({
        bible: plan.storyBible,
        beat,
        hasReference: false,
      })

      if (keyframe.prompt.length > STORY_PROMPT_MAX_LENGTH) {
        return { ok: false, reason: `beats[${beat.order - 1}]: prompt final demasiado largo` }
      }

      let video: ReturnType<typeof storyPromptComposer.composeVideo>

      try {
        video = storyPromptComposer.composeVideo({
          bible: plan.storyBible,
          beat,
          preset: 'fast',
        })
      } catch (error) {
        if (error instanceof StoryError && error.code === 'invalid-visual-prompt') {
          return { ok: false, reason: `beats[${beat.order - 1}]: prompt de vídeo demasiado largo` }
        }

        throw error
      }

      if (video.prompt.length > STORY_VIDEO_PROMPT_MAX_LENGTH) {
        return { ok: false, reason: `beats[${beat.order - 1}]: prompt de vídeo demasiado largo` }
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
      event: 'story.visual.ok',
      pass: 'visual',
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
      event: 'story.visual.failed',
      pass: 'visual',
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

export function createStoryVisualDirector(
  options: VisualDirectorOptions,
): StoryVisualDirector {
  return new NativeStoryVisualDirector(options)
}
