// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposerError, isComposerError } from '../../../server/shared/errors'
import type { FalBinaryUploadRequest, FalHttpClient, FalHttpRequest } from '../../../server/fal/http-client'
import {
  NativeMediaStorage,
  createMediaStorage,
} from '../../../server/fal/media-storage'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')
const STORAGE = 'https://rest.fal.ai'
const created: string[] = []

async function tempFile(bytes = 8): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'story-media-storage-test-'))
  created.push(directory)
  const path = join(directory, 'story-final.mp4')
  await writeFile(path, Buffer.alloc(bytes, 1))

  return path
}

interface ClientHarness {
  readonly client: FalHttpClient
  readonly request: ReturnType<typeof vi.fn>
  readonly uploadBinary: ReturnType<typeof vi.fn>
}

function fakeClient(options: {
  readonly data?: unknown
  readonly withUpload?: boolean
  readonly requestError?: Error
  readonly uploadError?: Error
} = {}): ClientHarness {
  const request = vi.fn(async (_request: FalHttpRequest) => {
    if (options.requestError) throw options.requestError

    return {
      status: 200,
      data: options.data ?? {
        upload_url: 'https://v3.fal.media/files/test/upload?signature=abc',
        file_url: 'https://v3.fal.media/files/test/final.mp4',
      },
      headers: new Headers(),
    }
  })
  const uploadBinary = vi.fn(async (request: FalBinaryUploadRequest) => {
    if (options.uploadError) throw options.uploadError
    const body = request.body as { destroy?: () => void }
    body.destroy?.()

    return { status: 200, data: null, headers: new Headers() }
  })

  const client = {
    request,
    ...(options.withUpload === false ? {} : { uploadBinary }),
  } as unknown as FalHttpClient

  return { client, request, uploadBinary }
}

function storage(client: FalHttpClient, maxBytes?: number): NativeMediaStorage {
  return new NativeMediaStorage({
    client,
    storageBaseUrl: STORAGE,
    now: () => NOW,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  })
}

function input(filePath: string, overrides: Partial<{
  fileName: string
  contentType: 'video/mp4'
  lifecycleSeconds: number
}> = {}) {
  return {
    filePath,
    fileName: overrides.fileName ?? 'story-storytest0001-abcdef123456.mp4',
    contentType: overrides.contentType ?? 'video/mp4' as const,
    lifecycleSeconds: overrides.lifecycleSeconds ?? 86_400,
  }
}

