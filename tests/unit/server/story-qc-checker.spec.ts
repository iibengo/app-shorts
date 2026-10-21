// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryQCObserved, StoryQCSceneResult } from '~/models/story'
import {
  aggregateQc,
  compareScene,
  sortIssues,
} from '../../../server/story/qc-checker'
import type { QCSceneExpectation } from '../../../server/story/qc-types'

const EXPECTATION: QCSceneExpectation = {
  sceneId: 'scene-1',
  order: 2,
  leadCharacterId: 'bart',
  characters: ['bart'],
  props: ['skateboard'],
  signaturePropId: 'skateboard',
  visualPrompt: 'Bart acelera con su patinete azul.',
  continuityFromPrevious: 'El patinete azul sigue en el sendero.',
  sceneRole: 'development',
  camera: 'medium',
}

function observed(overrides: Partial<StoryQCObserved> = {}): StoryQCObserved {
  return {
    characters: ['bart'],
    wardrobeMismatch: [],
    unknownCharacters: false,
    props: ['skateboard'],
    unknownProps: false,
    locationMatches: true,
    weatherMatches: true,
    timeOfDayMatches: true,
    continuityMatches: true,
    textOrWatermark: false,
    artifacts: false,
    ...overrides,
  }
}

function scene(
  overrides: Partial<StoryQCSceneResult> = {},
): StoryQCSceneResult {
  return {
    sceneId: 'scene-1',
    order: 1,
    framesUrl: 'https://v3.fal.media/files/test/strip.jpg',
    technical: 'pass',
    observed: observed(),
    confidence: 0.9,
    issues: [],
    ...overrides,
  }
}

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((issue) => issue.code)
}

describe('qc-checker: observation comparator', () => {
  it.each([
    ['missing-lead-character', { characters: [] }],
    ['extra-character', { unknownCharacters: true }],
    ['wrong-wardrobe', { wardrobeMismatch: ['bart'] }],
    ['missing-prop', { props: [] }],
    ['wrong-prop', { unknownProps: true }],
    ['wrong-location', { locationMatches: false }],
    ['wrong-weather', { weatherMatches: false }],
    ['wrong-time-of-day', { timeOfDayMatches: false }],
    ['continuity-break', { continuityMatches: false }],
    ['text-or-watermark', { textOrWatermark: true }],
    ['visual-artifact', { artifacts: true }],
  ] as const)('emits %s', (code, overrides) => {
    const issues = compareScene({
      expectation: EXPECTATION,
      observed: observed(overrides),
      framesAvailable: true,
    })

    expect(codes(issues)).toContain(code)
  })

  it('emits missing-character for a non-lead expected character', () => {
    const issues = compareScene({
      expectation: { ...EXPECTATION, characters: ['bart', 'ana'] },
      observed: observed({ characters: ['bart'] }),
      framesAvailable: true,
    })

    expect(codes(issues)).toContain('missing-character')
  })

  it('marks the signature prop as blocking and other props as warnings', () => {
    const signature = compareScene({
      expectation: EXPECTATION,
      observed: observed({ props: [] }),
      framesAvailable: true,
    })
    const other = compareScene({
      expectation: {
        ...EXPECTATION,
        props: ['skateboard', 'helmet'],
        signaturePropId: 'skateboard',
      },
      observed: observed({ props: ['skateboard'] }),
      framesAvailable: true,
    })

    expect(signature.find((issue) => issue.code === 'missing-prop')?.severity)
      .toBe('blocking')
    expect(other.find((issue) => issue.code === 'missing-prop')?.severity)
      .toBe('warning')
  })

  it('emits frames-unavailable as a warning when frames are missing', () => {
    const issue = compareScene({
      expectation: EXPECTATION,
      observed: observed(),
      framesAvailable: false,
    }).find((entry) => entry.code === 'frames-unavailable')

    expect(issue?.severity).toBe('warning')
    expect(issue?.frame).toBe('clip')
  })

  it('sorts blocking before warnings and by scene and frame', () => {
    const sorted = sortIssues([
      { code: 'visual-artifact', severity: 'warning', sceneId: 'b', order: 2, frame: 'end' },
      { code: 'extra-character', severity: 'blocking', sceneId: 'c', order: 3, frame: 'middle' },
      { code: 'wrong-weather', severity: 'blocking', sceneId: 'a', order: 1, frame: 'start' },
      { code: 'wrong-time-of-day', severity: 'blocking', sceneId: 'a', order: 1, frame: 'middle' },
    ])

    expect(sorted.map((issue) => issue.code)).toEqual([
      'wrong-weather',
      'wrong-time-of-day',
      'extra-character',
      'visual-artifact',
    ])
  })
})

describe('qc-checker: aggregation', () => {
  it('fails on any blocking issue', () => {
    const result = aggregateQc({
      scenes: [
        scene({
          issues: [
            {
              code: 'wrong-prop',
              severity: 'blocking',
              sceneId: 'scene-1',
              order: 1,
              frame: 'middle',
            },
          ],
        }),
      ],
      evaluator: 'vision',
      minConfidence: 0.7,
      errorCode: null,
    })

    expect(result.status).toBe('FAILED')
  })

  it('never passes without observations or with evaluator none', () => {
    const missing = aggregateQc({
      scenes: [scene({ observed: null, confidence: null })],
      evaluator: 'vision',
      minConfidence: 0.7,
      errorCode: null,
    })
    const none = aggregateQc({
      scenes: [scene()],
      evaluator: 'none',
      minConfidence: 0.7,
      errorCode: 'qc-not-configured',
    })

    expect(missing.status).toBe('UNAVAILABLE')
    expect(none.status).toBe('UNAVAILABLE')
    expect(none.status).not.toBe('PASSED')
  })

  it('uses the minimum confidence and requires the threshold', () => {
    const needsReview = aggregateQc({
      scenes: [scene({ confidence: 0.95 }), scene({ confidence: 0.69 })],
      evaluator: 'vision',
      minConfidence: 0.7,
      errorCode: null,
    })
    const passed = aggregateQc({
      scenes: [scene({ confidence: 0.95 }), scene({ confidence: 0.7 })],
      evaluator: 'vision',
      minConfidence: 0.7,
      errorCode: null,
    })

    expect(needsReview.status).toBe('NEEDS_REVIEW')
    expect(needsReview.confidence).toBe(0.69)
    expect(passed.status).toBe('PASSED')
  })

  it('passes with warnings but no blocking problems', () => {
    const result = aggregateQc({
      scenes: [
        scene({
          issues: [
            {
              code: 'visual-artifact',
              severity: 'warning',
              sceneId: 'scene-1',
              order: 1,
              frame: 'middle',
            },
          ],
        }),
      ],
      evaluator: 'vision',
      minConfidence: 0.7,
      errorCode: null,
    })

    expect(result.status).toBe('PASSED')
  })
})
