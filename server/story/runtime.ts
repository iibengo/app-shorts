import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { StoryUploadTicket } from '~/models/story'
import type { FalHttpClient } from '../fal/http-client'
import { createFalHttpClient } from '../fal/http-client'
import { createFalQueueService } from '../fal/queue-service'
import type { FalQueueService } from '../fal/queue-service'
import { createFalStorageService } from '../fal/storage-service'
import type { FalStorageService } from '../fal/storage-service'
import { createMediaStorage } from '../fal/media-storage'
import type { MediaStorage } from '../fal/media-storage'
import { FAL_API_ORIGINS } from '../fal/types'
import { hasDatabase } from '../db/prisma'
import { createStoryAssembler, hasFfmpegBinary } from './assembly-service'
import type { StoryAssembler } from './assembly-service'
import { createMediaDownloader } from './media-downloader'
import { createFfmpegRunner } from './ffmpeg-runner'
import type { StoryCostGuard } from './cost'
import { createStoryCostGuard } from './cost'
import { createBriefingDirector } from './briefing-director'
import { createStoryDirector } from './director'
import type { StoryDirector } from './director-types'
import { createKeyframeOrchestrator } from './keyframe-orchestrator'
import type { KeyframeOrchestrator } from './keyframe-orchestrator'
import { createVideoOrchestrator } from './video-orchestrator'
import type { VideoOrchestrator } from './video-orchestrator'
import { createStoryRateLimiter } from './rate-limit'
import type { StoryRateLimiter } from './rate-limit'
import {
  DEFAULT_STORY_RECONCILER_CONFIG,
  createStoryReconciler,
} from './reconciler'
import type { StoryReconciler } from './reconciler'
import { createPrismaStoryRepository } from './prisma-story-repository'
import type { StoryRepository } from './repository'
import { createStoryService, hashStoryBody, canonicalStoryBody } from './story-service'
import type { StoryService } from './story-service'
import { createStoryQCService } from './qc-service'
import type { StoryQCService } from './qc-service'
import { QC_EVALUATOR_TIMEOUT_MS, createStoryQCEvaluator } from './qc-evaluator'
import { createStoryFrameExtractor } from './qc-frames'

interface RuntimeStoryConfig {
  readonly maxCostUsd?: number
  readonly costDirectorUsd?: number
  readonly costKeyframeUsd?: number
  readonly costKeyframeReferenceUsd?: number
  readonly costVideoFastUsd?: number
  readonly costVideoQualityUsd?: number
  readonly dailyBudgetUsd?: number
  readonly ttlMs?: number
  readonly reconcilerEnabled?: boolean
  readonly reconcilerIntervalMs?: number
  readonly leaseMs?: number
  readonly keyframeConcurrency?: number
  readonly videoConcurrency?: number
  readonly pollAfterMs?: number
  readonly createLimit?: number
  readonly createWindowMs?: number
  readonly uploadLimit?: number
  readonly uploadWindowMs?: number
  readonly commandLimit?: number
  readonly commandWindowMs?: number
  readonly maxActiveStories?: number
  readonly directorModel?: string
  readonly directorTimeoutMs?: number
  readonly deepseekBaseUrl?: string
  readonly falQueueBaseUrl?: string
  readonly falRunBaseUrl?: string
  readonly falStorageBaseUrl?: string
  readonly assemblyTimeoutMs?: number
  readonly assemblyConcurrency?: number
  readonly costQcUsd?: number
  readonly qcEnabled?: boolean
  readonly qcTimeoutMs?: number
  readonly qcLeaseMs?: number
  readonly qcConcurrency?: number
  readonly qcMinConfidence?: number
  readonly qcRetryLimit?: number
  readonly qcRetryWindowMs?: number
  readonly qcModel?: string
}

interface AppRuntimeConfig {
  readonly falKey?: string
  readonly deepseekKey?: string
  readonly composer?: {
    readonly falQueueBaseUrl?: string
    readonly falRunBaseUrl?: string
    readonly falStorageBaseUrl?: string
  }
  readonly story?: RuntimeStoryConfig
}

export interface StoryUploadIdempotencyEntry {
  readonly bodyHash: string
  readonly ticket: StoryUploadTicket
}

