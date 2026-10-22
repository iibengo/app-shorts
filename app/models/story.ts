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

export type StoryMode = 'faithful' | 'creative'

export type StoryPlatform = 'tiktok' | 'reels'

/** Modo de producción. No confundir con StoryMode. */
export type StoryCostMode = 'budget' | 'standard' | 'production'

export type StoryDurationSeconds = 15 | 30 | 45 | 60 | 90

export type StoryShotDurationSeconds = 2 | 3 | 4 | 5 | 6

export type StoryShotFraming =
  | 'establishing'
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close-up'
  | 'detail'
  | 'reaction'
  | 'over-the-shoulder'
  | 'two-shot'
  | 'insert'

export type StoryShotStatus = SceneStatus

export type StoryNarrativeTone =
  | 'humor'
  | 'aventura'
  | 'absurdo'
  | 'heartwarming'
  | 'dramatic'

/** `neutral` solo aparece al normalizar planes anteriores a 007. */
export type StoryTone = StoryNarrativeTone | 'neutral'

export type StoryEntitySource = 'premise' | 'invented'

export type StoryStoryFunction =
  | 'hook'
  | 'complication'
  | 'escalation'
  | 'twist'
  | 'payoff'

export type StoryModelId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

export type StorySceneCount = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** Compatibilidad con la normalización legacy de 007. */
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
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source: StoryEntitySource
}

export interface StoryCharacter {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly wardrobe: string
  readonly source: StoryEntitySource
}

export interface StoryProp {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source: StoryEntitySource
}

export interface StoryBible {
  readonly style: string
  readonly tone: StoryTone
  readonly theme: string
  readonly leadCharacterId: string
  /** No nulo en creación; `null` solo en planes legacy. */
  readonly signaturePropId: string | null
  readonly characters: readonly StoryCharacter[]
  readonly locations: readonly StoryLocation[]
  readonly props: readonly StoryProp[]
  readonly forbidden: readonly string[]
  readonly continuityRules: readonly string[]
}

/** Narrativa. Sin puesta en escena. */
export interface StoryNarrativeScene {
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
  readonly continuityFromPrevious: string | null
  /** Presupuesto narrativo orientativo; los planos son la autoridad de duración. */
  readonly durationHintSeconds?: number
}

export interface StoryPlan {
  readonly title: string
  readonly logline: string
  readonly tone: StoryTone
  /** `null` solo en planes legacy sin normalizar. */
  readonly storyBible: StoryBible | null
  readonly scenes: readonly StoryNarrativeScene[]
}

/** Unidad de generación. Una fila de `Shot`. */
export interface StoryShot {
  readonly id: string
  readonly sceneId: string
  readonly sceneOrder: number
  readonly order: number
  readonly indexInScene: number
  readonly durationSeconds: StoryShotDurationSeconds
  readonly camera: StoryCameraShot
  readonly framing: StoryShotFraming
  readonly subject: string
  readonly action: string
  readonly visualPrompt: string
  readonly transition: StoryTransition
  readonly locationId: string
  readonly status: StoryShotStatus
  readonly keyframeUrl: string | null
  readonly keyframeAttempts: number
  readonly videoUrl: string | null
  readonly videoAttempts: number
  readonly error: StoryJobError | null
}

/** Escena del DTO: narrativa (planJson) + agregado (Scene) + planos (Shot). */
export interface StoryScene {
  readonly id: string
  readonly order: number
  readonly narration: string
  readonly sceneRole: StorySceneRole
  readonly locationId: string
  readonly timeOfDay: StoryTimeOfDay
  readonly weather: StoryWeather
  readonly characters: readonly string[]
  readonly props: readonly string[]
  readonly storyFunction: StoryStoryFunction
  readonly gag: string | null
  readonly status: SceneStatus
  readonly plannedDurationSeconds: number
  readonly shots: readonly StoryShot[]
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
  | 'similar-shots'
  | 'technical-duration'
  | 'technical-streams'
  | 'technical-aspect'
  | 'technical-resolution'

export interface StoryQCIssue {
  readonly code: StoryQCIssueCode
  readonly severity: StoryQCSeverity
  readonly sceneId: string
  readonly order: number
  readonly shotId: string
  readonly shotOrder: number
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

export interface StoryQCShotResult {
  readonly shotId: string
  readonly sceneId: string
  readonly sceneOrder: number
  readonly shotOrder: number
  readonly indexInScene: number
  readonly framesUrl: string | null
  readonly technical: 'pass' | 'fail'
  readonly observed: StoryQCObserved | null
  readonly confidence: number | null
  readonly issues: readonly StoryQCIssue[]
}

export interface StoryQCVarietyPair {
  readonly previousShotId: string
  readonly shotId: string
  readonly distance: number
  readonly similar: boolean
}

export interface StoryQCVariety {
  readonly checkedAt: string
  readonly pairs: readonly StoryQCVarietyPair[]
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
  readonly shots: readonly StoryQCShotResult[]
  readonly issues: readonly StoryQCIssue[]
  readonly variety: StoryQCVariety | null
  readonly override: StoryQCOverride | null
}

export type StoryErrorCode =
  | 'invalid-request'
  | 'premise-required'
  | 'premise-too-long'
  | 'invalid-premise'
  | 'invalid-scene-count'
  | 'invalid-preset'
  | 'invalid-mode'
  | 'invalid-platform'
  | 'invalid-duration'
  | 'invalid-cost-mode'
  | 'invalid-shot-duration'
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
  | 'shot-not-found'
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

export interface Story {
  readonly id: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
  readonly preset: StoryPreset
  readonly mode: StoryMode
  readonly platform: StoryPlatform
  readonly costMode: StoryCostMode
  readonly modelId: StoryModelId
  readonly targetDurationSeconds: StoryDurationSeconds
  readonly maxDurationSeconds: StoryDurationSeconds
  readonly plannedDurationSeconds: number
  readonly shotCount: number
  readonly finalDurationSeconds: number | null
  /** Derived from `plan.scenes.length`. */
  readonly sceneCount: StorySceneCount
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
  readonly platform: StoryPlatform
  readonly costMode: StoryCostMode
  readonly targetDurationSeconds: StoryDurationSeconds
  readonly maxDurationSeconds: StoryDurationSeconds
  readonly preset: StoryPreset
  /** Obligatorio desde 007. */
  readonly mode: StoryMode
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
}

export interface StoryShotUpdateRequest {
  readonly visualPrompt?: string
  readonly durationSeconds?: StoryShotDurationSeconds
  readonly regenerate?: boolean
}

/** Compatibilidad: la ruta por escena ya no edita un prompt único. */
export interface StoryBeatUpdateRequest {
  readonly visualPrompt?: string
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
