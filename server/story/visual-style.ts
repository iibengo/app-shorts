import type { StoryVisualStyle } from '~/models/story'
import { STORY_VISUAL_STYLES } from '~/models/story'
import { StoryError } from './errors'

/**
 * Single source of truth for the look of the channel. The client sends an id;
 * the prompt text lives here, in English, and is versioned with the code.
 * Adding a style is one entry in this registry, never a new spec.
 *
 * E5 (2026-10-25): a style describes *how the world looks*, never *where each
 * scene happens*. `papercraft` used to impose "dark navy background with neon
 * accents" on every shot, so the first scene came out in daylight and the rest
 * at night — the style was fighting the script. Background, light and palette
 * belong to the scene; material and shape belong to the style.
 */
const STYLE_BLOCKS: Readonly<Record<StoryVisualStyle, string>> = {
  cartoon3d:
    '3D cartoon render, glossy stylized characters, Pixar-like proportions, soft studio lighting, clean pastel palette',
  papercraft:
    'low-poly papercraft 3D render, faceted geometric shapes, matte paper texture, neon accent lighting',
  voxel:
    'voxel art 3D render, blocky cubic characters and props, chunky pixel-like volumes, flat shaded faces, saturated palette, clean isometric-friendly lighting',
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
  voxel: 'voxel art 3D render, blocky cubic characters, flat shaded faces',
  clay: 'claymation look, handmade plasticine characters, warm soft light',
  anime: 'anime illustration, clean cel shading, vibrant colors',
  photo: 'photorealistic cinematic still, natural lighting',
}

const NEGATIVE_BY_STYLE: Readonly<Record<StoryVisualStyle, string>> = {
  cartoon3d: 'photorealistic, live action, gritty texture',
  papercraft: 'photorealistic, smooth plastic, glossy reflections',
  voxel: 'photorealistic, smooth organic surfaces, soft gradients',
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
