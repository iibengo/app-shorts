import type { StoryRuntime } from '../../server/story/runtime'
import type { StoryRepository } from '../../server/story/repository'
import type { StoryDirector } from '../../server/story/director-types'
import type { StoryService } from '../../server/story/story-service'
import type { KeyframeOrchestrator } from '../../server/story/keyframe-orchestrator'
import type { VideoOrchestrator } from '../../server/story/video-orchestrator'
import type { StoryCostConfigOptions } from '../../server/story/cost'
import type { StoryQCService } from '../../server/story/qc-service'
import type { FalStorageService } from '../../server/fal/storage-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../server/story/rate-limit'
import type { StoryRateLimitConfig } from '../../server/story/rate-limit'
import { createStoryCostGuard } from '../../server/story/cost'
import { createStoryService } from '../../server/story/story-service'
import { FakeStoryDirector, FakeStoryRepository } from './story'

export interface StoryRuntimeOptions {
  readonly repository?: StoryRepository
  readonly director?: StoryDirector | null
  readonly service?: StoryService | null
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
  const director = 'director' in options
    ? options.director ?? null
    : new FakeStoryDirector()
  const rateLimiter = createStoryRateLimiter({
    config: { ...DEFAULT_STORY_RATE_LIMIT_CONFIG, ...options.rateLimit },
    ...(options.now ? { now: options.now } : {}),
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
        ...(options.now ? { now: options.now } : {}),
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
    keyframes,
    videos,
    assembler: null,
    qcService: options.qcService ?? null,
    qcEnabled: options.qcEnabled ?? false,
    qcMinConfidence: options.qcMinConfidence ?? 0.7,
    costQcUsd: options.costQcUsd ?? 0.02,
    narrativeTimeoutMs: 40_000,
    visualTimeoutMs: 25_000,
    directorTotalTimeoutMs: 85_000,
    hasFfmpeg: options.hasFfmpeg ?? true,
    videoConcurrency: 2,
    assemblyTimeoutMs: 180_000,
    reconciler: null,
    uploadIdempotency: options.uploadIdempotency ?? new Map(),
  }

  return runtime as unknown as StoryRuntime
}
