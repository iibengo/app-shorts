import type {
  StoryBible,
  StoryCameraShot,
  StoryCostMode,
  StoryDurationSeconds,
  StoryMode,
  StoryNarrativeScene,
  StoryNarrativeTone,
  StoryPlatform,
  StoryPreset,
  StoryShotDurationSeconds,
  StoryShotFraming,
  StoryPlan,
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

export interface CanonDraft {
  readonly title: string
  readonly logline: string
  readonly tone: StoryNarrativeTone
  readonly storyBible: StoryBible
}

export interface NarrativeSceneDraft extends StoryNarrativeScene {}

export interface NarrativeDraft extends CanonDraft {
  readonly scenes: readonly NarrativeSceneDraft[]
}

export interface DurationPlan {
  readonly costMode: StoryCostMode
  readonly platform: StoryPlatform
  readonly targetDurationSeconds: StoryDurationSeconds
  readonly maxDurationSeconds: StoryDurationSeconds
  readonly rhythm: 'tiktok' | 'slow'
  readonly sceneCount: { readonly min: number; readonly max: number }
  readonly shotCount: { readonly min: number; readonly max: number }
  readonly shotsPerSceneMax: 4
  readonly exactShotCount: number | null
  readonly capUsd: number
  readonly maxVideoAttempts: 2
  readonly attemptsReset: boolean
  readonly qualityAllowed: boolean
  readonly slowThresholdMs: number
}

export interface ShotDraft {
  readonly indexInScene: number
  readonly durationSeconds: StoryShotDurationSeconds
  readonly camera: StoryCameraShot
  readonly framing: StoryShotFraming
  readonly subject: string
  readonly action: string
  readonly visualPrompt: string
  readonly transition: StoryTransition
  readonly locationId: string
}

export interface ShotListDraft {
  readonly scenes: readonly {
    readonly order: number
    readonly shots: readonly ShotDraft[]
  }[]
}

export interface AssembledShot extends ShotDraft {
  readonly sceneId: string
  readonly sceneOrder: number
  readonly order: number
}

export interface ShotPlanScene {
  readonly order: number
  readonly shots: readonly AssembledShot[]
}

export interface ShotPlan {
  readonly scenes: readonly ShotPlanScene[]
  readonly plannedDurationSeconds: number
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
  readonly stage?: 'canon' | 'beats' | 'scenes' | 'shots'
  readonly attempt: 1 | 2
  readonly finishReason: DirectorFinishReason
  readonly errorCode?: string
  readonly reason?: string
  readonly mode?: StoryMode
  readonly latencyMs?: number
  readonly completionTokens?: number
  readonly reasoningTokens?: number
}

export interface DirectorContext {
  readonly brief: StoryBrief
}

export interface StoryNarrativeDirector {
  createNarrative(input: {
    readonly premise: string
    readonly mode: StoryMode
    readonly durationPlan: DurationPlan
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
    readonly signal?: AbortSignal
  }): Promise<NarrativeDraft>
}

export interface ReelPlan {
  readonly plan: StoryPlan
  readonly shotPlan: ShotPlan
}

export interface ReelPlanDirector {
  createPlan(input: {
    readonly premise: string
    readonly mode: StoryMode
    readonly preset?: StoryPreset
    readonly durationPlan: DurationPlan
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
    readonly signal?: AbortSignal
  }): Promise<ReelPlan>
}

export interface StoryShotDirector {
  createShotList(input: {
    readonly premise: string
    readonly mode: StoryMode
    readonly preset?: StoryPreset
    readonly narrative: NarrativeDraft
    readonly durationPlan: DurationPlan
    readonly signal?: AbortSignal
  }): Promise<ShotListDraft>
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
