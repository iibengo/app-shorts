export type StoryStatus =
  | 'PLANNING'
  | 'GENERATING_KEYFRAMES'
  | 'WAITING_APPROVAL'
  | 'GENERATING_VIDEOS'
  | 'VIDEOS_READY'
  | 'QC'
  | 'WAITING_QC'
  | 'ASSEMBLING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'

export type SceneStatus =
  | 'PENDING'
  | 'KEYFRAME_QUEUED'
  | 'KEYFRAME_RUNNING'
  | 'KEYFRAME_READY'
  | 'KEYFRAME_FAILED'
  | 'VIDEO_QUEUED'
  | 'VIDEO_RUNNING'
  | 'VIDEO_READY'
  | 'VIDEO_FAILED'
  | 'CANCELLED'

export type StoryPreset = 'fast' | 'quality'

export type StoryModelId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

export type StorySceneCount = 4 | 5 | 6

export type StorySceneDurationSeconds = 6

export type StoryAspectRatio = '9:16'

export type StoryImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export type StoryTimeOfDay =
  | 'dawn'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'golden-hour'
  | 'dusk'
  | 'night'

export type StoryWeather =
  | 'clear'
  | 'cloudy'
  | 'overcast'
  | 'light-rain'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'windy'

export type StoryCameraShot =
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'low-angle'
  | 'high-angle'
  | 'tracking'
  | 'over-the-shoulder'
  | 'detail'

export type StorySceneRole =
  | 'establishing'
  | 'development'
  | 'escalation'
  | 'climax'
  | 'resolution'

export type StoryTransition = 'cut'

export interface StoryLocation {
  readonly name: string
  readonly description: string
}

export interface StoryCharacter {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly wardrobe: string
}

export interface StoryProp {
  readonly id: string
  readonly name: string
  readonly description: string
}

export interface StoryBible {
  readonly style: string
  readonly location: StoryLocation
  readonly timeOfDay: StoryTimeOfDay
  readonly weather: StoryWeather
  readonly leadCharacterId: string
  readonly signaturePropId: string | null
  readonly characters: readonly StoryCharacter[]
  readonly props: readonly StoryProp[]
  readonly forbidden: readonly string[]
  readonly continuityRules: readonly string[]
}

export interface StoryBeat {
  readonly order: number
  readonly sceneRole: StorySceneRole
  readonly visualPrompt: string
  readonly narration: string
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly camera: StoryCameraShot
  readonly continuityFromPrevious: string | null
  readonly transition: StoryTransition
}

export interface StoryPlan {
  readonly title: string
  readonly logline: string
  /** `null` solo en planes persistidos antes de 006. */
  readonly storyBible: StoryBible | null
  readonly beats: readonly StoryBeat[]
}

export type StoryQCStatus = 'PASSED' | 'NEEDS_REVIEW' | 'FAILED' | 'UNAVAILABLE'

export type StoryQCEvaluator = 'vision' | 'none'

export type StoryQCErrorCode =
  | 'qc-disabled'
  | 'qc-not-configured'
  | 'qc-budget-skipped'
  | 'qc-frames-failed'
  | 'qc-evaluator-unavailable'
  | 'qc-evaluator-timeout'
  | 'qc-evaluator-invalid-output'

export type StoryQCSeverity = 'blocking' | 'warning'

export type StoryQCFrame = 'start' | 'middle' | 'end' | 'clip'

export type StoryQCIssueCode =
  | 'missing-lead-character'
  | 'missing-character'
  | 'extra-character'
  | 'wrong-wardrobe'
  | 'missing-prop'
  | 'wrong-prop'
  | 'wrong-location'
  | 'wrong-weather'
  | 'wrong-time-of-day'
  | 'continuity-break'
  | 'text-or-watermark'
  | 'visual-artifact'
  | 'frames-unavailable'
  | 'technical-duration'
  | 'technical-streams'
  | 'technical-aspect'
  | 'technical-resolution'

export interface StoryQCIssue {
  readonly code: StoryQCIssueCode
  readonly severity: StoryQCSeverity
  readonly sceneId: string
  readonly order: number
  readonly frame: StoryQCFrame
}

/** Observación normalizada del evaluador. Sin texto libre y solo con ids de la biblia. */
export interface StoryQCObserved {
  readonly characters: readonly string[]
  readonly wardrobeMismatch: readonly string[]
  readonly unknownCharacters: boolean
  readonly props: readonly string[]
  readonly unknownProps: boolean
  readonly locationMatches: boolean
  readonly weatherMatches: boolean
  readonly timeOfDayMatches: boolean
  readonly continuityMatches: boolean
  readonly textOrWatermark: boolean
  readonly artifacts: boolean
}

export interface StoryQCSceneResult {
  readonly sceneId: string
  readonly order: number
  readonly framesUrl: string | null
  readonly technical: 'pass' | 'fail'
  readonly observed: StoryQCObserved | null
  readonly confidence: number | null
  readonly issues: readonly StoryQCIssue[]
}

