import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { ComposerError } from '../shared/errors'
import type { FalHttpClient } from './http-client'
import {
  assertFalMediaUrl,
  assertSecureUploadUrl,
  isRecord,
  readString,
} from './types'

const LIFECYCLE_HEADER = 'X-Fal-Object-Lifecycle'
const DEFAULT_MAX_BYTES = 209_715_200
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/

export interface MediaStorageUploadInput {
  readonly filePath: string
  readonly fileName: string
  readonly contentType: 'video/mp4'
  readonly lifecycleSeconds: number
}

export interface MediaStorageResult {
  readonly fileUrl: string
  readonly expiresAt: string
}

export interface MediaStorage {
  uploadFile(input: MediaStorageUploadInput): Promise<MediaStorageResult>
}

export interface MediaStorageOptions {
  readonly client: FalHttpClient
  readonly storageBaseUrl: string
  readonly now?: () => number
  readonly maxBytes?: number
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export class NativeMediaStorage implements MediaStorage {
  private readonly client: FalHttpClient
  private readonly storageBaseUrl: string
  private readonly now: () => number
  private readonly maxBytes: number

  constructor(options: MediaStorageOptions) {
    this.client = options.client
    this.storageBaseUrl = trimTrailingSlash(options.storageBaseUrl)
    this.now = options.now ?? Date.now
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  }

  async uploadFile(input: MediaStorageUploadInput): Promise<MediaStorageResult> {
    if (!FILE_NAME_PATTERN.test(input.fileName)) {
      throw new ComposerError('internal-error')
    }

    const fileStat = await stat(input.filePath)

    if (!fileStat.isFile() || fileStat.size <= 0) {
      throw new ComposerError('provider-rejected')
    }

    if (fileStat.size > this.maxBytes) {
      throw new ComposerError('payload-too-large')
    }

    const response = await this.client.request<unknown>({
      url: `${this.storageBaseUrl}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      method: 'POST',
      headers: {
        [LIFECYCLE_HEADER]: JSON.stringify({
          expiration_duration_seconds: input.lifecycleSeconds,
        }),
      },
      body: {
        content_type: input.contentType,
        file_name: input.fileName,
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

    if (!this.client.uploadBinary) {
      throw new ComposerError('provider-error')
    }

    await this.client.uploadBinary({
      url: safeUploadUrl,
      body: createReadStream(input.filePath),
      contentType: input.contentType,
      timeoutMs: 120_000,
    })

    return {
      fileUrl: safeFileUrl,
      expiresAt: new Date(
        this.now() + input.lifecycleSeconds * 1000,
      ).toISOString(),
    }
  }
}

export function createMediaStorage(options: MediaStorageOptions): MediaStorage {
  return new NativeMediaStorage(options)
}
