// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import {
  DEFAULT_STORY_COST_CONFIG,
  NativeStoryCostGuard,
  createStoryCostGuard,
} from '../../../server/story/cost'
import type { StoryPreset } from '~/models/story'
import { makeScenes, makeStoryRecord } from '../../helpers/story'

function guard(options: Parameters<typeof createStoryCostGuard>[0] = {}) {
  return createStoryCostGuard(options)
}

function storyWith(options: {
  preset?: StoryPreset
  sceneCount?: number
  reference?: boolean
  keyframeAttempts?: number
  videoAttempts?: number
}) {
  const sceneCount = options.sceneCount ?? 5

  return makeStoryRecord({
    preset: options.preset ?? 'fast',
    sceneCount,
    referenceUrl: options.reference ? 'https://v3.fal.media/files/test/ref.webp' : null,
    referenceExpiresAt: options.reference ? new Date(Date.now() + 3_600_000) : null,
    scenes: makeScenes(sceneCount, {
      keyframeAttempts: options.keyframeAttempts ?? 0,
      videoAttempts: options.videoAttempts ?? 0,
    }),
  })
}

describe('story cost estimates', () => {
  it('exposes the configured defaults', () => {
    expect(DEFAULT_STORY_COST_CONFIG).toEqual({
      maxStoryCostUsd: 8,
      directorCostUsd: 0.01,
      narrativeCostUsd: 0.01,
      visualCostUsd: 0.012,
      directorRepairCostUsd: 0.01,
      keyframeCostUsd: 0.05,
      keyframeReferenceCostUsd: 0.08,
      videoFastCostUsd: 0.35,
      videoQualityCostUsd: 0.7,
      videoQualityShortCostUsd: 0.35,
      qcUnitCostUsd: 0.02,
      dailyBudgetUsd: 50,
    })
    expect(guard().costs).toEqual(DEFAULT_STORY_COST_CONFIG)
  })

  it.each([
    ['fast', 4, false, 1.632],
    ['fast', 5, false, 2.032],
    ['fast', 6, false, 2.432],
    ['fast', 6, true, 2.612],
    ['quality', 4, false, 3.032],
    ['quality', 5, false, 3.782],
    ['quality', 6, false, 4.532],
    ['quality', 6, true, 4.712],
  ] as const)(
    'estimates the base %s story with %i scenes and reference=%s',
    (preset, sceneCount, hasReference, expected) => {
      expect(guard().estimateNewStory(preset, sceneCount, hasReference)).toBe(expected)
    },
  )

  it('counts every persisted attempt, including failed ones', () => {
    const story = storyWith({
      sceneCount: 5,
      keyframeAttempts: 2,
      videoAttempts: 2,
    })

    expect(guard().estimate(story)).toBe(4.032)
  })

  it('uses the reference keyframe unit when a reference exists', () => {
    const story = storyWith({
      sceneCount: 5,
      reference: true,
      keyframeAttempts: 2,
      videoAttempts: 2,
    })

    expect(guard().estimate(story)).toBe(4.332)
  })

  it('uses the quality video unit for quality stories', () => {
    const story = storyWith({
      preset: 'quality',
      sceneCount: 4,
      keyframeAttempts: 2,
      videoAttempts: 2,
    })

    expect(guard().estimate(story)).toBe(6.032)
  })

  it('adds one keyframe unit for the next attempt', () => {
    const story = storyWith({ sceneCount: 5, keyframeAttempts: 1, videoAttempts: 0 })

    expect(guard().estimate(story)).toBe(0.282)
    expect(guard().estimateAfterKeyframeAttempt(story)).toBe(0.332)
  })

  it('adds one video unit for the next attempt', () => {
    const story = storyWith({ sceneCount: 5, keyframeAttempts: 1, videoAttempts: 0 })

    expect(guard().estimateAfterVideoAttempt(story)).toBe(0.632)
  })

  it('projects the vision cost per scene for the QC', () => {
    const story = storyWith({ sceneCount: 5, keyframeAttempts: 1, videoAttempts: 0 })

    expect(guard().estimateAfterQc(story)).toBe(0.382)
  })

  it('accumulates vision calls across QC retries and forgets cancelled stories', () => {
    const story = storyWith({ sceneCount: 5, keyframeAttempts: 1, videoAttempts: 0 })
    const costGuard = guard()

    costGuard.recordQcEvaluations(story.id, 5)

    const first = costGuard.estimate(story)

    expect(first).toBe(0.382)
    expect(costGuard.estimateAfterQc(story)).toBe(0.482)

    costGuard.recordQcEvaluations(story.id, 5)

    expect(costGuard.estimate(story)).toBe(0.482)
    expect(costGuard.estimate(story)).toBeLessThan(8)

    costGuard.forgetStory(story.id)

    expect(costGuard.estimate(story)).toBe(0.282)
  })

  it('projects the approval cost from the pending videos only', () => {
    const scenes = makeScenes(5, { keyframeAttempts: 1, videoAttempts: 0 })
    scenes[0] = { ...scenes[0]!, videoAttempts: 2, status: 'VIDEO_FAILED' }
    const story = makeStoryRecord({ preset: 'quality', sceneCount: 5, scenes })

    const estimate = guard().estimate(story)

    expect(guard().estimateVideosApproval(story)).toBe(
      Math.round((estimate + 4 * 0.7) * 1_000_000) / 1_000_000,
    )
  })

  it('honours custom unit costs and rounds to six decimals', () => {
    const custom = createStoryCostGuard({
      narrativeCostUsd: 0.0000002,
      visualCostUsd: 0.0000002,
      directorRepairCostUsd: 0.0000001,
      keyframeCostUsd: 0,
      keyframeReferenceCostUsd: 0,
      videoFastCostUsd: 0,
      videoQualityCostUsd: 0,
    })

    expect(custom.estimateNewStory('fast', 4, false)).toBe(0.000001)
    expect(new NativeStoryCostGuard({ ...DEFAULT_STORY_COST_CONFIG, videoFastCostUsd: 0.1 })
      .estimateNewStory('fast', 10, false)).toBe(1.532)
  })
})

