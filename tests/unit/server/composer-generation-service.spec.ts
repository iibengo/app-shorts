// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerGenerationService } from '../../../server/composer/composer-generation-service'
import { ComposerError } from '../../../server/composer/errors'
import type { GenerationOrchestrator, OrchestratorJob } from '../../../server/composer/generation-orchestrator'
import type { FalQueueService } from '../../../server/composer/fal-queue-service'
import { createJobTokenService } from '../../../server/composer/job-token'
import { RateLimiter } from '../../../server/composer/rate-limit'
import type { ComposerRequestContext } from '../../../server/composer/request-context'
import minimax from '../../fixtures/fal/minimax-result.json'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')
const SECRET = 'test-secret-with-at-least-32-characters'
const SESSION: ComposerRequestContext = {
  sessionId: 'session-abcdefghijklmnopqrstuv',
  ipHash: 'a'.repeat(64),
}
const SUBMISSION = {
  requestId: 'req-1',
  statusUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1/status',
  responseUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1',
  cancelUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1/cancel',
}
const ORCHESTRATED: OrchestratorJob = {
  endpointId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
  requestId: SUBMISSION.requestId,
  statusUrl: SUBMISSION.statusUrl,
  responseUrl: SUBMISSION.responseUrl,
  cancelUrl: SUBMISSION.cancelUrl,
  modelId: 'minimax-hailuo-02',
  preset: 'fast',
  durationSeconds: 6,
  promptHash: 'b'.repeat(64),
  posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  referenceUrl: null,
  createdAt: NOW,
  expiresAt: NOW + 3_600_000,
  pollAfterMs: 2_000,
}
const REQUEST = {
  prompt: 'Un short sobre luz natural',
  preset: 'fast' as const,
  durationSeconds: 6 as const,
  referenceUrl: null,
}

function createService(options: {
  readonly orchestratorCreate?: GenerationOrchestrator['createVideoJob']
  readonly parseVideoOutput?: GenerationOrchestrator['parseVideoOutput']
  readonly getStatus?: FalQueueService['getStatus']
  readonly getResult?: FalQueueService['getResult']
  readonly cancel?: FalQueueService['cancel']
  readonly dailyGenerationBudget?: number
  readonly now?: () => number
} = {}) {
  let clock = NOW
  const now = options.now ?? (() => clock)
  const createVideoJob = vi.fn(
    options.orchestratorCreate ?? (async () => ORCHESTRATED),
  )
  const parseVideoOutput = vi.fn(
    options.parseVideoOutput ?? ((preset, payload, duration) => {
      const output = payload as { video: { url: string; width?: number; height?: number } }

      return {
        videoUrl: output.video.url,
        width: output.video.width ?? null,
        height: output.video.height ?? null,
      }
    }),
  )
  const orchestrator = {
    createVideoJob,
    parseVideoOutput,
  } as unknown as GenerationOrchestrator
  const getStatus = vi.fn(options.getStatus ?? (async () => ({
    status: 'IN_QUEUE' as const,
    queuePosition: 3,
  })))
  const getResult = vi.fn(options.getResult ?? (async () => minimax))
  const cancel = vi.fn(options.cancel ?? (async () => undefined))
  const queue = {
    submit: vi.fn(),
    getStatus,
    getResult,
    cancel,
  } as unknown as FalQueueService
  const rateLimiter = new RateLimiter({
    config: {
      generateLimit: 3,
      generateWindowMs: 600_000,
      uploadLimit: 5,
      uploadWindowMs: 600_000,
      maxActiveJobs: 1,
      maxGlobalJobs: 3,
      dailyGenerationBudget: options.dailyGenerationBudget ?? 50,
      jobTtlMs: 3_600_000,
    },
    now,
  })
  const jobTokens = createJobTokenService({
    secret: SECRET,
    now,
  })
  const service = new ComposerGenerationService({
    orchestrator,
    queue,
    rateLimiter,
    jobTokens,
    pollAfterMs: 2_000,
    jobTtlMs: 3_600_000,
    now,
  })

  return {
    service,
    createVideoJob,
    parseVideoOutput,
    getStatus,
    getResult,
    cancel,
    rateLimiter,
    jobTokens,
    advance(ms: number) {
      clock += ms
    },
  }
}

