import { Buffer } from 'node:buffer'
import { getRequestHeader, readRawBody } from 'h3'
import type { H3Event } from 'h3'
import type {
  StoryBeatUpdateRequest,
  StoryCreateRequest,
  StoryImageMimeType,
  StoryMode,
  StoryPreset,
  StoryReferenceUploadRequest,
  StorySceneCount,
} from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import {
  findUnknownField,
  isIdempotencyKey,
  isJsonContentType,
  isJsonObject,
  parseJsonObject,
} from '../shared/json'
import { hasControlCharacters, normalizeText, validateText } from '../shared/prompt'
import { StoryError } from './errors'

export const STORY_CREATE_MAX_BODY_BYTES = 16_384
export const STORY_BEAT_MAX_BODY_BYTES = 8_192
export const STORY_UPLOAD_MAX_BODY_BYTES = 4_096

export const STORY_MIN_PREMISE_LENGTH = 10
export const STORY_MAX_PREMISE_LENGTH = 600
export const STORY_MIN_VISUAL_PROMPT_LENGTH = 20
export const STORY_MAX_VISUAL_PROMPT_LENGTH = 600
export const STORY_MIN_NARRATION_LENGTH = 10
export const STORY_MAX_NARRATION_LENGTH = 280
export const STORY_MAX_IMAGE_BYTES = 8_388_608
export const STORY_MAX_FILE_NAME_LENGTH = 200
export const STORY_REFERENCE_MAX_AGE_MS = 3_600_000

const SCENE_COUNTS: readonly StorySceneCount[] = [4, 5, 6]
const PRESETS: readonly StoryPreset[] = ['fast', 'quality']
const IMAGE_MIME_TYPES: readonly StoryImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

const CREATE_FIELDS = [
  'premise',
  'sceneCount',
  'preset',
  'mode',
  'referenceUrl',
  'referenceExpiresAt',
] as const
const BEAT_FIELDS = ['visualPrompt', 'narration', 'regenerate'] as const
const UPLOAD_FIELDS = ['fileName', 'contentType', 'sizeBytes'] as const

const MARKUP_CHARACTERS = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/

function assertKnownFields(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (findUnknownField(payload, allowed) !== null) {
    throw new StoryError('invalid-request')
  }
}

function containsMarkup(value: string): boolean {
  return MARKUP_CHARACTERS.test(value) || MARKDOWN_BLOCK.test(value)
}

export async function readStoryJsonBody(
  event: H3Event,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  if (!isJsonContentType(getRequestHeader(event, 'content-type'))) {
    throw new StoryError('unsupported-media-type')
  }

  const raw = await readRawBody(event)

  if (raw === undefined) {
    throw new StoryError('invalid-request')
  }

  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new StoryError('payload-too-large')
  }

  const parsed = parseJsonObject(raw)

  if (parsed === null) {
    throw new StoryError('invalid-request')
  }

  return parsed
}

export function validatePremise(value: unknown): string {
  const result = validateText(value, STORY_MAX_PREMISE_LENGTH)

  if (!result.ok) {
    if (result.error === 'too-long') {
      throw new StoryError('premise-too-long')
    }

    if (result.error === 'control-characters') {
      throw new StoryError('invalid-premise')
    }

    throw new StoryError('premise-required')
  }

  if (result.value.length < STORY_MIN_PREMISE_LENGTH) {
    throw new StoryError('premise-required')
  }

  return result.value
}

export function validateSceneCount(value: unknown): StorySceneCount {
  if (value === undefined) {
    return 5
  }

  if (typeof value !== 'number' || !SCENE_COUNTS.includes(value as StorySceneCount)) {
    throw new StoryError('invalid-scene-count')
  }

  return value as StorySceneCount
}

export function validateStoryMode(value: unknown): StoryMode {
  if (value === 'faithful' || value === 'creative') {
    return value
  }

  throw new StoryError('invalid-mode')
}

export function validatePreset(value: unknown): StoryPreset {
  if (value === undefined) {
    return 'fast'
  }

  if (typeof value !== 'string' || !PRESETS.includes(value as StoryPreset)) {
    throw new StoryError('invalid-preset')
  }

  return value as StoryPreset
}

interface ReferenceInput {
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
}

export function validateReference(
  urlValue: unknown,
  expiresValue: unknown,
  now: number,
): ReferenceInput {
  const hasUrl = urlValue !== undefined && urlValue !== null
  const hasExpires = expiresValue !== undefined && expiresValue !== null

  if (!hasUrl) {
    if (hasExpires) {
      throw new StoryError('invalid-reference')
    }

    return { referenceUrl: null, referenceExpiresAt: null }
  }

  if (typeof urlValue !== 'string' || typeof expiresValue !== 'string') {
    throw new StoryError('invalid-reference')
  }

  let safeUrl: string

  try {
    safeUrl = assertFalMediaUrl(urlValue)
  } catch {
    throw new StoryError('invalid-reference')
  }

  const expiresAt = Date.parse(expiresValue)

  if (!Number.isFinite(expiresAt)) {
    throw new StoryError('invalid-reference')
  }

  if (expiresAt <= now || expiresAt > now + STORY_REFERENCE_MAX_AGE_MS) {
    throw new StoryError('invalid-reference')
  }

  return {
    referenceUrl: safeUrl,
    referenceExpiresAt: new Date(expiresAt).toISOString(),
  }
}

