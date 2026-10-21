// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryBible } from '~/models/story'
import {
  parsePersistedStoryQC,
  validateQCObservation,
} from '../../../server/story/qc-validator'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import observedPass from '../../fixtures/story/qc-observed-pass.json'
import observedFail from '../../fixtures/story/qc-observed-continuity-fail.json'
import evaluatorInvalid from '../../fixtures/story/qc-evaluator-invalid.json'

const BIBLE = plan5.storyBible as StoryBible
const BART_BIBLE: StoryBible = {
  ...BIBLE,
  leadCharacterId: 'bart',
  signaturePropId: 'skateboard',
  characters: [
    {
      id: 'bart',
      name: 'Bart',
      description: 'Niño de piel amarilla y pelo puntiagudo.',
      wardrobe: 'Camiseta naranja, shorts azules y zapatillas azules.',
    },
  ],
  props: [
    {
      id: 'skateboard',
      name: 'Patinete azul',
      description: 'Patinete azul con manillar negro y ruedas rojas.',
    },
  ],
  forbidden: ['Homer', 'bicicleta', 'lluvia', 'noche'],
}

describe('qc-validator: evaluator payload', () => {
  it('accepts the normative observations', () => {
    for (const fixture of [observedPass, observedFail]) {
      const validation = validateQCObservation(fixture, BART_BIBLE)

      expect(validation.ok, validation.ok ? '' : validation.reason).toBe(true)
    }
  })

  it.each([
    ['extra keys', { ...observedPass, extra: true }],
    ['missing keys', { confidence: 0.9 }],
    ['wrong array type', { ...observedPass, characters: 'bart' }],
    ['wrong boolean type', { ...observedPass, artifacts: 'yes' }],
    ['confidence above 1', { ...observedPass, confidence: 1.4 }],
    ['confidence below 0', { ...observedPass, confidence: -0.1 }],
    ['invalid fixture', evaluatorInvalid],
  ])('rejects %s', (_label, payload) => {
    expect(validateQCObservation(payload, BART_BIBLE).ok).toBe(false)
  })

  it('discards unknown ids without rejecting the payload', () => {
    const validation = validateQCObservation(
      {
        ...observedPass,
        characters: ['bart', 'homer'],
        props: ['skateboard', 'bicycle'],
        wardrobeMismatch: ['homer'],
      },
      BART_BIBLE,
    )

    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.observed.characters).toEqual(['bart'])
    expect(validation.observed.props).toEqual(['skateboard'])
    expect(validation.observed.wardrobeMismatch).toEqual([])
  })
})

describe('qc-validator: persisted report', () => {
  const { confidence: _confidence, ...persistedObserved } = observedFail

  it('parses a complete persisted QC report and omits invalid frame URLs', () => {
    const parsed = parsePersistedStoryQC({
      status: 'FAILED',
      errorCode: null,
      evaluator: 'vision',
      confidence: 0.62,
      scenes: [
        {
          sceneId: 'scene-1',
          order: 1,
          framesUrl: 'https://evil.example/strip.jpg',
          technical: 'pass',
          observed: persistedObserved,
          confidence: 0.62,
          issues: [],
        },
      ],
      issues: [],
      override: null,
    })

    expect(parsed).not.toBeNull()
    expect(parsed?.scenes[0]?.framesUrl).toBeNull()
    expect(parsed?.checkedAt).toBe('')
  })

  it('degrades a PASSED report without a valid strip', () => {
    const parsed = parsePersistedStoryQC({
      status: 'PASSED',
      errorCode: null,
      evaluator: 'vision',
      confidence: 0.92,
      scenes: [
        {
          sceneId: 'scene-1',
          order: 1,
          framesUrl: 'https://evil.example/strip.jpg',
          technical: 'pass',
          observed: persistedObserved,
          confidence: 0.92,
          issues: [],
        },
      ],
      issues: [],
      override: null,
    })

    expect(parsed?.status).toBe('UNAVAILABLE')
    expect(parsed?.scenes[0]?.framesUrl).toBeNull()
    expect(parsed?.issues.some((issue) => issue.code === 'frames-unavailable')).toBe(true)
  })

  it.each([
    ['not an object', null],
    ['unknown status', { status: 'OK', errorCode: null, evaluator: 'vision', confidence: 0.9, scenes: [{}], issues: [], override: null }],
    ['passed with none evaluator', { status: 'PASSED', errorCode: 'qc-disabled', evaluator: 'none', confidence: 0.9, scenes: [], issues: [], override: null }],
  ])('rejects %s', (_label, value) => {
    expect(parsePersistedStoryQC(value)).toBeNull()
  })
})
