// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NARRATION_COPY_MIN_LENGTH,
  hasSignificantNarrationCopy,
  normalizePromptText,
} from '../../../server/story/prompt-guard'

describe('prompt-guard', () => {
  it('normalizes case, spacing and unicode before comparing', () => {
    expect(normalizePromptText('  Clara   persigue\tal merengue  ')).toBe('clara persigue al merengue')
    expect(normalizePromptText('Cafe\u0301 con leche')).toBe(normalizePromptText('Café con leche'))
  })

  it('rejects a visual prompt that reproduces the whole narration', () => {
    expect(hasSignificantNarrationCopy(
      'Clara corre por el parque con el merengue.',
      'Clara corre por el parque con el merengue.',
    )).toBe(true)
  })

  it('rejects a literal run of at least twenty normalized characters', () => {
    const run = 'x'.repeat(NARRATION_COPY_MIN_LENGTH)
    const narration = `Algo que Clara dice ${run} y termina aquí.`

    expect(hasSignificantNarrationCopy(`Plano de ${run} en primer término.`, narration)).toBe(true)
  })

  it('allows common short words and phrases below the threshold', () => {
    const narration = 'Clara mira el merengue imposible sobre la mesa del obrador.'

    expect(hasSignificantNarrationCopy(
      'Plano medio de Clara con el merengue, luz cálida y fondo desenfocado.',
      narration,
    )).toBe(false)
  })

  it('returns false for an empty narration', () => {
    expect(hasSignificantNarrationCopy('Plano medio de Clara.', '')).toBe(false)
  })

  it('ignores case and whitespace differences when the narration is copied', () => {
    expect(hasSignificantNarrationCopy(
      'CLARA   MIRA EL MERENGUE IMPOSIBLE',
      'clara mira el merengue imposible',
    )).toBe(true)
  })
})
