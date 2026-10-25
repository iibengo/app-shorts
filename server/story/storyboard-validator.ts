import type {
  StoryBeat,
  StoryCameraShot,
  StoryPlan,
} from '~/models/story'
import type {
  NarrativeDraft,
  StoryboardBeat,
  StoryboardDraft,
} from './director-types'
import { STORY_CAMERAS } from './story-mode'

export const STORYBOARD_KEYS = ['beats'] as const
export const STORYBOARD_BEAT_KEYS = [
  'order',
  'visualPrompt',
  'camera',
  'continuityFromPrevious',
  'transition',
] as const

export type StoryboardValidation =
  | { readonly ok: true; readonly draft: StoryboardDraft }
  | { readonly ok: false; readonly reason: string }

const MARKUP = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const URL = /(?:https?:\/\/|www\.)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function hasAllKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

function invalidText(value: string): boolean {
  return MARKUP.test(value) || MARKDOWN_BLOCK.test(value) || CONTROL.test(value) || URL.test(value)
}

function validateText(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string | null {
  if (typeof value !== 'string') return `${field}: tipo inválido`

  const text = value.normalize('NFC').trim()

  if (text.length < min || text.length > max) return `${field}: longitud fuera de rango`
  if (invalidText(text)) return `${field}: contiene marcas no permitidas`

  return null
}

export function validateStoryboardDraft(
  value: unknown,
  options: { readonly sceneCount: number },
): StoryboardValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, STORYBOARD_KEYS) || !hasAllKeys(value, STORYBOARD_KEYS)) {
    return { ok: false, reason: 'storyboard: forma inválida' }
  }

  if (!Array.isArray(value.beats) || value.beats.length !== options.sceneCount) {
    return { ok: false, reason: `storyboard.beats: se esperaban exactamente ${options.sceneCount}` }
  }

  const beats: StoryboardBeat[] = []

  for (let index = 0; index < value.beats.length; index += 1) {
    const beat = value.beats[index]
    const field = `storyboard.beats[${index}]`

    if (
      !isRecord(beat)
      || !hasOnlyKeys(beat, STORYBOARD_BEAT_KEYS)
      || !hasAllKeys(beat, STORYBOARD_BEAT_KEYS)
    ) {
      return { ok: false, reason: `${field}: forma inválida` }
    }

    if (beat.order !== index + 1) {
      return { ok: false, reason: `${field}.order: debe ser ${index + 1}` }
    }

    const promptError = validateText(beat.visualPrompt, 20, 600, `${field}.visualPrompt`)
    if (promptError) return { ok: false, reason: promptError }

    if (
      typeof beat.camera !== 'string'
      || !(STORY_CAMERAS as readonly string[]).includes(beat.camera)
    ) {
      return { ok: false, reason: `${field}.camera: valor inválido` }
    }

    if (index === 0) {
      if (beat.continuityFromPrevious !== null) {
        return { ok: false, reason: `${field}.continuityFromPrevious: debe ser null` }
      }
    } else {
      const continuityError = validateText(
        beat.continuityFromPrevious,
        20,
        200,
        `${field}.continuityFromPrevious`,
      )
      if (continuityError) return { ok: false, reason: continuityError }
    }

    if (beat.transition !== 'cut') {
      return { ok: false, reason: `${field}.transition: valor inválido` }
    }

    beats.push({
      order: index + 1,
      visualPrompt: (beat.visualPrompt as string).normalize('NFC').trim(),
      camera: beat.camera as StoryCameraShot,
      continuityFromPrevious: index === 0
        ? null
        : (beat.continuityFromPrevious as string).normalize('NFC').trim(),
      transition: 'cut',
    })
  }

  return { ok: true, draft: { beats } }
}

/**
 * Pure merge. Narrative fields are copied byte-for-byte; only the four
 * storyboard fields are added.
 */
export function assembleStoryPlan(
  narrative: NarrativeDraft,
  storyboard: StoryboardDraft,
): StoryPlan {
  const beats: StoryBeat[] = narrative.beats.map((beat, index) => {
    const visual = storyboard.beats[index]!
    // 014: the spoken line is narrative, so it travels with the beat and never
    // with the storyboard. A visual pass must not be able to rewrite the voice.
    const spokenLine = beat.spokenLine

    return {
      ...beat,
      ...(spokenLine === undefined ? {} : { spokenLine }),
      visualPrompt: visual.visualPrompt,
      camera: visual.camera,
      continuityFromPrevious: visual.continuityFromPrevious,
      transition: visual.transition,
    }
  })

  return {
    title: narrative.title,
    logline: narrative.logline,
    tone: narrative.tone,
    storyBible: narrative.storyBible,
    beats,
  }
}
