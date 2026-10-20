// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerJob } from '~/models/composer'
import { callHandler } from '../helpers/api-handler'
import { startFalStub } from '../helpers/fal-stub'

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
    maxGlobalJobs: 100,
    dailyGenerationBudget: 1_000,
    jobTtlMs: 3_600_000,
    keyframeTimeoutMs: 100,
    pollAfterMs: 2_000,
    falQueueBaseUrl: stub.baseUrl,
    falRunBaseUrl: stub.baseUrl,
    falStorageBaseUrl: stub.baseUrl,
  },
}

const nuxtMocks = vi.hoisted(() => ({ config: null as unknown }))
vi.mock('#app/nuxt', () => ({ useRuntimeConfig: () => nuxtMocks.config }))
nuxtMocks.config = runtimeConfig
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: generateHandler } = await import(
  '../../../server/api/composer/generate.post'
)
const { default: cancelHandler } = await import(
  '../../../server/api/composer/jobs/[id]/cancel.post'
)

afterAll(async () => {
  await stub.close()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  stub.reset()
})

const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

type ErrorBody = {
  error: {
    code: string
    message: string
    retryable: boolean
    retryAfterSeconds?: number
  }
}

type JobOrError = ComposerJob & { error?: ErrorBody['error'] }

interface CallOptions {
  readonly key?: string
  readonly cookie?: string
  readonly origin?: string
  readonly remoteAddress?: string
}

function generate(body: unknown, options: CallOptions = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.key ? { 'idempotency-key': options.key } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.origin ? { origin: options.origin, host: 'localhost' } : {}),
  }

  return callHandler<JobOrError>(generateHandler, {
    method: 'POST',
    path: '/api/composer/generate',
    headers,
    body: JSON.stringify(body),
    remoteAddress: options.remoteAddress,
  })
}

function cancel(jobId: string, options: CallOptions = {}) {
  return callHandler<JobOrError>(cancelHandler, {
    method: 'POST',
    path: `/api/composer/jobs/${jobId}/cancel`,
    params: { id: jobId },
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    remoteAddress: options.remoteAddress,
  })
}

function codeOf(body: unknown): string | undefined {
  return (body as { error?: { code?: string } } | null)?.error?.code
}

function json(response: { readonly body: unknown }): string {
  return JSON.stringify(response.body)
}

describe('POST /api/composer/generate fast path', () => {
  it('generates a FLUX dev keyframe, submits MiniMax and returns a queued job', async () => {
    const response = await generate({
      prompt: 'Un short sobre luz natural',
      preset: 'fast',
      durationSeconds: 6,
      referenceUrl: null,
    })

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(String(response.headers.get('set-cookie'))).toContain('composer_sid=')

    const job = response.body
    expect(job).toMatchObject({
      status: 'queued',
      stage: 'queued',
      queuePosition: null,
      preset: 'fast',
      modelId: 'minimax-hailuo-02',
      durationSeconds: 6,
      posterUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      pollAfterMs: 2_000,
    })
    expect(job.id).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(job.expiresAt).not.toBe(job.createdAt)

    const keyframe = stub.requests.find((request) =>
      request.path === '/fal-ai/flux/dev',
    )
    expect(keyframe?.method).toBe('POST')
    expect(keyframe?.authorization).toBe(`Key ${TEST_KEY}`)
    expect(keyframe?.body).toMatchObject({
      prompt: 'Cinematic vertical 9:16 keyframe for a short video. Un short sobre luz natural. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.',
      image_size: { width: 1152, height: 2048 },
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    })

    const video = stub.requests.find((request) =>
      request.path === '/fal-ai/minimax/hailuo-02/standard/image-to-video',
    )
    expect(video?.method).toBe('POST')
    expect(video?.authorization).toBe(`Key ${TEST_KEY}`)
    expect(video?.body).toMatchObject({
      prompt: 'Un short sobre luz natural. Vertical 9:16 short video, smooth natural motion, consistent subject, no text, no watermark, no logo.',
      image_url: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      duration: '6',
      resolution: '768P',
      prompt_optimizer: false,
    })

    expect(json(response)).not.toContain(TEST_KEY)
    expect(json(response)).not.toContain('Authorization')
    expect(json(response)).not.toContain('statusUrl')
    expect(json(response)).not.toContain('responseUrl')
    expect(json(response)).not.toContain('cancelUrl')
    expect(json(response)).not.toContain('status_url')
    expect(json(response)).not.toContain('NUXT_FAL_KEY')
  })

  it('uses Kontext and Kling for quality with a reference and 10 seconds', async () => {
    const response = await generate({
      prompt: 'Un short con mi imagen',
      preset: 'quality',
      durationSeconds: 10,
      referenceUrl: REFERENCE,
    })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      status: 'queued',
      preset: 'quality',
      modelId: 'kling-2.5-turbo-pro',
      durationSeconds: 10,
      posterUrl: 'https://v3.fal.media/files/test/keyframe-kontext.jpeg',
    })

    const keyframe = stub.requests.find((request) =>
      request.path === '/fal-ai/flux-pro/kontext',
    )
    expect(keyframe?.authorization).toBe(`Key ${TEST_KEY}`)
    expect(keyframe?.body).toMatchObject({
      image_url: REFERENCE,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      safety_tolerance: '2',
    })

    const video = stub.requests.find((request) =>
      request.path === '/fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    )
    expect(video?.body).toMatchObject({
      image_url: 'https://v3.fal.media/files/test/keyframe-kontext.jpeg',
      duration: '10',
      cfg_scale: 0.5,
    })
  })
})

