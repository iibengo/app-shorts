import type {
  StoryBible,
  StoryCameraShot,
  StoryMode,
  StoryNarrativeTone,
  StorySceneRole,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryTransition,
  StoryWeather,
} from '~/models/story'
import type { StoryBrief } from './premise-brief'

export interface NarrativeBeat {
  readonly order: number
  readonly sceneRole: StorySceneRole
  readonly locationId: string
  readonly timeOfDay: StoryTimeOfDay
  readonly weather: StoryWeather
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly action: string
  readonly narration: string
  readonly storyFunction: StoryStoryFunction
  readonly gag: string | null
}

export interface NarrativeDraft {
  readonly title: string
  readonly logline: string
  readonly tone: StoryNarrativeTone
  readonly storyBible: StoryBible
  readonly beats: readonly NarrativeBeat[]
}

export interface StoryboardBeat {
  readonly order: number
  readonly visualPrompt: string
  readonly camera: StoryCameraShot
  readonly continuityFromPrevious: string | null
  readonly transition: StoryTransition
}

export interface StoryboardDraft {
  readonly beats: readonly StoryboardBeat[]
}

export type DirectorFinishReason = 'stop' | 'length' | 'content_filter' | 'unknown'

export type DirectorPass = 'narrative' | 'visual'

export interface DirectorLogEvent {
  readonly event: string
  readonly pass: DirectorPass
  readonly attempt: 1 | 2
  readonly finishReason: DirectorFinishReason
  readonly errorCode?: string
  readonly reason?: string
  readonly mode?: StoryMode
  readonly latencyMs?: number
}

export interface DirectorContext {
  readonly brief: StoryBrief
}

export interface StoryNarrativeDirector {
  createNarrative(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly mode: StoryMode
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
    readonly signal?: AbortSignal
  }): Promise<NarrativeDraft>
}

export interface StoryVisualDirector {
  createStoryboard(input: {
    readonly premise: string
    readonly mode: StoryMode
    readonly narrative: NarrativeDraft
    readonly signal?: AbortSignal
  }): Promise<StoryboardDraft>
}

export interface StoryDirector {
  createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly mode: StoryMode
    readonly context?: DirectorContext
  }): Promise<StoryPlan>
}

export type DeepSeekContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image_url'; readonly image_url: { readonly url: string } }

export interface DeepSeekMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string | readonly DeepSeekContentPart[]
}
