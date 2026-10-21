import type { StoryBeat, StoryPlan } from '~/models/story'
import type { DirectorPlan } from './director-types'
import {
  validateContinuityBeats,
  validateStoryBible,
} from './bible-validator'
import { STORY_MIN_NARRATION_LENGTH } from './validation'

export const DIRECTOR_MIN_VISUAL_PROMPT_LENGTH = 20
export const DIRECTOR_MAX_VISUAL_PROMPT_LENGTH = 600
export const DIRECTOR_MIN_NARRATION_LENGTH = STORY_MIN_NARRATION_LENGTH
export const DIRECTOR_MAX_NARRATION_LENGTH = 280
export const DIRECTOR_MAX_TITLE_LENGTH = 80
export const DIRECTOR_MAX_LOGLINE_LENGTH = 200

export const DIRECTOR_PLAN_KEYS = ['title', 'logline', 'storyBible', 'beats'] as const
export const DIRECTOR_LEGACY_BEAT_KEYS = ['order', 'visualPrompt', 'narration'] as const

const MARKUP_CHARACTERS = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const URL_PATTERN = /(?:https?:\/\/|www\.)/i

export interface ValidateDirectorPlanOptions {
  /**
   * Only the persisted-row read path accepts plans stored before 006 without a
   * Story Bible. Creation is always strict.
   */
  readonly allowLegacyBible?: boolean
}

export type DirectorPlanValidation =
  | { readonly ok: true; readonly plan: DirectorPlan }
  | { readonly ok: false; readonly reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: string): string {
  return value.normalize('NFC').trim()
}

export function containsDirectorMarkup(value: string): boolean {
  return MARKUP_CHARACTERS.test(value) || MARKDOWN_BLOCK.test(value)
}

function hasControlCharacters(value: string): boolean {
  return CONTROL_CHARACTERS.test(value)
}

function containsUrl(value: string): boolean {
  return URL_PATTERN.test(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function validateSingleLine(
  value: unknown,
  maxLength: number,
  field: string,
): string | null {
  if (typeof value !== 'string') {
    return `${field}: tipo inválido`
  }

  const normalized = normalizeText(value)

  if (normalized.length < 1 || normalized.length > maxLength) {
    return `${field}: longitud fuera de rango`
  }

  if (
    containsDirectorMarkup(normalized)
    || hasControlCharacters(normalized)
    || containsUrl(normalized)
  ) {
    return `${field}: contiene marcas no permitidas`
  }

  return null
}

function validateLegacyBeat(value: unknown, index: number): string | null {
  if (!isRecord(value) || !hasOnlyKeys(value, DIRECTOR_LEGACY_BEAT_KEYS)) {
    return `beats[${index}]: forma inválida`
  }

  if (value.order !== index + 1) {
    return `beats[${index}]: order debe ser ${index + 1}`
  }

  const visualPromptError = validateSingleLine(
    value.visualPrompt,
    DIRECTOR_MAX_VISUAL_PROMPT_LENGTH,
    `beats[${index}].visualPrompt`,
  )

  if (visualPromptError) return visualPromptError

  const visualPrompt = normalizeText(value.visualPrompt as string)

  if (visualPrompt.length < DIRECTOR_MIN_VISUAL_PROMPT_LENGTH) {
    return `beats[${index}].visualPrompt: longitud fuera de rango`
  }

  if (typeof value.narration !== 'string') {
    return `beats[${index}].narration: tipo inválido`
  }

  const narration = normalizeText(value.narration).replace(/\s*\n+\s*/g, ' ')

  if (
    narration.length < DIRECTOR_MIN_NARRATION_LENGTH
    || narration.length > DIRECTOR_MAX_NARRATION_LENGTH
  ) {
    return `beats[${index}].narration: longitud fuera de rango`
  }

  if (containsDirectorMarkup(narration) || hasControlCharacters(narration)) {
    return `beats[${index}].narration: contiene marcas no permitidas`
  }

  return null
}

function legacyBeat(
  value: Record<string, unknown>,
  index: number,
  total: number,
): StoryBeat {
  return {
    order: index + 1,
    sceneRole: index === 0
      ? 'establishing'
      : index === total - 1
        ? 'resolution'
        : 'development',
    visualPrompt: normalizeText(value.visualPrompt as string),
    narration: normalizeText(value.narration as string).replace(/\s*\n+\s*/g, ' '),
    characters: [],
    props: [],
    camera: 'wide',
    continuityFromPrevious: index === 0 ? null : 'Continúa la escena anterior.',
    transition: 'cut',
  }
}

export function validateDirectorPlan(
  value: unknown,
  sceneCount: number,
  options: ValidateDirectorPlanOptions = {},
): DirectorPlanValidation {
  if (!isRecord(value)) {
    return { ok: false, reason: 'plan: forma inválida' }
  }

  const hasBible = value.storyBible !== undefined && value.storyBible !== null

  if (!hasBible) {
    if (!options.allowLegacyBible) {
      return { ok: false, reason: 'storyBible: ausente' }
    }

    if (!hasOnlyKeys(value, ['title', 'logline', 'beats'])) {
      return { ok: false, reason: 'plan: forma inválida' }
    }
  } else if (
    !hasOnlyKeys(value, DIRECTOR_PLAN_KEYS)
    || !('title' in value)
    || !('logline' in value)
    || !('beats' in value)
  ) {
    return { ok: false, reason: 'plan: forma inválida' }
  }

  const titleError = validateSingleLine(value.title, DIRECTOR_MAX_TITLE_LENGTH, 'title')

  if (titleError) {
    return { ok: false, reason: titleError }
  }

  const loglineError = validateSingleLine(
    value.logline,
    DIRECTOR_MAX_LOGLINE_LENGTH,
    'logline',
  )

  if (loglineError) {
    return { ok: false, reason: loglineError }
  }

  if (!Array.isArray(value.beats) || value.beats.length !== sceneCount) {
    return {
      ok: false,
      reason: `beats: se esperaban exactamente ${sceneCount}`,
    }
  }

  const title = normalizeText(value.title as string)
  const logline = normalizeText(value.logline as string)

  if (!hasBible) {
    const beats: StoryBeat[] = []

    for (let index = 0; index < value.beats.length; index += 1) {
      const error = validateLegacyBeat(value.beats[index], index)

      if (error) return { ok: false, reason: error }

      beats.push(
        legacyBeat(value.beats[index] as Record<string, unknown>, index, sceneCount),
      )
    }

    return { ok: true, plan: { title, logline, storyBible: null, beats } }
  }

  const bibleValidation = validateStoryBible(value.storyBible)

  if (!bibleValidation.ok) {
    return { ok: false, reason: bibleValidation.reason }
  }

  const beatsValidation = validateContinuityBeats(
    value.beats,
    sceneCount,
    bibleValidation.bible,
  )

  if (!beatsValidation.ok) {
    return { ok: false, reason: beatsValidation.reason }
  }

  return {
    ok: true,
    plan: {
      title,
      logline,
      storyBible: bibleValidation.bible,
      beats: beatsValidation.beats,
    },
  }
}

/** Builds the shared plan contract from a validated director response. */
export function toStoryPlan(plan: DirectorPlan): StoryPlan {
  return {
    title: plan.title,
    logline: plan.logline,
    storyBible: plan.storyBible,
    beats: plan.beats,
  }
}
