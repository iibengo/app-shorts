import type { StoryRecord } from './repository'
import { StoryError } from './errors'

export interface StoryCostConfig {
  readonly maxStoryCostUsd: number
  readonly directorCostUsd: number
  readonly keyframeCostUsd: number
  readonly keyframeReferenceCostUsd: number
  readonly videoFastCostUsd: number
  readonly videoQualityCostUsd: number
  readonly qcUnitCostUsd: number
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
  estimateAfterQc(story: StoryRecord): number
  recordQcEvaluations(storyId: string, count: number): void
  forgetStory(storyId: string): void
  assertWithinBudget(costUsd: number): void
}

export interface StoryCostConfigOptions {
  readonly maxStoryCostUsd?: number
  readonly directorCostUsd?: number
  readonly keyframeCostUsd?: number
  readonly keyframeReferenceCostUsd?: number
  readonly videoFastCostUsd?: number
  readonly videoQualityCostUsd?: number
  readonly qcUnitCostUsd?: number
  readonly dailyBudgetUsd?: number
}

export const DEFAULT_STORY_COST_CONFIG: StoryCostConfig = {
  maxStoryCostUsd: 8,
  directorCostUsd: 0.01,
  keyframeCostUsd: 0.05,
  keyframeReferenceCostUsd: 0.08,
  videoFastCostUsd: 0.35,
  videoQualityCostUsd: 0.7,
  qcUnitCostUsd: 0.02,
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
  private readonly qcEvaluations = new Map<string, number>()

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
    const qcUnits = Math.max(
      this.qcEvaluations.get(story.id) ?? 0,
      story.qc?.scenes.filter((scene) => scene.observed !== null).length ?? 0,
    )

    return roundUsd(
      this.config.directorCostUsd
      + keyframeUnits * unitKeyframeCost(story, this.config)
      + videoUnits * unitVideoCost(story, this.config)
      + qcUnits * this.config.qcUnitCostUsd,
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

  estimateAfterQc(story: StoryRecord): number {
    return roundUsd(
      this.estimate(story) + story.scenes.length * this.config.qcUnitCostUsd,
    )
  }

  recordQcEvaluations(storyId: string, count: number): void {
    if (count <= 0) return

    const next = (this.qcEvaluations.get(storyId) ?? 0) + count
    this.qcEvaluations.set(storyId, next)

    if (this.qcEvaluations.size > 5_000) {
      const oldest = this.qcEvaluations.keys().next().value

      if (oldest !== undefined) {
        this.qcEvaluations.delete(oldest)
      }
    }
  }

  forgetStory(storyId: string): void {
    this.qcEvaluations.delete(storyId)
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
    qcUnitCostUsd:
      options.qcUnitCostUsd ?? DEFAULT_STORY_COST_CONFIG.qcUnitCostUsd,
    dailyBudgetUsd:
      options.dailyBudgetUsd ?? DEFAULT_STORY_COST_CONFIG.dailyBudgetUsd,
  })
}
