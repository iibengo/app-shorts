import type {
  StoryCostMode,
  StoryDurationSeconds,
  StoryPlatform,
  StoryPreset,
  StoryShotDurationSeconds,
} from '~/models/story'
import type { DurationPlan } from './director-types'

export type ProfileRhythm = 'tiktok' | 'slow'

export interface StoryCostProfile {
  readonly costMode: StoryCostMode
  readonly durationSeconds: StoryDurationSeconds
  readonly plannedMin: number
  readonly plannedMax: number
  readonly sceneMin: number
  readonly sceneMax: number
  readonly shotMin: number
  readonly shotMax: number
  readonly exactShotCount: number | null
  readonly shotDurationMin: StoryShotDurationSeconds
  readonly shotDurationMax: StoryShotDurationSeconds
  readonly preset: StoryPreset | 'both'
  readonly rhythm: ProfileRhythm
  readonly capUsd: number
  readonly maxVideoAttempts: 2
  readonly attemptsReset: boolean
  readonly qualityAllowed: boolean
  readonly timeMinMinutes: number
  readonly timeMaxMinutes: number
  readonly slowThresholdMs: number
}

export const STORY_COST_PROFILES: readonly StoryCostProfile[] = [
  {
    costMode: 'budget',
    durationSeconds: 15,
    plannedMin: 12,
    plannedMax: 15,
    sceneMin: 2,
    sceneMax: 3,
    shotMin: 4,
    shotMax: 5,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 5,
    preset: 'fast',
    rhythm: 'tiktok',
    capUsd: 2.5,
    maxVideoAttempts: 2,
    attemptsReset: false,
    qualityAllowed: false,
    timeMinMinutes: 3,
    timeMaxMinutes: 5,
    slowThresholdMs: 378_000,
  },
  {
    costMode: 'standard',
    durationSeconds: 15,
    plannedMin: 14,
    plannedMax: 15,
    sceneMin: 2,
    sceneMax: 3,
    shotMin: 4,
    shotMax: 6,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 6,
    preset: 'both',
    rhythm: 'tiktok',
    capUsd: 5,
    maxVideoAttempts: 2,
    attemptsReset: true,
    qualityAllowed: true,
    timeMinMinutes: 4,
    timeMaxMinutes: 6,
    slowThresholdMs: 450_000,
  },
  {
    costMode: 'standard',
    durationSeconds: 30,
    plannedMin: 29,
    plannedMax: 30,
    sceneMin: 3,
    sceneMax: 5,
    shotMin: 9,
    shotMax: 12,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 6,
    preset: 'both',
    rhythm: 'tiktok',
    capUsd: 7,
    maxVideoAttempts: 2,
    attemptsReset: true,
    qualityAllowed: true,
    timeMinMinutes: 5,
    timeMaxMinutes: 10,
    slowThresholdMs: 750_000,
  },
  {
    costMode: 'standard',
    durationSeconds: 45,
    plannedMin: 44,
    plannedMax: 45,
    sceneMin: 4,
    sceneMax: 6,
    shotMin: 14,
    shotMax: 16,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 6,
    preset: 'both',
    rhythm: 'tiktok',
    capUsd: 9,
    maxVideoAttempts: 2,
    attemptsReset: true,
    qualityAllowed: true,
    timeMinMinutes: 7,
    timeMaxMinutes: 12,
    slowThresholdMs: 900_000,
  },
  {
    costMode: 'standard',
    durationSeconds: 60,
    plannedMin: 59,
    plannedMax: 60,
    sceneMin: 5,
    sceneMax: 8,
    shotMin: 18,
    shotMax: 22,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 6,
    preset: 'both',
    rhythm: 'tiktok',
    capUsd: 11,
    maxVideoAttempts: 2,
    attemptsReset: true,
    qualityAllowed: true,
    timeMinMinutes: 10,
    timeMaxMinutes: 16,
    slowThresholdMs: 1_200_000,
  },
  {
    costMode: 'budget',
    durationSeconds: 90,
    plannedMin: 90,
    plannedMax: 90,
    sceneMin: 5,
    sceneMax: 8,
    shotMin: 15,
    shotMax: 15,
    exactShotCount: 15,
    shotDurationMin: 6,
    shotDurationMax: 6,
    preset: 'fast',
    rhythm: 'slow',
    capUsd: 7,
    maxVideoAttempts: 2,
    attemptsReset: false,
    qualityAllowed: false,
    timeMinMinutes: 12,
    timeMaxMinutes: 18,
    slowThresholdMs: 1_350_000,
  },
  {
    costMode: 'production',
    durationSeconds: 90,
    plannedMin: 89,
    plannedMax: 90,
    sceneMin: 7,
    sceneMax: 10,
    shotMin: 26,
    shotMax: 30,
    exactShotCount: null,
    shotDurationMin: 2,
    shotDurationMax: 6,
    preset: 'both',
    rhythm: 'tiktok',
    capUsd: 15,
    maxVideoAttempts: 2,
    attemptsReset: true,
    qualityAllowed: true,
    timeMinMinutes: 17,
    timeMaxMinutes: 25,
    slowThresholdMs: 1_878_000,
  },
] as const

