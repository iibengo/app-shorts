import { describe, expect, it } from 'vitest'
import type { StoryCostMode, StoryDurationSeconds } from '~/models/story'
import { durationPlanFor } from '../../../server/story/cost-profiles'
import { createLegacyReelPlanAdapter } from '../../../server/story/reel-plan-adapter'
import type { StoryTimePlan } from '../../../server/story/time-plan'
import { FakeSceneCountStoryDirector } from '../../helpers/story-reel'

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

const PROFILES: readonly (readonly [StoryCostMode, StoryDurationSeconds, boolean])[] = [
  ['budget', 15, false],
  ['budget', 15, true],
  ['standard', 15, false],
  ['standard', 30, false],
  ['standard', 45, false],
  ['standard', 60, false],
  ['budget', 90, false],
  ['production', 90, false],
]

describe('LegacyReelPlanAdapter', () => {
  for (const [costMode, duration, hasReference] of PROFILES) {
    it(`builds a valid vertical plan for ${costMode} ${duration}${hasReference ? ' + reference' : ''}`, async () => {
      const director = new FakeSceneCountStoryDirector()
      const adapter = createLegacyReelPlanAdapter(director)
      const plan = durationPlanFor(costMode, duration, 'tiktok', hasReference)
      const reel = await adapter.createPlan({
        premise: PREMISE,
        mode: 'faithful',
        durationPlan: plan,
        referenceUrl: hasReference ? 'https://v3.fal.media/files/test/reference.webp' : null,
      })
      const shots = reel.shotPlan.scenes.flatMap((scene) => scene.shots)

      expect(director.calls).toHaveLength(1)
      expect(reel.plan.scenes.length).toBeGreaterThanOrEqual(plan.sceneCount.min)
      expect(reel.plan.scenes.length).toBeLessThanOrEqual(plan.sceneCount.max)
      expect(shots.length).toBeGreaterThanOrEqual(plan.shotCount.min)
      expect(shots.length).toBeLessThanOrEqual(plan.shotCount.max)
      if (plan.exactShotCount !== null) {
        expect(shots).toHaveLength(plan.exactShotCount)
      }
      expect(shots.reduce((total, shot) => total + shot.durationSeconds, 0))
        .toBe(duration)
      if (plan.costMode === 'budget' && duration === 15) {
        expect(shots.every((shot) => shot.durationSeconds <= 5)).toBe(true)
      }
      if (plan.costMode === 'budget' && duration === 90) {
        expect(shots.every((shot) => shot.durationSeconds === 6)).toBe(true)
      }
      expect(shots.map((shot) => shot.order)).toEqual(
        Array.from({ length: shots.length }, (_value, index) => index + 1),
      )
      expect(shots[0]?.framing).not.toBe('establishing')
      if (plan.rhythm === 'tiktok') {
        expect(shots[0]?.durationSeconds).toBeLessThanOrEqual(3)
        expect((shots[0]?.durationSeconds ?? 0) + (shots[1]?.durationSeconds ?? 0))
          .toBeLessThanOrEqual(6)
      }
      for (const scene of reel.shotPlan.scenes) {
        expect(scene.shots.length).toBeGreaterThanOrEqual(1)
        expect(scene.shots.length).toBeLessThanOrEqual(4)
        expect(scene.shots.map((shot) => shot.indexInScene)).toEqual(
          Array.from({ length: scene.shots.length }, (_value, index) => index + 1),
        )
      }
      for (const shot of shots) {
        expect(shot.action.length).toBeGreaterThanOrEqual(20)
        expect(shot.action.length).toBeLessThanOrEqual(200)
        expect(shot.visualPrompt.length).toBeGreaterThanOrEqual(20)
        expect(shot.visualPrompt.length).toBeLessThanOrEqual(400)
        expect(shot.subject.length).toBeGreaterThanOrEqual(3)
        expect(shot.subject.length).toBeLessThanOrEqual(80)
        expect(shot.transition).toBe('cut')
      }
    })
  }
})

describe('014 · el plan de tiempo manda sobre la división', () => {
  // The old path divided 24 s by 12 shots and asked the engine for 6 s clips
  // it then trimmed to 2. With a time plan the shot duration is a duration the
  // engine accepts, so paid and delivered seconds stop diverging (F9).
  const timePlan: StoryTimePlan = {
    engineId: 'minimax-hailuo-02',
    targetSeconds: 30,
    clipSeconds: [10, 10, 10],
    paidSeconds: 30,
    plannedSeconds: 30,
    usedRatio: 1,
    trimsLastShot: false,
    scenes: [
      { sceneOrder: 1, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
      { sceneOrder: 2, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
      { sceneOrder: 3, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
    ],
  }

  it('uses the engine durations instead of dividing the target', async () => {
    const director = new FakeSceneCountStoryDirector()
    const adapter = createLegacyReelPlanAdapter(director)
    const plan = durationPlanFor('standard', 30, 'tiktok', false)

    const reel = await adapter.createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: plan,
      referenceUrl: null,
      timePlan,
    })

    const shots = reel.shotPlan.scenes.flatMap((scene) => scene.shots)

    expect(shots).toHaveLength(3)
    for (const shot of shots) {
      expect([6, 10]).toContain(shot.durationSeconds)
    }
  })

  it('keeps the old behaviour when no time plan is given', async () => {
    const director = new FakeSceneCountStoryDirector()
    const adapter = createLegacyReelPlanAdapter(director)
    const plan = durationPlanFor('standard', 30, 'tiktok', false)

    const reel = await adapter.createPlan({
      premise: PREMISE,
      mode: 'faithful',
      durationPlan: plan,
      referenceUrl: null,
    })

    const shots = reel.shotPlan.scenes.flatMap((scene) => scene.shots)

    expect(shots.length).toBeGreaterThan(3)
  })
})
