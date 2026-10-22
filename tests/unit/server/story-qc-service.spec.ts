// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryQCObserved, StoryPlan } from '~/models/story'
import { createStoryCostGuard } from '../../../server/story/cost'
import type { StoryCostGuard } from '../../../server/story/cost'
import { QCFramesGlobalError } from '../../../server/story/qc-frames'
import { NativeStoryQCService } from '../../../server/story/qc-service'
import type { StoryQCServiceConfig } from '../../../server/story/qc-service'
import type {
  QCEvaluation,
  QCFrameStrip,
  StoryFrameExtractor,
} from '../../../server/story/qc-types'
import { makeScenes, makeStoryRecord } from '../../helpers/story'
import creative from '../../fixtures/story/plan-creative-scene-changes.json'

const OBSERVED: StoryQCObserved = {
  characters: ['clara'],
  wardrobeMismatch: [],
  unknownCharacters: false,
  props: ['merengue'],
  unknownProps: false,
  locationMatches: true,
  weatherMatches: true,
  timeOfDayMatches: true,
  continuityMatches: true,
  textOrWatermark: false,
  artifacts: false,
}

const CONFIG: StoryQCServiceConfig = {
  enabled: true,
  minConfidence: 0.7,
  timeoutMs: 240_000,
}

function qcStory() {
  const scenes = makeScenes(5, {
    status: 'VIDEO_READY',
    keyframeAttempts: 1,
    videoAttempts: 1,
    videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
  })

  return makeStoryRecord({
    status: 'QC',
    sceneCount: 5,
    scenes,
    approvedAt: new Date(),
  })
}

function qcStoryWithPlan(plan: StoryPlan) {
  return makeStoryRecord({
    status: 'QC',
    sceneCount: 5,
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    }),
    plan,
    approvedAt: new Date(),
  })
}

function strips(
  story: ReturnType<typeof qcStory>,
  overrides: Partial<QCFrameStrip> = {},
): QCFrameStrip[] {
  return story.scenes.map((scene) => ({
    sceneId: scene.id,
    order: scene.order,
    filePath: `/tmp/strip-${scene.order}.jpg`,
    durationSeconds: 6,
    technical: [],
    framesUrl: `https://v3.fal.media/files/test/story-qc-${scene.order}.jpg`,
    ...overrides,
  }))
}

function frameExtractor(result: readonly QCFrameStrip[] | Error): StoryFrameExtractor {
  return {
    async extract() {
      if (result instanceof Error) throw result
      return result
    },
  }
}

function evaluator(result: QCEvaluation | ((order: number) => QCEvaluation)) {
  const calls: number[] = []
  const implementation = {
    async evaluate(input: Parameters<typeof import('../../../server/story/qc-types').StoryQCEvaluator['evaluate']>[0]) {
      calls.push(input.expectation.order)

      return typeof result === 'function' ? result(input.expectation.order) : result
    },
  }

  return { evaluator: implementation, calls }
}

function service(
  story: ReturnType<typeof qcStory>,
  frames: StoryFrameExtractor,
  evaluation: ReturnType<typeof evaluator>['evaluator'],
  options: {
    readonly cost?: Parameters<typeof createStoryCostGuard>[0]
    readonly costGuard?: StoryCostGuard
    readonly config?: Partial<StoryQCServiceConfig>
  } = {},
) {
  return new NativeStoryQCService({
    frameExtractor: frames,
    evaluator: evaluation,
    costGuard: options.costGuard ?? createStoryCostGuard(options.cost),
    config: { ...CONFIG, ...options.config },
  })
}

const CLIPS = (story: ReturnType<typeof qcStory>) => story.scenes.map((scene) => ({
  sceneId: scene.id,
  order: scene.order,
  url: scene.videoUrl!,
}))

