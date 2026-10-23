import type {
  StoryCostMode,
  StoryCreateRequest,
  StoryDurationSeconds,
  StoryPlatform,
  StoryShotDurationSeconds,
  StoryShotUpdateRequest,
} from '~/models/story'
import { findUnknownField, isJsonObject } from '../shared/json'
import {
  costProfile,
  durationPlanFor,
  isValidProfile,
} from './cost-profiles'
import type { DurationPlan } from './director-types'
import { StoryError } from './errors'
import {
  validatePreset,
  validatePremise,
  validateReference,
  validateStoryMode,
  validateVisualPrompt,
} from './validation'
import { validateVisualStyle } from './visual-style'

export const REEL_CREATE_FIELDS = [
  'premise',
  'platform',
  'costMode',
  'targetDurationSeconds',
  'maxDurationSeconds',
  'sceneCount',
  'preset',
  'visualStyle',
  'mode',
  'referenceUrl',
  'referenceExpiresAt',
  'legacy',
] as const

const PLATFORMS: readonly StoryPlatform[] = ['tiktok', 'reels']
const COST_MODES: readonly StoryCostMode[] = ['budget', 'standard', 'production']

export function validateReelPlatform(value: unknown): StoryPlatform {
  if (value === undefined) return 'tiktok'
  if (typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)) {
    return value as StoryPlatform
  }

  throw new StoryError('invalid-platform')
}

export function validateReelCostMode(value: unknown): StoryCostMode {
  if (value === undefined) return 'standard'
  if (typeof value === 'string' && (COST_MODES as readonly string[]).includes(value)) {
    return value as StoryCostMode
  }

  throw new StoryError('invalid-cost-mode')
}

export function validateReelDuration(
  costMode: StoryCostMode,
  targetValue: unknown,
  maxValue: unknown,
): { readonly target: StoryDurationSeconds; readonly max: StoryDurationSeconds } {
  const target = targetValue === undefined ? 30 : targetValue

  const ALL_DURATIONS = [15, 30, 45, 60, 90]

  if (typeof target !== 'number' || !ALL_DURATIONS.includes(target)) {
    throw new StoryError('invalid-duration')
  }

  if (!isValidProfile(costMode, target as StoryDurationSeconds)) {
    throw new StoryError('invalid-cost-mode')
  }

  const max = maxValue === undefined ? target : maxValue

  if (max !== target) throw new StoryError('invalid-duration')

  return { target: target as StoryDurationSeconds, max: max as StoryDurationSeconds }
}

export interface ReelCreateValidation {
  readonly request: StoryCreateRequest
  readonly durationPlan: DurationPlan
}

const SHOT_UPDATE_FIELDS = ['visualPrompt', 'durationSeconds', 'regenerate'] as const
const SHOT_DURATIONS: readonly StoryShotDurationSeconds[] = [2, 3, 4, 5, 6]

export function validateReelShotUpdate(
  payload: unknown,
): StoryShotUpdateRequest {
  if (!isJsonObject(payload)) throw new StoryError('invalid-request')

  if (findUnknownField(payload, SHOT_UPDATE_FIELDS) !== null) {
    throw new StoryError('invalid-request')
  }

  const visualPrompt = payload.visualPrompt === undefined
    ? undefined
    : validateVisualPrompt(payload.visualPrompt)
  const durationSeconds = payload.durationSeconds === undefined
    ? undefined
    : payload.durationSeconds

  if (
    durationSeconds !== undefined
    && (
      typeof durationSeconds !== 'number'
      || !(SHOT_DURATIONS as readonly number[]).includes(durationSeconds)
    )
  ) {
    throw new StoryError('invalid-shot-duration')
  }

  if (payload.regenerate !== undefined && typeof payload.regenerate !== 'boolean') {
    throw new StoryError('invalid-request')
  }

  if (visualPrompt === undefined && durationSeconds === undefined && payload.regenerate === undefined) {
    throw new StoryError('invalid-request')
  }

  return {
    ...(visualPrompt === undefined ? {} : { visualPrompt }),
    ...(durationSeconds === undefined
      ? {}
      : { durationSeconds: durationSeconds as StoryShotDurationSeconds }),
    ...(payload.regenerate === undefined ? {} : { regenerate: payload.regenerate }),
  }
}

export function validateReelCreateRequest(
  payload: unknown,
  now: number,
): ReelCreateValidation {
  if (!isJsonObject(payload)) throw new StoryError('invalid-request')
  if (findUnknownField(payload, REEL_CREATE_FIELDS) !== null) {
    throw new StoryError('invalid-request')
  }

  const premise = validatePremise(payload.premise)
  const platform = validateReelPlatform(payload.platform)
  const costMode = validateReelCostMode(payload.costMode)
  const preset = validatePreset(payload.preset)
  const mode = validateStoryMode(payload.mode)
  const visualStyle = validateVisualStyle(payload.visualStyle)
  const duration = validateReelDuration(costMode, payload.targetDurationSeconds, payload.maxDurationSeconds)
  const profile = costProfile(costMode, duration.target)

  if (!profile) throw new StoryError('invalid-cost-mode')
  if (!profile.qualityAllowed && preset === 'quality') {
    throw new StoryError('invalid-cost-mode')
  }

  const reference = validateReference(payload.referenceUrl, payload.referenceExpiresAt, now)
  const durationPlan = durationPlanFor(
    costMode,
    duration.target,
    platform,
    reference.referenceUrl !== null,
  )

  return {
    request: {
      premise,
      platform,
      costMode,
      targetDurationSeconds: duration.target,
      maxDurationSeconds: duration.max,
      preset,
      visualStyle,
      mode,
      referenceUrl: reference.referenceUrl,
      referenceExpiresAt: reference.referenceExpiresAt,
    },
    durationPlan,
  }
}
