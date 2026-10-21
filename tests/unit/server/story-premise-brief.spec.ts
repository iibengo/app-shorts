// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BRIEF_MAX_DIRECTIVE_LENGTH,
  BRIEF_MAX_DIRECTIVES,
  BRIEF_MAX_RENDERED_LENGTH,
  analyzePremise,
  renderBriefBlock,
} from '../../../server/story/premise-brief'
import type { StoryBriefSignal } from '../../../server/story/premise-brief'

interface GoldenCase {
  readonly label: string
  readonly premise: string
  readonly normalizedLength: number
  readonly wordCount: number
  readonly clauseCount: number
  readonly applied: boolean
  readonly reasons: readonly StoryBriefSignal[]
}

const SIX_HUNDRED_SINGLE = 'a'.repeat(600)
const SIX_HUNDRED_THREE = `${'a'.repeat(199)},${'a'.repeat(199)},${'a'.repeat(200)}`

/**
 * Golden table frozen from FR-137: seven lengths crossed with one and three
 * clauses. Length 9 is unit coverage only; the route rejects it earlier.
 */
const GOLDEN: readonly GoldenCase[] = [
  {
    label: '9 caracteres y 1 cláusula',
    premise: 'Luz tenue',
    normalizedLength: 9,
    wordCount: 2,
    clauseCount: 1,
    applied: true,
    reasons: ['short-text', 'few-words', 'single-clause'],
  },
  {
    label: '9 caracteres y 3 cláusulas',
    premise: 'Aa,Bb.Ccc',
    normalizedLength: 9,
    wordCount: 1,
    clauseCount: 3,
    applied: true,
    reasons: ['short-text', 'few-words'],
  },
  {
    label: '10 caracteres y 1 cláusula',
    premise: 'Luz tenue.',
    normalizedLength: 10,
    wordCount: 2,
    clauseCount: 1,
    applied: true,
    reasons: ['short-text', 'few-words', 'single-clause'],
  },
  {
    label: '10 caracteres y 3 cláusulas',
    premise: 'Aa,Bb.Cccc',
    normalizedLength: 10,
    wordCount: 1,
    clauseCount: 3,
    applied: true,
    reasons: ['short-text', 'few-words'],
  },
  {
    label: '29 caracteres y 1 cláusula',
    premise: 'La ciudad duerme sin luz azul',
    normalizedLength: 29,
    wordCount: 6,
    clauseCount: 1,
    applied: true,
    reasons: ['short-text', 'few-words', 'single-clause'],
  },
  {
    label: '29 caracteres y 3 cláusulas',
    premise: 'La calle, el río, la luz gris',
    normalizedLength: 29,
    wordCount: 7,
    clauseCount: 3,
    applied: true,
    reasons: ['short-text', 'few-words'],
  },
  {
    label: '30 caracteres y 1 cláusula',
    premise: 'La ciudad duerme sin luz azul.',
    normalizedLength: 30,
    wordCount: 6,
    clauseCount: 1,
    applied: true,
    reasons: ['short-text', 'few-words', 'single-clause'],
  },
  {
    label: '30 caracteres y 3 cláusulas',
    premise: 'La ciudad, el río, la luz gris',
    normalizedLength: 30,
    wordCount: 7,
    clauseCount: 3,
    applied: true,
    reasons: ['short-text', 'few-words'],
  },
  {
    label: '59 caracteres y 1 cláusula',
    premise: 'Una ciudad duerme bajo la lluvia mientras suena una canción',
    normalizedLength: 59,
    wordCount: 10,
    clauseCount: 1,
    applied: true,
    reasons: ['short-text', 'single-clause'],
  },
  {
    label: '59 caracteres y 3 cláusulas',
    premise: 'Una ciudad duerme, el río canta, la lluvia suena sin parar.',
    normalizedLength: 59,
    wordCount: 11,
    clauseCount: 3,
    applied: true,
    reasons: ['short-text'],
  },
  {
    label: '60 caracteres y 1 cláusula',
    premise: 'Una ciudad duerme bajo la lluvia mientras suena una canción.',
    normalizedLength: 60,
    wordCount: 10,
    clauseCount: 1,
    applied: true,
    reasons: ['single-clause'],
  },
  {
    label: '60 caracteres y 3 cláusulas',
    premise: 'Una ciudad duerme, el río canta, la lluvia cae muy despacio.',
    normalizedLength: 60,
    wordCount: 11,
    clauseCount: 3,
    applied: false,
    reasons: [],
  },
  {
    label: '600 caracteres y 1 cláusula',
    premise: SIX_HUNDRED_SINGLE,
    normalizedLength: 600,
    wordCount: 1,
    clauseCount: 1,
    applied: true,
    reasons: ['few-words', 'single-clause'],
  },
  {
    label: '600 caracteres y 3 cláusulas',
    premise: SIX_HUNDRED_THREE,
    normalizedLength: 600,
    wordCount: 1,
    clauseCount: 3,
    applied: true,
    reasons: ['few-words'],
  },
]