describe('ComposerGenerationService.createJob', () => {
  it('creates a queued job token and reserves the session', async () => {
    const { service, createVideoJob, jobTokens } = createService()

    const job = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })

    expect(createVideoJob).toHaveBeenCalledWith(REQUEST, undefined)
    expect(job).toMatchObject({
      status: 'queued',
      stage: 'queued',
      queuePosition: null,
      preset: 'fast',
      modelId: 'minimax-hailuo-02',
      durationSeconds: 6,
      posterUrl: ORCHESTRATED.posterUrl,
      pollAfterMs: 2_000,
    })
    expect(job.id).toMatch(/^v1\./)
    expect(jobTokens.verify(job.id)).toMatchObject({
      endpointId: ORCHESTRATED.endpointId,
      requestId: 'req-1',
      modelId: 'minimax-hailuo-02',
    })
  })

  it('returns the same response for a repeated idempotency key and body', async () => {
    const { service, createVideoJob } = createService()

    const first = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })
    const second = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })

    expect(second).toEqual(first)
    expect(createVideoJob).toHaveBeenCalledTimes(1)
  })

  it('rejects the same key with a different body', async () => {
    const { service } = createService()

    await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })

    await expect(service.createJob({
      request: { ...REQUEST, prompt: 'Otra idea' },
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })).rejects.toMatchObject({ code: 'idempotency-conflict' })
  })

  it('rejects a second request while the same key is in flight', async () => {
    let resolveJob!: (value: OrchestratorJob) => void
    const { service } = createService({
      orchestratorCreate: () => new Promise<OrchestratorJob>((resolve) => {
        resolveJob = resolve
      }),
    })

    const first = service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })
    await Promise.resolve()
    await Promise.resolve()

    await expect(service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })).rejects.toMatchObject({ code: 'generation-in-progress' })

    resolveJob(ORCHESTRATED)
    await first
  })

  it('deduplicates identical requests without a key for 60 seconds', async () => {
    const { service, createVideoJob, advance, rateLimiter } = createService()

    const first = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })
    const second = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })

    expect(second).toEqual(first)
    expect(createVideoJob).toHaveBeenCalledTimes(1)

    rateLimiter.releaseJob(SESSION.sessionId)
    advance(60_001)
    const third = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })

    expect(createVideoJob).toHaveBeenCalledTimes(2)
    expect(third.status).toBe('queued')
  })

  it('rejects a second active generation for the same session', async () => {
    const { service } = createService()

    await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: 'idem-12345678',
    })

    await expect(service.createJob({
      request: { ...REQUEST, prompt: 'Otra idea' },
      context: SESSION,
      idempotencyKey: 'idem-87654321',
    })).rejects.toMatchObject({ code: 'generation-in-progress' })
  })

  it('releases the session after a successful terminal poll', async () => {
    const { service } = createService({
      getStatus: async () => ({ status: 'COMPLETED', queuePosition: null }),
    })

    const job = await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })

    await service.getJob(job.id, SESSION)

    const next = await service.createJob({
      request: { ...REQUEST, prompt: 'Otra idea' },
      context: SESSION,
      idempotencyKey: null,
    })
    expect(next.status).toBe('queued')
  })

  it('enforces the daily budget', async () => {
    const { service, createVideoJob } = createService({ dailyGenerationBudget: 1 })

    await service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })

    await expect(service.createJob({
      request: REQUEST,
      context: { ...SESSION, sessionId: 'session-other' },
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: 'budget-exhausted' })
    expect(createVideoJob).toHaveBeenCalledTimes(1)
  })

  it('enforces the generation rate limit', async () => {
    const { service } = createService({
      getStatus: async () => ({ status: 'COMPLETED', queuePosition: null }),
    })

    for (let index = 0; index < 3; index += 1) {
      const job = await service.createJob({
        request: { ...REQUEST, prompt: `Idea ${index}` },
        context: SESSION,
        idempotencyKey: null,
      })
      await service.getJob(job.id, SESSION)
    }

    await expect(service.createJob({
      request: { ...REQUEST, prompt: 'Idea 4' },
      context: SESSION,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: 'rate-limited', retryAfterSeconds: 600 })
  })

  it('releases the reserved job when orchestration fails', async () => {
    const { service, rateLimiter } = createService({
      orchestratorCreate: async () => {
        throw new ComposerError('provider-error')
      },
    })

    await expect(service.createJob({
      request: REQUEST,
      context: SESSION,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: 'provider-error' })

    expect(rateLimiter.hasActiveJob(SESSION.sessionId)).toBe(false)
  })
})

