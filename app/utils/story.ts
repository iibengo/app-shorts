import {
  STORY_MAX_IMAGE_BYTES,
  STORY_MAX_NARRATION_LENGTH,
  STORY_MAX_PREMISE_LENGTH,
  STORY_MAX_VISUAL_PROMPT_LENGTH,
  STORY_MIN_NARRATION_LENGTH,
  STORY_MIN_PREMISE_LENGTH,
  STORY_MIN_VISUAL_PROMPT_LENGTH,
  STORY_POLL_AFTER_MS,
  STORY_PRESETS,
  STORY_SCENE_DURATION_SECONDS,
  STORY_TERMINAL_STATUSES,
  type StoryStepId,
} from '~/data/story'
import type {
  SceneStatus,
  StoryImageMimeType,
  StoryJobError,
  StoryModelId,
  StoryPreset,
  StoryScene,
  StorySceneCount,
  StoryStatus,
} from '~/models/story'

export interface StoryFileLike {
  readonly name: string
  readonly type: string
  readonly size: number
}

const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = 1_048_576
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const MARKUP_CHARACTERS = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/

const SCENE_STATUS_LABELS: Readonly<Record<SceneStatus, string>> = {
  PENDING: 'Pendiente',
  KEYFRAME_QUEUED: 'En cola',
  KEYFRAME_RUNNING: 'Generando imagen',
  KEYFRAME_READY: 'Imagen lista',
  KEYFRAME_FAILED: 'Imagen fallida',
  VIDEO_QUEUED: 'En cola',
  VIDEO_RUNNING: 'Generando vídeo',
  VIDEO_READY: 'Vídeo listo',
  VIDEO_FAILED: 'Vídeo fallido',
  CANCELLED: 'Cancelada',
}

function issue(code: StoryJobError['code'], message: string): StoryJobError {
  return { code, message, retryable: false }
}

export function normalizeStoryText(value: string): string {
  return value.normalize('NFC').trim()
}

export function containsStoryMarkup(value: string): boolean {
  return MARKUP_CHARACTERS.test(value) || MARKDOWN_BLOCK.test(value)
}

export function hasStoryControlCharacters(value: string): boolean {
  return CONTROL_CHARACTERS.test(value)
}

export function validateStoryPremise(value: string): StoryJobError | null {
  const normalized = normalizeStoryText(value)

  if (normalized.length < STORY_MIN_PREMISE_LENGTH) {
    return issue('premise-required', 'Escribe una premisa para crear tu historia.')
  }

  if (normalized.length > STORY_MAX_PREMISE_LENGTH) {
    return issue('premise-too-long', 'La premisa no puede superar los 600 caracteres.')
  }

  if (hasStoryControlCharacters(normalized)) {
    return issue('invalid-premise', 'La premisa contiene caracteres no admitidos.')
  }

  return null
}

export function validateStoryVisualPrompt(value: string): StoryJobError | null {
  const normalized = normalizeStoryText(value)

  if (
    normalized.length < STORY_MIN_VISUAL_PROMPT_LENGTH
    || normalized.length > STORY_MAX_VISUAL_PROMPT_LENGTH
    || containsStoryMarkup(normalized)
    || hasStoryControlCharacters(normalized)
  ) {
    return issue('invalid-visual-prompt', 'El prompt visual no es válido.')
  }

  return null
}

export function validateStoryNarration(value: string): StoryJobError | null {
  const normalized = normalizeStoryText(value).replace(/\s*\n+\s*/g, ' ')

  if (
    normalized.length < STORY_MIN_NARRATION_LENGTH
    || normalized.length > STORY_MAX_NARRATION_LENGTH
    || containsStoryMarkup(normalized)
    || hasStoryControlCharacters(normalized)
  ) {
    return issue('invalid-narration', 'La narración no es válida.')
  }

  return null
}

export function normalizeStoryMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
}

export function isStoryImageMimeType(
  mimeType: string,
): mimeType is StoryImageMimeType {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp'
}

