export type ComposerEndpointId =
  | 'fal-ai/flux/dev'
  | 'fal-ai/flux-pro/kontext'
  | 'fal-ai/flux-pro/kontext/max/multi'
  | 'fal-ai/nano-banana/edit'
  | 'fal-ai/minimax/hailuo-02/standard/image-to-video'
  | 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'

export const COMPOSER_ENDPOINT_IDS: readonly ComposerEndpointId[] = [
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/kontext',
  'fal-ai/flux-pro/kontext/max/multi',
  'fal-ai/nano-banana/edit',
  'fal-ai/minimax/hailuo-02/standard/image-to-video',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
]

export const FAL_CDN_HOSTS: readonly string[] = [
  'v3.fal.media',
  'v3b.fal.media',
  'fal.media',
]

export const FAL_API_ORIGINS: readonly string[] = [
  'https://queue.fal.run',
  'https://fal.run',
  'https://rest.fal.ai',
]

export type FalQueueState = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

export interface FalQueueSubmissionPayload {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export interface FalQueueStatusPayload {
  readonly status: FalQueueState
  readonly queuePosition: number | null
}

export interface FalFluxImageOutput {
  readonly imageUrl: string
  readonly width: number | null
  readonly height: number | null
}

export interface FalVideoOutput {
  readonly videoUrl: string
  readonly width: number | null
  readonly height: number | null
}

export function isComposerEndpointId(value: string): value is ComposerEndpointId {
  return (COMPOSER_ENDPOINT_IDS as readonly string[]).includes(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]

  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function assertFalApiUrl(
  value: string,
  allowedOrigins: readonly string[],
  allowInsecure: boolean,
): string {
  const url = parseUrl(value)

  if (!url) {
    throw new Error('invalid-fal-url')
  }

  const protocolAllowed = url.protocol === 'https:' || (allowInsecure && url.protocol === 'http:')

  if (!protocolAllowed || url.username || url.password || url.hash) {
    throw new Error('invalid-fal-url')
  }

  if (!allowedOrigins.includes(url.origin)) {
    throw new Error('invalid-fal-url')
  }

  return url.toString()
}

export function assertFalMediaUrl(value: string, maxLength = 2048): string {
  const url = parseUrl(value)

  if (!url) {
    throw new Error('invalid-fal-media-url')
  }

  const portAllowed = url.port === '' || url.port === '443'

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
    || !portAllowed
    || !FAL_CDN_HOSTS.includes(url.hostname)
    || value.length > maxLength
  ) {
    throw new Error('invalid-fal-media-url')
  }

  return url.toString()
}

export function assertSecureUploadUrl(value: string): string {
  const url = parseUrl(value)

  if (
    !url
    || url.protocol !== 'https:'
    || url.username
    || url.password
    || url.hash
  ) {
    throw new Error('invalid-upload-url')
  }

  return url.toString()
}

export function parseQueueSubmission(payload: unknown): FalQueueSubmissionPayload {
  if (!isRecord(payload)) {
    throw new Error('invalid-queue-submission')
  }

  const requestId = readString(payload, 'request_id')
  const statusUrl = readString(payload, 'status_url')
  const responseUrl = readString(payload, 'response_url')
  const cancelUrl = readString(payload, 'cancel_url')

  if (!requestId || !statusUrl || !responseUrl || !cancelUrl) {
    throw new Error('invalid-queue-submission')
  }

  return { requestId, statusUrl, responseUrl, cancelUrl }
}

export function parseQueueStatus(payload: unknown): FalQueueStatusPayload {
  if (!isRecord(payload)) {
    throw new Error('invalid-queue-status')
  }

  const status = payload.status

  if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS' && status !== 'COMPLETED') {
    throw new Error('invalid-queue-status')
  }

  const queuePosition = readNumber(payload, 'queue_position')

  return {
    status,
    queuePosition: queuePosition === null ? null : Math.max(0, Math.trunc(queuePosition)),
  }
}

export function isContentBlockedPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false

  const nsfw = payload.has_nsfw_concepts

  if (Array.isArray(nsfw) && nsfw.some((value) => value === true)) {
    return true
  }

  const text = [
    readString(payload, 'detail'),
    readString(payload, 'message'),
    readString(payload, 'error'),
    readString(payload, 'code'),
  ]
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLowerCase()

  return ['nsfw', 'safety', 'policy', 'moderation', 'blocked'].some((needle) =>
    text.includes(needle),
  )
}