describe('story budget cap', () => {
  it('accepts costs up to the 8 USD cap', () => {
    expect(() => guard().assertWithinBudget(8)).not.toThrow()
    expect(() => guard().assertWithinBudget(7.999999)).not.toThrow()
  })

  it('rejects a cost above the cap with story-budget-exhausted', () => {
    let error: unknown

    try {
      guard().assertWithinBudget(8.000001)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('story-budget-exhausted')
    expect((error as StoryError).status).toBe(429)
  })

  it('rejects the worst-case 6 scene quality story', () => {
    const story = storyWith({
      preset: 'quality',
      sceneCount: 6,
      keyframeAttempts: 2,
      videoAttempts: 2,
    })

    expect(guard().estimate(story)).toBe(9.032)
    expect(() => guard().assertWithinBudget(guard().estimate(story))).toThrow(StoryError)
  })

  it('supports a custom cap without changing the formula', () => {
    const custom = guard({ maxStoryCostUsd: 5 })

    expect(() => custom.assertWithinBudget(5)).not.toThrow()
    expect(() => custom.assertWithinBudget(5.01)).toThrow(StoryError)
    expect(custom.estimateNewStory('fast', 5, false)).toBe(2.032)
  })

  it('does not call the provider when the projected attempt exceeds the cap', () => {
    const custom = guard({ maxStoryCostUsd: 1 })
    const story = storyWith({ sceneCount: 5, keyframeAttempts: 2, videoAttempts: 1 })
    const projected = custom.estimateAfterVideoAttempt(story)

    expect(projected).toBeGreaterThan(1)
    expect(() => custom.assertWithinBudget(projected)).toThrow(StoryError)
  })
})