describe('ComposerGenerationService.getJob', () => {
  it('maps IN_QUEUE with the provider position', async () => {
    const { service, jobTokens } = createService()

    const token = jobTokens.create({
      endpointId: ORCHESTRATED.endpointId,
      requestId: ORCHESTRATED.requestId,
      statusUrl: ORCHESTRATED.statusUrl,
      responseUrl: ORCHESTRATED.responseUrl,
      cancelUrl: ORCHESTRATED.cancelUrl,
      modelId: ORCHESTRATED.modelId,
      preset: ORCHESTRATED.preset,
      durationSeconds: ORCHESTRATED.durationSeconds,
      promptHash: ORCHESTRATED.promptHash,
      posterUrl: ORCHESTRATED.posterUrl,
      referenceUrl: null,
      createdAt: ORCHESTRATED.createdAt,
      expiresAt: ORCHESTRATED.expiresAt,
    })

    await expect(service.getJob(token, SESSION)).resolves.toMatchObject({
      id: token,
      status: 'queued',
      stage: 'queued',
      queuePosition: 3,
    })
  })

  it('maps IN_PROGRESS to running/video', async () => {
    const { service, jobTokens } = createService({
      getStatus: async () => ({ status: 'IN_PROGRESS', queuePosition: null }),
    })
    const token = serviceToken(jobTokens)

    await expect(service.getJob(token, SESSION)).resolves.toMatchObject({
      status: 'running',
      stage: 'video',
      queuePosition: null,
    })
  })

  it('maps COMPLETED and the provider output to succeeded', async () => {
    const { service, jobTokens, getResult } = createService({
      getStatus: async () => ({ status: 'COMPLETED', queuePosition: null }),
    })
    const token = serviceToken(jobTokens)

    const job = await service.getJob(token, SESSION)

    expect(getResult).toHaveBeenCalledWith(ORCHESTRATED.responseUrl)
    expect(job).toMatchObject({
      status: 'succeeded',
      stage: 'finalizing',
      output: {
        videoUrl: 'https://v3.fal.media/files/test/minimax-video.mp4',
        posterUrl: ORCHESTRATED.posterUrl,
        width: 1080,
        height: 1920,
        durationSeconds: 6,
        modelId: 'minimax-hailuo-02',
        expiresAt: new Date(ORCHESTRATED.expiresAt).toISOString(),
      },
    })
  })

  it('maps an invalid provider output to a failed job', async () => {
    const { service, jobTokens } = createService({
      getStatus: async () => ({ status: 'COMPLETED', queuePosition: null }),
      parseVideoOutput: () => {
        throw new ComposerError('provider-invalid-output')
      },
    })
    const token = serviceToken(jobTokens)

    await expect(service.getJob(token, SESSION)).resolves.toMatchObject({
      status: 'failed',
      stage: 'finalizing',
      error: {
        code: 'provider-invalid-output',
        retryable: true,
      },
    })
  })

  it('does not swallow unexpected provider status failures', async () => {
    const { service, jobTokens } = createService({
      getStatus: async () => {
        throw new ComposerError('provider-error')
      },
    })
    const token = serviceToken(jobTokens)

    await expect(service.getJob(token, SESSION)).rejects.toMatchObject({
      code: 'provider-error',
    })
  })

  it('returns cancelled after a confirmed cancellation', async () => {
    const { service, jobTokens } = createService()
    const token = serviceToken(jobTokens)

    await service.cancelJob(token, SESSION)

    await expect(service.getJob(token, SESSION)).resolves.toMatchObject({
      status: 'cancelled',
      stage: 'queued',
    })
  })

  it('rejects expired and tampered tokens', async () => {
    const { service, jobTokens, advance } = createService()
    const token = serviceToken(jobTokens)

    await expect(service.getJob(`${token.slice(0, -2)}xx`, SESSION))
      .rejects.toMatchObject({ code: 'job-not-found' })

    advance(3_600_001)
    await expect(service.getJob(token, SESSION)).rejects.toMatchObject({
      code: 'job-expired',
    })
  })
})

describe('ComposerGenerationService.cancelJob', () => {
  it('cancels an active job and is idempotent', async () => {
    const { service, jobTokens, cancel, getStatus } = createService()
    const token = serviceToken(jobTokens)

    const first = await service.cancelJob(token, SESSION)
    expect(cancel).toHaveBeenCalledWith(ORCHESTRATED.cancelUrl)
    expect(first).toMatchObject({ status: 'cancelled', stage: 'queued' })

    const second = await service.cancelJob(token, SESSION)
    expect(second).toEqual(first)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('refuses to cancel a completed job', async () => {
    const { service, jobTokens, cancel } = createService({
      getStatus: async () => ({ status: 'COMPLETED', queuePosition: null }),
    })
    const token = serviceToken(jobTokens)

    await expect(service.cancelJob(token, SESSION)).rejects.toMatchObject({
      code: 'job-not-cancellable',
    })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('maps a provider 409 to job-not-cancellable', async () => {
    const { service, jobTokens } = createService({
      cancel: async () => {
        throw new ComposerError('job-not-cancellable')
      },
    })
    const token = serviceToken(jobTokens)

    await expect(service.cancelJob(token, SESSION)).rejects.toMatchObject({
      code: 'job-not-cancellable',
    })
  })

  it('maps other cancel failures to cancel-failed', async () => {
    const { service, jobTokens } = createService({
      cancel: async () => {
        throw new ComposerError('provider-error')
      },
    })
    const token = serviceToken(jobTokens)

    await expect(service.cancelJob(token, SESSION)).rejects.toMatchObject({
      code: 'cancel-failed',
      retryable: true,
    })
  })
})

function serviceToken(jobTokens: ReturnType<typeof createJobTokenService>): string {
  return jobTokens.create({
    endpointId: ORCHESTRATED.endpointId,
    requestId: ORCHESTRATED.requestId,
    statusUrl: ORCHESTRATED.statusUrl,
    responseUrl: ORCHESTRATED.responseUrl,
    cancelUrl: ORCHESTRATED.cancelUrl,
    modelId: ORCHESTRATED.modelId,
    preset: ORCHESTRATED.preset,
    durationSeconds: ORCHESTRATED.durationSeconds,
    promptHash: ORCHESTRATED.promptHash,
    posterUrl: ORCHESTRATED.posterUrl,
    referenceUrl: null,
    createdAt: ORCHESTRATED.createdAt,
    expiresAt: ORCHESTRATED.expiresAt,
  })
}
