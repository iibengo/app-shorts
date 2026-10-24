/**
 * What each video engine can actually do.
 *
 * The pipeline used to pick durations with a ternary and hope, and it worked by
 * accident with two engines. With a third it breaks: one engine only accepts
 * 6 or 10 seconds, the other 5 or 10, and the field for a last frame is called
 * differently in each. Everything an engine constrains lives here, cited from
 * its official schema, so the rest of the code asks instead of guessing.
 *
 * Pure: no I/O, no environment.
 */
export type StoryVideoEngineId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

/** Inputs an engine understands. Only the ones we might send. */
export type EngineInput = 'image' | 'last-image' | 'negative-prompt' | 'prompt-optimizer'

export interface EngineCapacity {
  readonly id: StoryVideoEngineId
  /** Durations the provider accepts, verbatim from its schema. */
  readonly durationsSeconds: readonly number[]
  readonly defaultDurationSeconds: number
  /** Resolutions the schema exposes. Empty when the engine exposes none. */
  readonly resolutions: readonly string[]
  /** True when the output aspect follows the input image instead of a parameter. */
  readonly inheritsAspectFromInput: boolean
  readonly inputs: readonly EngineInput[]
  /** How the last frame is called, when the engine has one. */
  readonly lastImageField: 'end_image_url' | 'tail_image_url' | null
  /** True when the engine rewrites our prompt unless told not to. */
  readonly promptOptimizerByDefault: boolean
  /** Billed seconds per delivered clip, and the unit price. */
  readonly costPerSecondUsd: number
  /** Tolerance accepted between requested and delivered duration. */
  readonly durationToleranceSeconds: number
  /** Date the schema was read, so a change can be dated. */
  readonly verifiedAt: string
}

/**
 * Schemas and prices read on 2026-10-24 from the provider's published pages.
 * Both inherit the aspect ratio from the input image, which is why a landscape
 * keyframe produced a landscape clip.
 *
 * Prices are what the provider charges, not estimates:
 * - Hailuo 02 Standard at 768P: 0.045 USD per generated second (0.27 per 6 s).
 * - Kling 2.5 Turbo Pro: 0.35 USD for the first 5 s, 0.07 for each extra second.
 *   At 5 s that is 0.070/s; at 10 s it is 0.042/s, so the longer clip is cheaper
 *   per second on this engine and the sheet records the 5 s figure.
 */
export const ENGINE_CAPACITIES: Readonly<Record<StoryVideoEngineId, EngineCapacity>> = {
  'minimax-hailuo-02': {
    id: 'minimax-hailuo-02',
    durationsSeconds: [6, 10],
    defaultDurationSeconds: 6,
    resolutions: ['512P', '768P'],
    inheritsAspectFromInput: true,
    inputs: ['image', 'last-image', 'prompt-optimizer'],
    lastImageField: 'end_image_url',
    promptOptimizerByDefault: true,
    costPerSecondUsd: 0.045,
    durationToleranceSeconds: 0.18,
    verifiedAt: '2026-10-24',
  },
  'kling-2.5-turbo-pro': {
    id: 'kling-2.5-turbo-pro',
    durationsSeconds: [5, 10],
    defaultDurationSeconds: 5,
    resolutions: [],
    inheritsAspectFromInput: true,
    inputs: ['image', 'last-image', 'negative-prompt'],
    lastImageField: 'tail_image_url',
    promptOptimizerByDefault: false,
    costPerSecondUsd: 0.07,
    durationToleranceSeconds: 0.18,
    verifiedAt: '2026-10-24',
  },
}

export function engineCapacity(id: StoryVideoEngineId): EngineCapacity {
  const capacity = ENGINE_CAPACITIES[id]

  // A silent fallback would bill a story against the wrong limits. Better to
  // stop before spending.
  if (capacity === undefined) throw new Error(`engine-unknown: ${String(id)}`)

  return capacity
}

/**
 * The duration the engine will actually accept for a wanted length.
 *
 * It never invents a value: it returns one of the engine's own. Nearest wins;
 * on a tie the shorter one wins, because paying for time nobody watches is a
 * worse mistake than a shorter shot.
 */
export function durationFor(
  capacity: EngineCapacity,
  wantedSeconds: number,
): number {
  const sorted = [...capacity.durationsSeconds].sort((a, b) => a - b)

  if (sorted.length === 0) return capacity.defaultDurationSeconds

  let best = sorted[0]!

  for (const candidate of sorted) {
    const current = Math.abs(candidate - wantedSeconds)
    const previous = Math.abs(best - wantedSeconds)

    if (current < previous || (current === previous && candidate < best)) best = candidate
  }

  return best
}

/**
 * Splits a target length into shots the engine can actually produce.
 *
 * With a 6-second minimum, 15 seconds is two shots of 6 plus one of 3: three
 * shots, not four. The caller gets durations it can send as they are, so the
 * assembly never trims a delivered clip.
 */
export function planShotDurations(
  capacity: EngineCapacity,
  targetSeconds: number,
  maxShots: number,
): readonly number[] | null {
  const allowed = [...capacity.durationsSeconds]
    .filter((value) => value > 0)
    .sort((a, b) => a - b)

  if (allowed.length === 0 || targetSeconds <= 0 || maxShots <= 0) return null

  const smallest = allowed[0]!
  const largest = allowed[allowed.length - 1]!

  if (largest * maxShots < targetSeconds) return null
  if (smallest > targetSeconds && targetSeconds < smallest / 2) return null

  // A greedy pass overshoots: 12 with 6 and 10 picks 10 and leaves 2, which no
  // duration covers. This walks the whole search space instead, keeping the
  // combination with the fewest, longest shots that lands exactly on target.
  let best: readonly number[] | null = null

  const walk = (remaining: number, chosen: number[]): void => {
    if (remaining === 0) {
      if (best === null || betterShots(chosen, best)) best = [...chosen]

      return
    }

    if (chosen.length >= maxShots) return
    if (best !== null && chosen.length >= best.length) return

    for (const value of allowed) {
      if (value > remaining) continue

      chosen.push(value)
      walk(remaining - value, chosen)
      chosen.pop()
    }
  }

  walk(targetSeconds, [])

  return best
}

/** Fewer shots first; on a tie, longer shots. Deterministic by construction. */
function betterShots(candidate: readonly number[], current: readonly number[]): boolean {
  if (candidate.length !== current.length) return candidate.length < current.length

  const candidateLargest = Math.max(...candidate)
  const currentLargest = Math.max(...current)

  if (candidateLargest !== currentLargest) return candidateLargest > currentLargest

  return candidate.join(',') < current.join(',')
}

/** Billed seconds for a shot, so the estimate matches what will be charged. */
export function billedSecondsFor(capacity: EngineCapacity, shotSeconds: number): number {
  return durationFor(capacity, shotSeconds)
}
