import { tmpdir } from 'node:os'
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
import { FfmpegKeyframeLayoutInspector } from './keyframe-layout-inspector'
import type { StoryCostConfig, StoryCostGuard } from './cost'
import { createStoryCostGuard } from './cost'
import { createBriefingNarrativeDirector } from './briefing-director'
import { createStoryDirector } from './director'
import { createDeepSeekClient, DEFAULT_DEEPSEEK_BASE_URL } from './deepseek-client'
import { createStoryNarrativeDirector } from './narrative-director'
import { createStoryVisualDirector } from './visual-director'
import type { ReelPlanDirector, StoryDirector } from './director-types'
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
import { createPrismaReelStoryRepository } from './reel-repository'
import type { ReelStoryRepository } from './reel-repository'
import { createReelStoryDirector } from './reel-director'
import { createReelNarrativeDirector } from './reel-narrative-director'
import { createReelShotDirector } from './reel-shot-director'
import { createReelStoryService } from './reel-service'
import type { ReelStoryService } from './reel-service'
import { createReelCostGuard } from './reel-cost'
import type { ReelCostGuard } from './reel-cost'
import { createReelStoryReconciler } from './reel-reconciler'
import type { ReelStoryReconciler } from './reel-reconciler'
import { createShotAssembler } from './shot-assembly-service'
import type { ShotAssembler } from './shot-assembly-service'
import { createShotKeyframeOrchestrator } from './shot-keyframe-orchestrator'
import { createCharacterSheetOrchestrator } from './character-sheet-orchestrator'
import {
  createCharacterReferenceOrchestrator,
} from './character-ref-orchestrator'
import type { CharacterReferenceOrchestrator } from './character-ref-orchestrator'
import { createConsistencyChecker } from './consistency-check'
import type { ShotKeyframeOrchestrator } from './shot-keyframe-orchestrator'
import { createShotQCService } from './shot-qc-service'
import type { ShotQCService } from './shot-qc-service'
import { createShotVideoOrchestrator } from './shot-video-orchestrator'
import type { ShotVideoOrchestrator } from './shot-video-orchestrator'
import { createStoryService, hashStoryBody, canonicalStoryBody } from './story-service'
import type { StoryService } from './story-service'
import { createStoryQCService } from './qc-service'
import type { StoryQCService } from './qc-service'
import { QC_EVALUATOR_TIMEOUT_MS, createStoryQCEvaluator } from './qc-evaluator'
import { createStoryFrameExtractor } from './qc-frames'

interface RuntimeStoryConfig {
  readonly maxCostUsd?: number
  readonly costDirectorUsd?: number
  readonly costNarrativeUsd?: number
  readonly costVisualUsd?: number
  readonly costDirectorRepairUsd?: number
  readonly costKeyframeUsd?: number
  readonly costKeyframeReferenceUsd?: number
  readonly costVideoFastUsd?: number
  readonly costVideoQualityUsd?: number
  readonly costVideoQualityShortUsd?: number
  readonly costCharacterRefUsd?: number
  /** 012: a vision call per keyframe is paid, so it stays off unless asked. */
  readonly consistencyEnabled?: boolean
  readonly dailyBudgetUsd?: number
  readonly ttlMs?: number
  readonly reconcilerEnabled?: boolean
  readonly reconcilerIntervalMs?: number
  readonly leaseMs?: number
  readonly assemblyLeaseMs?: number
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
  readonly canonTimeoutMs?: number
  readonly beatsTimeoutMs?: number
  readonly visualTimeoutMs?: number
  readonly directorTotalTimeoutMs?: number
  readonly reelShotTimeoutMs?: number
  readonly reelDirectorTotalTimeoutMs?: number
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
  readonly reelRepository: ReelStoryRepository | null
  readonly reelDirector: ReelPlanDirector | null
  readonly reelService: ReelStoryService | null
  readonly reelCostGuard: ReelCostGuard
  readonly reelKeyframes: ShotKeyframeOrchestrator | null
  readonly reelCharacterRefs: CharacterReferenceOrchestrator | null
  readonly reelVideos: ShotVideoOrchestrator | null
  readonly reelAssembler: ShotAssembler | null
  readonly reelQcService: ShotQCService | null
  readonly reelReconciler: ReelStoryReconciler | null
  readonly reelShotTimeoutMs: number
  readonly reelDirectorTotalTimeoutMs: number
  readonly keyframes: KeyframeOrchestrator | null
  readonly videos: VideoOrchestrator | null
  readonly assembler: StoryAssembler | null
  readonly qcService: StoryQCService | null
  readonly qcEnabled: boolean
  readonly qcMinConfidence: number
  readonly costQcUsd: number
  readonly canonTimeoutMs: number
  readonly beatsTimeoutMs: number
  readonly visualTimeoutMs: number
  readonly directorTotalTimeoutMs: number
  readonly hasFfmpeg: boolean
  readonly videoConcurrency: number
  readonly assemblyTimeoutMs: number
  readonly reconciler: StoryReconciler | null
  readonly uploadIdempotency: Map<string, StoryUploadIdempotencyEntry>
}

