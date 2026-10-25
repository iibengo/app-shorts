import { StoryError } from './errors'

/**
 * 014: a segment of speech to be synthesised, before something is paid.
 *
 * The scene owns its line; the plan owns its time. Both are decided before the
 * first provider call, so a line that cannot fit is rejected without spending.
 */
export interface SpeechPlanItem {
  readonly sceneOrder: number
  readonly text: string
  /** Time the scene really has, in seconds. */
  readonly availableSeconds: number
  /** Estimated speech time, to reject impossible lines before paying. */
  readonly estimatedSeconds: number
}

export interface SpeechPlan {
  readonly items: readonly SpeechPlanItem[]
  readonly totalEstimatedSeconds: number
  readonly totalCharacters: number
}

/**
 * True when a planned line is longer than the time it has.
 *
 * The tolerance is generous on purpose: the estimate is declared, not measured,
 * and a false positive would reject a story that would have fitted. The real
 * measurement after synthesis is what fails a line, and by then the fix is a
 * re-write, never a speed-up.
 */
export const SPEECH_ESTIMATE_TOLERANCE = 1.35

export function planIsImpossible(plan: SpeechPlan, tolerance = SPEECH_ESTIMATE_TOLERANCE): number[] {
  return plan.items
    .filter((item) => item.estimatedSeconds > item.availableSeconds * tolerance)
    .map((item) => item.sceneOrder)
}

export function assertPlanFits(plan: SpeechPlan): void {
  if (planIsImpossible(plan).length > 0) throw new StoryError('audio-too-long')
}