export function validateStoryReferenceFile(file: StoryFileLike): StoryJobError | null {
  const mimeType = normalizeStoryMimeType(file.type)

  if (file.size <= 0) {
    return issue('reference-empty', 'El archivo está vacío.')
  }

  if (!isStoryImageMimeType(mimeType)) {
    return issue('unsupported-reference-type', 'Formato no admitido. Usa PNG, JPG o WebP.')
  }

  if (file.size > STORY_MAX_IMAGE_BYTES) {
    return issue('reference-too-large', 'La imagen supera el máximo de 8 MB.')
  }

  return null
}

export function formatStoryDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.trunc(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function formatStoryElapsed(seconds: number): string {
  return formatStoryDuration(seconds)
}

export function formatStoryFileSize(sizeBytes: number): string {
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

export function storyModelIdForPreset(preset: StoryPreset): StoryModelId {
  return preset === 'quality' ? 'kling-2.5-turbo-pro' : 'minimax-hailuo-02'
}

export function getStoryPreset(preset: StoryPreset): (typeof STORY_PRESETS)[number] {
  return STORY_PRESETS.find((item) => item.preset === preset) ?? STORY_PRESETS[0]!
}

export function storyTotalDuration(sceneCount: StorySceneCount): number {
  return sceneCount * STORY_SCENE_DURATION_SECONDS
}

export function isStoryTerminal(status: StoryStatus): boolean {
  return STORY_TERMINAL_STATUSES.includes(status)
}

export function storyStepForStatus(status: StoryStatus): StoryStepId {
  if (status === 'GENERATING_KEYFRAMES') return 'images'
  if (status === 'WAITING_APPROVAL') return 'images'
  if (status === 'GENERATING_VIDEOS' || status === 'VIDEOS_READY') return 'videos'
  if (status === 'READY') return 'result'

  return 'plan'
}

export function sceneStatusLabel(status: SceneStatus): string {
  return SCENE_STATUS_LABELS[status]
}

export function storyPollAfterMs(status: StoryStatus): number {
  return isStoryTerminal(status) ? 0 : STORY_POLL_AFTER_MS
}

export function countReadyVideos(scenes: readonly StoryScene[]): number {
  return scenes.filter((scene) => scene.status === 'VIDEO_READY').length
}

export function canRegenerateKeyframe(scene: StoryScene): boolean {
  return (
    scene.keyframeAttempts < 2
    && (scene.status === 'KEYFRAME_READY' || scene.status === 'KEYFRAME_FAILED')
  )
}

export function storyReferenceLabel(referenceUrl: string | null): string {
  return referenceUrl ? '1 imagen' : 'Sin referencia'
}

const STORY_MEDIA_HOSTS: readonly string[] = [
  'v3.fal.media',
  'v3b.fal.media',
  'fal.media',
]

export function isStoryMediaUrl(value: string | null | undefined): value is string {
  if (!value) return false

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return false
  }

  return (
    url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.hash === ''
    && (url.port === '' || url.port === '443')
    && STORY_MEDIA_HOSTS.includes(url.hostname)
  )
}

export function storyPosterUrl(scenes: readonly StoryScene[]): string | null {
  const first = scenes.slice().sort((a, b) => a.order - b.order)[0]

  return first && isStoryMediaUrl(first.keyframeUrl) ? first.keyframeUrl : null
}

export function storyError(
  code: StoryJobError['code'],
  message: string,
  retryable = false,
): StoryJobError {
  return { code, message, retryable }
}

export function storySceneTitle(order: number, total: number): string {
  return `Escena ${order} de ${total}`
}

export function storyAttemptLabel(attempts: number): string {
  const safe = Math.min(2, Math.max(1, Math.trunc(attempts)))

  return `Imagen ${safe} de 2`
}

export function preferredPollDelay(pollAfterMs: number | undefined): number {
  const value = typeof pollAfterMs === 'number' ? pollAfterMs : STORY_POLL_AFTER_MS

  return Math.min(10_000, Math.max(1_000, Math.trunc(value)))
}
