export type StoryStatus =
  | 'PLANNING'
  | 'GENERATING_KEYFRAMES'
  | 'WAITING_APPROVAL'
  | 'GENERATING_VIDEOS'
  | 'VIDEOS_READY'
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

export interface StoryBeat {
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
}

export interface StoryPlan {
  readonly title: string
  readonly logline: string
  readonly beats: readonly StoryBeat[]
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
  | { readonly status: 'assembling'; readonly story: Story }
  | { readonly status: 'ready'; readonly story: Story }
  | {
      readonly status: 'failed'
      readonly story: Story
      readonly error: StoryJobError
    }
  | { readonly status: 'cancelled'; readonly story: Story }
  | { readonly status: 'expired'; readonly storyId: string }