const DURATION_VALUES: readonly StoryDurationSeconds[] = [15, 30, 45, 60, 90]

export function allowedDurations(costMode: StoryCostMode): readonly StoryDurationSeconds[] {
  return STORY_COST_PROFILES
    .filter((profile) => profile.costMode === costMode)
    .map((profile) => profile.durationSeconds)
}

export function isValidProfile(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
): boolean {
  return STORY_COST_PROFILES.some((profile) =>
    profile.costMode === costMode && profile.durationSeconds === duration)
}

export function costProfile(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
): StoryCostProfile | null {
  return STORY_COST_PROFILES.find((profile) =>
    profile.costMode === costMode && profile.durationSeconds === duration) ?? null
}

export function profileShotBudget(
  profile: StoryCostProfile,
  hasReference: boolean,
): { readonly min: number; readonly max: number; readonly exact: number | null } {
  if (profile.costMode === 'budget' && profile.durationSeconds === 15 && hasReference) {
    return { min: 4, max: 4, exact: 4 }
  }

  if (profile.exactShotCount !== null) {
    return { min: profile.exactShotCount, max: profile.exactShotCount, exact: profile.exactShotCount }
  }

  return { min: profile.shotMin, max: profile.shotMax, exact: null }
}

export function profileSceneBudget(
  profile: StoryCostProfile,
): { readonly min: number; readonly max: number } {
  return { min: profile.sceneMin, max: profile.sceneMax }
}

export function profileCapUsd(profile: StoryCostProfile): number {
  return profile.capUsd
}

export function profileRhythm(profile: StoryCostProfile): ProfileRhythm {
  return profile.rhythm
}

export function profileAttemptsReset(profile: StoryCostProfile): boolean {
  return profile.attemptsReset
}

export function profileSlowThresholdMs(profile: StoryCostProfile): number {
  return profile.slowThresholdMs
}

export function profilePresetAllowed(
  profile: StoryCostProfile,
  preset: StoryPreset,
): boolean {
  return profile.qualityAllowed || preset === 'fast'
}

export function durationPlanFor(
  costMode: StoryCostMode,
  duration: StoryDurationSeconds,
  platform: StoryPlatform,
  hasReference: boolean,
): DurationPlan {
  const profile = costProfile(costMode, duration)

  if (!profile) {
    throw new Error('invalid-cost-mode')
  }

  const shots = profileShotBudget(profile, hasReference)
  const scenes = profileSceneBudget(profile)

  return {
    costMode,
    platform,
    targetDurationSeconds: duration,
    maxDurationSeconds: duration,
    rhythm: profile.rhythm,
    sceneCount: scenes,
    shotCount: { min: shots.min, max: shots.max },
    shotsPerSceneMax: 4,
    exactShotCount: shots.exact,
    capUsd: profile.capUsd,
    maxVideoAttempts: 2,
    attemptsReset: profile.attemptsReset,
    qualityAllowed: profile.qualityAllowed,
    slowThresholdMs: profile.slowThresholdMs,
  }
}

export function validateProfileDuration(
  costMode: StoryCostMode,
  duration: unknown,
): duration is StoryDurationSeconds {
  return typeof duration === 'number'
    && (DURATION_VALUES as readonly number[]).includes(duration)
    && isValidProfile(costMode, duration as StoryDurationSeconds)
}
