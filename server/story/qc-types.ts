import type {
  StoryBible,
  StoryCameraShot,
  StoryQCIssueCode,
  StoryQCObserved,
  StoryQC,
  StoryQCErrorCode,
  StorySceneRole,
} from '~/models/story'

export interface QCSceneExpectation {
  readonly sceneId: string
  readonly order: number
  readonly leadCharacterId: string
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly signaturePropId: string | null
  readonly visualPrompt: string
  readonly continuityFromPrevious: string | null
  readonly sceneRole: StorySceneRole
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
    readonly signal?: AbortSignal
  }): Promise<readonly QCFrameStrip[]>
}

export interface StoryQCResult {
  readonly qc: StoryQC
  readonly technicalFailures: readonly { readonly sceneId: string; readonly order: number }[]
}