async function captureComposerError(run: () => Promise<unknown>): Promise<ComposerError> {
  try {
    await run()
  } catch (error) {
    expect(isComposerError(error)).toBe(true)

    return error as ComposerError
  }

  throw new Error('expected a ComposerError')
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('NativeMediaStorage.uploadFile', () => {
  it('initiates the upload with video/mp4 and the exact lifecycle header', async () => {
    const { client, request } = fakeClient()
    const filePath = await tempFile()

    await storage(client).uploadFile(input(filePath))

    expect(request).toHaveBeenCalledTimes(1)

    const call = request.mock.calls[0]![0] as FalHttpRequest

    expect(call.url).toBe(`${STORAGE}/storage/upload/initiate?storage_type=fal-cdn-v3`)
    expect(call.method).toBe('POST')
    expect(call.timeoutMs).toBe(15_000)
    expect(call.body).toEqual({
      content_type: 'video/mp4',
      file_name: 'story-storytest0001-abcdef123456.mp4',
    })
    expect(call.headers).toEqual({
      'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: 86_400 }),
    })
    expect(call.headers).not.toHaveProperty('Authorization')
    expect(call.headers).not.toHaveProperty('Content-Type')
  })

  it('uploads the binary without authorization and returns the validated URL', async () => {
    const { client, uploadBinary } = fakeClient()
    const filePath = await tempFile()

    const result = await storage(client).uploadFile(input(filePath))

    expect(uploadBinary).toHaveBeenCalledTimes(1)

    const call = uploadBinary.mock.calls[0]![0] as FalBinaryUploadRequest

    expect(call.url).toBe('https://v3.fal.media/files/test/upload?signature=abc')
    expect(call.contentType).toBe('video/mp4')
    expect(call.timeoutMs).toBe(120_000)
    expect(call).not.toHaveProperty('headers')
    expect(call).not.toHaveProperty('authorization')

    expect(result).toEqual({
      fileUrl: 'https://v3.fal.media/files/test/final.mp4',
      expiresAt: new Date(NOW + 86_400_000).toISOString(),
    })
  })

  it('uses the provided lifecycle for the returned expiry', async () => {
    const { client } = fakeClient()
    const filePath = await tempFile()

    const result = await storage(client).uploadFile(input(filePath, { lifecycleSeconds: 3_600 }))

    expect(result.expiresAt).toBe(new Date(NOW + 3_600_000).toISOString())
  })

  it('rejects an invalid generated file name before calling the provider', async () => {
    const { client, request } = fakeClient()
    const filePath = await tempFile()

    for (const fileName of ['../escape.mp4', 'a/b.mp4', '-leading.mp4', '']) {
      const error = await captureComposerError(() => storage(client).uploadFile(
        input(filePath, { fileName }),
      ))

      expect(error.code).toBe('internal-error')
    }

    expect(request).not.toHaveBeenCalled()
  })

  it('rejects an empty file and a file above the max size', async () => {
    const { client, request } = fakeClient()
    const empty = await tempFile(0)
    const large = await tempFile(16)

    expect((await captureComposerError(() => storage(client).uploadFile(input(empty)))).code)
      .toBe('provider-rejected')
    expect((await captureComposerError(() => storage(client, 4).uploadFile(input(large)))).code)
      .toBe('payload-too-large')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects a missing file', async () => {
    const { client } = fakeClient()

    await expect(storage(client).uploadFile(input('/definitely/missing.mp4')))
      .rejects.toThrow()
  })

  it.each([
    ['missing upload url', { file_url: 'https://v3.fal.media/files/test/final.mp4' }],
    ['missing file url', { upload_url: 'https://v3.fal.media/files/test/upload' }],
    ['non-object payload', 'not-an-object'],
    ['http upload url', { upload_url: 'http://v3.fal.media/upload', file_url: 'https://v3.fal.media/files/test/final.mp4' }],
    ['non-allowlisted file url', { upload_url: 'https://v3.fal.media/upload', file_url: 'https://evil.example/final.mp4' }],
  ])('rejects an invalid provider response (%s)', async (_label, data) => {
    const { client, uploadBinary } = fakeClient({ data })
    const filePath = await tempFile()

    const error = await captureComposerError(() => storage(client).uploadFile(input(filePath)))

    expect(error.code).toBe('provider-invalid-output')
    expect(uploadBinary).not.toHaveBeenCalled()
  })

  it('fails with provider-error when the client cannot upload binaries', async () => {
    const { client } = fakeClient({ withUpload: false })
    const filePath = await tempFile()

    expect((await captureComposerError(() => storage(client).uploadFile(input(filePath)))).code)
      .toBe('provider-error')
  })

  it('propagates a ComposerError from the initiate call without wrapping', async () => {
    const original = new ComposerError('provider-busy', { retryAfterSeconds: 5 })
    const { client } = fakeClient({ requestError: original })
    const filePath = await tempFile()

    const error = await captureComposerError(() => storage(client).uploadFile(input(filePath)))

    expect(error.code).toBe('provider-busy')
    expect(error.retryAfterSeconds).toBe(5)
  })

  it('propagates an upload failure', async () => {
    const { client } = fakeClient({ uploadError: new ComposerError('provider-timeout') })
    const filePath = await tempFile()

    expect((await captureComposerError(() => storage(client).uploadFile(input(filePath)))).code)
      .toBe('provider-timeout')
  })

  it('creates a storage through the factory', () => {
    const { client } = fakeClient()

    expect(createMediaStorage({ client, storageBaseUrl: STORAGE }))
      .toBeInstanceOf(NativeMediaStorage)
  })
})
