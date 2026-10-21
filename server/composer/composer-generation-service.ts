import { createHash } from 'node:crypto'
import type {
  ComposerGenerationRequest,
  ComposerJob,
  ComposerJobError,
  ComposerJobId,
  ComposerPreset,
  ComposerVideoDuration,
} from '~/models/composer'
import { ComposerError, isComposerError, toComposerJobError } from '../shared/errors'
import type { ComposerJobTokenPayload, JobTokenService } from '../shared/job-token'
import type { FalQueueService } from '../fal/queue-service'
import type { GenerationOrchestrator } from './generation-orchestrator'
import type { RateLimiter } from '../shared/rate-limit'
import { IdempotencyStore } from '../shared/rate-limit'
import type { ComposerRequestContext } from '../shared/request-context'
import { canonicalGenerationBody } from '../shared/validation'

export interface CreateComposerJobInput {
  readonly request: ComposerGenerationRequest
  readonly context: ComposerRequestContext
  readonly idempotencyKey: string | null
  readonly signal?: AbortSignal
}

export interface ComposerGenerationServiceOptions {
  readonly orchestrator: GenerationOrchestrator
  readonly queue: FalQueueService
  readonly rateLimiter: RateLimiter
  readonly jobTokens: JobTokenService
  readonly pollAfterMs: number
  readonly jobTtlMs?: number
  readonly now?: () => number
}

interface DedupeEntry {
  readonly job: ComposerJob
  readonly expiresAt: number
}

interface CancelledJobEntry {
  readonly expiresAt: number
  readonly stage: 'queued' | 'video' | 'finalizing'
}

interface ComposerJobBaseFields {
  readonly id: ComposerJobId
  readonly preset: ComposerPreset
  readonly modelId: ComposerJob['modelId']
  readonly durationSeconds: ComposerVideoDuration
  readonly posterUrl: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly pollAfterMs: number
}