const EIGHT_WORDS = 'silencio, silencio silencio silencio silencio silencio silencio silencio'
const NINE_WORDS = `${EIGHT_WORDS} silencio`
const SEPARATORS = 'La luz, el mar; el sol: la noche.'
const CONNECTOR_Y = 'La ciudad duerme y el río canta'
const CONNECTOR_CHAIN =
  'La ciudad duerme y el río canta, pero la lluvia suena luego cuando llega la noche'
const NFC_PREMISE = 'La canción suena, el río canta y la lluvia cae sobre la ciudad'
const WHITESPACE_PREMISE = '  La ciudad duerme,\n\tsin luz azul  '

describe('analyzePremise golden table', () => {
  it.each(GOLDEN)('$label', (testCase) => {
    const analysis = analyzePremise(testCase.premise)

    expect(analysis.normalizedLength).toBe(testCase.normalizedLength)
    expect(analysis.wordCount).toBe(testCase.wordCount)
    expect(analysis.clauseCount).toBe(testCase.clauseCount)
    expect(analysis.brief.applied).toBe(testCase.applied)
    expect(analysis.brief.reasons).toEqual(testCase.reasons)
  })
})

describe('analyzePremise edge cases', () => {
  it('keeps the 8 versus 9 words frontier', () => {
    expect(EIGHT_WORDS.length).toBe(72)
    expect(NINE_WORDS.length).toBe(81)

    const eight = analyzePremise(EIGHT_WORDS)
    const nine = analyzePremise(NINE_WORDS)

    expect(eight.wordCount).toBe(8)
    expect(eight.clauseCount).toBe(2)
    expect(eight.brief.applied).toBe(true)
    expect(eight.brief.reasons).toEqual(['few-words'])

    expect(nine.wordCount).toBe(9)
    expect(nine.clauseCount).toBe(2)
    expect(nine.brief.applied).toBe(false)
    expect(nine.brief.reasons).toEqual([])
  })

  it('splits clauses on comma, semicolon, colon and period', () => {
    const analysis = analyzePremise(SEPARATORS)

    expect(analysis.normalizedLength).toBe(33)
    expect(analysis.wordCount).toBe(8)
    expect(analysis.clauseCount).toBe(4)
    expect(analysis.brief.reasons).toEqual(['short-text', 'few-words'])
  })

  it('splits clauses on the y, pero, luego and cuando connectors', () => {
    const withY = analyzePremise(CONNECTOR_Y)
    const chained = analyzePremise(CONNECTOR_CHAIN)

    expect(withY.clauseCount).toBe(2)
    expect(withY.brief.reasons).toEqual(['short-text', 'few-words'])

    expect(CONNECTOR_CHAIN).toContain(' y ')
    expect(CONNECTOR_CHAIN).toContain(' pero ')
    expect(CONNECTOR_CHAIN).toContain(' luego ')
    expect(CONNECTOR_CHAIN).toContain(' cuando ')
    expect(chained.normalizedLength).toBe(81)
    expect(chained.wordCount).toBe(16)
    expect(chained.clauseCount).toBe(4)
    expect(chained.brief.applied).toBe(false)
  })

  it('treats NFC composed and decomposed input as the same premise', () => {
    const composed = analyzePremise(NFC_PREMISE)
    const decomposed = analyzePremise(NFC_PREMISE.normalize('NFD'))

    expect(decomposed).toEqual(composed)
    expect(composed.normalizedLength).toBe(62)
    expect(composed.brief.applied).toBe(false)
  })

  it('normalizes surrounding whitespace but keeps internal spacing as words', () => {
    const analysis = analyzePremise(WHITESPACE_PREMISE)

    expect(analysis.normalizedLength).toBe(31)
    expect(analysis.wordCount).toBe(6)
    expect(analysis.clauseCount).toBe(2)
    expect(analysis.brief.applied).toBe(true)
  })

  it('accepts a 600 character premise with three clauses', () => {
    const analysis = analyzePremise(SIX_HUNDRED_THREE)

    expect(SIX_HUNDRED_THREE.length).toBe(600)
    expect(analysis.normalizedLength).toBe(600)
    expect(analysis.clauseCount).toBe(3)
    expect(analysis.brief.applied).toBe(true)
  })
})

