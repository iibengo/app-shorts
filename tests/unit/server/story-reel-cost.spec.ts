import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STORY_COST_CONFIG,
  type StoryCostConfig,
} from '../../../server/story/cost'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'
import { FakeReelStoryRepository } from '../../helpers/story-reel'

const NOW = new Date('2026-10-22T12:00:00.000Z')

async function qualityStory() {
  const fixture = makeReelNarrative('standard', 30, false)
  const repository = new FakeReelStoryRepository()
  const story = await repository.createStory({
    sessionId: 'story-session-reel-cost',
    status: 'WAITING_APPROVAL',
    premise: fixture.canon.logline,
    title: fixture.canon.title,
    logline: fixture.canon.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'quality',
    mode: 'faithful',
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    plan: fixture.narrative,
    shotPlan: makeReelShotList(fixture.narrative, fixture.plan),
    idempotencyKey: null,
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  })

  return {
    ...story,
    shots: story.shots.map((shot) => ({
      ...shot,
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      videoAttempts: 0,
    })),
  }
}

describe('008 cost profile', () => {
  it('uses the 5 s quality unit instead of the legacy 10 s quality unit', async () => {
    const story = await qualityStory()
    const costs: StoryCostConfig = {
      ...DEFAULT_STORY_COST_CONFIG,
      videoFastCostUsd: 0.35,
      videoQualityCostUsd: 0.7,
      videoQualityShortCostUsd: 0.35,
    }
    const guard = createReelCostGuard({ costs })
    const base = guard.estimate(story)

    expect(costs.videoQualityShortCostUsd).toBe(0.35)
    expect(guard.estimateVideoAttempt(story) - base).toBeCloseTo(0.35, 6)
    expect(guard.estimateVideosApproval(story)).toBeCloseTo(
      base + story.shots.length * 0.35,
      6,
    )
  })
})