const DEFAULT_QUEUE_BASE_URL = 'https://queue.fal.run'
const DEFAULT_RUN_BASE_URL = 'https://fal.run'
const DEFAULT_STORAGE_BASE_URL = 'https://rest.fal.ai'

const processIpSalt = randomBytes(32).toString('hex')

interface StoryLogEvent {
  readonly event: string
  readonly storyId?: string
  readonly sceneOrder?: number
  readonly errorCode?: string
  readonly reason?: string
  readonly pass?: 'narrative' | 'visual'
  readonly stage?: 'canon' | 'beats' | 'scenes' | 'shots'
  readonly attempt?: 1 | 2
  readonly finishReason?: string
  readonly mode?: string
  readonly latencyMs?: number
  readonly completionTokens?: number
  readonly reasoningTokens?: number
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
  const costConfig: StoryCostConfig = {
    maxStoryCostUsd: decimalValue(story.maxCostUsd, 8),
    directorCostUsd: decimalValue(story.costDirectorUsd, 0.01),
    narrativeCostUsd: decimalValue(story.costNarrativeUsd, 0.01),
    visualCostUsd: decimalValue(story.costVisualUsd, 0.012),
    directorRepairCostUsd: decimalValue(story.costDirectorRepairUsd, 0.01),
    keyframeCostUsd: decimalValue(story.costKeyframeUsd, 0.05),
    keyframeReferenceCostUsd: decimalValue(story.costKeyframeReferenceUsd, 0.08),
    videoFastCostUsd: decimalValue(story.costVideoFastUsd, 0.35),
    videoQualityCostUsd: decimalValue(story.costVideoQualityUsd, 0.7),
    videoQualityShortCostUsd: decimalValue(story.costVideoQualityShortUsd, 0.35),
    qcUnitCostUsd: costQcUsd,
    characterRefCostUsd: decimalValue(story.costCharacterRefUsd, 0.04),
    dailyBudgetUsd: decimalValue(story.dailyBudgetUsd, 50),
  }
  const costGuard = createStoryCostGuard(costConfig)
  const reelCostGuard = createReelCostGuard({ costs: costConfig })
  const canonTimeoutMs = numberValue(story.canonTimeoutMs, 60_000)
  const beatsTimeoutMs = numberValue(story.beatsTimeoutMs, 60_000)
  const visualTimeoutMs = numberValue(story.visualTimeoutMs, 40_000)
  const directorTotalTimeoutMs = numberValue(story.directorTotalTimeoutMs, 180_000)
  const reelShotTimeoutMs = numberValue(story.reelShotTimeoutMs, 75_000)
  const reelDirectorTotalTimeoutMs = numberValue(
    story.reelDirectorTotalTimeoutMs,
    300_000,
  )
  const deepseekClient = hasDeepSeekKey
    ? createDeepSeekClient({
        apiKey: deepseekKey,
        baseUrl: stringValue(story.deepseekBaseUrl, DEFAULT_DEEPSEEK_BASE_URL),
      })
    : null
  const narrative = deepseekClient
    ? createBriefingNarrativeDirector(createStoryNarrativeDirector({
        client: deepseekClient,
        onEvent: logStoryEvent,
        canonTimeoutMs,
        beatsTimeoutMs,
      }))
    : null
  const visual = deepseekClient
    ? createStoryVisualDirector({
        client: deepseekClient,
        onEvent: logStoryEvent,
        timeoutMs: visualTimeoutMs,
      })
    : null
  const director = narrative && visual
    ? createStoryDirector({
        narrative,
        visual,
        totalTimeoutMs: directorTotalTimeoutMs,
      })
    : null
  const reelNarrative = deepseekClient
    ? createReelNarrativeDirector({
        client: deepseekClient,
        onEvent: logStoryEvent,
        canonTimeoutMs,
        scenesTimeoutMs: beatsTimeoutMs,
      })
    : null
  const reelShots = deepseekClient
    ? createReelShotDirector({
        client: deepseekClient,
        onEvent: logStoryEvent,
        timeoutMs: reelShotTimeoutMs,
      })
    : null
  const reelDirector = reelNarrative && reelShots
    ? createReelStoryDirector({
        narrative: reelNarrative,
        shots: reelShots,
        totalTimeoutMs: reelDirectorTotalTimeoutMs,
      })
    : null
  const repository = databaseAvailable ? createPrismaStoryRepository() : null
  const reelRepository = databaseAvailable ? createPrismaReelStoryRepository() : null
  const keyframes = hasFalKey ? createKeyframeOrchestrator(queue) : null
  const videos = hasFalKey ? createVideoOrchestrator(queue) : null
  const reelKeyframes = hasFalKey ? createShotKeyframeOrchestrator(queue) : null
  const reelCharacterSheet = hasFalKey ? createCharacterSheetOrchestrator(queue) : null
  const reelCharacterRefs = hasFalKey ? createCharacterReferenceOrchestrator(queue) : null
  const reelVideos = hasFalKey ? createShotVideoOrchestrator(queue) : null
  const mediaStorage = hasFalKey
    ? createMediaStorage({ client, storageBaseUrl })
    : null
  const ffmpegPath = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
  const ffprobePath = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
  const hasFfmpeg = hasFfmpegBinary(ffmpegPath) && hasFfmpegBinary(ffprobePath)
  const assemblyTimeoutMs = numberValue(story.assemblyTimeoutMs, 420_000)
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
          deepseekClient
            ? {
                client: deepseekClient,
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
  const reelDownloader = createMediaDownloader({ maxOrder: 99 })
  const reelAssembler = mediaStorage
    ? createShotAssembler(
        {
          downloader: reelDownloader,
          runner: createFfmpegRunner(),
          mediaStorage,
          ffmpegPath,
          ffprobePath,
        },
        {
          totalTimeoutMs: numberValue(story.assemblyTimeoutMs, 420_000),
        },
      )
    : null
  const reelQcService = mediaStorage
    ? createShotQCService({
        frameExtractor: createStoryFrameExtractor({
          downloader: reelDownloader,
          runner: createFfmpegRunner(),
          mediaStorage,
          ffmpegPath,
          ffprobePath,
        }),
        evaluator: createStoryQCEvaluator(
          deepseekClient
            ? {
                client: deepseekClient,
                timeoutMs: QC_EVALUATOR_TIMEOUT_MS,
              }
            : null,
        ),
        costGuard: reelCostGuard,
        onEvent: logStoryEvent,
        config: {
          enabled: qcEnabled,
          minConfidence: qcMinConfidence,
          timeoutMs: numberValue(story.qcTimeoutMs, 600_000),
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
  const reelService = reelRepository
    ? createReelStoryService({
        repository: reelRepository,
        director: reelDirector,
        keyframes: reelKeyframes,
        characterSheet: reelCharacterSheet,
        videos: reelVideos,
        costGuard: reelCostGuard,
        qcEnabled,
        rateLimiter,
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
  const reelLayoutInspector = hasFfmpeg
    ? new FfmpegKeyframeLayoutInspector(createFfmpegRunner(), ffmpegPath, tmpdir())
    : null
  const reelReconciler = reelRepository && reelKeyframes && reelVideos && reelAssembler
    ? createReelStoryReconciler({
        repository: reelRepository,
        keyframes: reelKeyframes,
        characterSheet: reelCharacterSheet,
        characterReferences: reelCharacterRefs,
        layoutInspector: reelLayoutInspector,
        // Off by default: every keyframe would cost a vision call that no
        // profile budgets for. Turn on only with a measured smoke.
        consistency:
          deepseekClient === null || booleanValue(story.consistencyEnabled, false) !== true
            ? null
            : createConsistencyChecker({ client: deepseekClient }),
        videos: reelVideos,
        assembler: reelAssembler,
        qcService: reelQcService,
        costGuard: reelCostGuard,
        qcEnabled,
        onEvent: logStoryEvent,
        config: {
          leaseMs: numberValue(story.leaseMs, 60_000),
          assemblyLeaseMs: numberValue(story.assemblyLeaseMs, 480_000),
          qcLeaseMs: numberValue(story.qcLeaseMs, 720_000),
          tickBudgetMs: 45_000,
          keyframeConcurrency: numberValue(story.keyframeConcurrency, 6),
          videoConcurrency: numberValue(story.videoConcurrency, 4),
          claimLimit: 5,
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
    reelRepository,
    reelDirector,
    reelService,
    reelCostGuard,
    reelKeyframes,
    reelCharacterRefs,
    reelVideos,
    reelAssembler,
    reelQcService,
    reelReconciler,
    reelShotTimeoutMs,
    reelDirectorTotalTimeoutMs,
    keyframes,
    videos,
    assembler,
    qcService,
    qcEnabled,
    qcMinConfidence,
    costQcUsd,
    canonTimeoutMs,
    beatsTimeoutMs,
    visualTimeoutMs,
    directorTotalTimeoutMs,
    hasFfmpeg,
    videoConcurrency: numberValue(story.videoConcurrency, 4),
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
