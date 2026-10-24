// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ENGINE_CAPACITIES,
  durationFor,
  engineCapacity,
  planShotDurations,
} from '../../../server/story/engine-capabilities'

const FAST = engineCapacity('minimax-hailuo-02')
const QUALITY = engineCapacity('kling-2.5-turbo-pro')

describe('engine capacities', () => {
  it('records the durations each engine actually accepts', () => {
    // Read from the published schemas on 2026-10-24. One engine has no 5, the
    // other has no 6: asking for the wrong one used to be silently rounded.
    expect(FAST.durationsSeconds).toEqual([6, 10])
    expect(QUALITY.durationsSeconds).toEqual([5, 10])
  })

  it('records that the last-frame field has a different name in each engine', () => {
    expect(FAST.lastImageField).toBe('end_image_url')
    expect(QUALITY.lastImageField).toBe('tail_image_url')
  })

  it('records which engine rewrites our prompt by default', () => {
    expect(FAST.promptOptimizerByDefault).toBe(true)
    expect(QUALITY.promptOptimizerByDefault).toBe(false)
  })

  it('records who accepts a negative prompt', () => {
    expect(FAST.inputs).not.toContain('negative-prompt')
    expect(QUALITY.inputs).toContain('negative-prompt')
  })

  it('dates every sheet so a schema change can be traced', () => {
    for (const capacity of Object.values(ENGINE_CAPACITIES)) {
      expect(capacity.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('fails loudly for an engine nobody described', () => {
    expect(() => engineCapacity('invented' as never)).toThrow()
  })
})

describe('duration selection', () => {
  it('keeps an accepted duration as it is', () => {
    expect(durationFor(FAST, 6)).toBe(6)
    expect(durationFor(QUALITY, 5)).toBe(5)
  })

  it('picks the nearest accepted duration, never an invented one', () => {
    expect(durationFor(FAST, 2)).toBe(6)
    expect(durationFor(FAST, 3)).toBe(6)
    expect(durationFor(QUALITY, 3)).toBe(5)
    expect(durationFor(FAST, 9)).toBe(10)
  })

  it('prefers the shorter one on a tie, so nobody pays for unused seconds', () => {
    // 8 sits exactly between 6 and 10.
    expect(durationFor(FAST, 8)).toBe(6)
  })
})

describe('planning shots inside the engine limits', () => {
  it('reports 15 seconds as impossible with a 6 second minimum', () => {
    // 15 cannot be built from 6 and 10 without a 3 second remainder, and this
    // engine has no 3. The honest answer is "cannot", not an invented duration
    // that the provider would silently round and we would trim.
    expect(planShotDurations(FAST, 15, 6)).toBeNull()
  })

  it('composes 12 and 18 exactly, which 6 and 10 do build', () => {
    expect(planShotDurations(FAST, 12, 6)).toEqual([6, 6])
    expect(planShotDurations(FAST, 18, 6)).toEqual([6, 6, 6])
    // Longest first: the plan opens with the widest beat and closes shorter.
    expect(planShotDurations(FAST, 16, 6)).toEqual([10, 6])
  })

  it('composes 30 seconds from accepted durations only', () => {
    const plan = planShotDurations(FAST, 30, 10)

    expect(plan).not.toBeNull()
    expect(plan!.reduce((total, value) => total + value, 0)).toBe(30)
    expect(plan!.every((value) => FAST.durationsSeconds.includes(value))).toBe(true)
  })

  it('respects the shot cap', () => {
    const plan = planShotDurations(FAST, 60, 3)

    expect(plan).toBeNull()
  })

  it('prefers long shots over many short ones', () => {
    const plan = planShotDurations(QUALITY, 20, 10)!

    expect(plan).toEqual([10, 10])
  })

  it('returns null when the target cannot be composed', () => {
    expect(planShotDurations(FAST, 3, 1)).toBeNull()
  })

  it('is deterministic', () => {
    expect(planShotDurations(FAST, 45, 12)).toEqual(planShotDurations(FAST, 45, 12))
  })
})

describe('prices, taken from the provider page', () => {
  it('records the per-second price each engine actually charges', () => {
    // Hailuo 02 Standard at 768P: 0.27 for 6 seconds. Kling 2.5 Turbo Pro:
    // 0.35 for the first 5 seconds, which is the figure the sheet keeps.
    expect(FAST.costPerSecondUsd).toBeCloseTo(0.045, 4)
    expect(QUALITY.costPerSecondUsd).toBeCloseTo(0.07, 4)
  })

  it('shows the cheap engine is never the expensive one per second', () => {
    expect(FAST.costPerSecondUsd).toBeLessThan(QUALITY.costPerSecondUsd)
  })
})
