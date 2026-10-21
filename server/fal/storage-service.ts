import { randomBytes } from 'node:crypto'
import type {
  ComposerImageMimeType,
  ComposerReferenceUploadRequest,
  ComposerUploadTicket,
} from '~/models/composer'
import { ComposerError } from '../shared/errors'
import {
  assertFalMediaUrl,
  assertSecureUploadUrl,
  isRecord,
  readString,
} from './types'
import type { FalHttpClient } from './http-client'

const DEFAULT_LIFECYCLE_SECONDS = 3_600
const DEFAULT_FILE_PREFIX = 'composer-ref-'
const LIFECYCLE_HEADER = 'X-Fal-Object-Lifecycle'

const EXTENSIONS: Readonly<Record<ComposerImageMimeType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export interface FalStorageService {
  initiate(request: ComposerReferenceUploadRequest): Promise<ComposerUploadTicket>
}

export interface FalStorageServiceOptions {
  readonly client: FalHttpClient
  readonly storageBaseUrl: string
  readonly now?: () => number
  readonly randomHex?: (bytes: number) => string
  /** Additive: filename prefix. Defaults to the Composer prefix. */
  readonly filePrefix?: string
  /** Additive: object lifecycle in seconds. Defaults to 3600. */
  readonly lifecycleSeconds?: number
}

function defaultRandomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export class NativeFalStorageService implements FalStorageService {
  private readonly client: FalHttpClient
  private readonly storageBaseUrl: string
  private readonly now: () => number
  private readonly randomHex: (bytes: number) => string
  private readonly filePrefix: string
  private readonly lifecycleSeconds: number

  constructor(options: FalStorageServiceOptions) {
    this.client = options.client
    this.storageBaseUrl = trimTrailingSlash(options.storageBaseUrl)
    this.now = options.now ?? Date.now
    this.randomHex = options.randomHex ?? defaultRandomHex
    this.filePrefix = options.filePrefix ?? DEFAULT_FILE_PREFIX
    this.lifecycleSeconds = options.lifecycleSeconds ?? DEFAULT_LIFECYCLE_SECONDS
  }

  async initiate(
    request: ComposerReferenceUploadRequest,
  ): Promise<ComposerUploadTicket> {
    const fileName = `${this.filePrefix}${this.randomHex(12)}.${EXTENSIONS[request.contentType]}`

    const response = await this.client.request<unknown>({
      url: `${this.storageBaseUrl}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      method: 'POST',
      headers: {
        [LIFECYCLE_HEADER]: JSON.stringify({
          expiration_duration_seconds: this.lifecycleSeconds,
        }),
      },
      body: {
        content_type: request.contentType,
        file_name: fileName,
      },
      timeoutMs: 15_000,
    })

    if (!isRecord(response.data)) {
      throw new ComposerError('provider-invalid-output')
    }

    const uploadUrl = readString(response.data, 'upload_url')
    const fileUrl = readString(response.data, 'file_url')

    if (!uploadUrl || !fileUrl) {
      throw new ComposerError('provider-invalid-output')
    }

    let safeUploadUrl: string
    let safeFileUrl: string

    try {
      safeUploadUrl = assertSecureUploadUrl(uploadUrl)
      safeFileUrl = assertFalMediaUrl(fileUrl)
    } catch {
      throw new ComposerError('provider-invalid-output')
    }

    const expiresAt = new Date(
      this.now() + this.lifecycleSeconds * 1000,
    ).toISOString()

    return {
      uploadUrl: safeUploadUrl,
      fileUrl: safeFileUrl,
      expiresAt,
      uploadHeaders: {
        'Content-Type': request.contentType,
      },
    }
  }
}

export function createFalStorageService(
  options: FalStorageServiceOptions,
): FalStorageService {
  return new NativeFalStorageService(options)
}
