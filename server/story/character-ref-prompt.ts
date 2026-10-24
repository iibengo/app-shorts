import type { StoryCharacter, StoryVisualStyle } from '~/models/story'
import { StoryError } from './errors'
import { SINGLE_FRAME_BLOCK } from './story-prompt-composer'
import { styleBlockFor } from './visual-style'

/**
 * One image per character. The budget keeps the identity sentence, the
 * wardrobe and the single-frame guard inside one short prompt: Nano Banana
 * reads style first and the character description afterwards.
 */
export const CHARACTER_REF_PROMPT_MAX_CHARS = 600

function compact(value: string, maxLength: number): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ')

  if (normalized.length <= maxLength) return normalized

  const slice = normalized.slice(0, Math.max(0, maxLength - 1))
  const lastSpace = slice.lastIndexOf(' ')

  if (lastSpace <= 0) return `${slice}…`

  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

function body(
  character: StoryCharacter,
  descriptionBudget: number,
  wardrobeBudget: number,
  hasStyleReference: boolean,
): string {
  const styleReference = hasStyleReference
    ? 'Use the reference image only for its visual style and palette. '
    : ''

  // 013: describe the absence instead of forbidding it. Nano Banana has no
  // negative channel, and "no text" names the thing it should avoid.
  // A clean studio background is what keeps the face readable when this image
  // is later used as a reference for a busy scene.
  return `${styleReference}One single character, front view, facing the camera, full body visible. `
    + `${character.name}: ${compact(character.description, descriptionBudget)}. `
    + `Wardrobe: ${compact(character.wardrobe, wardrobeBudget)}. `
    + `${SINGLE_FRAME_BLOCK} `
    + 'A plain neutral studio backdrop, evenly lit, with clean unmarked surfaces. Vertical 9:16.'
}

export interface CharacterReferencePromptOptions {
  readonly hasStyleReference: boolean
  readonly maxLength?: number
}

/**
 * Pure and deterministic. The visual style opens the prompt, the character
 * identity comes from the canon, and the grid is forbidden everywhere.
 */
export function characterReferencePrompt(
  character: StoryCharacter,
  style: StoryVisualStyle,
  options: CharacterReferencePromptOptions,
): string {
  const budget = options.maxLength === undefined
    ? CHARACTER_REF_PROMPT_MAX_CHARS
    : Math.min(options.maxLength, CHARACTER_REF_PROMPT_MAX_CHARS)
  const stylePrefix = `${styleBlockFor(style)}. `
  // The description and the wardrobe degrade first; the style block and the
  // single-frame guard never do.
  const ladder: readonly (readonly [number, number])[] = [
    [320, 180],
    [200, 120],
    [140, 90],
    [90, 60],
    [60, 40],
  ]

  for (const [descriptionBudget, wardrobeBudget] of ladder) {
    const candidate = `${stylePrefix}${body(
      character,
      descriptionBudget,
      wardrobeBudget,
      options.hasStyleReference,
    )}`

    if (candidate.length <= budget) return candidate
  }

  throw new StoryError('invalid-visual-prompt')
}
