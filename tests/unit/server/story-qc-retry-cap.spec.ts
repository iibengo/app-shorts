// @vitest-environment node
/**
 * H5 integration: a QC round followed by `qc/retry` must not let the story
 * exceed its cost cap. The first round records five vision calls in the cost
 * guard; the retry clears the persisted report but not the accumulated cost,
 * so the second round has to degrade to `qc-budget-skipped` without calling
 * the evaluator again.
 */
import { describe, expect, it } from 'vitest'
import type { StoryQCObserved } from '~/models/story'
import { createStoryCostGuard } from '../../../server/story/cost'
import { NativeStoryQCService } from '../../../server/story/qc-service'
import { createStoryRateLimiter } from '../../../server/story/rate-limit'
import { StoryReconciler } from '../../../server/story/reconciler'
import { createStoryService } from '../../../server/story/story-service'
import {
  FakeKeyframeOrchestrator,
  FakeStoryAssembler,
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  TEST_NOW,
  createTestClock,
  makeScenes,
  makeStoryRecord,
} from '../../helpers/story'

// 016: follows the measured fast-clip price (0.27), not the old 0.35 estimate.
const CAP_USD = 1.75
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

describe('QC retry cost cap', () => {
  it('degrades the second QC round to manual without exceeding the cap', async () => {
    const story = makeStoryRecord({
      status: 'VIDEOS_READY',
      sceneCount: 5,
      scenes: makeScenes(5, {
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
        videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      }),
    })
    const repository = new FakeStoryRepository([story])
    const clock = createTestClock(TEST_NOW)
    const costGuard = createStoryCostGuard({ maxStoryCostUsd: CAP_USD })
    const evaluations: number[] = []
    const qcService = new NativeStoryQCService({
      frameExtractor: {
        async extract(input) {
          return input.clips.map((clip) => ({
            sceneId: clip.sceneId,
            order: clip.order,
            filePath: `/tmp/story-qc-${clip.order}.jpg`,
            durationSeconds: 6,
            technical: [],
            framesUrl: `https://v3.fal.media/files/test/story-qc-${clip.order}.jpg`,
          }))
        },
      },
      evaluator: {
        async evaluate(input) {
          evaluations.push(input.expectation.order)

          // Below the 0.7 threshold: NEEDS_REVIEW, never PASSED.
          return { kind: 'observed', observed: OBSERVED, confidence: 0.5 }
        },
      },
      costGuard,
      config: { enabled: true, minConfidence: 0.7, timeoutMs: 240_000 },
      now: clock.now,
    })
    const reconciler = new StoryReconciler({
      repository,
      keyframes: new FakeKeyframeOrchestrator(),
      videos: new FakeVideoOrchestrator(),
      assembler: new FakeStoryAssembler(),
      qcService,
      costGuard,
      config: {
        leaseMs: 60_000,
        assemblyLeaseMs: 240_000,
        qcLeaseMs: 300_000,
        qcTimeoutMs: 240_000,
        tickBudgetMs: 45_000,
        keyframeConcurrency: 3,
        videoConcurrency: 2,
        qcConcurrency: 1,
        claimLimit: 5,
        cleanupIntervalMs: 600_000,
        cleanupBatchSize: 50,
        cleanupGraceMs: 3_600_000,
      },
      owner: 'qc-cap-owner',
      now: clock.now,
    })

    await reconciler.runOnce()

    expect(evaluations).toEqual([1, 2, 3, 4, 5])
    expect(repository.find(story.id)).toMatchObject({
      status: 'WAITING_QC',
      qc: { status: 'NEEDS_REVIEW' },
    })
    expect(costGuard.estimate(repository.find(story.id)!)).toBe(1.732)

    const service = createStoryService({
      repository,
      director: null,
      keyframes: null,
      videos: null,
      rateLimiter: createStoryRateLimiter({
        config: {
          createLimit: 3,
          createWindowMs: 3_600_000,
          uploadLimit: 5,
          uploadWindowMs: 600_000,
          uploadIpLimit: 20,
          uploadIpWindowMs: 3_600_000,
          commandLimit: 10,
          commandWindowMs: 60_000,
          pollWindowMs: 1_500,
          cancelLimit: 3,
          cancelWindowMs: 60_000,
          assembleLimit: 3,
          assembleWindowMs: 3_600_000,
          qcRetryLimit: 3,
          qcRetryWindowMs: 3_600_000,
          maxActiveStories: 2,
          dailyBudgetUsd: 50,
        },
        now: clock.now,
      }),
      costGuard,
      config: { pollAfterMs: 2_500, storyTtlMs: 86_400_000 },
      now: clock.now,
    })

    const retried = await service.retryQc(story.id, SESSION_ID)

    expect(retried.status).toBe('VIDEOS_READY')
    expect(retried.qc).toBeNull()

    evaluations.length = 0
    clock.advance(5_000)

    await reconciler.runOnce()

    const waiting = repository.find(story.id)!

    expect(evaluations).toEqual([])
    expect(waiting).toMatchObject({
      status: 'WAITING_QC',
      qc: {
        status: 'UNAVAILABLE',
        errorCode: 'qc-budget-skipped',
        evaluator: 'none',
      },
    })
    expect(costGuard.estimate(waiting)).toBeLessThanOrEqual(CAP_USD)
    expect(costGuard.estimate(waiting)).toBe(1.732)
  })
})
