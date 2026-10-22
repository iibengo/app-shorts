// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  isValidPlannedDuration,
  plannedDuration,
  plannedRange,
  trimToMaxDuration,
  validateDurationPlan,
} from '../../../server/story/duration-plan'

describe('duration plan', () => {
  it('uses the profile ranges', () => {
    expect(plannedRange('budget', 15, 15)).toEqual({ min: 12, max: 15 })
    expect(plannedRange('budget', 90, 90)).toEqual({ min: 90, max: 90 })
    expect(plannedRange('standard', 30, 30)).toEqual({ min: 29, max: 30 })
  })

  it('trims from the end without removing shots', () => {
    const result = trimToMaxDuration([
      { order: 1, durationSeconds: 5 },
      { order: 2, durationSeconds: 5 },
      { order: 3, durationSeconds: 5 },
    ], 12)

    expect(result?.duration).toBe(11)
    expect(result?.shots).toHaveLength(3)
    expect(result?.shots.map((shot) => shot.durationSeconds)).toEqual([5, 3, 3])
  })

  it('validates defaults and rejects max != target', () => {
    const plan = validateDurationPlan({
      costMode: undefined,
      targetDurationSeconds: undefined,
      maxDurationSeconds: undefined,
      platform: 'tiktok',
      hasReference: false,
    })

    expect(plan.costMode).toBe('standard')
    expect(plan.targetDurationSeconds).toBe(30)
    expect(isValidPlannedDuration(plan, 30, 9)).toBe(true)
    expect(() => validateDurationPlan({
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 45,
      platform: 'tiktok',
      hasReference: false,
    })).toThrow('invalid-duration')
  })

  it('computes planned duration', () => {
    expect(plannedDuration([{ durationSeconds: 2 }, { durationSeconds: 4 }])).toBe(6)
  })
})