describe('POST /api/composer/generate validation', () => {
  it.each([
    [{ prompt: '   ' }, 'prompt-required', 'Escribe una idea para generar tu short.'],
    [{ prompt: 'a'.repeat(281) }, 'prompt-too-long', 'La idea no puede superar los 280 caracteres.'],
    [{ prompt: 'Idea', preset: 'pro' }, 'invalid-preset', 'El estilo de generación no es válido.'],
    [{ prompt: 'Idea', preset: 'quality', durationSeconds: 6 }, 'invalid-duration', 'La duración no es válida para el estilo elegido.'],
    [{ prompt: 'Idea', referenceUrl: 'https://evil.example/a.webp' }, 'invalid-reference', 'La imagen de referencia no es válida.'],
    [{ prompt: 'Idea', mode: 'image' }, 'invalid-request', 'La solicitud no es válida.'],
    [{ prompt: 'Idea', endpointId: 'fal-ai/flux/dev' }, 'invalid-request', 'La solicitud no es válida.'],
  ] as const)('rejects invalid bodies with 400', async (body, code, message) => {
    const response = await generate(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code, message, retryable: false },
    })
  })

  it('rejects a prompt with control characters with invalid-prompt', async () => {
    const response = await generate({ prompt: 'Idea\u0000' })

    expect(response.status).toBe(400)
    expect(codeOf(response.body)).toBe('invalid-prompt')
  })

  it('rejects bodies larger than 16 KiB with 413', async () => {
    const response = await generate({ prompt: 'a'.repeat(20_000) })

    expect(response.status).toBe(413)
    expect(codeOf(response.body)).toBe('payload-too-large')
  })

  it('rejects non-JSON content types with 415', async () => {
    const response = await callHandler(generateHandler, {
      method: 'POST',
      path: '/api/composer/generate',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ prompt: 'Idea' }),
    })

    expect(response.status).toBe(415)
    expect(codeOf(response.body)).toBe('unsupported-media-type')
  })

  it('rejects cross-origin requests with 403', async () => {
    const response = await generate({ prompt: 'Idea' }, {
      origin: 'https://evil.example',
    })

    expect(response.status).toBe(403)
    expect(codeOf(response.body)).toBe('cross-origin-request')
  })

  it('accepts same-origin JSON requests', async () => {
    const response = await generate({ prompt: 'Idea' }, {
      origin: 'http://localhost',
    })

    expect(response.status).toBe(202)
  })
})

