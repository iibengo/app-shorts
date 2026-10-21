import type { DirectorPlan } from './director-types'
import { STORY_MIN_NARRATION_LENGTH } from './validation'

export const DIRECTOR_MIN_VISUAL_PROMPT_LENGTH = 20
export const DIRECTOR_MAX_VISUAL_PROMPT_LENGTH = 600
export const DIRECTOR_MIN_NARRATION_LENGTH = STORY_MIN_NARRATION_LENGTH
export const DIRECTOR_MAX_NARRATION_LENGTH = 280
export const DIRECTOR_MAX_TITLE_LENGTH = 80
export const DIRECTOR_MAX_LOGLINE_LENGTH = 200

export const DIRECTOR_PLAN_KEYS = ['title', 'logline', 'beats'] as const
export const DIRECTOR_BEAT_KEYS = ['order', 'visualPrompt', 'narration'] as const

const MARKUP_CHARACTERS = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

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

  if (containsDirectorMarkup(normalized) || hasControlCharacters(normalized)) {
    return `${field}: contiene marcas no permitidas`
  }

  return null
}

function validateBeat(value: unknown, index: number): string | null {
  if (!isRecord(value) || !hasOnlyKeys(value, DIRECTOR_BEAT_KEYS)) {
    return `beats[${index}]: forma inválida`
  }

  if (value.order !== index + 1) {
    return `beats[${index}]: order debe ser ${index + 1}`
  }

  if (typeof value.visualPrompt !== 'string') {
    return `beats[${index}].visualPrompt: tipo inválido`
  }

  const visualPrompt = normalizeText(value.visualPrompt)

  if (
    visualPrompt.length < DIRECTOR_MIN_VISUAL_PROMPT_LENGTH
    || visualPrompt.length > DIRECTOR_MAX_VISUAL_PROMPT_LENGTH
  ) {
    return `beats[${index}].visualPrompt: longitud fuera de rango`
  }

  if (containsDirectorMarkup(visualPrompt) || hasControlCharacters(visualPrompt)) {
    return `beats[${index}].visualPrompt: contiene marcas no permitidas`
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

export function validateDirectorPlan(
  value: unknown,
  sceneCount: number,
): DirectorPlanValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, DIRECTOR_PLAN_KEYS)) {
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

  const beats: { order: number; visualPrompt: string; narration: string }[] = []

  for (let index = 0; index < value.beats.length; index += 1) {
    const error = validateBeat(value.beats[index], index)

    if (error) {
      return { ok: false, reason: error }
    }

    const beat = value.beats[index] as Record<string, unknown>

    beats.push({
      order: index + 1,
      visualPrompt: normalizeText(beat.visualPrompt as string),
      narration: normalizeText(beat.narration as string).replace(/\s*\n+\s*/g, ' '),
    })
  }

  return {
    ok: true,
    plan: {
      title: normalizeText(value.title as string),
      logline: normalizeText(value.logline as string),
      beats,
    },
  }
}
