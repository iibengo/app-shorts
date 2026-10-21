import { createHash } from 'node:crypto'
import type {
  SceneStatus,
  Story,
  StoryBeatUpdateRequest,
  StoryErrorCode,
  StoryJob,
  StoryPlan,
  StoryPreset,
  StoryScene,
  StorySceneCount,
  StoryStatus,
} from '~/models/story'
import { IdempotencyStore } from '../shared/rate-limit'
import type { StoryCostGuard } from './cost'
import type { StoryDirector } from './director-types'
import { StoryError, getStoryErrorDefinition, storyErrorMessage, toStoryError } from './errors'
import type { KeyframeOrchestrator } from './keyframe-orchestrator'
import type { StoryRateLimiter } from './rate-limit'
import type { VideoOrchestrator } from './video-orchestrator'
import type {
  CreateSceneRecord,
  SceneRecord,
  StoryRecord,
  StoryRepository,
} from './repository'

export interface StoryServiceConfig {
  readonly pollAfterMs: number
  readonly storyTtlMs: number
}

export interface CreateStoryInput {
  readonly sessionId: string
  readonly request: {
    readonly premise: string
    readonly sceneCount: StorySceneCount
    readonly preset: StoryPreset
    readonly referenceUrl: string | null
    readonly referenceExpiresAt: string | null
  }
  readonly idempotencyKey: string | null
  readonly bodyHash: string
}

export interface CreateStoryResult {
  readonly story: StoryRecord
  readonly replayed: boolean
}

export interface UpdateBeatInput {
  readonly storyId: string
  readonly sessionId: string
  readonly sceneId: string
  readonly update: StoryBeatUpdateRequest
}

export interface StoryService {
  create(input: CreateStoryInput): Promise<CreateStoryResult>
  get(id: string, sessionId: string): Promise<StoryRecord>
  updateBeatAndRegenerate(input: UpdateBeatInput): Promise<StoryRecord>
  approve(id: string, sessionId: string): Promise<StoryRecord>
  retryVideo(id: string, sessionId: string, sceneId: string): Promise<StoryRecord>
  requestAssembly(id: string, sessionId: string): Promise<StoryRecord>
  cancel(id: string, sessionId: string): Promise<StoryRecord>
}

export interface StoryServiceEvent {
  readonly event: string
  readonly storyId?: string
  readonly sceneOrder?: number
  readonly errorCode?: string
}

export interface StoryServiceOptions {
  readonly repository: StoryRepository
  readonly director: StoryDirector | null
  readonly rateLimiter: StoryRateLimiter
  readonly costGuard: StoryCostGuard
  readonly config: StoryServiceConfig
  readonly keyframes?: KeyframeOrchestrator | null
  readonly videos?: VideoOrchestrator | null
  readonly now?: () => number
  readonly onEvent?: (event: StoryServiceEvent) => void
  readonly idempotency?: IdempotencyStore<StoryRecord>
  readonly autoDedupe?: IdempotencyStore<StoryRecord>
}

const REGENERABLE_SCENE_STATUSES: readonly SceneStatus[] = [
  'KEYFRAME_READY',
  'KEYFRAME_FAILED',
]

export function canonicalStoryBody(request: CreateStoryInput['request']): string {
  return JSON.stringify([
    request.premise,
    request.sceneCount,
    request.preset,
    request.referenceUrl,
    request.referenceExpiresAt,
  ])
}

export function hashStoryBody(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex')
}

function toSceneCount(value: number): StorySceneCount {
  if (value === 4 || value === 5 || value === 6) {
    return value
  }

  return 5
}

function sceneError(scene: SceneRecord): StoryScene['error'] {
  const code: StoryErrorCode | null = scene.status === 'VIDEO_FAILED'
    ? scene.videoError
    : scene.status === 'KEYFRAME_FAILED'
      ? scene.keyframeError
      : null

  if (!code) {
    return null
  }

  return {
    code,
    message: storyErrorMessage(code),
    retryable: getStoryErrorDefinition(code).retryable,
  }
}

function sceneDto(scene: SceneRecord): StoryScene {
  return {
    id: scene.id,
    order: scene.order,
    visualPrompt: scene.visualPrompt,
    narration: scene.narration,
    status: scene.status,
    keyframeUrl: scene.keyframeUrl,
    keyframeAttempts: scene.keyframeAttempts,
    videoUrl: scene.videoUrl,
    videoAttempts: scene.videoAttempts,
    error: sceneError(scene),
  }
}

