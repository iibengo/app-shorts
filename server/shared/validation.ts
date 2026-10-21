import { Buffer } from 'node:buffer'
import { getRequestHeader, readRawBody } from 'h3'
import type { H3Event } from 'h3'
import type {
  ComposerGenerationRequest,
  ComposerImageMimeType,
  ComposerPreset,
  ComposerReferenceUploadRequest,
  ComposerVideoDuration,
} from '~/models/composer'
import { ComposerError } from './errors'
import { assertFalMediaUrl } from '../fal/types'
import {
  findUnknownField,
  isIdempotencyKey,
  isJsonContentType,
  isJsonObject,
  parseJsonObject,
} from './json'
import { hasControlCharacters, validateText } from './prompt'

export { isJsonContentType } from './json'

const MAX_PROMPT_LENGTH = 280
const MAX_IMAGE_BYTES = 8_388_608
const MAX_FILE_NAME_LENGTH = 200

const IMAGE_MIME_TYPES: readonly ComposerImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

const PRESETS: readonly ComposerPreset[] = ['fast', 'quality']

const DURATIONS: Readonly<Record<ComposerPreset, readonly ComposerVideoDuration[]>> = {
  fast: [6, 10],
  quality: [5, 10],
}

const DEFAULT_DURATIONS: Readonly<Record<ComposerPreset, ComposerVideoDuration>> = {
  fast: 6,
  quality: 5,
}

const GENERATE_FIELDS = ['prompt', 'preset', 'durationSeconds', 'referenceUrl'] as const
const UPLOAD_FIELDS = ['fileName', 'contentType', 'sizeBytes'] as const

function assertKnownFields(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (findUnknownField(payload, allowed) !== null) {
    throw new ComposerError('invalid-request')
  }
}

export async function readJsonBody(
  event: H3Event,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  if (!isJsonContentType(getRequestHeader(event, 'content-type'))) {
    throw new ComposerError('unsupported-media-type')
  }

  const raw = await readRawBody(event)

  if (raw === undefined) {
    throw new ComposerError('invalid-request')
  }

  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new ComposerError('payload-too-large')
  }

  const parsed = parseJsonObject(raw)

  if (parsed === null) {
    throw new ComposerError('invalid-request')
  }

  return parsed
}

export function validatePrompt(value: unknown): string {
  const result = validateText(value, MAX_PROMPT_LENGTH)

  if (!result.ok) {
    if (result.error === 'too-long') {
      throw new ComposerError('prompt-too-long')
    }

    if (result.error === 'control-characters') {
      throw new ComposerError('invalid-prompt')
    }

    throw new ComposerError('prompt-required')
  }

  return result.value
}

export function validatePreset(value: unknown): ComposerPreset {
  if (value === undefined) {
    return 'fast'
  }

  if (typeof value !== 'string' || !PRESETS.includes(value as ComposerPreset)) {
    throw new ComposerError('invalid-preset')
  }

  return value as ComposerPreset
}

export function isDurationAllowed(
  preset: ComposerPreset,
  durationSeconds: number,
): durationSeconds is ComposerVideoDuration {
  return DURATIONS[preset].includes(durationSeconds as ComposerVideoDuration)
}

export function validateDuration(
  value: unknown,
  preset: ComposerPreset,
): ComposerVideoDuration {
  if (value === undefined) {
    return DEFAULT_DURATIONS[preset]
  }

  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || !isDurationAllowed(preset, value)
  ) {
    throw new ComposerError('invalid-duration')
  }

  return value
}

export function validateReferenceUrl(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new ComposerError('invalid-reference')
  }

  try {
    return assertFalMediaUrl(value)
  } catch {
    throw new ComposerError('invalid-reference')
  }
}

export function validateGenerateRequest(payload: unknown): ComposerGenerationRequest {
  if (!isJsonObject(payload)) {
    throw new ComposerError('invalid-request')
  }

  assertKnownFields(payload, GENERATE_FIELDS)

  const prompt = validatePrompt(payload.prompt)
  const preset = validatePreset(payload.preset)
  const durationSeconds = validateDuration(payload.durationSeconds, preset)
  const referenceUrl = validateReferenceUrl(payload.referenceUrl)

  return { prompt, preset, durationSeconds, referenceUrl }
}

export function validateFileName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ComposerError('invalid-file-name')
  }

  const fileName = value.trim()

  if (
    fileName.length < 1
    || fileName.length > MAX_FILE_NAME_LENGTH
    || fileName.includes('/')
    || fileName.includes('\\')
    || fileName.includes('..')
    || fileName.includes('\0')
    || hasControlCharacters(fileName)
  ) {
    throw new ComposerError('invalid-file-name')
  }

  return fileName
}

export function normalizeImageContentType(value: unknown): ComposerImageMimeType {
  if (typeof value !== 'string') {
    throw new ComposerError('unsupported-reference-type')
  }

  const normalized = value.split(';')[0]?.trim().toLowerCase()

  if (!normalized || !IMAGE_MIME_TYPES.includes(normalized as ComposerImageMimeType)) {
    throw new ComposerError('unsupported-reference-type')
  }

  return normalized as ComposerImageMimeType
}

export function validateSizeBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ComposerError('invalid-request')
  }

  if (value <= 0) {
    throw new ComposerError('reference-empty')
  }

  if (value > MAX_IMAGE_BYTES) {
    throw new ComposerError('reference-too-large')
  }

  return value
}

export function validateUploadRequest(payload: unknown): ComposerReferenceUploadRequest {
  if (!isJsonObject(payload)) {
    throw new ComposerError('invalid-request')
  }

  assertKnownFields(payload, UPLOAD_FIELDS)

  return {
    fileName: validateFileName(payload.fileName),
    contentType: normalizeImageContentType(payload.contentType),
    sizeBytes: validateSizeBytes(payload.sizeBytes),
  }
}

export function validateIdempotencyKey(
  value: string | undefined,
): string | null {
  if (value === undefined || value.length === 0) {
    return null
  }

  if (!isIdempotencyKey(value)) {
    throw new ComposerError('invalid-request')
  }

  return value
}

export function canonicalGenerationBody(request: ComposerGenerationRequest): string {
  return JSON.stringify([
    request.prompt,
    request.preset,
    request.durationSeconds,
    request.referenceUrl,
  ])
}

export function canonicalUploadBody(request: ComposerReferenceUploadRequest): string {
  return JSON.stringify([
    request.fileName,
    request.contentType,
    request.sizeBytes,
  ])
}
