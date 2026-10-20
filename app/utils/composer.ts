import {
  COMPOSER_MAX_DURATION_SECONDS,
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
  COMPOSER_MAX_VIDEO_BYTES,
  COMPOSER_MIN_DURATION_SECONDS,
  COMPOSER_POSTERS,
  COMPOSER_REFERENCE_MIME_TYPES,
  COMPOSER_TITLES,
} from '~/data/composer'
import type {
  ComposerGenerationRequest,
  ComposerGenerationStage,
  ComposerReference,
  ComposerReferenceKind,
  ComposerReferenceMimeType,
  ComposerReferenceSignature,
  ComposerValidationCode,
  ComposerValidationField,
  ComposerValidationIssue,
  GeneratedShortPreview,
  GeneratedShortPreviewId,
} from '~/models/composer'

export interface ComposerFileLike {
  readonly name: string
  readonly type: string
  readonly size: number
}

const VALIDATION_MESSAGES: Readonly<Record<ComposerValidationCode, string>> = {
  'prompt-required': 'Escribe una idea para generar tu short.',
  'prompt-too-long': 'La idea no puede superar los 280 caracteres.',
  'references-limit': 'Puedes añadir hasta 3 referencias.',
  'reference-empty': 'El archivo está vacío.',
  'reference-type': 'Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.',
  'reference-too-large': 'El archivo supera el tamaño máximo permitido.',
}

const STAGE_LABELS: Readonly<Record<ComposerGenerationStage, string>> = {
  analyzing: 'Analizando tu idea',
  composing: 'Componiendo la escena',
  rendering: 'Preparando la vista previa',
}

const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = 1_048_576

function createIssue(
  code: ComposerValidationCode,
  field: ComposerValidationField,
  message = VALIDATION_MESSAGES[code],
): ComposerValidationIssue {
  return { code, field, message }
}

export function normalizeComposerPrompt(prompt: string): string {
  return prompt.normalize('NFC').trim()
}

export function validateComposerPrompt(prompt: string): ComposerValidationIssue | null {
  const normalized = normalizeComposerPrompt(prompt)

  if (normalized.length === 0) {
    return createIssue('prompt-required', 'prompt')
  }

  if (normalized.length > COMPOSER_MAX_PROMPT_LENGTH) {
    return createIssue('prompt-too-long', 'prompt')
  }

  return null
}

export function normalizeComposerMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isComposerReferenceMimeType(
  mimeType: string,
): mimeType is ComposerReferenceMimeType {
  return (COMPOSER_REFERENCE_MIME_TYPES as readonly string[]).includes(mimeType)
}

export function getReferenceKind(mimeType: string): ComposerReferenceKind {
  return normalizeComposerMimeType(mimeType).startsWith('image/') ? 'image' : 'video'
}

export function validateReferenceFile(
  file: ComposerFileLike,
): ComposerValidationIssue | null {
  if (file.size <= 0) {
    return createIssue('reference-empty', 'references')
  }

  const mimeType = normalizeComposerMimeType(file.type)

  if (!isComposerReferenceMimeType(mimeType)) {
    return createIssue('reference-type', 'references')
  }

  if (getReferenceKind(mimeType) === 'image') {
    if (file.size > COMPOSER_MAX_IMAGE_BYTES) {
      return createIssue(
        'reference-too-large',
        'references',
        'La imagen supera el máximo de 8 MB.',
      )
    }

    return null
  }

  if (file.size > COMPOSER_MAX_VIDEO_BYTES) {
    return createIssue(
      'reference-too-large',
      'references',
      'El vídeo supera el máximo de 50 MB.',
    )
  }

  return null
}

export function formatFileSize(sizeBytes: number): string {
  const bytes = Math.max(0, Math.trunc(sizeBytes))

  if (bytes < BYTES_PER_KIB) {
    return `${bytes} B`
  }

  if (bytes < BYTES_PER_MIB) {
    return `${Math.ceil(bytes / BYTES_PER_KIB)} KB`
  }

  const mebibytes = Math.round((bytes / BYTES_PER_MIB) * 10) / 10
  const formatted = mebibytes.toFixed(1).replace('.', ',')

  return `${formatted.replace(/,0$/, '')} MB`
}

export function formatReferenceCount(count: number): string {
  const safeCount = Math.max(0, Math.trunc(count))

  return safeCount === 1 ? '1 referencia' : `${safeCount} referencias`
}

export function composerStageLabel(stage: ComposerGenerationStage): string {
  return STAGE_LABELS[stage]
}

export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

function buildPromptKey(prompt: string): string {
  return normalizeComposerPrompt(prompt).replace(/\s+/g, ' ').toLowerCase()
}

function buildSignature(
  promptKey: string,
  references: readonly ComposerReferenceSignature[],
): string {
  return JSON.stringify([
    promptKey,
    references.map((reference) => [
      reference.kind,
      reference.name,
      reference.sizeBytes,
    ]),
  ])
}

export function buildComposerGenerationRequest(
  prompt: string,
  references: readonly ComposerReference[],
  attempt: number,
): ComposerGenerationRequest {
  return {
    prompt: normalizeComposerPrompt(prompt),
    references: references.map((reference) => ({
      kind: reference.kind,
      name: reference.name,
      sizeBytes: reference.sizeBytes,
    })),
    attempt: Math.max(1, Math.trunc(attempt)),
  }
}

export function buildGeneratedShortPreview(
  request: ComposerGenerationRequest,
): GeneratedShortPreview {
  const attempt = Math.max(1, Math.trunc(request.attempt))
  const promptKey = buildPromptKey(request.prompt)
  const baseHash = fnv1a32(buildSignature(promptKey, request.references))

  const posterIndex = (baseHash + attempt - 1) % COMPOSER_POSTERS.length
  const titleIndex = (baseHash + (attempt - 1) * 3) % COMPOSER_TITLES.length
  const durationRange = COMPOSER_MAX_DURATION_SECONDS - COMPOSER_MIN_DURATION_SECONDS + 1
  const durationSeconds =
    COMPOSER_MIN_DURATION_SECONDS + ((baseHash + (attempt - 1) * 7) % durationRange)
  const hashHex = baseHash.toString(16).padStart(8, '0')
  const poster = COMPOSER_POSTERS[posterIndex] ?? COMPOSER_POSTERS[0]!
  const title = COMPOSER_TITLES[titleIndex] ?? COMPOSER_TITLES[0]!

  return {
    id: `preview-${hashHex}-${attempt}` as GeneratedShortPreviewId,
    title,
    poster,
    durationSeconds,
    prompt: request.prompt,
    referenceCount: request.references.length,
    attempt,
  }
}
