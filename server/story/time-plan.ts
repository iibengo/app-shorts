import type { EngineCapacity } from './engine-capabilities'
import { planShotDurations } from './engine-capabilities'
import { StoryError } from './errors'
import { wordsForSeconds } from './speech-rate'

/**
 * 014: the time plan, decided before anything is paid.
 *
 * The engine decides which durations exist; the script then fits inside them.
 * The old order — total seconds divided by twelve shots — is what produced
 * 6-second clips trimmed to 2 (F9) and pairs of identical shots (F7).
 *
 * Pure: no I/O, no environment.
 */
export interface SceneTimeBudget {
  readonly sceneOrder: number
  /** Clip durations the engine will be asked for, in order. */
  readonly clipSeconds: readonly number[]
  /** Time the scene really has, already summed. */
  readonly availableSeconds: number
  /** Words the narrator may say in this scene. */
  readonly wordBudget: number
}

export interface StoryTimePlan {
  readonly engineId: string
  readonly targetSeconds: number
  /** Every clip the engine will be asked for, so paid equals planned. */
  readonly clipSeconds: readonly number[]
  readonly paidSeconds: number
  readonly plannedSeconds: number
  /** planned / paid, published so a degrading ratio cannot hide. */
  readonly usedRatio: number
  /** True when the last shot is trimmed to land exactly on the target. */
  readonly trimsLastShot: boolean
  readonly scenes: readonly SceneTimeBudget[]
}

export interface TimePlanInput {
  readonly capacity: EngineCapacity
  readonly targetSeconds: number
  readonly sceneCount: number
  /**
   * Hard ceiling for paid seconds. `null` means no ceiling beyond the target's
   * own rounding, which is how the plan already behaves.
   */
  readonly maxPaidSeconds?: number | null
}

/** Below this ratio the plan is wasting money and is rejected instead of published. */
export const MIN_USED_RATIO = 0.9

/**
 * Splits the target into scenes that each own whole clips.
 *
 * When the engine cannot land exactly on the target, the plan buys the next
 * reachable length and trims only the last shot of the story: paying for 16 s
 * to deliver 15 is honest, paying for 72 s to deliver 24 is not.
 */
export function planStoryTime(input: TimePlanInput): StoryTimePlan {
  const { capacity, targetSeconds, sceneCount } = input

  if (sceneCount <= 0) throw new StoryError('invalid-request')

  const allowed = [...capacity.durationsSeconds].filter((value) => value > 0)

  if (allowed.length === 0) throw new StoryError('audio-not-configured')

  const smallest = Math.min(...allowed)
  const largest = Math.max(...allowed)
  // Enough headroom for one clip per scene, never fewer.
  const maxShots = Math.max(sceneCount, Math.ceil(targetSeconds / smallest))

  let exact = planShotDurations(capacity, targetSeconds, maxShots)
  let planned = targetSeconds
  let trimsLastShot = false

  if (exact === null) {
    // Round up to the next reachable length and trim the last shot to land.
    let candidate = targetSeconds + 1
    const ceiling = input.maxPaidSeconds ?? targetSeconds + largest

    while (candidate <= ceiling) {
      const found = planShotDurations(capacity, candidate, maxShots)

      if (found !== null) {
        exact = found
        planned = candidate
        trimsLastShot = true
        break
      }

      candidate += 1
    }
  }

  if (exact === null) throw new StoryError('audio-too-long')

  const clips = [...exact].sort((a, b) => b - a)
  const paidSeconds = clips.reduce((total, value) => total + value, 0)
  const usedRatio = paidSeconds === 0 ? 0 : planned / paidSeconds

  if (usedRatio < MIN_USED_RATIO) throw new StoryError('audio-too-long')

  // A plan with fewer clips than scenes leaves a scene with nothing to shoot.
  // That is a profile that does not fit the engine, not a line that is too long.
  if (clips.length < sceneCount) throw new StoryError('invalid-request')

  const scenes: SceneTimeBudget[] = []
  // Clips are dealt round-robin so every scene gets at least one, and the
  // remainder lands on the first scenes instead of piling onto the last.
  const buckets: number[][] = Array.from({ length: sceneCount }, () => [])

  for (let index = 0; index < clips.length; index += 1) {
    const target = index < sceneCount ? index : index % sceneCount

    buckets[target]!.push(clips[index]!)
  }

  for (let index = 0; index < sceneCount; index += 1) {
    const slice = buckets[index]!

    if (slice.length === 0) throw new StoryError('invalid-request')

    const availableSeconds = slice.reduce((total, value) => total + value, 0)

    scenes.push({
      sceneOrder: index + 1,
      clipSeconds: slice,
      availableSeconds,
      wordBudget: wordsForSeconds(availableSeconds),
    })
  }

  return {
    engineId: capacity.id,
    targetSeconds,
    clipSeconds: clips,
    paidSeconds,
    plannedSeconds: planned,
    usedRatio,
    trimsLastShot,
    scenes,
  }
}

/**
 * Words per scene, in one line, for the script prompt.
 *
 * The director is told how much it may say per scene; a scene that asks for
 * more words than these is rejected before any provider is called.
 */
export function wordBudgetsFor(plan: StoryTimePlan): readonly number[] {
  return plan.scenes.map((scene) => scene.wordBudget)
}
