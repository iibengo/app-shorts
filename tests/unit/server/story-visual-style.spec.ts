// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { STORY_VISUAL_STYLES } from '~/models/story'
import {
  isStoryVisualStyle,
  styleBlockFor,
  styleNegativeFor,
  validateVisualStyle,
} from '../../../server/story/visual-style'
import { StoryError } from '../../../server/story/errors'

describe('visual style registry', () => {
  it('maps every id to an English style block', () => {
    expect(STORY_VISUAL_STYLES).toHaveLength(6)

    for (const style of STORY_VISUAL_STYLES) {
      const block = styleBlockFor(style)

      expect(block.length).toBeGreaterThan(20)
      // ASCII only: prompts are English, no accents or Spanish words.
      expect(block).toMatch(/^[\x20-\x7E]+$/)
      expect(styleNegativeFor(style).length).toBeGreaterThan(5)
      expect(isStoryVisualStyle(style)).toBe(true)
    }
  })

  it('defaults to cartoon3d and rejects unknown ids', () => {
    expect(validateVisualStyle(undefined)).toBe('cartoon3d')
    expect(validateVisualStyle('papercraft')).toBe('papercraft')
    expect(() => validateVisualStyle('vaporwave')).toThrow(StoryError)
    expect(() => validateVisualStyle(7)).toThrow(StoryError)
  })

  it('keeps each style visually distinct', () => {
    const blocks = STORY_VISUAL_STYLES.map((style) => styleBlockFor(style))

    expect(new Set(blocks).size).toBe(blocks.length)
    expect(styleBlockFor('papercraft')).toContain('low-poly')
    expect(styleBlockFor('cartoon3d')).toContain('3D cartoon')
  })
})

describe('voxel style', () => {
  it('describes blocky cubes and forbids smooth surfaces', () => {
    expect(styleBlockFor('voxel')).toContain('voxel')
    expect(styleBlockFor('voxel')).toContain('cubic')
    expect(styleNegativeFor('voxel')).toContain('smooth')
  })

  it('is accepted by the validator', () => {
    expect(validateVisualStyle('voxel')).toBe('voxel')
  })
})
