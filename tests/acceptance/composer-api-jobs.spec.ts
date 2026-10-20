// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposerJob } from '~/models/composer'
import { createJobTokenService } from '../../../server/composer/job-token'
import kling from '../fixtures/fal/kling-result.json'
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
    generateLimit: 20,
    generateWindowMs: 600_000,
    uploadLimit: 5,
    uploadWindowMs: 600_000,
    maxActiveJobs: 1,
    maxGlobalJobs: 100,
    dailyGenerationBudget: 1_000,
    jobTtlMs: 3_600_000,
    keyframeTimeoutMs: 45_000,
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
const { default: getJobHandler } = await import(
  '../../../server/api/composer/jobs/[id].get'
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
  readonly cookie?: string
  readonly remoteAddress?: string
}

function createJob(body: Record<string, unknown> = { prompt: 'Idea de prueba' }, options: CallOptions = {}) {
  return callHandler<JobOrError>(generateHandler, {
    method: 'POST',
    path: '/api/composer/generate',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
    remoteAddress: options.remoteAddress,
  })
}

function getJob(id: string, options: CallOptions = {}) {
  return callHandler<JobOrError>(getJobHandler, {
    method: 'GET',
    path: `/api/composer/jobs/${id}`,
    params: { id },
    headers: options.cookie ? { cookie: options.cookie } : {},
    remoteAddress: options.remoteAddress,
  })
}

function cancelJob(id: string, options: CallOptions = {}) {
  return callHandler<JobOrError>(cancelHandler, {
    method: 'POST',
    path: `/api/composer/jobs/${id}/cancel`,
    params: { id },
    headers: options.cookie ? { cookie: options.cookie } : {},
    remoteAddress: options.remoteAddress,
  })
}

function codeOf(body: unknown): string | undefined {
  return (body as { error?: { code?: string } } | null)?.error?.code
}

function json(response: { readonly body: unknown }): string {
  return JSON.stringify(response.body)
}

