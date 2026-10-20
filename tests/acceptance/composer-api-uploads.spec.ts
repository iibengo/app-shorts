// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerUploadTicket } from '~/models/composer'
import { callHandler } from '../helpers/api-handler'
import { startFalStub } from '../helpers/fal-stub'

const nuxtMocks = vi.hoisted(() => ({ config: null as unknown }))

vi.mock('#app/nuxt', () => ({
  useRuntimeConfig: () => nuxtMocks.config,
}))

const TEST_KEY = 'test-key'
const TEST_SECRET = 'test-secret-with-at-least-32-characters'

process.env.NUXT_FAL_KEY = TEST_KEY
process.env.NUXT_COMPOSER_JOB_SECRET = TEST_SECRET

const stub = await startFalStub()
process.env.NUXT_COMPOSER_FAL_QUEUE_BASE_URL = stub.baseUrl
process.env.NUXT_COMPOSER_FAL_RUN_BASE_URL = stub.baseUrl
process.env.NUXT_COMPOSER_FAL_STORAGE_BASE_URL = stub.baseUrl

const runtimeConfig = {
  falKey: TEST_KEY,
  composer: {
    jobSecret: TEST_SECRET,
    generateLimit: 2,
    generateWindowMs: 600_000,
    uploadLimit: 5,
    uploadWindowMs: 600_000,
    maxActiveJobs: 1,
    maxGlobalJobs: 3,
    dailyGenerationBudget: 1_000,
    jobTtlMs: 3_600_000,
    keyframeTimeoutMs: 45_000,
    pollAfterMs: 2_000,
    falQueueBaseUrl: stub.baseUrl,
    falRunBaseUrl: stub.baseUrl,
    falStorageBaseUrl: stub.baseUrl,
  },
}

nuxtMocks.config = runtimeConfig
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: uploadsHandler } = await import(
  '../../../server/api/composer/uploads.post'
)

afterAll(async () => {
  await stub.close()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  stub.reset()
})

const VALID_UPLOAD = {
  fileName: 'look-primavera.webp',
  contentType: 'image/webp',
  sizeBytes: 482_133,
}

type UploadBody = ComposerUploadTicket & {
  error?: { code: string; message: string; retryable: boolean; retryAfterSeconds?: number }
}

function uploads(
  body: unknown,
  options: {
    readonly cookie?: string
    readonly key?: string
    readonly origin?: string
    readonly remoteAddress?: string
  } = {},
) {
  const headers: Record<string, string> = {
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.key ? { 'idempotency-key': options.key } : {}),
    ...(options.origin ? { origin: options.origin, host: 'localhost' } : {}),
  }

  return callHandler<UploadBody>(uploadsHandler, {
    method: 'POST',
    path: '/api/composer/uploads',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    remoteAddress: options.remoteAddress,
  })
}

