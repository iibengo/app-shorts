import type { StoryMode, StoryPlan } from '~/models/story'
import type {
  DirectorContext,
  ReelPlan,
  ReelPlanDirector,
  StoryNarrativeDirector,
  StoryShotDirector,
} from './director-types'
import { StoryError } from './errors'
import { validateShotList } from './shot-plan-validator'

export const REEL_DIRECTOR_TOTAL_TIMEOUT_MS = 300_000

export interface ReelStoryDirectorOptions {
  readonly narrative: StoryNarrativeDirector
  readonly shots: StoryShotDirector
  readonly totalTimeoutMs?: number
}

/**
 * 008 production director: narrative scenes first, then shot grammar.
 *
 * The shot pass can never run when the narrative pass fails, and the composed
 * plan is validated again before it reaches persistence.
 */
export class NativeReelStoryDirector implements ReelPlanDirector {
  private readonly narrative: StoryNarrativeDirector
  private readonly shots: StoryShotDirector
  private readonly totalTimeoutMs: number

  constructor(options: ReelStoryDirectorOptions) {
    this.narrative = options.narrative
    this.shots = options.shots
    this.totalTimeoutMs = options.totalTimeoutMs ?? REEL_DIRECTOR_TOTAL_TIMEOUT_MS
  }

  async createPlan(input: {
    readonly premise: string
    readonly mode: StoryMode
    readonly preset?: Parameters<ReelPlanDirector['createPlan']>[0]['preset']
    readonly durationPlan: Parameters<ReelPlanDirector['createPlan']>[0]['durationPlan']
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
    readonly signal?: AbortSignal
  }): Promise<ReelPlan> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.totalTimeoutMs)
    const onAbort = (): void => controller.abort()
    input.signal?.addEventListener('abort', onAbort, { once: true })

    if (input.signal?.aborted) onAbort()

    try {
      const narrative = await this.narrative.createNarrative({
        premise: input.premise,
        mode: input.mode,
        durationPlan: input.durationPlan,
        referenceUrl: input.referenceUrl,
        ...(input.context === undefined ? {} : { context: input.context }),
        signal: controller.signal,
      })
      const shotList = await this.shots.createShotList({
        premise: input.premise,
        mode: input.mode,
        ...(input.preset === undefined ? {} : { preset: input.preset }),
        narrative,
        durationPlan: input.durationPlan,
        signal: controller.signal,
      })
      const validation = validateShotList(shotList, {
        durationPlan: input.durationPlan,
        narrative,
        preset: input.preset ?? 'fast',
      })

      if (!validation.ok) {
        throw new StoryError('director-invalid-output')
      }

      const plan: StoryPlan = {
        title: narrative.title,
        logline: narrative.logline,
        tone: narrative.tone,
        storyBible: narrative.storyBible,
        scenes: narrative.scenes,
      }

      return { plan, shotPlan: validation.plan }
    } catch (error) {
      if (timedOut) {
        throw new StoryError('director-timeout')
      }

      if (error instanceof StoryError) throw error

      throw new StoryError('director-invalid-output')
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', onAbort)
    }
  }
}

export function createReelStoryDirector(
  options: ReelStoryDirectorOptions,
): ReelPlanDirector {
  return new NativeReelStoryDirector(options)
}