describe('GET /api/composer/jobs/{id}', () => {
  it('returns a queued job with the provider queue position', async () => {
    const created = await createJob()
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.41',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.body).toMatchObject({
      id: created.body.id,
      status: 'queued',
      stage: 'queued',
      queuePosition: 3,
      preset: 'fast',
      modelId: 'minimax-hailuo-02',
      durationSeconds: 6,
      posterUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      pollAfterMs: 2_000,
    })
    expect(json(response)).not.toContain(TEST_KEY)
    expect(json(response)).not.toContain('Authorization')
    expect(json(response)).not.toContain('status_url')
    expect(json(response)).not.toContain('response_url')
    expect(json(response)).not.toContain('cancel_url')
    expect(json(response)).not.toContain('queue.fal.run')
  })

  it('omits the queue position when the provider does not return it', async () => {
    stub.state.queuePosition = null
    const created = await createJob()
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.42',
    })

    expect(response.status).toBe(200)
    expect((response.body as { queuePosition?: unknown }).queuePosition ?? null).toBeNull()
  })

  it('maps IN_PROGRESS to running with stage video', async () => {
    stub.state.queueStatus = 'IN_PROGRESS'
    const created = await createJob()
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.43',
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'running',
      stage: 'video',
      queuePosition: null,
    })
  })

  it('maps COMPLETED to succeeded with the MiniMax output', async () => {
    stub.state.queueStatus = 'COMPLETED'
    const created = await createJob()
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.44',
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'succeeded',
      stage: 'finalizing',
      output: {
        videoUrl: 'https://v3.fal.media/files/test/minimax-video.mp4',
        posterUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
        width: 1080,
        height: 1920,
        durationSeconds: 6,
        modelId: 'minimax-hailuo-02',
        expiresAt: created.body.expiresAt,
      },
    })
  })

  it('maps COMPLETED to the Kling output for the quality preset', async () => {
    stub.state.queueStatus = 'COMPLETED'
    stub.state.resultPayload = kling
    const created = await createJob({
      prompt: 'Idea de calidad',
      preset: 'quality',
      durationSeconds: 10,
      referenceUrl: 'https://v3.fal.media/files/test/reference.webp',
    })
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.45',
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'succeeded',
      modelId: 'kling-2.5-turbo-pro',
      durationSeconds: 10,
      output: {
        videoUrl: 'https://v3.fal.media/files/test/kling-video.mp4',
        width: null,
        height: null,
        durationSeconds: 10,
        modelId: 'kling-2.5-turbo-pro',
      },
    })
  })

  it('maps an invalid completed output to a failed job', async () => {
    stub.state.queueStatus = 'COMPLETED'
    stub.state.resultPayload = { video: {} }
    const created = await createJob()
    const response = await getJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.46',
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'failed',
      stage: 'finalizing',
      error: {
        code: 'provider-invalid-output',
        message: 'El proveedor devolvió un resultado no válido. Inténtalo de nuevo.',
        retryable: true,
      },
    })
  })

  it('returns 404 for a tampered token without revealing the reason', async () => {
    const created = await createJob()
    const parts = created.body.id.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]!.startsWith('A') ? 'B' : 'A'}${parts[2]!.slice(1)}`
    const response = await getJob(tampered, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.47',
    })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'job-not-found',
        message: 'Esta generación ya no está disponible. Empieza de nuevo.',
        retryable: false,
      },
    })
  })

  it('returns 404 for malformed and oversized tokens', async () => {
    const malformed = await getJob('v1.invalid')
    expect(malformed.status).toBe(404)
    expect(codeOf(malformed.body)).toBe('job-not-found')

    const oversized = await getJob(`v1.${'a'.repeat(4_100)}`)
    expect(oversized.status).toBe(404)
    expect(codeOf(oversized.body)).toBe('job-not-found')
  })

  it('returns 410 for an expired token', async () => {
    const now = Date.now()
    const tokens = createJobTokenService({
      secret: TEST_SECRET,
      now: () => now,
    })
    const token = tokens.create({
      endpointId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
      requestId: 'req-expired',
      statusUrl: `${stub.baseUrl}/queue/requests/req-expired/status`,
      responseUrl: `${stub.baseUrl}/queue/requests/req-expired`,
      cancelUrl: `${stub.baseUrl}/queue/requests/req-expired/cancel`,
      modelId: 'minimax-hailuo-02',
      preset: 'fast',
      durationSeconds: 6,
      promptHash: 'a'.repeat(64),
      posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      referenceUrl: null,
      createdAt: now - 7_200_000,
      expiresAt: now - 3_600_000,
    })

    const response = await getJob(token)

    expect(response.status).toBe(410)
    expect(response.body).toEqual({
      error: {
        code: 'job-expired',
        message: 'Esta generación ya no está disponible. Empieza de nuevo.',
        retryable: false,
      },
    })
  })

  it('rate limits polling faster than once every 1.5 seconds', async () => {
    const created = await createJob()
    const options = {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.48',
    }

    const first = await getJob(created.body.id, options)
    const second = await getJob(created.body.id, options)

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThanOrEqual(2)
    expect(codeOf(second.body)).toBe('rate-limited')
  })

  it('rejects unexpected query parameters with 400', async () => {
    const created = await createJob()
    const response = await callHandler(getJobHandler, {
      method: 'GET',
      path: `/api/composer/jobs/${created.body.id}?debug=1`,
      params: { id: created.body.id },
      headers: { cookie: created.cookie ?? '' },
    })

    expect(response.status).toBe(400)
    expect(codeOf(response.body)).toBe('invalid-request')
  })
})

describe('POST /api/composer/jobs/{id}/cancel', () => {
  it('cancels a queued job and is idempotent', async () => {
    const created = await createJob()
    const options = {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.51',
    }

    const first = await cancelJob(created.body.id, options)
    const second = await cancelJob(created.body.id, options)

    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      id: created.body.id,
      status: 'cancelled',
      stage: 'queued',
      preset: 'fast',
      modelId: 'minimax-hailuo-02',
    })
    expect(second.status).toBe(200)
    expect(second.body).toEqual(first.body)

    const cancelCalls = stub.requests.filter((request) =>
      request.method === 'PUT' && request.path.endsWith('/cancel'),
    )
    expect(cancelCalls).toHaveLength(1)
    expect(cancelCalls[0]?.authorization).toBe(`Key ${TEST_KEY}`)
  })

  it('cancels a running job with stage video', async () => {
    stub.state.queueStatus = 'IN_PROGRESS'
    const created = await createJob()
    const response = await cancelJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.52',
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'cancelled', stage: 'video' })
  })

  it('returns 409 job-not-cancellable when the job already completed', async () => {
    stub.state.queueStatus = 'COMPLETED'
    const created = await createJob()
    const response = await cancelJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.53',
    })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        code: 'job-not-cancellable',
        message: 'Esta generación ya ha terminado y no se puede cancelar.',
        retryable: false,
      },
    })
  })

  it('returns 502 cancel-failed when Fal rejects the cancellation', async () => {
    stub.state.cancelStatus = 500
    const created = await createJob()
    const response = await cancelJob(created.body.id, {
      cookie: created.cookie ?? undefined,
      remoteAddress: '198.51.100.54',
    })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({
      error: {
        code: 'cancel-failed',
        message: 'No se pudo cancelar la generación. Inténtalo de nuevo.',
        retryable: true,
      },
    })
  })

  it('returns 404 for an invalid token and never echoes credentials', async () => {
    const response = await cancelJob('v1.bad')

    expect(response.status).toBe(404)
    expect(codeOf(response.body)).toBe('job-not-found')
    expect(json(response)).not.toContain(TEST_KEY)
    expect(json(response)).not.toContain('Authorization')
  })
})
