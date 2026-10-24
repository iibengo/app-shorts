import type { StoryRecord } from './repository'
import { StoryError } from './errors'

export interface StoryCostConfig {
  readonly maxStoryCostUsd: number
  readonly directorCostUsd: number
  readonly narrativeCostUsd: number
  readonly visualCostUsd: number
  readonly directorRepairCostUsd: number
  readonly keyframeCostUsd: number
  readonly keyframeReferenceCostUsd: number
  readonly videoFastCostUsd: number
  readonly videoQualityCostUsd: number
  /** 008: Kling quality clip is 5 s, not the legacy 10 s unit. */
  readonly videoQualityShortCostUsd: number
  readonly qcUnitCostUsd: number
  /** 012: one Nano Banana image per character. */
  readonly characterRefCostUsd: number
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
  readonly narrativeCostUsd?: number
  readonly visualCostUsd?: number
  readonly directorRepairCostUsd?: number
  readonly keyframeCostUsd?: number
  readonly keyframeReferenceCostUsd?: number
  readonly videoFastCostUsd?: number
  readonly videoQualityCostUsd?: number
  readonly videoQualityShortCostUsd?: number
  readonly qcUnitCostUsd?: number
  readonly characterRefCostUsd?: number
  readonly dailyBudgetUsd?: number
}

export const DEFAULT_STORY_COST_CONFIG: StoryCostConfig = {
  maxStoryCostUsd: 8,
  directorCostUsd: 0.01,
  narrativeCostUsd: 0.01,
  visualCostUsd: 0.012,
  directorRepairCostUsd: 0.01,
  keyframeCostUsd: 0.05,
  keyframeReferenceCostUsd: 0.08,
  videoFastCostUsd: 0.35,
  videoQualityCostUsd: 0.7,
  videoQualityShortCostUsd: 0.35,
  qcUnitCostUsd: 0.02,
  characterRefCostUsd: 0.04,
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

  private directorCost(): number {
    return roundUsd(
      this.config.narrativeCostUsd
      + this.config.visualCostUsd
      + this.config.directorRepairCostUsd,
    )
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
      this.directorCost()
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
      this.directorCost()
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
    narrativeCostUsd: options.narrativeCostUsd ?? DEFAULT_STORY_COST_CONFIG.narrativeCostUsd,
    visualCostUsd: options.visualCostUsd ?? DEFAULT_STORY_COST_CONFIG.visualCostUsd,
    directorRepairCostUsd:
      options.directorRepairCostUsd ?? DEFAULT_STORY_COST_CONFIG.directorRepairCostUsd,
    keyframeCostUsd: options.keyframeCostUsd ?? DEFAULT_STORY_COST_CONFIG.keyframeCostUsd,
    keyframeReferenceCostUsd:
      options.keyframeReferenceCostUsd
      ?? DEFAULT_STORY_COST_CONFIG.keyframeReferenceCostUsd,
    videoFastCostUsd:
      options.videoFastCostUsd ?? DEFAULT_STORY_COST_CONFIG.videoFastCostUsd,
    videoQualityCostUsd:
      options.videoQualityCostUsd ?? DEFAULT_STORY_COST_CONFIG.videoQualityCostUsd,
    videoQualityShortCostUsd:
      options.videoQualityShortCostUsd
      ?? DEFAULT_STORY_COST_CONFIG.videoQualityShortCostUsd,
    qcUnitCostUsd:
      options.qcUnitCostUsd ?? DEFAULT_STORY_COST_CONFIG.qcUnitCostUsd,
    characterRefCostUsd:
      options.characterRefCostUsd ?? DEFAULT_STORY_COST_CONFIG.characterRefCostUsd,
    dailyBudgetUsd:
      options.dailyBudgetUsd ?? DEFAULT_STORY_COST_CONFIG.dailyBudgetUsd,
  })
}
