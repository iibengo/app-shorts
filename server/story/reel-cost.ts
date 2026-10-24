import type { StoryCostConfig } from './cost'
import type { ReelStoryRecord } from './reel-repository'
import { costProfile } from './cost-profiles'
import { StoryError } from './errors'

export interface ReelCostGuard {
  estimate(story: ReelStoryRecord): number
  estimateKeyframeAttempt(story: ReelStoryRecord): number
  estimateVideoAttempt(story: ReelStoryRecord): number
  estimateCharacterRefs(story: ReelStoryRecord): number
  estimateCharacterRefAttempt(story: ReelStoryRecord, characterId: string): number
  estimateQc(story: ReelStoryRecord): number
  estimateVideosApproval(story: ReelStoryRecord): number
  capFor(story: ReelStoryRecord): number
  assertWithinCap(story: ReelStoryRecord, costUsd: number): void
  recordQcEvaluations(storyId: string, count: number): void
  forgetStory(storyId: string): void
}

export interface ReelCostGuardOptions {
  readonly costs: StoryCostConfig
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function keyframeUnit(story: ReelStoryRecord, costs: StoryCostConfig): number {
  return story.referenceUrl
    ? costs.keyframeReferenceCostUsd
    : costs.keyframeCostUsd
}

function videoUnit(story: ReelStoryRecord, costs: StoryCostConfig): number {
  return story.preset === 'quality'
    ? costs.videoQualityShortCostUsd
    : costs.videoFastCostUsd
}

/**
 * A reference is paid when its image was produced or when an attempt was
 * charged. A `pending` entry with zero attempts has not reached the provider.
 */
function characterRefUnits(story: ReelStoryRecord): number {
  // A retried reference was billed once per attempt, so it is counted per
  // attempt. Counting one unit per character would let a story overrun its cap
  // by one image for every retry, silently.
  return Object.values(story.characterRefs ?? {}).reduce((total, ref) => {
    if (ref.source !== 'generated') return total

    // `attempts` is incremented before the provider call, so a `ready` entry
    // always has at least one; a never-sent `pending` has zero and is free.
    return total + ref.attempts
  }, 0)
}

export class NativeReelCostGuard implements ReelCostGuard {
  private readonly costs: StoryCostConfig
  private readonly qcEvaluations = new Map<string, number>()

  constructor(options: ReelCostGuardOptions) {
    this.costs = options.costs
  }

  capFor(story: ReelStoryRecord): number {
    return costProfile(story.costMode, story.targetDurationSeconds)?.capUsd
      ?? this.costs.maxStoryCostUsd
  }

  estimate(story: ReelStoryRecord): number {
    const keyframeUnits = story.shots.reduce(
      (total, shot) => total + shot.keyframeAttempts,
      0,
    )
    const videoUnits = story.shots.reduce(
      (total, shot) => total + shot.videoAttempts,
      0,
    )
    const qcUnits = Math.max(
      this.qcEvaluations.get(story.id) ?? 0,
      story.qc?.shots.filter((shot) => shot.observed !== null).length ?? 0,
    )

    return roundUsd(
      this.costs.narrativeCostUsd
      + this.costs.visualCostUsd
      + this.costs.directorRepairCostUsd
      + keyframeUnits * keyframeUnit(story, this.costs)
      + videoUnits * videoUnit(story, this.costs)
      + qcUnits * this.costs.qcUnitCostUsd
      + this.estimateCharacterRefs(story),
    )
  }

  estimateKeyframeAttempt(story: ReelStoryRecord): number {
    return roundUsd(this.estimate(story) + keyframeUnit(story, this.costs))
  }

  estimateVideoAttempt(story: ReelStoryRecord): number {
    return roundUsd(this.estimate(story) + videoUnit(story, this.costs))
  }

  estimateCharacterRefs(story: ReelStoryRecord): number {
    return roundUsd(characterRefUnits(story) * this.costs.characterRefCostUsd)
  }

  estimateCharacterRefAttempt(story: ReelStoryRecord, characterId: string): number {
    const current = story.characterRefs?.[characterId]

    // A ready reference is never submitted again; the estimate does not grow.
    if (current !== undefined && current.status === 'ready') return this.estimate(story)

    return roundUsd(this.estimate(story) + this.costs.characterRefCostUsd)
  }

  estimateQc(story: ReelStoryRecord): number {
    return roundUsd(
      this.estimate(story) + story.shots.length * this.costs.qcUnitCostUsd,
    )
  }

  estimateVideosApproval(story: ReelStoryRecord): number {
    const pending = story.shots.filter((shot) => shot.videoAttempts === 0).length

    return roundUsd(
      this.estimate(story) + pending * videoUnit(story, this.costs),
    )
  }

  assertWithinCap(story: ReelStoryRecord, costUsd: number): void {
    if (costUsd > this.capFor(story)) {
      throw new StoryError('story-budget-exhausted')
    }
  }

  recordQcEvaluations(storyId: string, count: number): void {
    if (count <= 0) return
    this.qcEvaluations.set(storyId, (this.qcEvaluations.get(storyId) ?? 0) + count)

    if (this.qcEvaluations.size > 5_000) {
      const oldest = this.qcEvaluations.keys().next().value

      if (oldest !== undefined) this.qcEvaluations.delete(oldest)
    }
  }

  forgetStory(storyId: string): void {
    this.qcEvaluations.delete(storyId)
  }
}

export function createReelCostGuard(options: ReelCostGuardOptions): ReelCostGuard {
  return new NativeReelCostGuard(options)
}