function storyErrorDto(story: StoryRecord): Story['error'] {
  if (!story.errorCode) {
    return null
  }

  return {
    code: story.errorCode,
    message: story.errorMessage ?? storyErrorMessage(story.errorCode),
    retryable: getStoryErrorDefinition(story.errorCode).retryable,
  }
}

function pollAfterFor(status: StoryStatus, pollAfterMs: number): number {
  if (status === 'READY' || status === 'FAILED' || status === 'CANCELLED') {
    return 0
  }

  return pollAfterMs
}

export function toStoryDto(story: StoryRecord, pollAfterMs: number, now: number): Story {
  const referenceActive =
    story.referenceUrl !== null
    && story.referenceExpiresAt !== null
    && story.referenceExpiresAt.getTime() > now

  return {
    id: story.id,
    status: story.status,
    premise: story.premise,
    title: story.title,
    logline: story.logline,
    referenceUrl: referenceActive ? story.referenceUrl : null,
    referenceExpiresAt: referenceActive && story.referenceExpiresAt
      ? story.referenceExpiresAt.toISOString()
      : null,
    preset: story.preset,
    modelId: story.preset === 'quality' ? 'kling-2.5-turbo-pro' : 'minimax-hailuo-02',
    sceneCount: toSceneCount(story.sceneCount),
    durationSeconds: 6,
    totalDurationSeconds: toSceneCount(story.sceneCount) * 6,
    aspectRatio: '9:16',
    plan: story.plan,
    scenes: story.scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(sceneDto),
    finalVideoUrl: story.finalVideoUrl,
    finalVideoExpiresAt: story.finalVideoExpiresAt?.toISOString() ?? null,
    approvedAt: story.approvedAt?.toISOString() ?? null,
    completedAt: story.completedAt?.toISOString() ?? null,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    version: story.version,
    error: storyErrorDto(story),
    pollAfterMs: pollAfterFor(story.status, pollAfterMs),
  }
}

export function toStoryJob(story: StoryRecord, pollAfterMs: number): StoryJob {
  return {
    storyId: story.id,
    status: story.status,
    version: story.version,
    pollAfterMs: pollAfterFor(story.status, pollAfterMs),
  }
}

function matchesRequest(
  story: StoryRecord,
  request: CreateStoryInput['request'],
): boolean {
  return (
    story.premise === request.premise
    && story.sceneCount === request.sceneCount
    && story.preset === request.preset
    && story.referenceUrl === request.referenceUrl
  )
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { readonly code?: unknown }).code === 'P2002'
  )
}

export class StoryServiceImpl implements StoryService {
  private readonly repository: StoryRepository
  private readonly director: StoryDirector | null
  private readonly rateLimiter: StoryRateLimiter
  private readonly costGuard: StoryCostGuard
  private readonly config: StoryServiceConfig
  private readonly keyframes: KeyframeOrchestrator | null
  private readonly videos: VideoOrchestrator | null
  private readonly now: () => number
  private readonly onEvent: (event: StoryServiceEvent) => void
  private readonly idempotency: IdempotencyStore<StoryRecord>
  private readonly autoDedupe: IdempotencyStore<StoryRecord>

  constructor(options: StoryServiceOptions) {
    this.repository = options.repository
    this.director = options.director
    this.rateLimiter = options.rateLimiter
    this.costGuard = options.costGuard
    this.config = options.config
    this.keyframes = options.keyframes ?? null
    this.videos = options.videos ?? null
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent ?? (() => undefined)
    this.idempotency = options.idempotency ?? new IdempotencyStore<StoryRecord>()
    this.autoDedupe = options.autoDedupe
      ?? new IdempotencyStore<StoryRecord>({ ttlMs: 60_000 })
  }

