import type { StoryPreset, StoryShotDurationSeconds } from '~/models/story'
import type { DurationPlan } from './director-types'

/**
 * Single authority for shot duration by profile and preset.
 *
 * 6 s is only valid for fast, except budget 90 (exact 6) and budget 15 (2–5).
 */
export function isShotDurationAllowed(
  plan: Pick<DurationPlan, 'costMode' | 'targetDurationSeconds'>,
  preset: StoryPreset,
  durationSeconds: number,
): durationSeconds is StoryShotDurationSeconds {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 2 || durationSeconds > 6) {
    return false
  }

  if (plan.costMode === 'budget' && plan.targetDurationSeconds === 15) {
    return durationSeconds >= 2 && durationSeconds <= 5
  }

  if (plan.costMode === 'budget' && plan.targetDurationSeconds === 90) {
    return durationSeconds === 6
  }

  if (preset === 'quality') {
    return durationSeconds >= 2 && durationSeconds <= 5
  }

  if (
    plan.costMode === 'standard'
    && plan.targetDurationSeconds !== 15
  ) {
    return durationSeconds >= 2 && durationSeconds <= 5
  }

  return durationSeconds >= 2 && durationSeconds <= 6
}

export function shotDurationRange(
  plan: Pick<DurationPlan, 'costMode' | 'targetDurationSeconds'>,
  preset: StoryPreset,
): { readonly min: number; readonly max: number; readonly exact: number | null } {
  if (plan.costMode === 'budget' && plan.targetDurationSeconds === 90) {
    return { min: 6, max: 6, exact: 6 }
  }

  const cap = preset === 'quality'
    || (plan.costMode === 'budget' && plan.targetDurationSeconds === 15)
    || (plan.costMode === 'standard' && plan.targetDurationSeconds !== 15)

  return { min: 2, max: cap ? 5 : 6, exact: null }
}