export interface StoryRuntime {
  readonly hasFalKey: boolean
  readonly hasDeepSeekKey: boolean
  readonly hasDatabase: boolean
  readonly ipSalt: string
  readonly pollAfterMs: number
  readonly storyTtlMs: number
  readonly reconcilerEnabled: boolean
  readonly reconcilerIntervalMs: number
  readonly client: FalHttpClient
  readonly queue: FalQueueService
  readonly storage: FalStorageService
  readonly mediaStorage: MediaStorage | null
  readonly rateLimiter: StoryRateLimiter
  readonly costGuard: StoryCostGuard
  readonly director: StoryDirector | null
  readonly repository: StoryRepository | null
  readonly service: StoryService | null
  readonly keyframes: KeyframeOrchestrator | null
  readonly videos: VideoOrchestrator | null
  readonly assembler: StoryAssembler | null
  readonly qcService: StoryQCService | null
  readonly qcEnabled: boolean
  readonly qcMinConfidence: number
  readonly costQcUsd: number
  readonly hasFfmpeg: boolean
  readonly videoConcurrency: number
  readonly assemblyTimeoutMs: number
  readonly reconciler: StoryReconciler | null
  readonly uploadIdempotency: Map<string, StoryUploadIdempotencyEntry>
}

const DEFAULT_QUEUE_BASE_URL = 'https://queue.fal.run'
const DEFAULT_RUN_BASE_URL = 'https://fal.run'
const DEFAULT_STORAGE_BASE_URL = 'https://rest.fal.ai'
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

const processIpSalt = randomBytes(32).toString('hex')

interface StoryLogEvent {
  readonly event: string
  readonly storyId?: string
  readonly sceneOrder?: number
  readonly errorCode?: string
  readonly reason?: string
}

function logStoryEvent(event: StoryLogEvent): void {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  console.info(JSON.stringify({
    ...event,
    ts: new Date().toISOString(),
  }))
}

let cachedRuntime: { readonly signature: string; readonly runtime: StoryRuntime } | null = null

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.trunc(parsed)
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Cost configuration is expressed in USD and needs to keep decimals
 * (for example 0.05 per keyframe). Truncating it would silently disable
 * the budget guard.
 */
function decimalValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback
}

function resolveAllowedOrigins(baseUrls: readonly string[]): readonly string[] {
  const fixed = [...FAL_API_ORIGINS]

  if (process.env.NODE_ENV !== 'test') {
    return fixed
  }

  for (const baseUrl of baseUrls) {
    try {
      const origin = new URL(baseUrl).origin

      if (!fixed.includes(origin)) {
        fixed.push(origin)
      }
    } catch {
      // Invalid test overrides fall back to the fixed allowlist.
    }
  }

  return fixed
}

