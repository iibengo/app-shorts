import type {
  StoryBible,
  StoryCameraShot,
  StoryQCIssueCode,
  StoryQCObserved,
  StoryQC,
  StoryQCErrorCode,
  StorySceneRole,
  StoryTimeOfDay,
  StoryWeather,
} from '~/models/story'

export interface QCSceneExpectation {
  readonly sceneId: string
  readonly order: number
  readonly sceneRole: StorySceneRole
  readonly locationId: string
  readonly locationName: string
  readonly locationDescription: string
  readonly timeOfDay: StoryTimeOfDay
  readonly weather: StoryWeather
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly leadCharacterId: string
  readonly signaturePropId: string | null
  readonly action: string
  readonly visualPrompt: string
  readonly continuityFromPrevious: string | null
  readonly camera: StoryCameraShot
}

export interface QCFrameStrip {
  readonly sceneId: string
  readonly order: number
  readonly filePath: string
  readonly durationSeconds: number
  readonly technical: readonly StoryQCIssueCode[]
  /** Allowlisted CDN URL of the uploaded contact strip, or `null` on failure. */
  readonly framesUrl: string | null
  /** Local dHash of the representative frame, used only by 008 QC. */
  readonly dHash?: string
}

export type QCEvaluation =
  | { readonly kind: 'observed'; readonly observed: StoryQCObserved; readonly confidence: number }
  | { readonly kind: 'unavailable'; readonly errorCode: StoryQCErrorCode }

export interface StoryQCEvaluator {
  evaluate(input: {
    readonly bible: StoryBible
    readonly expectation: QCSceneExpectation
    readonly previous: StoryQCObserved | null
    readonly imageUrl: string
    readonly signal?: AbortSignal
  }): Promise<QCEvaluation>
}

export interface StoryFrameExtractor {
  extract(input: {
    readonly storyId: string
    readonly clips: readonly { readonly sceneId: string; readonly order: number; readonly url: string }[]
    readonly frameCount?: 2 | 3
    readonly hash?: boolean
    /** 008 provider clip duration: 6 s fast, 5 s quality. */
    readonly expectedDurationSeconds?: 5 | 6
    readonly signal?: AbortSignal
  }): Promise<readonly QCFrameStrip[]>
}

export interface StoryQCResult {
  readonly qc: StoryQC
  readonly technicalFailures: readonly { readonly sceneId: string; readonly order: number }[]
}
