import { describe, expect, it } from 'vitest'
import type { StoryCharacter } from '~/models/story'
import {
  CHARACTER_REF_PROMPT_MAX_CHARS,
  characterReferencePrompt,
} from '../../../server/story/character-ref-prompt'
import { SINGLE_FRAME_BLOCK } from '../../../server/story/story-prompt-composer'
import { styleBlockFor } from '../../../server/story/visual-style'

const CHARACTER: StoryCharacter = {
  id: 'pixel',
  name: 'Pixel',
  description: 'A curious low-poly cat with turquoise eyes.',
  wardrobe: 'A tiny orange scarf.',
  source: 'invented',
}

describe('character reference prompt', () => {
  it('opens with the visual style and stays in English', () => {
    const prompt = characterReferencePrompt(CHARACTER, 'papercraft', {
      hasStyleReference: true,
    })

    expect(prompt.startsWith(`${styleBlockFor('papercraft')}. `)).toBe(true)
    expect(prompt).toContain('One single character')
    expect(prompt).toContain('Pixel')
    expect(prompt).toContain('low-poly cat')
    expect(prompt).toContain('orange scarf')
  })

  it('forbids a grid with the shared single-frame guard', () => {
    const prompt = characterReferencePrompt(CHARACTER, 'cartoon3d', {
      hasStyleReference: false,
    })

    expect(prompt).toContain(SINGLE_FRAME_BLOCK)
    expect(prompt).toContain('no grid')
    expect(prompt).toContain('no collage')
  })

  it('asks for one character and forbids text and logos', () => {
    const prompt = characterReferencePrompt(CHARACTER, 'clay', {
      hasStyleReference: false,
    })

    expect(prompt).toContain('One single character')
    expect(prompt).toContain('no text')
    expect(prompt).toContain('no logo')
  })

  it('does not impose a photorealistic medium over a stylised reference', () => {
    const prompt = characterReferencePrompt(CHARACTER, 'papercraft', {
      hasStyleReference: true,
    })

    expect(prompt).not.toContain('photorealistic')
  })

  it('uses the reference only as a style guide', () => {
    const prompt = characterReferencePrompt(CHARACTER, 'papercraft', {
      hasStyleReference: true,
    })

    expect(prompt).toContain('reference image only for its visual style')
  })

  it('degrades a long canon until it fits the budget', () => {
    const longCharacter: StoryCharacter = {
      ...CHARACTER,
      description: 'A very detailed description. '.repeat(80),
      wardrobe: 'An extremely long wardrobe description. '.repeat(40),
    }
    const prompt = characterReferencePrompt(longCharacter, 'papercraft', {
      hasStyleReference: true,
    })

    expect(prompt.length).toBeLessThanOrEqual(CHARACTER_REF_PROMPT_MAX_CHARS)
    expect(prompt).toContain(SINGLE_FRAME_BLOCK)
    expect(prompt.startsWith(`${styleBlockFor('papercraft')}. `)).toBe(true)
  })
})