export function createStoryRuntime(config: AppRuntimeConfig): StoryRuntime {
  const falKey = stringValue(config.falKey, '')
  const deepseekKey = stringValue(config.deepseekKey, '')
  const story = config.story ?? {}
  const hasFalKey = falKey.length > 0
  const hasDeepSeekKey = deepseekKey.length > 0
  const databaseAvailable = hasDatabase()
  const queueBaseUrl = stringValue(
    story.falQueueBaseUrl ?? config.composer?.falQueueBaseUrl,
    DEFAULT_QUEUE_BASE_URL,
  )
  const runBaseUrl = stringValue(
    story.falRunBaseUrl ?? config.composer?.falRunBaseUrl,
    DEFAULT_RUN_BASE_URL,
  )
  const storageBaseUrl = stringValue(
    story.falStorageBaseUrl ?? config.composer?.falStorageBaseUrl,
    DEFAULT_STORAGE_BASE_URL,
  )
  const allowInsecure = process.env.NODE_ENV === 'test'
  const allowedOrigins = resolveAllowedOrigins([queueBaseUrl, runBaseUrl, storageBaseUrl])
  const client = createFalHttpClient({
    apiKey: falKey,
    allowedOrigins,
    allowInsecure,
  })
  const queue = createFalQueueService({
    client,
    queueBaseUrl,
    allowedOrigins,
    allowInsecure,
  })
  const storage = createFalStorageService({
    client,
    storageBaseUrl,
    filePrefix: 'story-ref-',
    lifecycleSeconds: 3_600,
  })
  const pollAfterMs = numberValue(story.pollAfterMs, 2_500)
  const qcEnabled = booleanValue(story.qcEnabled, false)
  const qcMinConfidence = decimalValue(story.qcMinConfidence, 0.7)
  const costQcUsd = decimalValue(story.costQcUsd, 0.02)
  const storyTtlMs = numberValue(story.ttlMs, 86_400_000)
  const rateLimiter = createStoryRateLimiter({
    config: {
      createLimit: numberValue(story.createLimit, 3),
      createWindowMs: numberValue(story.createWindowMs, 3_600_000),
      uploadLimit: numberValue(story.uploadLimit, 5),
      uploadWindowMs: numberValue(story.uploadWindowMs, 600_000),
      uploadIpLimit: 20,
      uploadIpWindowMs: 3_600_000,
      commandLimit: numberValue(story.commandLimit, 10),
      commandWindowMs: numberValue(story.commandWindowMs, 60_000),
      pollWindowMs: 1_500,
      cancelLimit: 3,
      cancelWindowMs: 60_000,
      assembleLimit: 3,
      assembleWindowMs: 3_600_000,
      qcRetryLimit: numberValue(story.qcRetryLimit, 3),
      qcRetryWindowMs: numberValue(story.qcRetryWindowMs, 3_600_000),
      maxActiveStories: numberValue(story.maxActiveStories, 2),
      dailyBudgetUsd: decimalValue(story.dailyBudgetUsd, 50),
    },
  })
  const costGuard = createStoryCostGuard({
    maxStoryCostUsd: decimalValue(story.maxCostUsd, 8),
    directorCostUsd: decimalValue(story.costDirectorUsd, 0.01),
    keyframeCostUsd: decimalValue(story.costKeyframeUsd, 0.05),
    keyframeReferenceCostUsd: decimalValue(story.costKeyframeReferenceUsd, 0.08),
    videoFastCostUsd: decimalValue(story.costVideoFastUsd, 0.35),
    videoQualityCostUsd: decimalValue(story.costVideoQualityUsd, 0.7),
    qcUnitCostUsd: costQcUsd,
    dailyBudgetUsd: decimalValue(story.dailyBudgetUsd, 50),
  })
  const director = hasDeepSeekKey
    ? createBriefingDirector(
        createStoryDirector({
          apiKey: deepseekKey,
          baseUrl: stringValue(story.deepseekBaseUrl, DEFAULT_DEEPSEEK_BASE_URL),
          timeoutMs: numberValue(story.directorTimeoutMs, 45_000),
          onEvent: logStoryEvent,
        }),
      )
    : null
  const repository = databaseAvailable ? createPrismaStoryRepository() : null
  const keyframes = hasFalKey ? createKeyframeOrchestrator(queue) : null
  const videos = hasFalKey ? createVideoOrchestrator(queue) : null
  const mediaStorage = hasFalKey
    ? createMediaStorage({ client, storageBaseUrl })
    : null
  const ffmpegPath = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const ffprobePath = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
  const hasFfmpeg = hasFfmpegBinary(ffmpegPath) && hasFfmpegBinary(ffprobePath)
  const assemblyTimeoutMs = numberValue(story.assemblyTimeoutMs, 180_000)
  const assembler = mediaStorage
    ? createStoryAssembler(
        {
          downloader: createMediaDownloader(),
          runner: createFfmpegRunner(),
          mediaStorage,
          ffmpegPath,
          ffprobePath,
        },
        { totalTimeoutMs: assemblyTimeoutMs },
      )
    : null
  const qcService = mediaStorage
    ? createStoryQCService({
        frameExtractor: createStoryFrameExtractor({
          downloader: createMediaDownloader(),
          runner: createFfmpegRunner(),
          mediaStorage,
          ffmpegPath,
          ffprobePath,
        }),
        evaluator: createStoryQCEvaluator(
          hasDeepSeekKey
            ? {
                apiKey: deepseekKey,
                baseUrl: stringValue(story.deepseekBaseUrl, DEFAULT_DEEPSEEK_BASE_URL),
                model: stringValue(story.qcModel, 'deepseek-flash'),
                timeoutMs: QC_EVALUATOR_TIMEOUT_MS,
              }
            : null,
        ),
        costGuard,
        onEvent: logStoryEvent,
        config: {
          enabled: qcEnabled,
          minConfidence: qcMinConfidence,
          timeoutMs: numberValue(story.qcTimeoutMs, 240_000),
        },
      })
    : null
  const service = repository
    ? createStoryService({
        repository,
        director,
        keyframes,
        videos,
        rateLimiter,
        costGuard,
        onEvent: logStoryEvent,
        config: { pollAfterMs, storyTtlMs },
      })
    : null
  const reconciler = repository && keyframes && videos && assembler
    ? createStoryReconciler({
        repository,
        keyframes,
        videos,
        assembler,
        qcService,
        costGuard,
        onEvent: logStoryEvent,
        config: {
          leaseMs: numberValue(story.leaseMs, DEFAULT_STORY_RECONCILER_CONFIG.leaseMs),
          assemblyLeaseMs: DEFAULT_STORY_RECONCILER_CONFIG.assemblyLeaseMs,
          qcLeaseMs: numberValue(
            story.qcLeaseMs,
            DEFAULT_STORY_RECONCILER_CONFIG.qcLeaseMs,
          ),
          qcTimeoutMs: numberValue(
            story.qcTimeoutMs,
            DEFAULT_STORY_RECONCILER_CONFIG.qcTimeoutMs,
          ),
          tickBudgetMs: 45_000,
          keyframeConcurrency: numberValue(
            story.keyframeConcurrency,
            DEFAULT_STORY_RECONCILER_CONFIG.keyframeConcurrency,
          ),
          videoConcurrency: numberValue(
            story.videoConcurrency,
            DEFAULT_STORY_RECONCILER_CONFIG.videoConcurrency,
          ),
          qcConcurrency: numberValue(
            story.qcConcurrency,
            DEFAULT_STORY_RECONCILER_CONFIG.qcConcurrency,
          ),
          claimLimit: DEFAULT_STORY_RECONCILER_CONFIG.claimLimit,
          cleanupIntervalMs: DEFAULT_STORY_RECONCILER_CONFIG.cleanupIntervalMs,
          cleanupBatchSize: DEFAULT_STORY_RECONCILER_CONFIG.cleanupBatchSize,
          cleanupGraceMs: DEFAULT_STORY_RECONCILER_CONFIG.cleanupGraceMs,
        },
      })
    : null

  return {
    hasFalKey,
    hasDeepSeekKey,
    hasDatabase: databaseAvailable,
    ipSalt: processIpSalt,
    pollAfterMs,
    storyTtlMs,
    reconcilerEnabled: booleanValue(story.reconcilerEnabled, true),
    reconcilerIntervalMs: numberValue(story.reconcilerIntervalMs, 5_000),
    client,
    queue,
    storage,
    mediaStorage,
    rateLimiter,
    costGuard,
    director,
    repository,
    service,
    keyframes,
    videos,
    assembler,
    qcService,
    qcEnabled,
    qcMinConfidence,
    costQcUsd,
    hasFfmpeg,
    videoConcurrency: numberValue(
      story.videoConcurrency,
      DEFAULT_STORY_RECONCILER_CONFIG.videoConcurrency,
    ),
    assemblyTimeoutMs,
    reconciler,
    uploadIdempotency: new Map<string, StoryUploadIdempotencyEntry>(),
  }
}

function runtimeSignature(raw: AppRuntimeConfig): string {
  return JSON.stringify([
    raw.falKey ?? '',
    raw.deepseekKey ?? '',
    raw.composer?.falQueueBaseUrl ?? '',
    raw.composer?.falRunBaseUrl ?? '',
    raw.composer?.falStorageBaseUrl ?? '',
    raw.story ?? {},
  ])
}

export function getStoryRuntime(event: H3Event): StoryRuntime {
  const override = (event.context as { readonly storyRuntime?: StoryRuntime }).storyRuntime

  if (override) {
    return override
  }

  const raw = useRuntimeConfig(event) as unknown as AppRuntimeConfig
  const signature = runtimeSignature(raw)

  if (cachedRuntime?.signature === signature) {
    return cachedRuntime.runtime
  }

  const runtime = createStoryRuntime(raw)
  cachedRuntime = { signature, runtime }

  return runtime
}

export function storyBodyHash(canonical: string): string {
  return hashStoryBody(canonical)
}

export { canonicalStoryBody }
