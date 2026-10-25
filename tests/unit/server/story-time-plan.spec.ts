// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { engineCapacity } from '../../../server/story/engine-capabilities'
import { planStoryTime, MIN_USED_RATIO } from '../../../server/story/time-plan'
import { StoryError } from '../../../server/story/errors'

const FAST = engineCapacity('minimax-hailuo-02') // 6 y 10 s
const QUALITY = engineCapacity('kling-2.5-turbo-pro') // 5 y 10 s

describe('014 · el tiempo nace del motor, no de una división', () => {
  it('buys whole clips instead of trimming them down', () => {
    // The delivered story asked for 12 shots of 2 s and got 12 clips of 6 s:
    // it paid 72 s to show 24. This is the case that must never come back.
    // MiniMax only has 6 and 10, so 30 s is three clips of 10. Three scenes,
    // because five scenes cannot be filled with three clips.
    const plan = planStoryTime({ capacity: FAST, targetSeconds: 30, sceneCount: 3 })

    expect(plan.paidSeconds).toBe(30)
    expect(plan.plannedSeconds).toBe(30)
    expect(plan.usedRatio).toBe(1)
    expect(plan.clipSeconds.every((value) => FAST.durationsSeconds.includes(value))).toBe(true)
  })

  it('never asks for a duration the engine does not accept', () => {
    for (const target of [30, 60, 90]) {
      const plan = planStoryTime({
        capacity: FAST,
        targetSeconds: target,
        sceneCount: 3,
        maxPaidSeconds: target + 10,
      })

      for (const clip of plan.clipSeconds) {
        expect(FAST.durationsSeconds).toContain(clip)
      }
    }
  })

  it('publishes a used ratio that cannot hide a wasteful plan', () => {
    const plan = planStoryTime({ capacity: FAST, targetSeconds: 30, sceneCount: 3 })

    expect(plan.usedRatio).toBeGreaterThanOrEqual(MIN_USED_RATIO)
  })

  it('gives every scene whole clips and a word budget', () => {
    const plan = planStoryTime({ capacity: FAST, targetSeconds: 30, sceneCount: 3 })

    expect(plan.scenes).toHaveLength(3)

    for (const scene of plan.scenes) {
      expect(scene.clipSeconds.length).toBeGreaterThan(0)
      expect(scene.availableSeconds).toBe(
        scene.clipSeconds.reduce((total, value) => total + value, 0),
      )
      expect(scene.wordBudget).toBeGreaterThan(0)
    }
  })

  it('accounts for every paid clip across the scenes', () => {
    const plan = planStoryTime({
      capacity: FAST,
      targetSeconds: 60,
      sceneCount: 3,
      maxPaidSeconds: 62,
    })
    const summed = plan.scenes.flatMap((scene) => scene.clipSeconds)
      .reduce((total, value) => total + value, 0)

    expect(summed).toBe(plan.paidSeconds)
  })

  it('rounds up and trims only the last shot when the target is unreachable', () => {
    // 15 s cannot be built from 6 and 10 alone: it buys 18 and trims the tail.
    // 15 cannot be built from 6 and 10: it buys 18 and trims the tail to 15.
    const plan = planStoryTime({
      capacity: FAST,
      targetSeconds: 15,
      sceneCount: 2,
      maxPaidSeconds: 18,
    })

    expect(plan.trimsLastShot).toBe(true)
    expect(plan.plannedSeconds).toBeGreaterThanOrEqual(15)
    expect(plan.paidSeconds).toBeGreaterThanOrEqual(15)
    expect(plan.usedRatio).toBeGreaterThanOrEqual(MIN_USED_RATIO)
  })

  it('works with an engine whose durations start at five', () => {
    const plan = planStoryTime({ capacity: QUALITY, targetSeconds: 10, sceneCount: 1 })

    expect(plan.clipSeconds.every((value) => QUALITY.durationsSeconds.includes(value))).toBe(true)
  })

  it('refuses to plan when no combination fits the ceiling', () => {
    const error = (() => {
      try {
        planStoryTime({ capacity: FAST, targetSeconds: 90, sceneCount: 10, maxPaidSeconds: 12 })

        return null
      } catch (caught) {
        return caught
      }
    })()

    expect(error).toBeInstanceOf(StoryError)
  })
})
