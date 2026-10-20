export type ComposerStep = 'input' | 'generating' | 'preview'

export type ComposerPreset = 'fast' | 'quality'

export type ComposerModelId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

export type ComposerVideoDuration = 5 | 6 | 10

export type ComposerValidationCode =
  | 'prompt-required'
  | 'prompt-too-long'
  | 'invalid-prompt'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'

export interface ComposerValidationIssue {
  readonly code: ComposerValidationCode
  readonly field: 'prompt' | 'reference'
  readonly message: string
}

export type ComposerReferenceId = `ref-${number}`

export type ComposerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ComposerReferenceUploadRequest {
  readonly fileName: string
  readonly contentType: ComposerImageMimeType
  readonly sizeBytes: number
}

export interface ComposerUploadTicket {
  readonly uploadUrl: string
  readonly fileUrl: string
  readonly expiresAt: string
  readonly uploadHeaders: Readonly<Record<string, string>>
}

export interface ComposerReference {
  readonly id: ComposerReferenceId
  readonly fileName: string
  readonly mimeType: ComposerImageMimeType
  readonly sizeBytes: number
  readonly fileUrl: string
  readonly previewUrl: string | null
  readonly width: number | null
  readonly height: number | null
  readonly expiresAt: string
}

export interface ComposerGenerationRequest {
  readonly prompt: string
  readonly preset: ComposerPreset
  readonly durationSeconds: ComposerVideoDuration
  readonly referenceUrl: string | null
}

export type ComposerJobId = `v1.${string}`

export type ComposerJobStage = 'keyframe' | 'queued' | 'video' | 'finalizing'

export type ComposerJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface ComposerVideoOutput {
  readonly videoUrl: string
  readonly posterUrl: string
  readonly width: number | null
  readonly height: number | null
  readonly durationSeconds: ComposerVideoDuration
  readonly modelId: ComposerModelId
  readonly expiresAt: string
}

export type ComposerErrorCode =
  | 'invalid-request'
  | 'invalid-prompt'
  | 'prompt-required'
  | 'prompt-too-long'
  | 'invalid-preset'
  | 'invalid-duration'
  | 'invalid-reference'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'cross-origin-request'
  | 'rate-limited'
  | 'server-busy'
  | 'budget-exhausted'
  | 'generation-in-progress'
  | 'idempotency-conflict'
  | 'ai-not-configured'
  | 'ai-unavailable'
  | 'ai-credits-exhausted'
  | 'content-blocked'
  | 'provider-rejected'
  | 'provider-busy'
  | 'provider-error'
  | 'provider-invalid-output'
  | 'keyframe-timeout'
  | 'provider-timeout'
  | 'job-not-found'
  | 'job-expired'
  | 'job-not-cancellable'
  | 'cancel-failed'
  | 'internal-error'

export interface ComposerJobError {
  readonly code: ComposerErrorCode
  readonly message: string
  readonly retryable: boolean
}

export interface ComposerApiError {
  readonly error: ComposerJobError & {
    readonly retryAfterSeconds?: number
  }
}

interface ComposerJobBase {
  readonly id: ComposerJobId
  readonly preset: ComposerPreset
  readonly modelId: ComposerModelId
  readonly durationSeconds: ComposerVideoDuration
  readonly posterUrl: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly pollAfterMs: number
}

export type ComposerJob =
  | (ComposerJobBase & {
      readonly status: 'queued'
      readonly stage: 'queued'
      readonly queuePosition: number | null
    })
  | (ComposerJobBase & {
      readonly status: 'running'
      readonly stage: 'video' | 'finalizing'
      readonly queuePosition: null
    })
  | (ComposerJobBase & {
      readonly status: 'succeeded'
      readonly stage: 'finalizing'
      readonly output: ComposerVideoOutput
    })
  | (ComposerJobBase & {
      readonly status: 'failed'
      readonly stage: 'queued' | 'video' | 'finalizing'
      readonly error: ComposerJobError
    })
  | (ComposerJobBase & {
      readonly status: 'cancelled'
      readonly stage: 'queued' | 'video' | 'finalizing'
    })

export interface ComposerModelCapabilities {
  readonly id: ComposerModelId
  readonly preset: ComposerPreset
  readonly label: string
  readonly durations: readonly ComposerVideoDuration[]
  readonly defaultDurationSeconds: ComposerVideoDuration
  readonly supportsImageReference: true
  readonly maxReferenceCount: 1
  readonly estimatedLatencySeconds: {
    readonly min: number
    readonly max: number
  }
  readonly estimatedCostUsd: number | null
}

export interface ComposerPresetDefinition {
  readonly preset: ComposerPreset
  readonly modelId: ComposerModelId
  readonly label: string
  readonly description: string
  readonly durations: readonly ComposerVideoDuration[]
  readonly defaultDurationSeconds: ComposerVideoDuration
}

export type ComposerGenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting'; readonly attempt: number }
  | {
      readonly status: 'queued'
      readonly job: Extract<ComposerJob, { status: 'queued' }>
      readonly attempt: number
    }
  | {
      readonly status: 'running'
      readonly job: Extract<ComposerJob, { status: 'running' }>
      readonly attempt: number
    }
  | {
      readonly status: 'ready'
      readonly job: Extract<ComposerJob, { status: 'succeeded' }>
      readonly attempt: number
    }
  | {
      readonly status: 'error'
      readonly phase: 'keyframe' | 'video' | 'poll'
      readonly error: ComposerJobError
      readonly jobId: ComposerJobId | null
      readonly posterUrl: string | null
      readonly attempt: number
    }
  | {
      readonly status: 'cancelled'
      readonly jobId: ComposerJobId | null
      readonly attempt: number
    }