describe('POST /api/composer/generate idempotency and limits', () => {
  it('returns the same job for the same key and body without calling Fal twice', async () => {
    const key = 'generate-idem-12345678'
    const body = { prompt: 'Idea idempotente', preset: 'fast', durationSeconds: 6 }

    const first = await generate(body, { key })
    const keyframesAfterFirst = stub.requests.filter((request) =>
      request.path === '/fal-ai/flux/dev',
    ).length
    const second = await generate(body, {
      key,
      cookie: first.cookie ?? undefined,
    })

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    expect(second.body).toEqual(first.body)
    expect(stub.requests.filter((request) =>
      request.path === '/fal-ai/flux/dev',
    )).toHaveLength(keyframesAfterFirst)
  })

  it('rejects the same key with a different body with 409', async () => {
    const key = 'generate-conflict-12345678'
    const first = await generate({ prompt: 'Idea A' }, { key })
    const conflict = await generate({ prompt: 'Idea B' }, {
      key,
      cookie: first.cookie ?? undefined,
    })

    expect(conflict.status).toBe(409)
    expect(codeOf(conflict.body)).toBe('idempotency-conflict')
  })

  it('rejects a second active generation for the same session with 409', async () => {
    const first = await generate({ prompt: 'Primera idea' })
    expect(first.status).toBe(202)

    const second = await generate({ prompt: 'Segunda idea' }, {
      cookie: first.cookie ?? undefined,
    })

    expect(second.status).toBe(409)
    expect(second.body).toEqual({
      error: {
        code: 'generation-in-progress',
        message: 'Ya tienes una generación en curso. Espera a que termine o cancélala.',
        retryable: false,
      },
    })
  })

  it('rate limits the third generation in a session with Retry-After', async () => {
    let cookie: string | undefined

    for (let index = 0; index < 2; index += 1) {
      const response = await generate({ prompt: `Idea ${index}` }, {
        cookie,
        remoteAddress: '198.51.100.31',
      })
      expect(response.status, `generate ${index}`).toBe(202)
      cookie = response.cookie ?? cookie
      const cancelled = await cancel(response.body.id, {
        cookie,
        remoteAddress: '198.51.100.31',
      })
      expect(cancelled.status, `cancel ${index}`).toBe(200)
    }

    const limited = await generate({ prompt: 'Idea 3' }, {
      cookie,
      remoteAddress: '198.51.100.31',
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

  it('deduplicates identical requests without a key', async () => {
    const body = { prompt: 'Misma idea sin clave' }
    const first = await generate(body)
    const second = await generate(body, {
      cookie: first.cookie ?? undefined,
    })

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    expect(second.body.id).toBe(first.body.id)
  })
})

describe('POST /api/composer/generate provider errors', () => {
  it('returns 504 keyframe-timeout without submitting a video', async () => {
    stub.state.keyframeDelayMs = 500

    const response = await generate({ prompt: 'Idea lenta' })

    expect(response.status).toBe(504)
    expect(response.body).toEqual({
      error: {
        code: 'keyframe-timeout',
        message: 'La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.',
        retryable: true,
      },
    })
    expect(stub.requests.some((request) =>
      request.path.includes('image-to-video'),
    )).toBe(false)
  })

  it('maps NSFW keyframes to 422 content-blocked without submitting a video', async () => {
    stub.state.keyframePayload = {
      images: [{ url: 'https://v3.fal.media/files/test/keyframe.jpeg' }],
      has_nsfw_concepts: [true],
    }

    const response = await generate({ prompt: 'Idea bloqueada' })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({
      error: {
        code: 'content-blocked',
        message: 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
        retryable: false,
      },
    })
    expect(stub.requests.some((request) =>
      request.path.includes('image-to-video'),
    )).toBe(false)
  })

  it('maps invalid Fal credentials to 503 without leaking details', async () => {
    stub.state.keyframeStatus = 401

    const response = await generate({ prompt: 'Idea' })

    expect(response.status).toBe(503)
    expect(codeOf(response.body)).toBe('ai-unavailable')
    expect(json(response)).not.toContain('invalid credentials')
    expect(json(response)).not.toContain(TEST_KEY)
    expect(json(response)).not.toContain('Authorization')
  })

  it('maps exhausted credits to 503 ai-credits-exhausted', async () => {
    stub.state.keyframeStatus = 402

    const response = await generate({ prompt: 'Idea' })

    expect(response.status).toBe(503)
    expect(codeOf(response.body)).toBe('ai-credits-exhausted')
    expect(json(response)).not.toContain('Insufficient credits')
  })

  it('maps a provider 5xx to 502 provider-error with retryable true', async () => {
    stub.state.keyframeStatus = 500

    const response = await generate({ prompt: 'Idea' })

    expect(response.status).toBe(502)
    expect(response.body).toMatchObject({
      error: { code: 'provider-error', retryable: true },
    })
    expect(json(response)).not.toContain('raw provider')
  })

  it('maps an invalid keyframe output to 502 provider-invalid-output', async () => {
    stub.state.keyframePayload = { images: [] }

    const response = await generate({ prompt: 'Idea' })

    expect(response.status).toBe(502)
    expect(codeOf(response.body)).toBe('provider-invalid-output')
  })
})