describe('POST /api/composer/uploads', () => {
  it('returns a signed ticket with only the PUT headers and no key', async () => {
    const response = await uploads(VALID_UPLOAD)
    const ticket = response.body

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(String(response.headers.get('set-cookie'))).toContain('composer_sid=')

    expect(ticket).toEqual({
      uploadUrl: expect.stringMatching(/^https:\/\/v3\.fal\.media\//),
      fileUrl: expect.stringMatching(/^https:\/\/v3\.fal\.media\//),
      expiresAt: expect.any(String),
      uploadHeaders: { 'Content-Type': 'image/webp' },
    })
    expect(Object.keys(ticket.uploadHeaders)).toEqual(['Content-Type'])
    expect(JSON.stringify(ticket.uploadHeaders)).not.toMatch(/authorization|cookie/i)
    expect(JSON.stringify(ticket)).not.toContain(TEST_KEY)
    expect(JSON.stringify(ticket)).not.toContain('Authorization')

    const expiresIn = Date.parse(ticket.expiresAt) - Date.now()
    expect(expiresIn).toBeGreaterThan(3_500_000)
    expect(expiresIn).toBeLessThanOrEqual(3_600_000)
  })

  it('initiates the upload with the lifecycle header and a generated file name', async () => {
    await uploads(VALID_UPLOAD)

    const initiate = stub.requests.find((request) =>
      request.path.startsWith('/storage/upload/initiate'),
    )
    expect(initiate, 'missing storage initiate call').toBeDefined()
    expect(initiate?.method).toBe('POST')
    expect(initiate?.path).toContain('storage_type=fal-cdn-v3')
    expect(initiate?.authorization).toBe(`Key ${TEST_KEY}`)
    expect(initiate?.headers['x-fal-object-lifecycle']).toBe(
      '{"expiration_duration_seconds":3600}',
    )
    expect(initiate?.body).toEqual({
      content_type: 'image/webp',
      file_name: expect.stringMatching(/^composer-ref-[0-9a-f]{24}\.webp$/),
    })
    expect(JSON.stringify(initiate?.body)).not.toContain('look-primavera.webp')
  })

  it('rejects multipart and binary uploads with 415', async () => {
    const response = await callHandler(uploadsHandler, {
      method: 'POST',
      path: '/api/composer/uploads',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: 'binary',
    })

    expect(response.status).toBe(415)
    expect(response.body).toEqual({
      error: {
        code: 'unsupported-media-type',
        message: 'El formato de la solicitud no es válido.',
        retryable: false,
      },
    })
    expect(stub.requests).toHaveLength(0)
  })

  it.each([
    [{ ...VALID_UPLOAD, fileName: '../escape.webp' }, 'invalid-file-name', 'El nombre del archivo no es válido.'],
    [{ ...VALID_UPLOAD, sizeBytes: 0 }, 'reference-empty', 'El archivo está vacío.'],
    [{ ...VALID_UPLOAD, sizeBytes: 8_388_609 }, 'reference-too-large', 'La imagen supera el máximo de 8 MB.'],
    [{ ...VALID_UPLOAD, contentType: 'image/gif' }, 'unsupported-reference-type', 'Formato no admitido. Usa PNG, JPG o WebP.'],
    [{ ...VALID_UPLOAD, model: 'flux' }, 'invalid-request', 'La solicitud no es válida.'],
  ] as const)('rejects invalid bodies with 400', async (body, code, message) => {
    const response = await uploads(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code, message, retryable: false },
    })
  })

  it('rejects bodies larger than 4 KiB with 413', async () => {
    const response = await uploads({
      ...VALID_UPLOAD,
      fileName: 'a'.repeat(5_000),
    })

    expect(response.status).toBe(413)
    expect(response.body).toMatchObject({
      error: { code: 'payload-too-large', retryable: false },
    })
  })

  it('rejects a cross-origin request with 403', async () => {
    const response = await uploads(VALID_UPLOAD, {
      origin: 'https://evil.example',
    })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      error: { code: 'cross-origin-request', retryable: false },
    })
  })

  it('accepts same-origin requests and rejects non-JSON content types with 415', async () => {
    const sameOrigin = await uploads(VALID_UPLOAD, {
      origin: 'http://localhost',
    })
    expect(sameOrigin.status).toBe(200)

    const text = await callHandler(uploadsHandler, {
      method: 'POST',
      path: '/api/composer/uploads',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(VALID_UPLOAD),
    })
    expect(text.status).toBe(415)
  })

  it('idempotently returns the same ticket without calling Fal twice', async () => {
    const key = 'upload-idem-12345678'
    const first = await uploads(VALID_UPLOAD, { key })
    const initiatesAfterFirst = stub.requests.filter((request) =>
      request.path.startsWith('/storage/upload/initiate'),
    ).length
    const second = await uploads(VALID_UPLOAD, {
      key,
      cookie: first.cookie ?? undefined,
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(stub.requests.filter((request) =>
      request.path.startsWith('/storage/upload/initiate'),
    )).toHaveLength(initiatesAfterFirst)
  })

  it('rejects the same idempotency key with a different body', async () => {
    const key = 'upload-conflict-12345678'
    const first = await uploads(VALID_UPLOAD, { key })
    const conflict = await uploads({
      ...VALID_UPLOAD,
      fileName: 'otra.webp',
    }, { key, cookie: first.cookie ?? undefined })

    expect(conflict.status).toBe(409)
    expect(conflict.body).toMatchObject({
      error: { code: 'idempotency-conflict', retryable: false },
    })
  })

  it('rate limits the sixth ticket in a session with Retry-After', async () => {
    let cookie: string | undefined

    for (let index = 0; index < 5; index += 1) {
      const response = await callHandler<UploadBody>(uploadsHandler, {
        method: 'POST',
        path: '/api/composer/uploads',
        headers: {
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ ...VALID_UPLOAD, fileName: `foto-${index}.webp` }),
        remoteAddress: '198.51.100.21',
      })
      expect(response.status, `ticket ${index}`).toBe(200)
      cookie = response.cookie ?? cookie
    }

    const limited = await callHandler<UploadBody>(uploadsHandler, {
      method: 'POST',
      path: '/api/composer/uploads',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(VALID_UPLOAD),
      remoteAddress: '198.51.100.21',
    })

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.body).toEqual({
      error: {
        code: 'rate-limited',
        message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
        retryable: true,
        retryAfterSeconds: expect.any(Number),
      },
    })
  })

  it('returns 503 ai-not-configured without a Fal key', async () => {
    const originalKey = runtimeConfig.falKey
    runtimeConfig.falKey = ''

    try {
      const response = await uploads(VALID_UPLOAD)

      expect(response.status).toBe(503)
      expect(response.body).toEqual({
        error: {
          code: 'ai-not-configured',
          message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
          retryable: false,
        },
      })
      expect(JSON.stringify(response.body)).not.toContain('NUXT_FAL_KEY')
      expect(stub.requests).toHaveLength(0)
    } finally {
      runtimeConfig.falKey = originalKey
    }
  })

  it('never echoes the Fal key in any response', async () => {
    const response = await uploads(VALID_UPLOAD)

    expect(JSON.stringify(response.body)).not.toContain(TEST_KEY)
    expect(JSON.stringify(response.body)).not.toContain('NUXT_FAL_KEY')
    expect(JSON.stringify(response.body)).not.toContain('Authorization')
  })
})
