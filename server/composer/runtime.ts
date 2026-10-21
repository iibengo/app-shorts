import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { ComposerUploadTicket } from '~/models/composer'
import { ComposerGenerationService } from './composer-generation-service'
import { createFalHttpClient } from '../fal/http-client'
import { createFalQueueService } from '../fal/queue-service'
import type { FalQueueService } from '../fal/queue-service'
import { createFalStorageService } from '../fal/storage-service'
import type { FalStorageService } from '../fal/storage-service'
import { FAL_API_ORIGINS } from '../fal/types'
import { createGenerationOrchestrator } from './generation-orchestrator'
import type { GenerationOrchestrator } from './generation-orchestrator'
import { createJobTokenService } from '../shared/job-token'
import type { JobTokenService } from '../shared/job-token'
import { modelRegistry } from './model-registry'
import { PromptComposer } from './prompt-composer'
import { IdempotencyStore, RateLimiter } from '../shared/rate-limit'

interface RuntimeComposerConfig {
  readonly jobSecret?: string
  readonly generateLimit?: number
  readonly generateWindowMs?: number
  readonly uploadLimit?: number
  readonly uploadWindowMs?: number
  readonly maxActiveJobs?: number
  readonly maxGlobalJobs?: number
  readonly dailyGenerationBudget?: number
  readonly jobTtlMs?: number
  readonly keyframeTimeoutMs?: number
  readonly pollAfterMs?: number
  readonly falQueueBaseUrl?: string
  readonly falRunBaseUrl?: string
  readonly falStorageBaseUrl?: string
}

interface AppRuntimeConfig {
  readonly falKey?: string
  readonly composer?: RuntimeComposerConfig
}

export interface ComposerRuntime {
  readonly hasFalKey: boolean
  readonly ipSalt: string
  readonly rateLimiter: RateLimiter
  readonly storage: FalStorageService
  readonly queue: FalQueueService
  readonly jobTokens: JobTokenService | null
  readonly orchestrator: GenerationOrchestrator | null
  readonly generation: ComposerGenerationService | null
  readonly uploadIdempotency: IdempotencyStore<ComposerUploadTicket>
}

const DEFAULT_QUEUE_BASE_URL = 'https://queue.fal.run'
const DEFAULT_RUN_BASE_URL = 'https://fal.run'
const DEFAULT_STORAGE_BASE_URL = 'https://rest.fal.ai'

const promptComposer = new PromptComposer()
const processIpSalt = randomBytes(32).toString('hex')

let cachedRuntime: { readonly signature: string; readonly runtime: ComposerRuntime } | null = null

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.trunc(parsed)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback
}

function originOf(value: string): string {
  return new URL(value).origin
}

function resolveAllowedOrigins(baseUrls: readonly string[]): readonly string[] {
  const fixed = [...FAL_API_ORIGINS]

  if (process.env.NODE_ENV !== 'test') {
    return fixed
  }

  for (const baseUrl of baseUrls) {
    try {
      const origin = originOf(baseUrl)

      if (!fixed.includes(origin)) {
        fixed.push(origin)
      }
    } catch {
      // Invalid test overrides fall back to the fixed allowlist.
    }
  }

  return fixed
}

function createRuntime(config: AppRuntimeConfig): ComposerRuntime {
  const falKey = stringValue(config.falKey, '')
  const composer = config.composer ?? {}
  const hasFalKey = falKey.length > 0
  const jobSecret = stringValue(composer.jobSecret, '')
  const queueBaseUrl = stringValue(composer.falQueueBaseUrl, DEFAULT_QUEUE_BASE_URL)
  const runBaseUrl = stringValue(composer.falRunBaseUrl, DEFAULT_RUN_BASE_URL)
  const storageBaseUrl = stringValue(composer.falStorageBaseUrl, DEFAULT_STORAGE_BASE_URL)
  const allowInsecure = process.env.NODE_ENV === 'test'
  const allowedOrigins = resolveAllowedOrigins([queueBaseUrl, runBaseUrl, storageBaseUrl])
  const http = createFalHttpClient({
    apiKey: falKey,
    allowedOrigins,
    allowInsecure,
  })
  const storage = createFalStorageService({
    client: http,
    storageBaseUrl,
  })
  const queue = createFalQueueService({
    client: http,
    queueBaseUrl,
    allowedOrigins,
    allowInsecure,
  })
  const rateLimiter = new RateLimiter({
    config: {
      generateLimit: numberValue(composer.generateLimit, 3),
      generateWindowMs: numberValue(composer.generateWindowMs, 600_000),
      uploadLimit: numberValue(composer.uploadLimit, 5),
      uploadWindowMs: numberValue(composer.uploadWindowMs, 600_000),
      maxActiveJobs: numberValue(composer.maxActiveJobs, 1),
      maxGlobalJobs: numberValue(composer.maxGlobalJobs, 3),
      dailyGenerationBudget: numberValue(composer.dailyGenerationBudget, 50),
      jobTtlMs: numberValue(composer.jobTtlMs, 3_600_000),
    },
  })

  const validSecret = jobSecret.length >= 32
  const jobTokens = validSecret
    ? createJobTokenService({ secret: jobSecret })
    : null
  const orchestrator = jobTokens
    ? createGenerationOrchestrator({
        queue,
        models: modelRegistry,
        prompts: promptComposer,
        http,
        runBaseUrl,
        keyframeTimeoutMs: numberValue(composer.keyframeTimeoutMs, 45_000),
        jobTtlMs: numberValue(composer.jobTtlMs, 3_600_000),
        pollAfterMs: numberValue(composer.pollAfterMs, 2_000),
      })
    : null
  const generation = jobTokens && orchestrator
    ? new ComposerGenerationService({
        orchestrator,
        queue,
        rateLimiter,
        jobTokens,
        pollAfterMs: numberValue(composer.pollAfterMs, 2_000),
        jobTtlMs: numberValue(composer.jobTtlMs, 3_600_000),
      })
    : null

  const ipSalt = validSecret ? jobSecret : processIpSalt

  return {
    hasFalKey,
    ipSalt,
    rateLimiter,
    storage,
    queue,
    jobTokens,
    orchestrator,
    generation,
    uploadIdempotency: new IdempotencyStore<ComposerUploadTicket>(),
  }
}

export function getComposerRuntime(event: H3Event): ComposerRuntime {
  const raw = useRuntimeConfig(event) as unknown as AppRuntimeConfig
  const composer = raw.composer ?? {}
  const signature = JSON.stringify([
    raw.falKey ?? '',
    composer.jobSecret ?? '',
    composer.generateLimit ?? '',
    composer.generateWindowMs ?? '',
    composer.uploadLimit ?? '',
    composer.uploadWindowMs ?? '',
    composer.maxActiveJobs ?? '',
    composer.maxGlobalJobs ?? '',
    composer.dailyGenerationBudget ?? '',
    composer.jobTtlMs ?? '',
    composer.keyframeTimeoutMs ?? '',
    composer.pollAfterMs ?? '',
    composer.falQueueBaseUrl ?? '',
    composer.falRunBaseUrl ?? '',
    composer.falStorageBaseUrl ?? '',
  ])

  if (cachedRuntime?.signature === signature) {
    return cachedRuntime.runtime
  }

  const runtime = createRuntime(raw)
  cachedRuntime = { signature, runtime }

  return runtime
}