describe('StoryQCService: passing and failing stories', () => {
  it('returns PASSED with the minimum confidence when every scene is coherent', async () => {
    const story = qcStory()
    const evaluation = evaluator((order) => ({
      kind: 'observed',
      observed: OBSERVED,
      confidence: order === 3 ? 0.71 : 0.93,
    }))

    const result = await service(story, frameExtractor(strips(story)), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('PASSED')
    expect(result.qc.confidence).toBe(0.71)
    expect(result.qc.issues).toHaveLength(0)
    expect(result.qc.scenes).toHaveLength(5)
    expect(result.qc.evaluator).toBe('vision')
    expect(result.technicalFailures).toHaveLength(0)
  })

  it('fails when a clip is technically broken and reports the scene', async () => {
    const story = qcStory()
    const frameStrips = strips(story)
    frameStrips[1] = { ...frameStrips[1]!, technical: ['technical-duration'], framesUrl: null }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(story, frameExtractor(frameStrips), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('FAILED')
    expect(result.technicalFailures).toEqual([
      { sceneId: story.scenes[1]!.id, order: 2 },
    ])
    expect(result.qc.issues.some((issue) => issue.code === 'technical-duration'))
      .toBe(true)
  })

  it('never passes with a missing observation', async () => {
    const story = qcStory()
    const frameStrips = strips(story)
    frameStrips[2] = { ...frameStrips[2]!, framesUrl: null }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(story, frameExtractor(frameStrips), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.issues.some((issue) => issue.code === 'frames-unavailable'))
      .toBe(true)
  })
})

describe('StoryQCService: honest unavailability', () => {
  it('uses evaluator none and qc-not-configured without a bible', async () => {
    const story = { ...qcStory(), plan: null }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(story, frameExtractor(strips(story)), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.evaluator).toBe('none')
    expect(result.qc.errorCode).toBe('qc-not-configured')
    expect(evaluation.calls).toHaveLength(0)
  })

  it('skips vision when the QC budget does not fit', async () => {
    const story = qcStory()
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(
      story,
      frameExtractor(strips(story)),
      evaluation.evaluator,
      { cost: { maxStoryCostUsd: 0.01 } },
    ).run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-budget-skipped')
    expect(result.qc.evaluator).toBe('none')
    expect(evaluation.calls).toHaveLength(0)
  })

  it('maps an evaluator failure to UNAVAILABLE without inventing an observation', async () => {
    const story = qcStory()
    const evaluation = evaluator({
      kind: 'unavailable',
      errorCode: 'qc-evaluator-invalid-output',
    })

    const result = await service(story, frameExtractor(strips(story)), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-evaluator-invalid-output')
    expect(result.qc.scenes.every((scene) => scene.observed === null)).toBe(true)
  })

  it('maps a global frames failure to qc-frames-failed', async () => {
    const story = qcStory()
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(
      story,
      frameExtractor(new QCFramesGlobalError('qc-frames-failed')),
      evaluation.evaluator,
    ).run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-frames-failed')
    expect(result.qc.issues.length).toBeGreaterThan(0)
    expect(result.qc.issues.every((issue) => issue.code === 'frames-unavailable')).toBe(true)
  })

  it('aborts frame extraction when the QC budget expires', async () => {
    const story = qcStory()
    const frames: StoryFrameExtractor = {
      extract(input) {
        return new Promise((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            reject(new QCFramesGlobalError('qc-frames-failed'))
          }, { once: true })
        })
      },
    }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(story, frames, evaluation.evaluator, {
      config: { timeoutMs: 5 },
    }).run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-frames-failed')
    expect(evaluation.calls).toHaveLength(0)
  })

  it('keeps UNAVAILABLE for legacy stories even with a technical failure', async () => {
    const story = { ...qcStory(), plan: null }
    const frameStrips = strips(story)
    frameStrips[0] = { ...frameStrips[0]!, technical: ['technical-duration'], framesUrl: null }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(story, frameExtractor(frameStrips), evaluation.evaluator)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.issues.some((issue) => issue.code === 'technical-duration')).toBe(true)
  })

  it('propagates ffmpeg-not-configured to the reconciler', async () => {
    const story = qcStory()
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    await expect(service(
      story,
      frameExtractor(new QCFramesGlobalError('ffmpeg-not-configured')),
      evaluation.evaluator,
    ).run({ story, clips: CLIPS(story) })).rejects.toMatchObject({
      code: 'ffmpeg-not-configured',
    })
  })
})

