import type { StoryMode, StoryPlan } from '~/models/story'
import { validateNarrativeDraft } from './canon-validator'
import type { NarrativeDraft, StoryboardDraft } from './director-types'
import { StoryError } from './errors'
import { normalizeLegacyPlan } from './legacy-plan'
import {
  STORY_GLOBAL_BLOCK_MAX_LENGTH,
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  STORY_PROMPT_MAX_LENGTH,
  composeGlobalBlock,
  storyPromptComposer,
} from './story-prompt-composer'
import { assembleStoryPlan, validateStoryboardDraft } from './storyboard-validator'

export const DIRECTOR_MIN_VISUAL_PROMPT_LENGTH = 20
export const DIRECTOR_MAX_VISUAL_PROMPT_LENGTH = 600
export const DIRECTOR_MIN_NARRATION_LENGTH = 10
export const DIRECTOR_MAX_NARRATION_LENGTH = 280
export const DIRECTOR_MAX_TITLE_LENGTH = 80
export const DIRECTOR_MAX_LOGLINE_LENGTH = 200

export interface StoryPlanValidationOptions {
  readonly sceneCount: number
  readonly mode: StoryMode
  readonly allowLegacy?: boolean
  readonly premise?: string
  readonly logline?: string | null
}

export type StoryPlanValidation =
  | { readonly ok: true; readonly plan: StoryPlan }
  | { readonly ok: false; readonly reason: string }

const NARRATIVE_KEYS = [
  'order',
  'sceneRole',
  'locationId',
  'timeOfDay',
  'weather',
  'characters',
  'props',
  'action',
  'narration',
  'storyFunction',
  'gag',
  'stake',
] as const
const STORYBOARD_KEYS = [
  'order',
  'visualPrompt',
  'camera',
  'continuityFromPrevious',
  'transition',
] as const
const PLAN_BEAT_KEYS = new Set([...NARRATIVE_KEYS, ...STORYBOARD_KEYS])
const PLAN_KEYS = new Set(['title', 'logline', 'tone', 'storyBible', 'beats'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key of keys) result[key] = value[key]

  return result
}

function splitPlan(value: unknown): {
  readonly narrative: unknown
  readonly storyboard: unknown
} | null {
  if (!isRecord(value) || !Array.isArray(value.beats)) return null
  if (Object.keys(value).some((key) => !PLAN_KEYS.has(key))) return null
  if (!value.beats.every((beat) => isRecord(beat)
    && Object.keys(beat).every((key) => PLAN_BEAT_KEYS.has(key)))) {
    return null
  }

  return {
    narrative: {
      title: value.title,
      logline: value.logline,
      tone: value.tone,
      storyBible: value.storyBible,
      beats: value.beats.map((beat) => isRecord(beat) ? pick(beat, NARRATIVE_KEYS) : beat),
    },
    storyboard: {
      beats: value.beats.map((beat) => isRecord(beat) ? pick(beat, STORYBOARD_KEYS) : beat),
    },
  }
}

function validateAssembledPlan(
  value: unknown,
  options: StoryPlanValidationOptions,
): StoryPlanValidation {
  const split = splitPlan(value)

  if (!split) return { ok: false, reason: 'plan: forma inválida' }

  const narrative = validateNarrativeDraft(split.narrative, {
    sceneCount: options.sceneCount,
    mode: options.mode,
  })

  if (!narrative.ok) return { ok: false, reason: narrative.reason }

  const storyboard = validateStoryboardDraft(split.storyboard, {
    sceneCount: options.sceneCount,
  })

  if (!storyboard.ok) return { ok: false, reason: storyboard.reason }

  const plan = assembleStoryPlan(narrative.draft, storyboard.draft)

  for (const beat of plan.beats) {
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

  return { ok: true, plan }
}

export function validateStoryPlan(
  value: unknown,
  options: StoryPlanValidationOptions,
): StoryPlanValidation {
  const current = validateAssembledPlan(value, options)

  if (current.ok) return current

  if (options.allowLegacy !== true) return current

  const legacy = normalizeLegacyPlan(value, {
    sceneCount: options.sceneCount,
    premise: options.premise ?? '',
    logline: options.logline ?? null,
    mode: options.mode,
  })

  if (!legacy) return current

  if (legacy.storyBible !== null) {
    if (composeGlobalBlock(legacy.storyBible).length > STORY_GLOBAL_BLOCK_MAX_LENGTH) {
      return current
    }

    for (const beat of legacy.beats) {
      const keyframe = storyPromptComposer.composeKeyframe({
        bible: legacy.storyBible,
        beat,
        hasReference: false,
      })
      let video: ReturnType<typeof storyPromptComposer.composeVideo>

      try {
        video = storyPromptComposer.composeVideo({
          bible: legacy.storyBible,
          beat,
          preset: 'fast',
        })
      } catch (error) {
        if (error instanceof StoryError && error.code === 'invalid-visual-prompt') {
          return current
        }

        throw error
      }

      if (
        keyframe.prompt.length > STORY_PROMPT_MAX_LENGTH
        || video.prompt.length > STORY_VIDEO_PROMPT_MAX_LENGTH
      ) {
        return current
      }
    }
  }

  return { ok: true, plan: legacy }
}

/**
 * Compatibility alias for older persisted-plan call sites. New creation code
 * uses `validateStoryPlan` with an explicit mode.
 */
export function validateDirectorPlan(
  value: unknown,
  sceneCount: number,
  options: { readonly allowLegacyBible?: boolean; readonly mode?: StoryMode } = {},
): StoryPlanValidation {
  return validateStoryPlan(value, {
    sceneCount,
    mode: options.mode ?? 'faithful',
    allowLegacy: options.allowLegacyBible,
  })
}

export type { NarrativeDraft, StoryboardDraft }
