export type ComposerStep = 'input' | 'generating' | 'preview'

export type ComposerReferenceKind = 'image' | 'video'
export type ComposerReferenceId = `ref-${number}`

export type ComposerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'
export type ComposerVideoMimeType = 'video/mp4' | 'video/webm' | 'video/quicktime'
export type ComposerReferenceMimeType = ComposerImageMimeType | ComposerVideoMimeType

export interface ComposerReference {
  readonly id: ComposerReferenceId
  readonly kind: ComposerReferenceKind
  readonly name: string
  readonly mimeType: ComposerReferenceMimeType
  readonly sizeBytes: number
  readonly thumbnailUrl: string | null
  readonly durationSeconds: number | null
}

export interface ComposerDraft {
  readonly prompt: string
  readonly references: readonly ComposerReference[]
}

export type ComposerPosterSrc = `/mock/composer/${string}.svg`

export interface ComposerPoster {
  readonly src: ComposerPosterSrc
  readonly alt: string
  readonly width: 1080
  readonly height: 1920
}

export interface ComposerReferenceSignature {
  readonly kind: ComposerReferenceKind
  readonly name: string
  readonly sizeBytes: number
}

export interface ComposerGenerationRequest {
  readonly prompt: string
  readonly references: readonly ComposerReferenceSignature[]
  readonly attempt: number
}

export type GeneratedShortPreviewId = `preview-${string}`

export interface GeneratedShortPreview {
  readonly id: GeneratedShortPreviewId
  readonly title: string
  readonly poster: ComposerPoster
  readonly durationSeconds: number
  readonly prompt: string
  readonly referenceCount: number
  readonly attempt: number
}

export type ComposerGenerationStage = 'analyzing' | 'composing' | 'rendering'

export type ComposerGenerationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'generating'
      readonly stage: ComposerGenerationStage
      readonly progress: number
      readonly attempt: number
    }
  | { readonly status: 'ready'; readonly result: GeneratedShortPreview }
  | { readonly status: 'error'; readonly message: string; readonly attempt: number }

export type ComposerValidationField = 'prompt' | 'references'

export type ComposerValidationCode =
  | 'prompt-required'
  | 'prompt-too-long'
  | 'references-limit'
  | 'reference-empty'
  | 'reference-type'
  | 'reference-too-large'

export interface ComposerValidationIssue {
  readonly code: ComposerValidationCode
  readonly field: ComposerValidationField
  readonly message: string
}

export type ComposerGenerator = (
  request: ComposerGenerationRequest,
) => GeneratedShortPreview
