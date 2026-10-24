// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryBible } from '~/models/story'
import {
  FOCUSED_FRAMINGS,
  normalizeFocusFraming,
  normalizeFocusText,
  resolveFocus,
  focusSizeBlock,
} from '../../../server/story/focus-framing'

const BIBLE = {
  leadCharacterId: 'ionias',
  characters: [
    { id: 'ionias', name: 'Ionias' },
    { id: 'pixel', name: 'Pixel' },
  ],
} as unknown as StoryBible

describe('focus text normalization', () => {
  it('lowercases, strips diacritics and collapses spaces', () => {
    expect(normalizeFocusText('  Iónias   en  el escritorio ')).toBe('ionias en el escritorio')
  })
})

describe('focus resolution', () => {
  it('resolves the secondary character when the subject names it', () => {
    expect(resolveFocus('Pixel teclea rápido', BIBLE)).toEqual({
      characterId: 'pixel',
      characterName: 'Pixel',
      ambiguous: false,
    })
  })

  it('resolves the protagonist', () => {
    expect(resolveFocus('Ionias lee la nota', BIBLE).characterId).toBe('ionias')
  })

  it('returns null when no canon name appears', () => {
    expect(resolveFocus('un portátil encendido', BIBLE)).toEqual({
      characterId: null,
      characterName: null,
      ambiguous: false,
    })
  })

  it('flags a two-character subject as ambiguous instead of picking one', () => {
    const resolution = resolveFocus('Ionias y Pixel frente a la pantalla', BIBLE)

    expect(resolution.characterId).toBeNull()
    expect(resolution.ambiguous).toBe(true)
  })

  it('returns null without a subject', () => {
    expect(resolveFocus(undefined, BIBLE).characterId).toBeNull()
    expect(resolveFocus('', BIBLE).characterId).toBeNull()
  })

  it('returns null without a bible', () => {
    expect(resolveFocus('Pixel', null).characterId).toBeNull()
  })
})

describe('framing normalization', () => {
  const pixel = resolveFocus('Pixel teclea', BIBLE)

  it('rewrites a wide shot of a secondary character to a close-up', () => {
    expect(normalizeFocusFraming('wide', pixel, 'ionias'))
      .toEqual({ framing: 'close-up', normalized: true })
  })

  it('rewrites medium, establishing, two-shot and over-the-shoulder too', () => {
    for (const framing of ['medium', 'establishing', 'two-shot', 'over-the-shoulder'] as const) {
      expect(normalizeFocusFraming(framing, pixel, 'ionias').normalized).toBe(true)
    }
  })

  it('leaves the focused framings untouched', () => {
    for (const framing of FOCUSED_FRAMINGS) {
      expect(normalizeFocusFraming(framing, pixel, 'ionias'))
        .toEqual({ framing, normalized: false })
    }
  })

  it('never rewrites the protagonist', () => {
    const ionias = resolveFocus('Ionias lee la nota', BIBLE)

    expect(normalizeFocusFraming('wide', ionias, 'ionias'))
      .toEqual({ framing: 'wide', normalized: false })
  })

  it('does not rewrite when the focus is unresolved or ambiguous', () => {
    expect(normalizeFocusFraming('wide', resolveFocus('nada', BIBLE), 'ionias').normalized).toBe(false)
    expect(normalizeFocusFraming('two-shot', resolveFocus('Ionias y Pixel', BIBLE), 'ionias').normalized)
      .toBe(false)
  })
})

describe('focus size block', () => {
  it('fixes two thirds of the frame for a close-up', () => {
    expect(focusSizeBlock('close-up', 'Pixel'))
      .toContain('two thirds of the frame width')
  })

  it('fixes one third for a medium shot', () => {
    expect(focusSizeBlock('medium', 'Pixel'))
      .toContain('one third of the frame width')
  })

  it('fills the frame for a detail or insert', () => {
    expect(focusSizeBlock('insert', 'Pixel')).toContain('nothing else competes')
  })

  it('emits nothing for wide framings or without a character', () => {
    expect(focusSizeBlock('wide', 'Pixel')).toBe('')
    expect(focusSizeBlock('close-up', null)).toBe('')
    expect(focusSizeBlock('close-up', '   ')).toBe('')
  })
})
