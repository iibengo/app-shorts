import type {
  ComposerModelId,
  ComposerVideoDuration,
} from '~/models/composer'

export interface KeyframeInput {
  readonly prompt: string
  readonly referenceUrl: string | null
}

export interface KeyframeOutput {
  readonly imageUrl: string
  readonly width: number | null
  readonly height: number | null
}

export interface VideoInput {
  readonly prompt: string
  readonly keyframeUrl: string
  readonly durationSeconds: ComposerVideoDuration
  /** Opcional. Si falta, cada adaptador usa su comportamiento actual. */
  readonly negativePrompt?: string
}

export interface VideoOutput {
  readonly videoUrl: string
  readonly width: number | null
  readonly height: number | null
}

export interface KeyframeAdapter {
  readonly modelId: string
  buildInput(input: KeyframeInput): unknown
  parseOutput(payload: unknown): KeyframeOutput
}

export interface VideoAdapter {
  readonly modelId: ComposerModelId
  buildInput(input: VideoInput): unknown
  parseOutput(
    payload: unknown,
    requestedDuration: ComposerVideoDuration,
  ): VideoOutput
}