  async create(input: CreateStoryInput): Promise<CreateStoryResult> {
    const director = this.director

    if (!director) {
      throw new StoryError('director-not-configured')
    }

    const replay = await this.resolveReplay(input)

    if (replay) {
      return replay
    }

    const sessionActive = await this.repository.countActive(input.sessionId)
    const globalActive = await this.repository.countActiveGlobal()

    this.rateLimiter.assertCanCreate(input.sessionId, sessionActive, globalActive)
    this.rateLimiter.consumeCreate(input.sessionId)

    const estimatedCost = this.costGuard.estimateNewStory(
      input.request.preset,
      input.request.sceneCount,
      input.request.referenceUrl !== null,
    )

    this.costGuard.assertWithinBudget(estimatedCost)
    this.rateLimiter.consumeDailyBudget(estimatedCost)

    const storeKey = input.idempotencyKey
      ? `${input.sessionId}:${input.idempotencyKey}`
      : null

    if (storeKey) {
      this.idempotency.setPending(storeKey, input.bodyHash)
    }

    this.rateLimiter.beginCreation(input.sessionId)
    this.onEvent({ event: 'story.create.start' })

    try {
      const plan = await director.createPlan({
        premise: input.request.premise,
        sceneCount: input.request.sceneCount,
        referenceUrl: input.request.referenceUrl,
      })
      const story = await this.persistStory(input, plan)

      if (storeKey) {
        this.idempotency.setDone(storeKey, input.bodyHash, story)
      }

      this.autoDedupe.setDone(this.autoKey(input.sessionId, input.bodyHash), input.bodyHash, story)
      this.onEvent({ event: 'story.create.ok', storyId: story.id })

      return { story, replayed: false }
    } catch (error) {
      if (storeKey) {
        this.idempotency.delete(storeKey)
      }

      if (isUniqueConstraintError(error) && input.idempotencyKey) {
        const existing = await this.repository.findBySessionAndIdempotencyKey(
          input.sessionId,
          input.idempotencyKey,
        )

        if (existing) {
          if (!matchesRequest(existing, input.request)) {
            throw new StoryError('idempotency-conflict')
          }

          if (storeKey) {
            this.idempotency.setDone(storeKey, input.bodyHash, existing)
          }

          return { story: existing, replayed: true }
        }
      }

      this.onEvent({
        event: 'story.create.failed',
        errorCode: toStoryError(error).code,
      })

      throw error
    } finally {
      this.rateLimiter.endCreation(input.sessionId)
    }
  }

  async get(id: string, sessionId: string): Promise<StoryRecord> {
    const story = await this.repository.findOwnedById(id, sessionId)

    if (!story) {
      throw new StoryError('story-not-found')
    }

    this.assertNotExpired(story)

    this.rateLimiter.consumePoll(story.id)

    return story
  }

  async updateBeatAndRegenerate(input: UpdateBeatInput): Promise<StoryRecord> {
    const story = await this.findOwned(input.storyId, input.sessionId)
    const scene = story.scenes.find((item) => item.id === input.sceneId)

    if (!scene) {
      throw new StoryError('beat-not-found')
    }

    const retryableFailure = story.status === 'FAILED' && story.errorCode === 'keyframe-failed'

    if (story.status !== 'WAITING_APPROVAL' && !retryableFailure) {
      throw new StoryError('story-not-ready')
    }

    if (!REGENERABLE_SCENE_STATUSES.includes(scene.status)) {
      throw new StoryError('scene-not-ready')
    }

    const regenerate = input.update.regenerate ?? true
    const promptChanged = input.update.visualPrompt !== scene.visualPrompt

    if (!regenerate && !promptChanged) {
      const narration = input.update.narration

      if (narration !== undefined && narration !== scene.narration) {
        const updated = await this.repository.updateScene(
          story.id,
          scene.id,
          { statuses: REGENERABLE_SCENE_STATUSES },
          { narration },
        )

        if (updated === 0) {
          throw new StoryError('scene-not-ready')
        }
      }

      return this.reload(story.id)
    }

    if (scene.keyframeAttempts >= 2) {
      throw new StoryError('keyframe-limit-reached')
    }

    this.costGuard.assertWithinBudget(this.costGuard.estimateAfterKeyframeAttempt(story))

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_APPROVAL', 'FAILED'], version: story.version },
      {
        status: 'GENERATING_KEYFRAMES',
        approvedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )

    if (storyUpdated === 0) {
      throw new StoryError('story-not-ready')
    }

    const sceneUpdated = await this.repository.updateScene(
      story.id,
      scene.id,
      { statuses: REGENERABLE_SCENE_STATUSES },
      {
        status: 'KEYFRAME_QUEUED',
        visualPrompt: input.update.visualPrompt,
        ...(input.update.narration === undefined
          ? {}
          : { narration: input.update.narration }),
        keyframeError: null,
        keyframeRequestId: null,
        keyframeStatusUrl: null,
        keyframeResponseUrl: null,
        keyframeCancelUrl: null,
      },
    )

    if (sceneUpdated === 0) {
      throw new StoryError('scene-not-ready')
    }

    return this.reload(story.id)
  }

  async approve(id: string, sessionId: string): Promise<StoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (
      story.status === 'GENERATING_VIDEOS'
      || story.status === 'VIDEOS_READY'
      || story.status === 'ASSEMBLING'
      || story.status === 'READY'
    ) {
      return story
    }

