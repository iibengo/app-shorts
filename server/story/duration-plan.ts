import type {
  StoryCostMode,
  StoryDurationSeconds,
  StoryPlatform,
} from '~/models/story'
import type { DurationPlan } from './director-types'
import {
  allowedDurations,
  costProfile,
  durationPlanFor,
  isValidProfile,
} from './cost-profiles'

export interface DurationShot {
  readonly order: number
  readonly durationSeconds: number
}

export function plannedDuration(
  shots: readonly { readonly durationSeconds: number }[],
): number {
  return shots.reduce((total, shot) => total + shot.durationSeconds, 0)
}

export function plannedRange(
  costMode: StoryCostMode,
  targetDurationSeconds: StoryDurationSeconds,
  maxDurationSeconds: StoryDurationSeconds,
): { readonly min: number; readonly max: number } {
  if (costMode === 'budget' && targetDurationSeconds === 15) {
    return { min: 12, max: 15 }
  }

  if (costMode === 'budget' && targetDurationSeconds === 90) {
    return { min: 90, max: 90 }
  }

  return { min: targetDurationSeconds - 1, max: maxDurationSeconds }
}

export function trimToMaxDuration<T extends DurationShot>(
  shots: readonly T[],
  maxDuration: number,
): { readonly shots: readonly T[]; readonly duration: number } | null {
  if (plannedDuration(shots) <= maxDuration) {
    return { shots, duration: plannedDuration(shots) }
  }

  const trimmed = shots.map((shot) => ({ ...shot }))
  let total = plannedDuration(trimmed)

  for (let index = trimmed.length - 1; index >= 0 && total > maxDuration; index -= 1) {
    const shot = trimmed[index]!

    if (shot.durationSeconds <= 2) continue

    const nextDuration = Math.max(2, shot.durationSeconds - 2)
    total -= shot.durationSeconds - nextDuration
    trimmed[index] = { ...shot, durationSeconds: nextDuration }
  }

  return total > maxDuration
    ? null
    : { shots: trimmed, duration: total }
}

export function validateDurationPlan(input: {
  readonly costMode: unknown
  readonly targetDurationSeconds: unknown
  readonly maxDurationSeconds: unknown
  readonly platform: StoryPlatform
  readonly hasReference: boolean
}): DurationPlan {
  const costMode = input.costMode === undefined ? 'standard' : input.costMode
  const target = input.targetDurationSeconds === undefined ? 30 : input.targetDurationSeconds
  const max = input.maxDurationSeconds === undefined ? target : input.maxDurationSeconds

  if (
    costMode !== 'budget'
    && costMode !== 'standard'
    && costMode !== 'production'
  ) {
    throw new Error('invalid-cost-mode')
  }

  if (
    typeof target !== 'number'
    || !(allowedDurations(costMode as StoryCostMode) as readonly number[]).includes(target)
  ) {
    throw new Error('invalid-duration')
  }

  if (max !== target || !isValidProfile(costMode as StoryCostMode, target as StoryDurationSeconds)) {
    throw new Error('invalid-duration')
  }

  const profile = costProfile(costMode as StoryCostMode, target as StoryDurationSeconds)

  if (!profile) throw new Error('invalid-cost-mode')

  return durationPlanFor(
    costMode as StoryCostMode,
    target as StoryDurationSeconds,
    input.platform,
    input.hasReference,
  )
}

export function isValidPlannedDuration(
  plan: DurationPlan,
  planned: number,
  shots: number,
): boolean {
  const range = plannedRange(
    plan.costMode,
    plan.targetDurationSeconds,
    plan.maxDurationSeconds,
  )
  const shotBudget = plan.shotCount

  if (planned < range.min || planned > range.max) return false
  if (plan.exactShotCount !== null && shots !== plan.exactShotCount) return false

  return shots >= shotBudget.min && shots <= shotBudget.max
}
