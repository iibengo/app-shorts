import type { StoryVisualStyle } from '~/models/story'
import { STORY_VISUAL_STYLES } from '~/models/story'
import { StoryError } from './errors'

/**
 * Single source of truth for the look of the channel. The client sends an id;
 * the prompt text lives here, in English, and is versioned with the code.
 * Adding a style is one entry in this registry, never a new spec.
 */
const STYLE_BLOCKS: Readonly<Record<StoryVisualStyle, string>> = {
  cartoon3d:
    '3D cartoon render, glossy stylized characters, Pixar-like proportions, soft studio lighting, clean pastel palette',
  papercraft:
    'low-poly papercraft 3D render, faceted geometric shapes, matte paper texture, dark navy background with neon pink and blue accents, dramatic rim light',
  clay:
    'claymation stop-motion look, handmade plasticine characters, visible fingerprints, warm soft light, miniature set',
  anime:
    'anime illustration style, clean cel shading, expressive eyes, dynamic composition, vibrant colors',
  photo:
    'photorealistic cinematic still, natural lighting, shallow depth of field, 35mm lens, high detail',
}

/** Short form of each style block, used when the prompt budget is tight. */
const STYLE_BLOCKS_SHORT: Readonly<Record<StoryVisualStyle, string>> = {
  cartoon3d: '3D cartoon render, glossy stylized characters, soft studio lighting',
  papercraft: 'low-poly papercraft 3D render, faceted paper planes, neon accents',
  clay: 'claymation look, handmade plasticine characters, warm soft light',
  anime: 'anime illustration, clean cel shading, vibrant colors',
  photo: 'photorealistic cinematic still, natural lighting',
}

const NEGATIVE_BY_STYLE: Readonly<Record<StoryVisualStyle, string>> = {
  cartoon3d: 'photorealistic, live action, gritty texture',
  papercraft: 'photorealistic, smooth plastic, glossy reflections',
  clay: 'photorealistic, digital CGI, sharp edges',
  anime: 'photorealistic, 3D render, western cartoon',
  photo: 'cartoon, illustration, 3D render, anime',
}

export function isStoryVisualStyle(value: unknown): value is StoryVisualStyle {
  return typeof value === 'string'
    && (STORY_VISUAL_STYLES as readonly string[]).includes(value)
}

export function validateVisualStyle(value: unknown): StoryVisualStyle {
  if (value === undefined) return 'cartoon3d'
  if (!isStoryVisualStyle(value)) throw new StoryError('invalid-visual-style')

  return value
}

/** English style block that opens every keyframe and video prompt. */
export function styleBlockFor(style: StoryVisualStyle): string {
  return STYLE_BLOCKS[style]
}

export function styleBlockShort(style: StoryVisualStyle): string {
  return STYLE_BLOCKS_SHORT[style]
}

/** Terms that fight the chosen look, for models that accept a negative prompt. */
export function styleNegativeFor(style: StoryVisualStyle): string {
  return NEGATIVE_BY_STYLE[style]
}