export function validateCreateRequest(
  payload: unknown,
  now: number,
): StoryCreateRequest {
  if (!isJsonObject(payload)) {
    throw new StoryError('invalid-request')
  }

  assertKnownFields(payload, CREATE_FIELDS)

  const premise = validatePremise(payload.premise)
  const sceneCount = validateSceneCount(payload.sceneCount)
  const preset = validatePreset(payload.preset)
  const mode = validateStoryMode(payload.mode)
  const reference = validateReference(payload.referenceUrl, payload.referenceExpiresAt, now)

  return {
    premise,
    sceneCount,
    preset,
    mode,
    referenceUrl: reference.referenceUrl,
    referenceExpiresAt: reference.referenceExpiresAt,
  }
}

export function validateVisualPrompt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new StoryError('invalid-visual-prompt')
  }

  const normalized = normalizeText(value)

  if (
    normalized.length < STORY_MIN_VISUAL_PROMPT_LENGTH
    || normalized.length > STORY_MAX_VISUAL_PROMPT_LENGTH
    || containsMarkup(normalized)
    || hasControlCharacters(normalized)
  ) {
    throw new StoryError('invalid-visual-prompt')
  }

  return normalized
}

export function validateNarration(value: unknown): string {
  if (typeof value !== 'string') {
    throw new StoryError('invalid-narration')
  }

  const normalized = normalizeText(value).replace(/\s*\n+\s*/g, ' ')

  if (
    normalized.length < STORY_MIN_NARRATION_LENGTH
    || normalized.length > STORY_MAX_NARRATION_LENGTH
    || containsMarkup(normalized)
    || hasControlCharacters(normalized)
  ) {
    throw new StoryError('invalid-narration')
  }

  return normalized
}

export function validateBeatUpdate(payload: unknown): StoryBeatUpdateRequest {
  if (!isJsonObject(payload)) {
    throw new StoryError('invalid-request')
  }

  assertKnownFields(payload, BEAT_FIELDS)

  const visualPrompt = validateVisualPrompt(payload.visualPrompt)
  const narration = payload.narration === undefined
    ? undefined
    : validateNarration(payload.narration)
  const regenerate = payload.regenerate

  if (regenerate !== undefined && typeof regenerate !== 'boolean') {
    throw new StoryError('invalid-request')
  }

  return {
    visualPrompt,
    ...(narration === undefined ? {} : { narration }),
    ...(regenerate === undefined ? {} : { regenerate }),
  }
}

function validateFileName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new StoryError('invalid-file-name')
  }

  const fileName = value.trim()

  if (
    fileName.length < 1
    || fileName.length > STORY_MAX_FILE_NAME_LENGTH
    || fileName.includes('/')
    || fileName.includes('\\')
    || fileName.includes('..')
    || fileName.includes('\0')
    || hasControlCharacters(fileName)
  ) {
    throw new StoryError('invalid-file-name')
  }

  return fileName
}

function normalizeContentType(value: unknown): StoryImageMimeType {
  if (typeof value !== 'string') {
    throw new StoryError('unsupported-reference-type')
  }

  const normalized = value.split(';')[0]?.trim().toLowerCase()

  if (!normalized || !IMAGE_MIME_TYPES.includes(normalized as StoryImageMimeType)) {
    throw new StoryError('unsupported-reference-type')
  }

  return normalized as StoryImageMimeType
}

function validateSizeBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new StoryError('invalid-request')
  }

  if (value <= 0) {
    throw new StoryError('reference-empty')
  }

  if (value > STORY_MAX_IMAGE_BYTES) {
    throw new StoryError('reference-too-large')
  }

  return value
}

export function validateUploadRequest(payload: unknown): StoryReferenceUploadRequest {
  if (!isJsonObject(payload)) {
    throw new StoryError('invalid-request')
  }

  assertKnownFields(payload, UPLOAD_FIELDS)

  return {
    fileName: validateFileName(payload.fileName),
    contentType: normalizeContentType(payload.contentType),
    sizeBytes: validateSizeBytes(payload.sizeBytes),
  }
}

export const STORY_QC_APPROVE_MAX_BODY_BYTES = 4_096

const QC_APPROVE_FIELDS = ['confirm'] as const

export function validateQcApproveRequest(
  payload: unknown,
): { readonly confirm: true } {
  if (!isJsonObject(payload)) {
    throw new StoryError('invalid-request')
  }

  assertKnownFields(payload, QC_APPROVE_FIELDS)

  if (payload.confirm !== true) {
    throw new StoryError('invalid-request')
  }

  return { confirm: true }
}

export function validateIdempotencyKey(value: string | undefined): string | null {  if (value === undefined || value.length === 0) {
    return null
  }

  if (!isIdempotencyKey(value)) {
    throw new StoryError('invalid-request')
  }

  return value
}