export interface StoryQCOverride {
  readonly at: string
  readonly approved: true
}

export interface StoryQC {
  readonly status: StoryQCStatus
  readonly errorCode: StoryQCErrorCode | null
  readonly evaluator: StoryQCEvaluator
  readonly checkedAt: string
  readonly confidence: number | null
  readonly scenes: readonly StoryQCSceneResult[]
  readonly issues: readonly StoryQCIssue[]
  readonly override: StoryQCOverride | null
}

export type StoryErrorCode =
  | 'invalid-request'
  | 'premise-required'
  | 'premise-too-long'
  | 'invalid-premise'
  | 'invalid-scene-count'
  | 'invalid-preset'
  | 'invalid-reference'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'
  | 'invalid-visual-prompt'
  | 'invalid-narration'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'cross-origin-request'
  | 'story-not-found'
  | 'story-expired'
  | 'beat-not-found'
  | 'story-not-ready'
  | 'scene-not-ready'
  | 'keyframe-limit-reached'
  | 'video-retry-limit-reached'
  | 'story-not-cancellable'
  | 'story-in-progress'
  | 'idempotency-conflict'
  | 'rate-limited'
  | 'server-busy'
  | 'story-budget-exhausted'
  | 'daily-budget-exhausted'
  | 'assembly-busy'
  | 'director-not-configured'
  | 'director-timeout'
  | 'director-invalid-output'
  | 'director-unavailable'
  | 'reference-expired'
  | 'content-blocked'
  | 'provider-rejected'
  | 'provider-busy'
  | 'provider-error'
  | 'provider-invalid-output'
  | 'provider-timeout'
  | 'keyframe-failed'
  | 'video-failed'
  | 'assembly-failed'
  | 'ffmpeg-not-configured'
  | 'assembly-timeout'
  | 'database-unavailable'
  | 'story-not-configured'
  | 'cancel-failed'
  | 'internal-error'

export interface StoryJobError {
  readonly code: StoryErrorCode
  readonly message: string
  readonly retryable: boolean
}

export interface StoryApiError {
  readonly error: StoryJobError & {
    readonly retryAfterSeconds?: number
  }
}

export interface StoryScene {
  readonly id: string
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
  readonly status: SceneStatus
  readonly keyframeUrl: string | null
  readonly keyframeAttempts: number
  readonly videoUrl: string | null
  readonly videoAttempts: number
  readonly error: StoryJobError | null
}

export interface Story {
  readonly id: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
  readonly preset: StoryPreset
  readonly modelId: StoryModelId
  readonly sceneCount: StorySceneCount
  readonly durationSeconds: StorySceneDurationSeconds
  readonly totalDurationSeconds: number
  readonly aspectRatio: StoryAspectRatio
  readonly plan: StoryPlan | null
  readonly scenes: readonly StoryScene[]
  readonly finalVideoUrl: string | null
  readonly finalVideoExpiresAt: string | null
  readonly approvedAt: string | null
  readonly completedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly expiresAt: string
  readonly version: number
  readonly error: StoryJobError | null
  readonly qc: StoryQC | null
  readonly pollAfterMs: number
}

export interface StoryCreateRequest {
  readonly premise: string
  readonly sceneCount: StorySceneCount
  readonly preset: StoryPreset
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
}

export interface StoryBeatUpdateRequest {
  readonly visualPrompt: string
  readonly narration?: string
  readonly regenerate?: boolean
}

export interface StoryReferenceUploadRequest {
  readonly fileName: string
  readonly contentType: StoryImageMimeType
  readonly sizeBytes: number
}

export interface StoryUploadTicket {
  readonly uploadUrl: string
  readonly fileUrl: string
  readonly expiresAt: string
  readonly uploadHeaders: Readonly<Record<string, string>>
}

export interface StoryReference {
  readonly fileName: string
  readonly contentType: StoryImageMimeType
  readonly sizeBytes: number
  readonly fileUrl: string
  readonly expiresAt: string
}

export interface StoryJob {
  readonly storyId: string
  readonly status: StoryStatus
  readonly version: number
  readonly pollAfterMs: number
}

export type StoryGenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'creating'; readonly premise: string }
  | { readonly status: 'planning'; readonly premise: string }
  | { readonly status: 'keyframes'; readonly story: Story }
  | { readonly status: 'review'; readonly story: Story }
  | { readonly status: 'videos'; readonly story: Story }
  | { readonly status: 'qc'; readonly story: Story }
  | { readonly status: 'waiting-qc'; readonly story: Story }
  | { readonly status: 'assembling'; readonly story: Story }
  | { readonly status: 'ready'; readonly story: Story }
  | {
      readonly status: 'failed'
      readonly story: Story
      readonly error: StoryJobError
    }
  | { readonly status: 'cancelled'; readonly story: Story }
  | { readonly status: 'expired'; readonly storyId: string }