const DEDUPE_TTL_MS = 60_000
const DEDUPE_MAX_ENTRIES = 1_000

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export class ComposerGenerationService {
  private readonly orchestrator: GenerationOrchestrator
  private readonly queue: FalQueueService
  private readonly rateLimiter: RateLimiter
  private readonly jobTokens: JobTokenService
  private readonly pollAfterMs: number
  private readonly jobTtlMs: number
  private readonly now: () => number
  private readonly idempotency = new IdempotencyStore<ComposerJob>()
  private readonly dedupe = new Map<string, DedupeEntry>()
  private readonly cancelledJobs = new Map<ComposerJobId, CancelledJobEntry>()

  constructor(options: ComposerGenerationServiceOptions) {
    this.orchestrator = options.orchestrator
    this.queue = options.queue
    this.rateLimiter = options.rateLimiter
    this.jobTokens = options.jobTokens
    this.pollAfterMs = Math.min(10_000, Math.max(1_000, options.pollAfterMs))
    this.jobTtlMs = Math.max(1_000, options.jobTtlMs ?? 3_600_000)
    this.now = options.now ?? Date.now
  }

  async createJob(input: CreateComposerJobInput): Promise<ComposerJob> {
    const bodyHash = sha256(canonicalGenerationBody(input.request))
    const idempotencyKey = input.idempotencyKey
      ? `${input.context.sessionId}:${input.idempotencyKey}`
      : null

    if (idempotencyKey) {
      const existing = this.idempotency.get(idempotencyKey)

      if (existing) {
        if (existing.bodyHash !== bodyHash) {
          throw new ComposerError('idempotency-conflict')
        }

        if (existing.status === 'pending') {
          throw new ComposerError('generation-in-progress')
        }

        return existing.value
      }
    } else {
      const dedupeKey = `${input.context.sessionId}:${bodyHash}`
      const cached = this.dedupe.get(dedupeKey)

      if (cached && cached.expiresAt > this.now()) {
        return cached.job
      }
    }

    if (idempotencyKey) {
      this.idempotency.setPending(idempotencyKey, bodyHash)
    }

    try {
      this.rateLimiter.assertCanStartJob(input.context.sessionId)
      this.rateLimiter.consumeGeneration(input.context.sessionId)
      this.rateLimiter.consumeDailyBudget()
      this.rateLimiter.reserveJob(input.context.sessionId)
    } catch (error) {
      if (idempotencyKey) {
        this.idempotency.delete(idempotencyKey)
      }

      throw error
    }

    try {
      const orchestrated = await this.orchestrator.createVideoJob(
        input.request,
        input.signal,
      )
      const token = this.jobTokens.create({
        endpointId: orchestrated.endpointId,
        requestId: orchestrated.requestId,
        statusUrl: orchestrated.statusUrl,
        responseUrl: orchestrated.responseUrl,
        cancelUrl: orchestrated.cancelUrl,
        modelId: orchestrated.modelId,
        preset: orchestrated.preset,
        durationSeconds: orchestrated.durationSeconds,
        promptHash: orchestrated.promptHash,
        posterUrl: orchestrated.posterUrl,
        referenceUrl: orchestrated.referenceUrl,
        createdAt: orchestrated.createdAt,
        expiresAt: orchestrated.expiresAt,
      })

      const job: ComposerJob = {
        id: token as ComposerJobId,
        status: 'queued',
        stage: 'queued',
        queuePosition: null,
        preset: orchestrated.preset,
        modelId: orchestrated.modelId,
        durationSeconds: orchestrated.durationSeconds,
        posterUrl: orchestrated.posterUrl,
        createdAt: new Date(orchestrated.createdAt).toISOString(),
        expiresAt: new Date(orchestrated.expiresAt).toISOString(),
        pollAfterMs: orchestrated.pollAfterMs,
      }

      if (idempotencyKey) {
        this.idempotency.setDone(idempotencyKey, bodyHash, job)
      }

      this.cleanupDedupe()
      this.dedupe.set(`${input.context.sessionId}:${bodyHash}`, {
        job,
        expiresAt: this.now() + DEDUPE_TTL_MS,
      })

      return job
    } catch (error) {
      this.rateLimiter.releaseJob(input.context.sessionId)

      if (idempotencyKey) {
        this.idempotency.delete(idempotencyKey)
      }

      throw error
    }
  }

  async getJob(id: string, context: ComposerRequestContext): Promise<ComposerJob> {
    const payload = this.jobTokens.verify(id)
    const jobId = id as ComposerJobId
    const base = this.buildBase(id, payload)

    this.cleanupCancelledJobs()

    const cancelled = this.cancelledJobs.get(jobId)

    if (cancelled && cancelled.expiresAt > this.now()) {
      this.rateLimiter.releaseJob(context.sessionId)

      return {
        ...base,
        status: 'cancelled',
        stage: cancelled.stage,
      }
    }

    const status = await this.queue.getStatus(payload.statusUrl)

    if (status.status === 'IN_QUEUE') {
      return {
        ...base,
        status: 'queued',
        stage: 'queued',
        queuePosition: status.queuePosition,
      }
    }

    if (status.status === 'IN_PROGRESS') {
      return {
        ...base,
        status: 'running',
        stage: 'video',
        queuePosition: null,
      }
    }

    try {
      const result = await this.queue.getResult(payload.responseUrl)
      const output = this.orchestrator.parseVideoOutput(
        payload.preset,
        result,
        payload.durationSeconds,
      )

      this.rateLimiter.releaseJob(context.sessionId)

      return {
        ...base,
        status: 'succeeded',
        stage: 'finalizing',
        output: {
          videoUrl: output.videoUrl,
          posterUrl: payload.posterUrl,
          width: output.width,
          height: output.height,
          durationSeconds: payload.durationSeconds,
          modelId: payload.modelId,
          expiresAt: base.expiresAt,
        },
      }
    } catch (error) {
      const failedError = this.mapCompletedFailure(error)

      if (!failedError) {
        throw error
      }

      this.rateLimiter.releaseJob(context.sessionId)

      return {
        ...base,
        status: 'failed',
        stage: 'finalizing',
        error: failedError,
      }
    }
  }

  async cancelJob(
    id: string,
    context: ComposerRequestContext,
  ): Promise<ComposerJob> {
    const payload = this.jobTokens.verify(id)
    const jobId = id as ComposerJobId
    const base = this.buildBase(id, payload)

    this.cleanupCancelledJobs()

    const existing = this.cancelledJobs.get(jobId)

    if (existing && existing.expiresAt > this.now()) {
      this.rateLimiter.releaseJob(context.sessionId)

      return {
        ...base,
        status: 'cancelled',
        stage: existing.stage,
      }
    }

    let status: Awaited<ReturnType<FalQueueService['getStatus']>>

    try {
      status = await this.queue.getStatus(payload.statusUrl)

      if (status.status === 'COMPLETED') {
        throw new ComposerError('job-not-cancellable')
      }

      await this.queue.cancel(payload.cancelUrl)
    } catch (error) {
      if (isComposerError(error) && error.code === 'job-not-cancellable') {
        throw error
      }

      throw new ComposerError('cancel-failed')
    }

    const stage = status.status === 'IN_QUEUE' ? 'queued' : 'video'

    this.cancelledJobs.set(jobId, {
      expiresAt: this.now() + this.jobTtlMs,
      stage,
    })
    this.cleanupCancelledJobs()
    this.rateLimiter.releaseJob(context.sessionId)

    return {
      ...base,
      status: 'cancelled',
      stage,
    }
  }

  private mapCompletedFailure(error: unknown): ComposerJobError | null {
    if (!isComposerError(error)) {
      return null
    }

    if (
      error.code === 'content-blocked'
      || error.code === 'ai-credits-exhausted'
      || error.code === 'provider-rejected'
      || error.code === 'provider-invalid-output'
    ) {
      return toComposerJobError(error)
    }

    return null
  }

  private cleanupCancelledJobs(): void {
    const now = this.now()

    for (const [jobId, entry] of this.cancelledJobs) {
      if (entry.expiresAt <= now) {
        this.cancelledJobs.delete(jobId)
      }
    }

    while (this.cancelledJobs.size > 1_000) {
      const oldestKey = this.cancelledJobs.keys().next().value

      if (oldestKey === undefined) return

      this.cancelledJobs.delete(oldestKey)
    }
  }

  private buildBase(
    id: string,
    payload: ComposerJobTokenPayload,
  ): ComposerJobBaseFields {
    return {
      id: id as ComposerJobId,
      preset: payload.preset,
      modelId: payload.modelId,
      durationSeconds: payload.durationSeconds,
      posterUrl: payload.posterUrl,
      createdAt: new Date(payload.createdAt).toISOString(),
      expiresAt: new Date(payload.expiresAt).toISOString(),
      pollAfterMs: this.pollAfterMs,
    }
  }

  private cleanupDedupe(): void {
    const now = this.now()

    for (const [key, entry] of this.dedupe) {
      if (entry.expiresAt <= now) {
        this.dedupe.delete(key)
      }
    }

    while (this.dedupe.size > DEDUPE_MAX_ENTRIES) {
      const oldestKey = this.dedupe.keys().next().value

      if (oldestKey === undefined) return

      this.dedupe.delete(oldestKey)
    }
  }
}
