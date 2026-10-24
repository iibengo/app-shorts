import { describe, expect, it } from 'vitest'
import type { StoryCreateRequest } from '~/models/story'
import {
  DEFAULT_STORY_COST_CONFIG,
  type StoryCostConfig,
} from '../../../server/story/cost'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { estimateCreationCost } from '../../../server/story/reel-service'
import type { StoredCharacterRefs } from '../../../server/story/character-refs'
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

const READY_REF = {
  status: 'ready' as const,
  source: 'generated' as const,
  frontalUrl: 'https://v3.fal.media/files/test/character.png',
  referenceUrls: ['https://v3.fal.media/files/test/character.png'],
  attempts: 1,
  updatedAt: '2026-10-24T12:00:00.000Z',
}

const PENDING_REF = {
  status: 'pending' as const,
  source: 'generated' as const,
  frontalUrl: null,
  referenceUrls: [],
  attempts: 0,
  updatedAt: '2026-10-24T12:00:00.000Z',
}

describe('012 character reference cost', () => {
  it('charges 0.04 per ready or attempted character', async () => {
    const story = await qualityStory()
    const guard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
    const base = guard.estimate(story)
    const refs: StoredCharacterRefs = {
      mara: READY_REF,
      iker: { ...READY_REF, frontalUrl: 'https://v3.fal.media/files/test/iker.png' },
      pending: PENDING_REF,
    }
    const withRefs = { ...story, characterRefs: refs }

    expect(guard.estimateCharacterRefs(withRefs)).toBeCloseTo(0.08, 6)
    expect(guard.estimate(withRefs)).toBeCloseTo(base + 0.08, 6)
  })

  it('does not charge a pending reference that never reached the provider', async () => {
    const story = await qualityStory()
    const guard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
    const withPending = { ...story, characterRefs: { mara: PENDING_REF } }

    expect(guard.estimateCharacterRefs(withPending)).toBe(0)
    expect(guard.estimate(withPending)).toBeCloseTo(guard.estimate(story), 6)
  })

  it('does not charge the user-supplied reference', async () => {
    const story = await qualityStory()
    const guard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
    const withUser = {
      ...story,
      characterRefs: {
        mara: { ...READY_REF, source: 'user' as const },
      },
    }

    expect(guard.estimateCharacterRefs(withUser)).toBe(0)
    expect(guard.estimate(withUser)).toBeCloseTo(guard.estimate(story), 6)
  })

  it('adds one unit for the next attempt and nothing for a ready reference', async () => {
    const story = await qualityStory()
    const guard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
    const base = guard.estimate(story)
    const withPending = { ...story, characterRefs: { mara: PENDING_REF } }
    const withReady = { ...story, characterRefs: { mara: READY_REF } }

    expect(guard.estimateCharacterRefAttempt(withPending, 'mara'))
      .toBeCloseTo(base + 0.04, 6)
    expect(guard.estimateCharacterRefAttempt(withReady, 'mara'))
      .toBeCloseTo(guard.estimate(withReady), 6)
  })

  it('keeps estimateVideoAttempt signature and value unchanged by references', async () => {
    const story = await qualityStory()
    const guard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
    const withRefs = { ...story, characterRefs: { mara: READY_REF } }

    expect(guard.estimateVideoAttempt(withRefs))
      .toBeCloseTo(guard.estimate(withRefs) + 0.35, 6)
  })
})

describe('012 exact budget profile arithmetic', () => {
  function request(
    hasReference: boolean,
  ): StoryCreateRequest {
    return {
      premise: 'Una repostera descubre que sus postres predicen el futuro.',
      platform: 'tiktok',
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      preset: 'fast',
      mode: 'faithful',
      referenceUrl: hasReference
        ? 'https://v3.fal.media/files/test/reference.webp'
        : null,
      referenceExpiresAt: hasReference
        ? '2026-10-24T13:00:00.000Z'
        : null,
    }
  }

  it('reserves no reference units in the pre-plan', () => {
    // The pre-plan call uses the default count of zero references on purpose.
    expect(estimateCreationCost(request(true), 4, false))
      .toBe(estimateCreationCost(request(true), 4, false, 0))
  })

  it('matches the budget 15 s table to the cent', () => {
    // With a user reference: keyframe 0.08, no reference for the lead.
    expect(estimateCreationCost(request(true), 4, false, 1)).toBe(2.14)
    expect(estimateCreationCost(request(true), 4, false, 2)).toBe(2.18)

    // Without a user reference: keyframe 0.05.
    expect(estimateCreationCost(request(false), 5, false, 1)).toBe(2.42)
    expect(estimateCreationCost(request(false), 5, false, 2)).toBe(2.46)
    // The worst case lands exactly on the 2.50 cap: it fits, no margin.
    expect(estimateCreationCost(request(false), 5, false, 3)).toBe(2.5)
  })
})
