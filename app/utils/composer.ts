import {
  COMPOSER_IMAGE_MIME_TYPES,
  COMPOSER_MAX_IMAGE_BYTES,
  COMPOSER_MAX_PROMPT_LENGTH,
  COMPOSER_MODELS,
  COMPOSER_PRESETS,
} from '~/data/composer'
import type {
  ComposerGenerationRequest,
  ComposerImageMimeType,
  ComposerJobStage,
  ComposerModelCapabilities,
  ComposerPreset,
  ComposerPresetDefinition,
  ComposerValidationCode,
  ComposerValidationIssue,
  ComposerVideoDuration,
} from '~/models/composer'

export interface ComposerFileLike {
  readonly name: string
  readonly type: string
  readonly size: number
}

const VALIDATION_MESSAGES: Readonly<Record<ComposerValidationCode, string>> = {
  'prompt-required': 'Escribe una idea para generar tu short.',
  'prompt-too-long': 'La idea no puede superar los 280 caracteres.',
  'invalid-prompt': 'La idea contiene caracteres no admitidos.',
  'reference-empty': 'El archivo está vacío.',
  'reference-too-large': 'La imagen supera el máximo de 8 MB.',
  'unsupported-reference-type': 'Formato no admitido. Usa PNG, JPG o WebP.',
  'invalid-file-name': 'El nombre del archivo no es válido.',
}

const STAGE_LABELS: Readonly<Record<ComposerJobStage, string>> = {
  keyframe: 'Creando el fotograma base',
  queued: 'En cola',
  video: 'Generando el vídeo',
  finalizing: 'Preparando el resultado',
}

export const COMPOSER_JOB_STAGES: readonly ComposerJobStage[] = [
  'keyframe',
  'queued',
  'video',
  'finalizing',
]

const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = 1_048_576
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

function createIssue(
  code: ComposerValidationCode,
  field: ComposerValidationIssue['field'],
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

  if (CONTROL_CHARACTERS.test(normalized)) {
    return createIssue('invalid-prompt', 'prompt')
  }

  return null
}

export function normalizeComposerMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isComposerImageMimeType(
  mimeType: string,
): mimeType is ComposerImageMimeType {
  return (COMPOSER_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}

export function validateReferenceFile(
  file: ComposerFileLike,
): ComposerValidationIssue | null {
  const mimeType = normalizeComposerMimeType(file.type)

  if (file.size <= 0) {
    return createIssue('reference-empty', 'reference')
  }

  if (!isComposerImageMimeType(mimeType)) {
    return createIssue('unsupported-reference-type', 'reference')
  }

  if (file.size > COMPOSER_MAX_IMAGE_BYTES) {
    return createIssue('reference-too-large', 'reference')
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

export function formatComposerDuration(seconds: ComposerVideoDuration | number): string {
  const safeSeconds = Math.max(0, Math.trunc(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function formatElapsedSeconds(seconds: number): string {
  return formatComposerDuration(seconds)
}

export function composerStageLabel(stage: ComposerJobStage): string {
  return STAGE_LABELS[stage]
}

export function getComposerPreset(preset: ComposerPreset): ComposerPresetDefinition {
  const definition = COMPOSER_PRESETS.find((item) => item.preset === preset)

  return definition ?? COMPOSER_PRESETS[0]!
}

export function getComposerModel(preset: ComposerPreset): ComposerModelCapabilities {
  const model = COMPOSER_MODELS.find((item) => item.preset === preset)

  return model ?? COMPOSER_MODELS[0]!
}

export function getComposerDurations(
  preset: ComposerPreset,
): readonly ComposerVideoDuration[] {
  return getComposerPreset(preset).durations
}

export function isComposerDurationAllowed(
  preset: ComposerPreset,
  durationSeconds: number,
): durationSeconds is ComposerVideoDuration {
  return getComposerPreset(preset).durations.includes(
    durationSeconds as ComposerVideoDuration,
  )
}

export function resolveComposerDuration(
  preset: ComposerPreset,
  durationSeconds: ComposerVideoDuration,
): ComposerVideoDuration {
  if (isComposerDurationAllowed(preset, durationSeconds)) {
    return durationSeconds
  }

  return getComposerPreset(preset).defaultDurationSeconds
}

export function formatComposerReference(referenceCount: number): string {
  return referenceCount > 0 ? '1 imagen' : 'Sin referencia'
}

export function buildComposerGenerationRequest(
  prompt: string,
  preset: ComposerPreset,
  durationSeconds: ComposerVideoDuration,
  referenceUrl: string | null,
): ComposerGenerationRequest {
  return {
    prompt: normalizeComposerPrompt(prompt),
    preset,
    durationSeconds: resolveComposerDuration(preset, durationSeconds),
    referenceUrl,
  }
}
