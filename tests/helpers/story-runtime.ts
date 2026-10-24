import type { StoryRuntime } from '../../server/story/runtime'
import type { StoryRepository } from '../../server/story/repository'
import type { ReelPlanDirector, StoryDirector } from '../../server/story/director-types'
import type { StoryService } from '../../server/story/story-service'
import type { KeyframeOrchestrator } from '../../server/story/keyframe-orchestrator'
import type { VideoOrchestrator } from '../../server/story/video-orchestrator'
import type { StoryCostConfigOptions } from '../../server/story/cost'
import type { StoryQCService } from '../../server/story/qc-service'
import { createReelStoryService } from '../../server/story/reel-service'
import type { ReelStoryService } from '../../server/story/reel-service'
import type { FalStorageService } from '../../server/fal/storage-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../server/story/rate-limit'
import type { StoryRateLimitConfig } from '../../server/story/rate-limit'
import { createStoryCostGuard, DEFAULT_STORY_COST_CONFIG } from '../../server/story/cost'
import { createStoryService } from '../../server/story/story-service'
import { createReelCostGuard } from '../../server/story/reel-cost'
import { FakeStoryDirector, FakeStoryRepository, TEST_NOW } from './story'
import { FakeReelPlanDirector, FakeReelStoryRepository } from './story-reel'

export interface StoryRuntimeOptions {
  readonly repository?: StoryRepository
  readonly director?: StoryDirector | null
  readonly service?: StoryService | null
  readonly reelService?: ReelStoryService | null
  readonly reelDirector?: ReelPlanDirector | null
  readonly keyframes?: KeyframeOrchestrator | null
  readonly videos?: VideoOrchestrator | null
  readonly qcService?: StoryQCService | null
  readonly storage?: FalStorageService | null
  readonly hasFalKey?: boolean
  readonly hasDeepSeekKey?: boolean
  readonly hasDatabase?: boolean
  readonly hasFfmpeg?: boolean
  readonly qcEnabled?: boolean
  readonly qcMinConfidence?: number
  readonly costQcUsd?: number
  readonly pollAfterMs?: number
  readonly now?: () => number
  readonly rateLimit?: Partial<StoryRateLimitConfig>
  readonly cost?: StoryCostConfigOptions
  readonly uploadIdempotency?: StoryRuntime['uploadIdempotency']
}

export function makeStoryRuntime(options: StoryRuntimeOptions = {}): StoryRuntime {
  const repository = options.repository ?? new FakeStoryRepository()
  const now = options.now ?? (() => TEST_NOW)
  const director = 'director' in options
    ? options.director ?? null
    : new FakeStoryDirector()
  const rateLimiter = createStoryRateLimiter({
    config: { ...DEFAULT_STORY_RATE_LIMIT_CONFIG, ...options.rateLimit },
    now,
  })
  const costGuard = createStoryCostGuard(options.cost ?? {})
  const keyframes = options.keyframes ?? null
  const videos = options.videos ?? null
  const service = options.service !== undefined
    ? options.service
    : createStoryService({
        repository,
        director,
        keyframes,
        videos,
        rateLimiter,
        costGuard,
        config: { pollAfterMs: options.pollAfterMs ?? 2_500, storyTtlMs: 86_400_000 },
        now,
      })
  const reelRepository = new FakeReelStoryRepository()
  const reelDirector = options.reelDirector !== undefined
    ? options.reelDirector
    : new FakeReelPlanDirector()
  const reelService = options.reelService !== undefined
    ? options.reelService
    : createReelStoryService({
        repository: reelRepository,
        director: reelDirector,
        rateLimiter,
        config: { pollAfterMs: options.pollAfterMs ?? 2_500, storyTtlMs: 86_400_000 },
        now,
      })

  const runtime = {
    hasFalKey: options.hasFalKey ?? true,
    hasDeepSeekKey: options.hasDeepSeekKey ?? director !== null,
    hasDatabase: options.hasDatabase ?? true,
    ipSalt: 'story-test-ip-salt',
    pollAfterMs: options.pollAfterMs ?? 2_500,
    storyTtlMs: 86_400_000,
    reconcilerEnabled: false,
    reconcilerIntervalMs: 5_000,
    client: {},
    queue: {},
    storage: options.storage ?? null,
    mediaStorage: null,
    rateLimiter,
    costGuard,
    director,
    repository,
    service,
    reelRepository,
    reelDirector,
    reelService,
    reelCostGuard: createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG }),
    reelKeyframes: null,
    reelCharacterRefs: null,
    reelVideos: null,
    reelAssembler: null,
    reelQcService: null,
    reelReconciler: null,
    reelShotTimeoutMs: 75_000,
    reelDirectorTotalTimeoutMs: 300_000,
    keyframes,
    videos,
    assembler: null,
    qcService: options.qcService ?? null,
    qcEnabled: options.qcEnabled ?? false,
    qcMinConfidence: options.qcMinConfidence ?? 0.7,
    costQcUsd: options.costQcUsd ?? 0.02,
    canonTimeoutMs: 60_000,
    beatsTimeoutMs: 60_000,
    visualTimeoutMs: 40_000,
    directorTotalTimeoutMs: 180_000,
    hasFfmpeg: options.hasFfmpeg ?? true,
    videoConcurrency: 2,
    assemblyTimeoutMs: 180_000,
    reconciler: null,
    uploadIdempotency: options.uploadIdempotency ?? new Map(),
  }

  return runtime as unknown as StoryRuntime
}
