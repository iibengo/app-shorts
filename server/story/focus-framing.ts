import type { StoryBible, StoryShotFraming } from '~/models/story'

/**
 * A shot whose action belongs to a secondary character must be framed on that
 * character, or it comes out tiny and lost in the background. This module
 * resolves which character the subject names and rewrites the framing when the
 * one the director chose cannot show it.
 *
 * Pure and deterministic: no I/O, no clock, no provider.
 */

/** Framings that can carry a secondary character as the focus. */
export const FOCUSED_FRAMINGS: readonly StoryShotFraming[] = [
  'close-up',
  'extreme-close-up',
  'insert',
  'detail',
  'reaction',
]

export const FOCUS_FALLBACK_FRAMING: StoryShotFraming = 'close-up'

export interface FocusResolution {
  /** Character the framing is about, or null when it cannot be decided. */
  readonly characterId: string | null
  readonly characterName: string | null
  /** True when two or more canon names appear: a group shot, never rewritten. */
  readonly ambiguous: boolean
}

export interface FocusNormalization {
  readonly framing: StoryShotFraming
  /** True when the framing was rewritten to the focused fallback. */
  readonly normalized: boolean
}

/** Lowercase, no diacritics, collapsed spaces. Keeps accented names matchable. */
export function normalizeFocusText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `subject` names the character the shot is about. Zero or several matches
 * return an unresolved resolution: validating them would either invent a focus
 * or turn a two-shot into a close-up of one person.
 */
export function resolveFocus(
  subject: string | undefined,
  bible: StoryBible | null,
): FocusResolution {
  const text = normalizeFocusText(subject ?? '')

  if (text.length === 0) {
    return { characterId: null, characterName: null, ambiguous: false }
  }

  const characters = bible === null ? [] : bible.characters

  const matches = characters.filter((character) => {
    const name = normalizeFocusText(character.name)

    return name.length > 0 && text.includes(name)
  })

  if (matches.length === 0) {
    return { characterId: null, characterName: null, ambiguous: false }
  }

  if (matches.length > 1) {
    return { characterId: null, characterName: null, ambiguous: true }
  }

  const only = matches[0]!

  return { characterId: only.id, characterName: only.name, ambiguous: false }
}

/**
 * Every framing suits the protagonist: a wide shot of the lead is a valid wide
 * shot. A secondary character only reads in a focused framing.
 */
export function normalizeFocusFraming(
  framing: StoryShotFraming,
  resolution: FocusResolution,
  leadCharacterId: string | null,
): FocusNormalization {
  if (resolution.characterId === null) return { framing, normalized: false }
  if (resolution.characterId === leadCharacterId) return { framing, normalized: false }
  if (FOCUSED_FRAMINGS.includes(framing)) return { framing, normalized: false }

  return { framing: FOCUS_FALLBACK_FRAMING, normalized: true }
}

/** Prompt block that fixes how much of the frame the focus occupies. */
export function focusSizeBlock(
  framing: StoryShotFraming,
  characterName: string | null,
): string {
  if (characterName === null) return ''

  const name = characterName.trim()

  if (name.length === 0) return ''

  switch (framing) {
    case 'close-up':
    case 'reaction':
      return `The ${name} occupies about two thirds of the frame width and is in sharp focus.`
    case 'extreme-close-up':
    case 'detail':
    case 'insert':
      return `The frame is filled by ${name}; nothing else competes for attention.`
    case 'medium':
      return `The ${name} occupies about one third of the frame width and is in sharp focus.`
    default:
      return ''
  }
}
