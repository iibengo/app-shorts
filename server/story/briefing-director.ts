/**
 * Story director decorator that injects a deterministic production brief.
 *
 * Server-only. It adds no HTTP calls, no cache and no per-story state: it
 * analyses the premise, hands a structured context to the native director and
 * returns the plan untouched.
 */
import type {
  DirectorContext,
  DirectorPlan,
  StoryDirector,
} from './director-types'
import { isStoryError } from './errors'
import { analyzePremise } from './premise-brief'

export interface BriefingDirectorLogEvent {
  readonly event: 'story.plan.ok' | 'story.plan.failed'
  readonly briefApplied: boolean
  readonly errorCode?: string
}

export interface BriefingDirectorOptions {
  readonly onEvent?: (event: BriefingDirectorLogEvent) => void
}

function errorCodeOf(error: unknown): string {
  return isStoryError(error) ? error.code : 'internal-error'
}

export function createBriefingDirector(
  inner: StoryDirector,
  options?: BriefingDirectorOptions,
): StoryDirector {
  const onEvent = options?.onEvent

  return {
    async createPlan(input): Promise<DirectorPlan> {
      const analysis = analyzePremise(input.premise)
      const briefApplied = analysis.brief.applied
      const context: DirectorContext | null = briefApplied
        ? { brief: analysis.brief }
        : null

      let plan: DirectorPlan

      try {
        plan = await inner.createPlan({
          premise: input.premise,
          sceneCount: input.sceneCount,
          referenceUrl: input.referenceUrl,
          ...(context === null ? {} : { context }),
        })
      } catch (error) {
        onEvent?.({
          event: 'story.plan.failed',
          briefApplied,
          errorCode: errorCodeOf(error),
        })

        throw error
      }

      onEvent?.({ event: 'story.plan.ok', briefApplied })

      return plan
    },
  }
}
