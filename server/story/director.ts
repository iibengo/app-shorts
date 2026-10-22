import type { StoryMode, StoryPlan } from '~/models/story'
import type {
  DirectorContext,
  StoryDirector,
  StoryNarrativeDirector,
  StoryVisualDirector,
} from './director-types'
import { StoryError } from './errors'
import { validateStoryPlan } from './plan-validator'
import { assembleStoryPlan } from './storyboard-validator'

export const DIRECTOR_TOTAL_TIMEOUT_MS = 180_000

export {
  DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
} from './deepseek-client'
export {
  BEATS_MAX_TOKENS,
  BEATS_REPAIR_MAX_TOKENS,
  BEATS_TIMEOUT_MS,
  CANON_MAX_TOKENS,
  CANON_REPAIR_MAX_TOKENS,
  CANON_TIMEOUT_MS,
} from './narrative-director'
export {
  VISUAL_MAX_TOKENS,
  VISUAL_MAX_TOKENS_LIMIT,
  VISUAL_TIMEOUT_MS,
  visualMaxTokens,
  visualRepairMaxTokens,
} from './visual-director'

export interface StoryDirectorOptions {
  readonly narrative: StoryNarrativeDirector
  readonly visual: StoryVisualDirector
  readonly totalTimeoutMs?: number
}

export class NativeStoryDirector implements StoryDirector {
  private readonly narrative: StoryNarrativeDirector
  private readonly visual: StoryVisualDirector
  private readonly totalTimeoutMs: number

  constructor(options: StoryDirectorOptions) {
    this.narrative = options.narrative
    this.visual = options.visual
    this.totalTimeoutMs = options.totalTimeoutMs ?? DIRECTOR_TOTAL_TIMEOUT_MS
  }

  async createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly mode: StoryMode
    readonly context?: DirectorContext
  }): Promise<StoryPlan> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, this.totalTimeoutMs)

    try {
      const narrative = await this.narrative.createNarrative({
        premise: input.premise,
        sceneCount: input.sceneCount,
        mode: input.mode,
        referenceUrl: input.referenceUrl,
        ...(input.context === undefined ? {} : { context: input.context }),
        signal: controller.signal,
      })
      const storyboard = await this.visual.createStoryboard({
        premise: input.premise,
        mode: input.mode,
        narrative,
        signal: controller.signal,
      })
      const plan = assembleStoryPlan(narrative, storyboard)
      const validation = validateStoryPlan(plan, {
        sceneCount: input.sceneCount,
        mode: input.mode,
      })

      if (!validation.ok) {
        throw new StoryError('director-invalid-output')
      }

      return validation.plan
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createStoryDirector(options: StoryDirectorOptions): StoryDirector {
  return new NativeStoryDirector(options)
}