describe('StoryQCService: QC switch and cost accounting', () => {
  it('records one cost-guard evaluation per vision call', async () => {
    const story = qcStory()
    const costGuard = createStoryCostGuard()
    const record = vi.spyOn(costGuard, 'recordQcEvaluations')
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(
      story,
      frameExtractor(strips(story)),
      evaluation.evaluator,
      { costGuard },
    ).run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('PASSED')
    expect(evaluation.calls).toHaveLength(5)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(story.id, 5)
  })

  it('counts only the scenes that actually reached the evaluator', async () => {
    const story = qcStory()
    const costGuard = createStoryCostGuard()
    const record = vi.spyOn(costGuard, 'recordQcEvaluations')
    const frameStrips = strips(story)
    frameStrips[4] = { ...frameStrips[4]!, framesUrl: null }
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    await service(
      story,
      frameExtractor(frameStrips),
      evaluation.evaluator,
      { costGuard },
    ).run({ story, clips: CLIPS(story) })

    expect(record).toHaveBeenCalledWith(story.id, 4)
  })

  it('degrades a second QC round to qc-budget-skipped without exceeding the cap', async () => {
    const story = qcStory()
    const costGuard = createStoryCostGuard({ maxStoryCostUsd: 2.15 })
    const firstEvaluation = evaluator({
      kind: 'observed',
      observed: OBSERVED,
      confidence: 0.9,
    })

    const first = await service(
      story,
      frameExtractor(strips(story)),
      firstEvaluation.evaluator,
      { costGuard },
    ).run({ story, clips: CLIPS(story) })

    expect(first.qc.status).toBe('PASSED')
    expect(firstEvaluation.calls).toHaveLength(5)
    expect(costGuard.estimate(story)).toBe(2.132)

    const retried = {
      ...story,
      qc: first.qc,
      qcCheckedAt: new Date(first.qc.checkedAt),
    }
    const secondEvaluation = evaluator({
      kind: 'observed',
      observed: OBSERVED,
      confidence: 0.9,
    })

    const second = await service(
      retried,
      frameExtractor(strips(retried)),
      secondEvaluation.evaluator,
      { costGuard },
    ).run({ story: retried, clips: CLIPS(retried) })

    expect(second.qc.status).toBe('UNAVAILABLE')
    expect(second.qc.errorCode).toBe('qc-budget-skipped')
    expect(second.qc.evaluator).toBe('none')
    expect(secondEvaluation.calls).toHaveLength(0)
    expect(costGuard.estimate(retried)).toBeLessThanOrEqual(2.15)
  })

  it('falls back to UNAVAILABLE with evaluator none when the QC switch is off', async () => {
    const story = qcStory()
    const costGuard = createStoryCostGuard()
    const record = vi.spyOn(costGuard, 'recordQcEvaluations')
    const evaluation = evaluator({ kind: 'observed', observed: OBSERVED, confidence: 0.9 })

    const result = await service(
      story,
      frameExtractor(strips(story)),
      evaluation.evaluator,
      { costGuard, config: { enabled: false } },
    ).run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('UNAVAILABLE')
    expect(result.qc.errorCode).toBe('qc-disabled')
    expect(result.qc.evaluator).toBe('none')
    expect(result.qc.override).toBeNull()
    expect(evaluation.calls).toHaveLength(0)
    expect(record).toHaveBeenCalledWith(story.id, 0)
    // The strips are still persisted so the human review has a contact sheet.
    expect(result.qc.scenes.every((scene) => scene.framesUrl !== null)).toBe(true)
    expect(result.qc.scenes.every((scene) => scene.observed === null)).toBe(true)
  })
})


describe('StoryQCService: scene context across changes', () => {
  it('evaluates each scene with its own location, time and weather', async () => {
    const plan = structuredClone(creative) as StoryPlan
    const story = qcStoryWithPlan(plan)
    const expectations: string[] = []
    const evaluation = {
      async evaluate(input: Parameters<typeof import('../../../server/story/qc-types').StoryQCEvaluator['evaluate']>[0]) {
        expectations.push(`${input.expectation.locationId}:${input.expectation.timeOfDay}:${input.expectation.weather}`)

        return {
          kind: 'observed' as const,
          observed: {
            ...OBSERVED,
            characters: [...input.expectation.characters],
            props: [...input.expectation.props],
          },
          confidence: 0.95,
        }
      },
    }

    const result = await service(story, frameExtractor(strips(story)), evaluation)
      .run({ story, clips: CLIPS(story) })

    expect(result.qc.status).toBe('PASSED')
    expect(new Set(expectations.map((value) => value.split(':')[0])).size).toBeGreaterThan(1)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-location')).toBe(false)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-time-of-day')).toBe(false)
    expect(result.qc.issues.some((issue) => issue.code === 'wrong-weather')).toBe(false)
  })

  it('does not require a lead or signature prop in a scene that does not declare them', async () => {
    const plan = structuredClone(creative) as StoryPlan
    plan.beats[2] = {
      ...plan.beats[2]!,
      characters: ['milo'],
      props: [],
    }
    const story = qcStoryWithPlan(plan)
    const evaluation = {
      async evaluate(input: Parameters<typeof import('../../../server/story/qc-types').StoryQCEvaluator['evaluate']>[0]) {
        return {
          kind: 'observed' as const,
          observed: {
            ...OBSERVED,
            characters: [...input.expectation.characters],
            props: [...input.expectation.props],
          },
          confidence: 0.95,
        }
      },
    }

    const result = await service(story, frameExtractor(strips(story)), evaluation)
      .run({ story, clips: CLIPS(story) })
    const sceneIssues = result.qc.issues.filter((issue) => issue.order === 3)

    expect(sceneIssues.some((issue) => issue.code === 'missing-lead-character')).toBe(false)
    expect(sceneIssues.some((issue) => issue.code === 'missing-prop')).toBe(false)
  })
})
