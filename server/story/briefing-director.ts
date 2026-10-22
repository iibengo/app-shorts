import type {
  NarrativeDraft,
  StoryNarrativeDirector,
} from './director-types'
import { analyzePremise } from './premise-brief'

export interface BriefingNarrativeLogEvent {
  readonly event: 'story.narrative.ok' | 'story.narrative.failed'
  readonly briefApplied: boolean
  readonly errorCode?: string
}

export interface BriefingNarrativeDirectorOptions {
  readonly onEvent?: (event: BriefingNarrativeLogEvent) => void
}

function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { readonly code?: unknown }).code

    return typeof code === 'string' ? code : 'internal-error'
  }

  return 'internal-error'
}

export function createBriefingNarrativeDirector(
  inner: StoryNarrativeDirector,
  options?: BriefingNarrativeDirectorOptions,
): StoryNarrativeDirector {
  const onEvent = options?.onEvent

  return {
    async createNarrative(input): Promise<NarrativeDraft> {
      const analysis = analyzePremise(input.premise)
      const briefApplied = analysis.brief.applied

      try {
        const draft = await inner.createNarrative({
          ...input,
          ...(briefApplied ? { context: { brief: analysis.brief } } : {}),
        })

        onEvent?.({ event: 'story.narrative.ok', briefApplied })

        return draft
      } catch (error) {
        onEvent?.({
          event: 'story.narrative.failed',
          briefApplied,
          errorCode: errorCodeOf(error),
        })

        throw error
      }
    },
  }
}

/** Compatibility alias for older call sites. */
export const createBriefingDirector = createBriefingNarrativeDirector
