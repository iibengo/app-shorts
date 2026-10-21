// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerError } from '../../../server/shared/errors'
import { createFalStorageService } from '../../../server/fal/storage-service'
import type { FalHttpClient, FalHttpRequest } from '../../../server/fal/http-client'
import { FakeStoryRepository } from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: uploadStoryReference } = await import(
  '../../../server/api/story/uploads.post'
)
const { default: createStory } = await import('../../../server/api/story/index.post')

const UPLOAD_URL = 'https://v3.fal.media/files/test/upload?signature=abc'
const FILE_URL = 'https://v3.fal.media/files/test/story-ref-abcdef.webp'

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    fileName: 'actor.webp',
    contentType: 'image/webp',
    sizeBytes: 482_133,
    ...overrides,
  }
}

function sessionOf(response: { setCookie: string | null }): string | undefined {
  return response.setCookie?.match(/story_sid=([^;]+)/)?.[1]
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

function fakeFalClient(options: {
  readonly data?: unknown
  readonly error?: Error
} = {}) {
  const request = vi.fn(async (_request: FalHttpRequest) => {
    if (options.error) throw options.error

    return {
      status: 200,
      data: options.data ?? { upload_url: UPLOAD_URL, file_url: FILE_URL },
      headers: new Headers(),
    }
  })

  return { client: { request } as unknown as FalHttpClient, request }
}

function setup(options: {
  readonly hasFalKey?: boolean
  readonly uploadLimit?: number
  readonly clientData?: unknown
  readonly clientError?: Error
  readonly storageError?: Error
} = {}) {
  const fal = fakeFalClient({ data: options.clientData, error: options.clientError })
  const storage = createFalStorageService({
    client: fal.client,
    storageBaseUrl: 'https://rest.fal.ai',
    filePrefix: 'story-ref-',
    lifecycleSeconds: 3_600,
    randomHex: () => 'a'.repeat(24),
  })
  const runtime = makeStoryRuntime({
    repository: new FakeStoryRepository(),
    hasFalKey: options.hasFalKey ?? true,
    storage: options.storageError
      ? {
          async initiate() {
            throw options.storageError!
          },
        }
      : storage,
    ...(options.uploadLimit ? { rateLimit: { uploadLimit: options.uploadLimit } } : {}),
  })

  return {
    runtime,
    fal,
    post(
      payload: unknown,
      callOptions: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime'> = {},
    ) {
      return callStoryRoute(uploadStoryReference, {
        method: 'POST',
        path: '/api/story/uploads',
        runtime,
        body: payload,
        ...callOptions,
      })
    },
  }
}

describe('POST /api/story/uploads success', () => {
  it('returns a signed ticket with the Story prefix and one hour lifecycle', async () => {
    const { post, fal } = setup()
    const before = Date.now()

    const response = await post(validBody())
    const after = Date.now()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')

    const ticket = response.body as {
      uploadUrl: string
      fileUrl: string
      expiresAt: string
      uploadHeaders: Record<string, string>
    }

    expect(ticket.uploadUrl).toBe(UPLOAD_URL)
    expect(ticket.fileUrl).toBe(FILE_URL)
    expect(ticket.uploadHeaders).toEqual({ 'Content-Type': 'image/webp' })

    const expiresAt = Date.parse(ticket.expiresAt)

    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000)
    expect(expiresAt).toBeLessThanOrEqual(after + 3_600_000)

    expect(fal.request).toHaveBeenCalledTimes(1)

    const request = fal.request.mock.calls[0]![0] as FalHttpRequest

    expect(request.headers).toEqual({
      'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: 3_600 }),
    })
    expect(request.body).toEqual({
      content_type: 'image/webp',
      file_name: `story-ref-${'a'.repeat(24)}.webp`,
    })
    expect(JSON.stringify(request.headers)).not.toContain('Authorization')
  })

  it('creates the session cookie on the first ticket', async () => {
    const { post } = setup()

    const response = await post(validBody())

    expect(response.setCookie).toContain('story_sid=')
    expect(sessionOf(response)).toMatch(/^[A-Za-z0-9_-]{22,128}$/)
    expect(response.setCookie).toContain('HttpOnly')
  })

  it('does not proxy binary data through Nitro', async () => {
    const { post } = setup()

    const response = await post(validBody())

    expect(response.body).toEqual({
      uploadUrl: expect.any(String),
      fileUrl: expect.any(String),
      expiresAt: expect.any(String),
      uploadHeaders: { 'Content-Type': 'image/webp' },
    })
    expect((response.body as { uploadHeaders: unknown }).uploadHeaders).not.toHaveProperty('Authorization')
  })

  it('replays the same idempotency key without initiating twice', async () => {
    const { post, fal } = setup()
    const payload = validBody()

    const first = await post(payload, { idempotencyKey: 'idem-key-12345678' })
    const second = await post(payload, {
      idempotencyKey: 'idem-key-12345678',
      cookieSessionId: sessionOf(first),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(fal.request).toHaveBeenCalledTimes(1)
  })

  it('rejects the same idempotency key with a different body', async () => {
    const { post } = setup()

    const first = await post(validBody(), { idempotencyKey: 'idem-key-12345678' })
    const conflict = await post(
      validBody({ fileName: 'other.png', contentType: 'image/png' }),
      { idempotencyKey: 'idem-key-12345678', cookieSessionId: sessionOf(first) },
    )

    expect(conflict.status).toBe(409)
    expect(errorCode(conflict)).toBe('idempotency-conflict')
  })
})

describe('POST /api/story/uploads validation', () => {
  it.each([
    [{ fileName: 'a.webp', contentType: 'image/webp', sizeBytes: 0 }, 'reference-empty'],
    [{ fileName: 'a.webp', contentType: 'image/webp', sizeBytes: 8_388_609 }, 'reference-too-large'],
    [{ fileName: 'a.gif', contentType: 'image/gif', sizeBytes: 100 }, 'unsupported-reference-type'],
    [{ fileName: 'a.svg', contentType: 'image/svg+xml', sizeBytes: 100 }, 'unsupported-reference-type'],
    [{ fileName: '../escape.webp', contentType: 'image/webp', sizeBytes: 100 }, 'invalid-file-name'],
    [{ fileName: 'a/b.webp', contentType: 'image/webp', sizeBytes: 100 }, 'invalid-file-name'],
    [{ fileName: 'a.webp', contentType: 'image/webp', sizeBytes: 100, fileUrl: FILE_URL }, 'invalid-request'],
  ])('rejects %# with the stable code', async (payload, code) => {
    const { post, fal } = setup()

    const response = await post(payload)

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe(code)
    expect(fal.request).not.toHaveBeenCalled()
  })

  it('accepts exactly 8 MiB and normalizes an uppercase content type', async () => {
    const { post } = setup()

    const response = await post(validBody({
      contentType: 'IMAGE/WEBP; charset=binary',
      sizeBytes: 8_388_608,
    }))

    expect(response.status).toBe(200)
  })

  it('rejects non-JSON content types with 415', async () => {
    const { post } = setup()

    const response = await post(validBody(), { contentType: 'multipart/form-data' })

    expect(response.status).toBe(415)
    expect(errorCode(response)).toBe('unsupported-media-type')
  })

  it('rejects bodies larger than 4 KiB with 413', async () => {
    const { post } = setup()

    const response = await post(validBody({ fileName: 'a'.repeat(5_000) + '.webp' }))

    expect(response.status).toBe(413)
    expect(errorCode(response)).toBe('payload-too-large')
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post(validBody(), { origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })

  it('rejects an invalid idempotency key with 400', async () => {
    const { post } = setup()

    const response = await post(validBody(), { idempotencyKey: 'short' })

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('invalid-request')
  })
})

describe('POST /api/story/uploads limits and provider errors', () => {
  it('returns 429 rate-limited per session', async () => {
    const { post } = setup({ uploadLimit: 1 })

    const first = await post(validBody())
    const second = await post(validBody(), { cookieSessionId: sessionOf(first) })

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('returns 503 story-not-configured without a Fal key', async () => {
    const { post } = setup({ hasFalKey: false })

    const response = await post(validBody())

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('story-not-configured')
  })

  it.each([
    [new ComposerError('provider-error'), 502, 'provider-error'],
    [new ComposerError('provider-timeout'), 504, 'provider-timeout'],
    [new ComposerError('provider-busy', { retryAfterSeconds: 7 }), 503, 'provider-busy'],
    [new ComposerError('ai-not-configured'), 503, 'story-not-configured'],
    [new ComposerError('content-blocked'), 422, 'content-blocked'],
  ])('maps a provider failure without leaking details', async (error, status, code) => {
    const { post } = setup({ storageError: error })

    const response = await post(validBody())

    expect(response.status).toBe(status)
    expect(errorCode(response)).toBe(code)
    expect(JSON.stringify(response.body)).not.toContain('raw provider')
    expect(JSON.stringify(response.body)).not.toContain('Authorization')

    if (code === 'provider-busy') {
      expect(Number(response.headers.get('retry-after'))).toBe(7)
    }
  })

  it('maps an invalid initiate payload to 502 provider-invalid-output', async () => {
    const { post } = setup({ clientData: { upload_url: UPLOAD_URL } })

    const response = await post(validBody())

    expect(response.status).toBe(502)
    expect(errorCode(response)).toBe('provider-invalid-output')
  })
})

describe('POST /api/story/uploads ownership isolation', () => {
  it('isolates idempotency caches by session', async () => {
    const { post } = setup()
    const payload = validBody()
    const key = 'idem-key-12345678'

    const first = await post(payload, { idempotencyKey: key })
    const other = await post(payload, {
      idempotencyKey: key,
      cookieSessionId: 'other-session-abcdefghij',
    })

    expect(first.status).toBe(200)
    expect(other.status).toBe(200)
  })

  it('shares the creation flow cookie with the upload route', async () => {
    const storage = createFalStorageService({
      client: fakeFalClient().client,
      storageBaseUrl: 'https://rest.fal.ai',
      filePrefix: 'story-ref-',
      lifecycleSeconds: 3_600,
    })
    const runtime = makeStoryRuntime({ storage })

    const created = await callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: {
        premise: 'Una repostera descubre que sus postres pueden predecir el futuro.',
        sceneCount: 5,
        preset: 'fast',
        referenceUrl: null,
        referenceExpiresAt: null,
      },
    })

    expect(created.status).toBe(201)

    const uploaded = await callStoryRoute(uploadStoryReference, {
      method: 'POST',
      path: '/api/story/uploads',
      runtime,
      body: validBody(),
      cookieSessionId: sessionOf(created),
    })

    expect(uploaded.status).toBe(200)
    expect(uploaded.setCookie).toBeNull()
  })
})
