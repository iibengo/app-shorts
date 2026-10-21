import type {
  ComposerModelId,
  ComposerPreset,
  ComposerVideoDuration,
} from '~/models/composer'
import { ComposerError } from './errors'
import {
  decodeBase64Url,
  encodeBase64Url,
  signHmacBase64Url,
  verifyHmacBase64Url,
} from './hmac'
import type { ComposerEndpointId } from '../fal/types'
import { isComposerEndpointId, isRecord } from '../fal/types'

export interface ComposerJobTokenPayload {
  readonly v: 1
  readonly endpointId: ComposerEndpointId
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
  readonly modelId: ComposerModelId
  readonly preset: ComposerPreset
  readonly durationSeconds: ComposerVideoDuration
  readonly promptHash: string
  readonly posterUrl: string
  readonly referenceUrl: string | null
  readonly createdAt: number
  readonly expiresAt: number
}

export type ComposerJobTokenInput = Omit<ComposerJobTokenPayload, 'v'>

export interface JobTokenService {
  create(input: ComposerJobTokenInput): string
  verify(token: string): ComposerJobTokenPayload
}

export interface JobTokenServiceOptions {
  readonly secret: string
  readonly now?: () => number
}

const MAX_TOKEN_LENGTH = 4_096
const MODEL_IDS: readonly ComposerModelId[] = [
  'minimax-hailuo-02',
  'kling-2.5-turbo-pro',
]
const PRESETS: readonly ComposerPreset[] = ['fast', 'quality']
const DURATIONS: readonly ComposerVideoDuration[] = [5, 6, 10]

function readStringField(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key]

  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumberField(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parsePayload(value: unknown): ComposerJobTokenPayload | null {
  if (!isRecord(value) || value.v !== 1) {
    return null
  }

  const endpointId = readStringField(value, 'endpointId')
  const requestId = readStringField(value, 'requestId')
  const statusUrl = readStringField(value, 'statusUrl')
  const responseUrl = readStringField(value, 'responseUrl')
  const cancelUrl = readStringField(value, 'cancelUrl')
  const modelId = readStringField(value, 'modelId')
  const preset = readStringField(value, 'preset')
  const durationSeconds = readNumberField(value, 'durationSeconds')
  const promptHash = readStringField(value, 'promptHash')
  const posterUrl = readStringField(value, 'posterUrl')
  const createdAt = readNumberField(value, 'createdAt')
  const expiresAt = readNumberField(value, 'expiresAt')
  const referenceValue = value.referenceUrl

  if (
    !endpointId
    || !isComposerEndpointId(endpointId)
    || !requestId
    || !statusUrl
    || !responseUrl
    || !cancelUrl
    || !modelId
    || !(MODEL_IDS as readonly string[]).includes(modelId)
    || !preset
    || !(PRESETS as readonly string[]).includes(preset)
    || durationSeconds === null
    || !(DURATIONS as readonly number[]).includes(durationSeconds)
    || !promptHash
    || !posterUrl
    || createdAt === null
    || expiresAt === null
    || expiresAt <= createdAt
    || !(referenceValue === null || typeof referenceValue === 'string')
  ) {
    return null
  }

  return {
    v: 1,
    endpointId,
    requestId,
    statusUrl,
    responseUrl,
    cancelUrl,
    modelId: modelId as ComposerModelId,
    preset: preset as ComposerPreset,
    durationSeconds: durationSeconds as ComposerVideoDuration,
    promptHash,
    posterUrl,
    referenceUrl: referenceValue,
    createdAt,
    expiresAt,
  }
}

export class HmacJobTokenService implements JobTokenService {
  private readonly secret: string
  private readonly now: () => number

  constructor(options: JobTokenServiceOptions) {
    this.secret = options.secret
    this.now = options.now ?? Date.now
  }

  create(input: ComposerJobTokenInput): string {
    const payload: ComposerJobTokenPayload = { v: 1, ...input }
    const payloadB64 = encodeBase64Url(JSON.stringify(payload))
    const signature = this.sign(payloadB64)

    return `v1.${payloadB64}.${signature}`
  }

  verify(token: string): ComposerJobTokenPayload {
    if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
      throw new ComposerError('job-not-found')
    }

    const parts = token.split('.')

    if (parts.length !== 3 || parts[0] !== 'v1') {
      throw new ComposerError('job-not-found')
    }

    const payloadB64 = parts[1]
    const signature = parts[2]

    if (!payloadB64 || !signature) {
      throw new ComposerError('job-not-found')
    }

    if (!verifyHmacBase64Url(this.secret, `v1.${payloadB64}`, signature)) {
      throw new ComposerError('job-not-found')
    }

    let decoded: unknown

    try {
      decoded = JSON.parse(decodeBase64Url(payloadB64))
    } catch {
      throw new ComposerError('job-not-found')
    }

    const payload = parsePayload(decoded)

    if (!payload) {
      throw new ComposerError('job-not-found')
    }

    if (payload.expiresAt <= this.now()) {
      throw new ComposerError('job-expired')
    }

    return payload
  }

  private sign(payloadB64: string): string {
    return signHmacBase64Url(this.secret, `v1.${payloadB64}`)
  }
}

export function createJobTokenService(options: JobTokenServiceOptions): JobTokenService {
  return new HmacJobTokenService(options)
}