describe('analyzePremise determinism', () => {
  it.each([...GOLDEN, { label: 'connectors', premise: CONNECTOR_CHAIN }])(
    'returns the same analysis twice for $label',
    (testCase) => {
      expect(analyzePremise(testCase.premise)).toEqual(analyzePremise(testCase.premise))
    },
  )

  it('does not depend on the current time', () => {
    const before = analyzePremise(SEPARATORS)
    const after = analyzePremise(SEPARATORS)

    expect(after).toEqual(before)
  })
})

describe('renderBriefBlock', () => {
  it('returns an empty string when the brief is inactive', () => {
    const brief = analyzePremise(NFC_PREMISE).brief

    expect(brief.applied).toBe(false)
    expect(renderBriefBlock(brief)).toBe('')
  })

  it('renders the same block stored in the brief', () => {
    const brief = analyzePremise('Luz tenue').brief

    if (!brief.applied) {
      throw new Error('expected an applied brief')
    }

    expect(brief.rendered).toBe(renderBriefBlock(brief))
  })

  it('stays within five directives, 120 characters each and 500 rendered characters', () => {
    for (const testCase of GOLDEN) {
      const brief = analyzePremise(testCase.premise).brief

      if (!brief.applied) continue

      expect(brief.directives.length).toBeLessThanOrEqual(BRIEF_MAX_DIRECTIVES)
      expect(brief.directives.length).toBeGreaterThan(0)

      for (const directive of brief.directives) {
        expect(directive.length).toBeGreaterThanOrEqual(1)
        expect(directive.length).toBeLessThanOrEqual(BRIEF_MAX_DIRECTIVE_LENGTH)
      }

      expect(brief.rendered.length).toBeLessThanOrEqual(BRIEF_MAX_RENDERED_LENGTH)
    }
  })

  it('asks for place, time, atmosphere, wardrobe, light and framing without changing the idea', () => {
    const brief = analyzePremise('Luz tenue').brief

    if (!brief.applied) {
      throw new Error('expected an applied brief')
    }

    const text = brief.directives.join(' ')

    for (const concept of [
      'lugar',
      'época',
      'hora',
      'atmósfera',
      'vestuario',
      'luz',
      'encuadre',
      'tema',
      'personajes',
      'desenlace',
    ]) {
      expect(text).toContain(concept)
    }

    expect(text).toContain('No cambies')
  })

  it('never interpolates the premise or user data', () => {
    const premise = 'Premisa secreta del usuario 12345 con un dragón azul'
    const brief = analyzePremise(premise).brief

    if (!brief.applied) {
      throw new Error('expected an applied brief')
    }

    for (const fragment of ['secreta', 'usuario', '12345', 'dragón', 'azul', premise]) {
      expect(brief.rendered).not.toContain(fragment)
      expect(brief.directives.join(' ')).not.toContain(fragment)
    }
  })

  it('contains no markup, headings, bullets, controls, URLs or provider names', () => {
    for (const testCase of GOLDEN) {
      const brief = analyzePremise(testCase.premise).brief

      if (!brief.applied) continue

      expect(brief.rendered).not.toMatch(/[<>`]/)
      expect(brief.rendered).not.toMatch(/(^|\s)#/)
      expect(brief.rendered).not.toMatch(/(^|\n)\s*[-*+]\s/)
      expect(brief.rendered).not.toMatch(/(^|\n)\s*\d+\.\s/)
      expect(brief.rendered).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/)
      expect(brief.rendered).not.toMatch(/https?:\/\//)
      expect(brief.rendered.toLowerCase()).not.toMatch(/fal|deepseek|openai/)
    }
  })
})
