import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  StoryCostMode,
  StoryCreateRequest,
  StoryDurationSeconds,
} from '~/models/story'
import { createDeepSeekClient } from '../../../server/story/deepseek-client'
import { createReelStoryDirector } from '../../../server/story/reel-director'
import { createReelNarrativeDirector } from '../../../server/story/reel-narrative-director'
import { createReelShotDirector } from '../../../server/story/reel-shot-director'
import {
  createReelStoryService,
  toReelStoryDto,
} from '../../../server/story/reel-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { durationPlanFor } from '../../../server/story/cost-profiles'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'
import { startDeepSeekStub } from '../../helpers/deepseek-stub'
import { FakeReelStoryRepository } from '../../helpers/story-reel'

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'
const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const KEY = 'test-deepseek-key'
const stub = await startDeepSeekStub()

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

const PROFILES: readonly (readonly [StoryCostMode, StoryDurationSeconds, boolean])[] = [
  ['budget', 15, true],
  ['budget', 15, false],
  ['standard', 15, false],
  ['standard', 30, false],
  ['standard', 45, false],
  ['standard', 60, false],
  ['budget', 90, false],
  ['production', 90, false],
]

function request(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
  hasReference: boolean,
): StoryCreateRequest {
  return {
    premise: PREMISE,
    platform: 'tiktok',
    costMode,
    targetDurationSeconds: duration,
    maxDurationSeconds: duration,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: hasReference
      ? 'https://v3.fal.media/files/test/reference.webp'
      : null,
    referenceExpiresAt: hasReference
      ? new Date(NOW + 3_600_000).toISOString()
      : null,
  }
}

function setup() {
  const repository = new FakeReelStoryRepository()
  const client = createDeepSeekClient({ apiKey: KEY, baseUrl: stub.baseUrl })
  const director = createReelStoryDirector({
    narrative: createReelNarrativeDirector({
      client,
      canonTimeoutMs: 2_000,
      scenesTimeoutMs: 2_000,
    }),
    shots: createReelShotDirector({ client, timeoutMs: 2_000 }),
    totalTimeoutMs: 5_000,
  })
  const service = createReelStoryService({
    repository,
    director,
    rateLimiter: createStoryRateLimiter({
      config: {
        ...DEFAULT_STORY_RATE_LIMIT_CONFIG,
        maxActiveStories: 50,
        createLimit: 50,
        dailyBudgetUsd: 1_000,
      },
      now: () => NOW,
    }),
    config: { storyTtlMs: 86_400_000, pollAfterMs: 2_500 },
    now: () => NOW,
  })

  return { repository, service }
}

describe('real 008 creation against the statement repository', () => {
  for (const [costMode, duration, hasReference] of PROFILES) {
    it(`persists ${costMode} ${duration}${hasReference ? ' + reference' : ''} from real director output`, async () => {
      const { repository, service } = setup()
      const fixture = makeReelNarrative(costMode, duration, hasReference)
      const shots = makeReelShotList(fixture.narrative, fixture.plan)
      stub.state.contents = [
        fixture.canon,
        { scenes: fixture.narrative.scenes },
        shots,
      ]
      const body = request(costMode, duration, hasReference)
      const result = await service.create({
        sessionId: `real-session-${costMode}-${duration}-${hasReference}`,
        request: body,
        idempotencyKey: null,
        bodyHash: 'body-hash',
      })
      const dto = toReelStoryDto(result.story, 2_500, NOW)

      expect(result.replayed).toBe(false)
      expect(result.story.status).toBe('GENERATING_KEYFRAMES')
      expect(result.story.platform).toBe('tiktok')
      expect(result.story.costMode).toBe(costMode)
      expect(result.story.targetDurationSeconds).toBe(duration)
      expect(result.story.maxDurationSeconds).toBe(duration)
      expect(result.story.plan.scenes).toEqual(fixture.narrative.scenes)
      expect(result.story.shotCount).toBe(
        durationPlanFor(
          costMode,
          duration,
          'tiktok',
          hasReference,
        ).exactShotCount ?? durationPlanFor(
          costMode,
          duration,
          'tiktok',
          hasReference,
        ).shotCount.max,
      )
      expect(result.story.plannedDurationSeconds).toBe(duration)
      expect(result.story.shots).toHaveLength(result.story.shotCount)
      expect(result.story.shots.every((shot) => shot.status === 'PENDING'))
        .toBe(true)
      expect(dto.scenes).toHaveLength(fixture.narrative.scenes.length)
      expect(dto.scenes.flatMap((scene) => scene.shots)).toHaveLength(dto.shotCount)
      expect(dto.plan?.scenes).toEqual(fixture.narrative.scenes)
      expect(repository.records).toHaveLength(1)
      expect(stub.requests).toHaveLength(3)
    })
  }
})