    if (story.status !== 'WAITING_APPROVAL') {
      throw new StoryError('story-not-ready')
    }

    const allReady = story.scenes.every((scene) => scene.status === 'KEYFRAME_READY')

    if (!allReady) {
      throw new StoryError('story-not-ready')
    }

    this.costGuard.assertWithinBudget(this.costGuard.estimateVideosApproval(story))

    const updated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_APPROVAL'], version: story.version },
      {
        status: 'GENERATING_VIDEOS',
        approvedAt: new Date(this.now()),
        errorCode: null,
        errorMessage: null,
      },
    )

    if (updated === 0) {
      const current = await this.findOwned(id, sessionId)

      if (current.status === 'GENERATING_VIDEOS' || current.status === 'VIDEOS_READY') {
        return current
      }

      throw new StoryError('story-not-ready')
    }

    this.onEvent({ event: 'story.approve', storyId: story.id })

    return this.reload(story.id)
  }

  async retryVideo(id: string, sessionId: string, sceneId: string): Promise<StoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const scene = story.scenes.find((item) => item.id === sceneId)

    if (!scene) {
      throw new StoryError('beat-not-found')
    }

    const retryableFailure = story.status === 'FAILED' && story.errorCode === 'video-failed'

    if (story.status !== 'GENERATING_VIDEOS' && !retryableFailure) {
      throw new StoryError('story-not-ready')
    }

    if (scene.status !== 'VIDEO_FAILED') {
      throw new StoryError('scene-not-ready')
    }

    if (scene.videoAttempts >= 2) {
      throw new StoryError('video-retry-limit-reached')
    }

    this.costGuard.assertWithinBudget(this.costGuard.estimateAfterVideoAttempt(story))

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: ['GENERATING_VIDEOS', 'FAILED'], version: story.version },
      {
        status: 'GENERATING_VIDEOS',
        errorCode: null,
        errorMessage: null,
      },
    )

    if (storyUpdated === 0) {
      throw new StoryError('story-not-ready')
    }

    const sceneUpdated = await this.repository.updateScene(
      story.id,
      scene.id,
      { statuses: ['VIDEO_FAILED'] },
      {
        status: 'VIDEO_QUEUED',
        videoError: null,
        videoRequestId: null,
        videoStatusUrl: null,
        videoResponseUrl: null,
        videoCancelUrl: null,
      },
    )

    if (sceneUpdated === 0) {
      throw new StoryError('scene-not-ready')
    }

    this.onEvent({
      event: 'story.video.retry',
      storyId: story.id,
      sceneOrder: scene.order,
    })

    return this.reload(story.id)
  }

  async requestAssembly(id: string, sessionId: string): Promise<StoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (story.status === 'READY' || story.status === 'ASSEMBLING') {
      return story
    }

    const retryableFailure =
      story.status === 'FAILED'
      && (
        story.errorCode === 'assembly-failed'
        || story.errorCode === 'assembly-timeout'
        || story.errorCode === 'ffmpeg-not-configured'
      )

    if (story.status !== 'VIDEOS_READY' && !retryableFailure) {
      throw new StoryError('story-not-ready')
    }

    if (!story.scenes.every((scene) => scene.status === 'VIDEO_READY')) {
      throw new StoryError('story-not-ready')
    }

    const queue = await this.repository.countByStatus('VIDEOS_READY')
    const waiting = story.status === 'VIDEOS_READY' ? queue - 1 : queue

    if (waiting >= 2) {
      throw new StoryError('assembly-busy', { retryAfterSeconds: 30 })
    }

    const updated = await this.repository.updateStory(
      story.id,
      { statuses: ['VIDEOS_READY', 'FAILED'], version: story.version },
      {
        status: 'VIDEOS_READY',
        errorCode: null,
        errorMessage: null,
      },
    )

    if (updated === 0) {
      throw new StoryError('story-not-ready')
    }

    this.onEvent({ event: 'story.assembly.request', storyId: story.id })

    return this.reload(story.id)
  }

  async cancel(id: string, sessionId: string): Promise<StoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (story.status === 'CANCELLED') {
      return story
    }

    if (story.status === 'READY' || story.status === 'FAILED') {
      throw new StoryError('story-not-cancellable')
    }

    const cancelled = await this.repository.cancel(id, sessionId, new Date(this.now()))

    if (!cancelled) {
      const current = await this.repository.findOwnedById(id, sessionId)

      if (current?.status === 'CANCELLED') {
        return current
      }

      throw new StoryError('cancel-failed')
    }

    await this.cancelProviderJobs(story)

    this.onEvent({ event: 'story.cancel', storyId: story.id })

    return this.reload(id)
  }

  private async cancelProviderJobs(story: StoryRecord): Promise<void> {
    for (const scene of story.scenes) {
      const keyframeActive =
        scene.keyframeRequestId !== null
        && (scene.status === 'KEYFRAME_QUEUED' || scene.status === 'KEYFRAME_RUNNING')

      if (this.keyframes && keyframeActive && scene.keyframeCancelUrl) {
        try {
          await this.keyframes.cancel(scene)
        } catch (error) {
          this.onEvent({
            event: 'story.cancel.failed',
            storyId: story.id,
            sceneOrder: scene.order,
            errorCode: toStoryError(error).code,
          })
        }
      }

      const videoActive =
        scene.videoRequestId !== null
        && (scene.status === 'VIDEO_QUEUED' || scene.status === 'VIDEO_RUNNING')

      if (this.videos && videoActive && scene.videoCancelUrl) {
        try {
          await this.videos.cancel(scene)
        } catch (error) {
          this.onEvent({
            event: 'story.cancel.failed',
            storyId: story.id,
            sceneOrder: scene.order,
            errorCode: toStoryError(error).code,
          })
        }
      }
    }
  }

  private async resolveReplay(input: CreateStoryInput): Promise<CreateStoryResult | null> {
    if (input.idempotencyKey) {
      const storeKey = `${input.sessionId}:${input.idempotencyKey}`
      const entry = this.idempotency.get(storeKey)

      if (entry) {
        if (entry.bodyHash !== input.bodyHash) {
          throw new StoryError('idempotency-conflict')
        }

        if (entry.status === 'done') {
          return { story: entry.value, replayed: true }
        }

        throw new StoryError('idempotency-conflict')
      }

      const existing = await this.repository.findBySessionAndIdempotencyKey(
        input.sessionId,
        input.idempotencyKey,
      )

      if (existing) {
        if (!matchesRequest(existing, input.request)) {
          throw new StoryError('idempotency-conflict')
        }

        this.idempotency.setDone(storeKey, input.bodyHash, existing)

        return { story: existing, replayed: true }
      }

      return null
    }

    const autoEntry = this.autoDedupe.get(this.autoKey(input.sessionId, input.bodyHash))

    if (autoEntry && autoEntry.status === 'done') {
      return { story: autoEntry.value, replayed: true }
    }

    return null
  }

  private autoKey(sessionId: string, bodyHash: string): string {
    return `auto:${sessionId}:${bodyHash}`
  }

  private async persistStory(
    input: CreateStoryInput,
    plan: StoryPlan,
  ): Promise<StoryRecord> {
    const now = new Date(this.now())
    const expiresAt = new Date(now.getTime() + this.config.storyTtlMs)
    const scenes: CreateSceneRecord[] = plan.beats.map((beat) => ({
      order: beat.order,
      visualPrompt: beat.visualPrompt,
      narration: beat.narration,
      status: 'PENDING',
    }))

    return this.repository.createStory({
      sessionId: input.sessionId,
      status: 'GENERATING_KEYFRAMES',
      premise: input.request.premise,
      title: plan.title,
      logline: plan.logline,
      referenceUrl: input.request.referenceUrl,
      referenceExpiresAt: input.request.referenceExpiresAt
        ? new Date(input.request.referenceExpiresAt)
        : null,
      preset: input.request.preset,
      sceneCount: input.request.sceneCount,
      durationSeconds: 6,
      aspectRatio: '9:16',
      plan,
      idempotencyKey: input.idempotencyKey,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      scenes,
    })
  }

  private async findOwned(id: string, sessionId: string): Promise<StoryRecord> {
    const story = await this.repository.findOwnedById(id, sessionId)

    if (!story) {
      throw new StoryError('story-not-found')
    }

    this.assertNotExpired(story)

    return story
  }

  private assertNotExpired(story: StoryRecord): void {
    if (story.expiresAt.getTime() <= this.now()) {
      throw new StoryError('story-expired')
    }
  }

  private async reload(id: string): Promise<StoryRecord> {
    const story = await this.repository.findById(id)

    if (!story) {
      throw new StoryError('story-not-found')
    }

    return story
  }
}

export function createStoryService(options: StoryServiceOptions): StoryService {
  return new StoryServiceImpl(options)
}
