import type {
  StoryCharacterSheet,
  StoryCharacterView,
} from '~/models/story'
import { StoryError } from './errors'
import { isVerticalAspect } from './aspect-ratio'

/** The four views a sheet needs so the model has data from every angle. */
export const SHEET_VIEWS: readonly StoryCharacterView[] = [
  'front',
  'three-quarter',
  'profile',
  'smile',
]

const VIEW_PROMPTS: Readonly<Record<StoryCharacterView, string>> = {
  front: 'Front view, facing the camera directly, neutral friendly expression, shoulders visible.',
  'three-quarter': 'Three-quarter view, head turned 45 degrees to the side, same expression.',
  profile: 'Side profile view, head turned 90 degrees, same expression.',
  smile: 'Front view, warm closed-mouth smile, same framing as the front view.',
}

/**
 * Prompt for one view of the character sheet. The reference is the person and
 * the look; only the angle changes, so the four views share identity.
 */
export function characterSheetPrompt(view: StoryCharacterView, style: string): string {
  return `${style}. Use the reference image as the exact same character: keep the identical face, hair, beard, eyebrows, eyes and skin tone. Generate one portrait for a character sheet. ${VIEW_PROMPTS[view]} Plain light neutral background, no props, no text, no logo. Vertical 9:16.`
}

export function parseCharacterSheet(value: unknown): StoryCharacterSheet | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const sheet: Partial<Record<StoryCharacterView, string>> = {}

  for (const view of SHEET_VIEWS) {
    const url = record[view]

    if (typeof url !== 'string' || url.length === 0) return null
    sheet[view] = url
  }

  return sheet as StoryCharacterSheet
}

export function assertSheetSize(width: number | null, height: number | null): void {
  if (!isVerticalAspect(width, height)) {
    throw new StoryError('provider-invalid-output')
  }
}

/** Order used when sending the sheet as references. */
export function sheetUrls(sheet: StoryCharacterSheet): readonly string[] {
  return SHEET_VIEWS.map((view) => sheet[view])
}
