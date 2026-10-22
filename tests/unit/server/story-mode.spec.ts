// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  STORY_MODES,
  STORY_NARRATIVE_TONES,
  isNarrativeTone,
  isStoryMode,
  maxInventedCharacters,
  parseStoryMode,
} from '../../../server/story/story-mode'

describe('story modes', () => {
  it('exposes the two modes and five narrative tones', () => {
    expect(STORY_MODES).toEqual(['faithful', 'creative'])
    expect(STORY_NARRATIVE_TONES).toEqual([
      'humor',
      'aventura',
      'absurdo',
      'heartwarming',
      'dramatic',
    ])
  })

  it('parses only exact modes', () => {
    expect(isStoryMode('faithful')).toBe(true)
    expect(isStoryMode('creative')).toBe(true)
    expect(isStoryMode('Creative')).toBe(false)
    expect(isStoryMode(' faithful ')).toBe(false)
    expect(parseStoryMode('creative')).toBe('creative')
    expect(parseStoryMode('unknown')).toBe('faithful')
  })

  it('rejects neutral for generated narratives', () => {
    expect(isNarrativeTone('humor')).toBe(true)
    expect(isNarrativeTone('neutral')).toBe(false)
  })

  it('limits invented characters by mode', () => {
    expect(maxInventedCharacters('faithful')).toBe(0)
    expect(maxInventedCharacters('creative')).toBe(2)
  })
})
