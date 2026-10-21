import type { StoryRecord } from './repository'
import { StoryError } from './errors'

export interface StoryCostConfig {
  readonly maxStoryCostUsd: number
  readonly directorCostUsd: number
  readonly keyframeCostUsd: number
  readonly keyframeReferenceCostUsd: number
  readonly videoFastCostUsd: number
  readonly videoQualityCostUsd: number
  readonly dailyBudgetUsd: number
}

export interface StoryCostGuard {
  estimate(story: StoryRecord): number
  estimateNewStory(
    preset: StoryRecord['preset'],
    sceneCount: number,
    hasReference: boolean,
  ): number
  estimateAfterKeyframeAttempt(story: StoryRecord): number
  estimateAfterVideoAttempt(story: StoryRecord): number
  estimateVideosApproval(story: StoryRecord): number
  assertWithinBudget(costUsd: number): void
}

export interface StoryCostConfigOptions {
  readonly maxStoryCostUsd?: number
  readonly directorCostUsd?: number
  readonly keyframeCostUsd?: number
  readonly keyframeReferenceCostUsd?: number
  readonly videoFastCostUsd?: number
  readonly videoQualityCostUsd?: number
  readonly dailyBudgetUsd?: number
}

export const DEFAULT_STORY_COST_CONFIG: StoryCostConfig = {
  maxStoryCostUsd: 8,
  directorCostUsd: 0.01,
  keyframeCostUsd: 0.05,
  keyframeReferenceCostUsd: 0.08,
  videoFastCostUsd: 0.35,
  videoQualityCostUsd: 0.7,
  dailyBudgetUsd: 50,
}

function unitKeyframeCost(story: StoryRecord, config: StoryCostConfig): number {
  return story.referenceUrl
    ? config.keyframeReferenceCostUsd
    : config.keyframeCostUsd
}

function unitVideoCost(story: StoryRecord, config: StoryCostConfig): number {
  return story.preset === 'quality'
    ? config.videoQualityCostUsd
    : config.videoFastCostUsd
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export class NativeStoryCostGuard implements StoryCostGuard {
  private readonly config: StoryCostConfig

  constructor(config: StoryCostConfig = DEFAULT_STORY_COST_CONFIG) {
    this.config = config
  }

  get costs(): StoryCostConfig {
    return this.config
  }

  estimate(story: StoryRecord): number {
    const keyframeUnits = story.scenes.reduce(
      (total, scene) => total + scene.keyframeAttempts,
      0,
    )
    const videoUnits = story.scenes.reduce(
      (total, scene) => total + scene.videoAttempts,
      0,
    )

    return roundUsd(
      this.config.directorCostUsd
      + keyframeUnits * unitKeyframeCost(story, this.config)
      + videoUnits * unitVideoCost(story, this.config),
    )
  }

  estimateNewStory(
    preset: StoryRecord['preset'],
    sceneCount: number,
    hasReference: boolean,
  ): number {
    const keyframeUnit = hasReference
      ? this.config.keyframeReferenceCostUsd
      : this.config.keyframeCostUsd
    const videoUnit = preset === 'quality'
      ? this.config.videoQualityCostUsd
      : this.config.videoFastCostUsd

    return roundUsd(
      this.config.directorCostUsd
      + sceneCount * keyframeUnit
      + sceneCount * videoUnit,
    )
  }

  estimateAfterKeyframeAttempt(story: StoryRecord): number {
    return roundUsd(this.estimate(story) + unitKeyframeCost(story, this.config))
  }

  estimateAfterVideoAttempt(story: StoryRecord): number {
    return roundUsd(this.estimate(story) + unitVideoCost(story, this.config))
  }

  estimateVideosApproval(story: StoryRecord): number {
    const pending = story.scenes.filter((scene) => scene.videoAttempts === 0).length

    return roundUsd(this.estimate(story) + pending * unitVideoCost(story, this.config))
  }

  assertWithinBudget(costUsd: number): void {
    if (costUsd > this.config.maxStoryCostUsd) {
      throw new StoryError('story-budget-exhausted')
    }
  }
}

export function createStoryCostGuard(
  options: StoryCostConfigOptions = {},
): StoryCostGuard {
  return new NativeStoryCostGuard({
    maxStoryCostUsd: options.maxStoryCostUsd ?? DEFAULT_STORY_COST_CONFIG.maxStoryCostUsd,
    directorCostUsd: options.directorCostUsd ?? DEFAULT_STORY_COST_CONFIG.directorCostUsd,
    keyframeCostUsd: options.keyframeCostUsd ?? DEFAULT_STORY_COST_CONFIG.keyframeCostUsd,
    keyframeReferenceCostUsd:
      options.keyframeReferenceCostUsd
      ?? DEFAULT_STORY_COST_CONFIG.keyframeReferenceCostUsd,
    videoFastCostUsd:
      options.videoFastCostUsd ?? DEFAULT_STORY_COST_CONFIG.videoFastCostUsd,
    videoQualityCostUsd:
      options.videoQualityCostUsd ?? DEFAULT_STORY_COST_CONFIG.videoQualityCostUsd,
    dailyBudgetUsd:
      options.dailyBudgetUsd ?? DEFAULT_STORY_COST_CONFIG.dailyBudgetUsd,
  })
}
