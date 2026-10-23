import type {
  SceneStatus,
  Story,
  StoryCreateRequest,
  StoryErrorCode,
  StoryJobError,
  StoryMode,
  StoryPlan,
  StoryQC,
  StoryScene,
  StoryShot,
  StoryShotDurationSeconds,
  StoryShotUpdateRequest,
  StoryStatus,
} from '~/models/story'
import type { ReelPlanDirector } from './director-types'
import { costProfile, durationPlanFor, profileCapUsd } from './cost-profiles'
import type { ReelCostGuard } from './reel-cost'
import { isShotDurationAllowed } from './shot-duration-rule'
import type { ShotKeyframeOrchestrator } from './shot-keyframe-orchestrator'
import type { ShotVideoOrchestrator } from './shot-video-orchestrator'
import { deriveSceneStatus } from './scene-status'
import { StoryError, getStoryErrorDefinition, storyErrorMessage, toStoryError } from './errors'
import type { StoryRateLimiter } from './rate-limit'
import type {
  ReelSceneRecord,
  ReelShotRecord,
  ReelStoryRecord,
  ReelStoryRepository,
} from './reel-repository'
import { hashStoryBody } from './story-service'

export interface ReelStoryServiceConfig {
  readonly storyTtlMs: number
  readonly pollAfterMs: number
}

export interface CreateReelStoryServiceInput {
  readonly sessionId: string
  readonly request: StoryCreateRequest
  readonly idempotencyKey: string | null
  readonly bodyHash: string
}

export interface CreateReelStoryResult {
  readonly story: ReelStoryRecord
  readonly replayed: boolean
}

export interface ReelStoryService {
  create(input: CreateReelStoryServiceInput): Promise<CreateReelStoryResult>
  get(id: string, sessionId: string): Promise<ReelStoryRecord>
  inspect(id: string, sessionId: string): Promise<ReelStoryRecord>
  approve(id: string, sessionId: string): Promise<ReelStoryRecord>
  cancel(id: string, sessionId: string): Promise<ReelStoryRecord>
  approveQc(id: string, sessionId: string): Promise<ReelStoryRecord>
  retryQc(id: string, sessionId: string): Promise<ReelStoryRecord>
  regenerateShot(
    id: string,
    sessionId: string,
    shotId: string,
    update: StoryShotUpdateRequest,
  ): Promise<ReelStoryRecord>
  retryVideoShot(id: string, sessionId: string, shotId: string): Promise<ReelStoryRecord>
  recoverShot(id: string, sessionId: string, shotId: string): Promise<ReelStoryRecord>
  regenerateSceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord>
  retrySceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord>
  recoverSceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord>
}

export interface ReelStoryServiceOptions {
  readonly repository: ReelStoryRepository
  readonly director: ReelPlanDirector | null
  readonly rateLimiter: StoryRateLimiter
  readonly config: ReelStoryServiceConfig
  readonly keyframes?: ShotKeyframeOrchestrator | null
  readonly videos?: ShotVideoOrchestrator | null
  readonly costGuard?: ReelCostGuard | null
  readonly qcEnabled?: boolean
  readonly now?: () => number
}

const ACTIVE_POLL_MS = 2_500

export function canonicalReelStoryBody(request: StoryCreateRequest): string {
  return JSON.stringify([
    request.premise,
    request.platform,
    request.costMode,
    request.targetDurationSeconds,
    request.maxDurationSeconds,
    request.preset,
    request.visualStyle ?? 'cartoon3d',
    request.mode,
    request.referenceUrl,
    request.referenceExpiresAt,
  ])
}

function sameRequest(record: ReelStoryRecord, request: StoryCreateRequest): boolean {
  return (
    record.premise === request.premise
    && record.platform === request.platform
    && record.costMode === request.costMode
    && record.targetDurationSeconds === request.targetDurationSeconds
    && record.maxDurationSeconds === request.maxDurationSeconds
    && record.preset === request.preset
    && (record.visualStyle ?? 'cartoon3d') === (request.visualStyle ?? 'cartoon3d')
    && record.mode === request.mode
    && record.referenceUrl === request.referenceUrl
    && record.referenceExpiresAt?.toISOString() === (request.referenceExpiresAt ?? undefined)
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

function estimateCreationCost(
  request: StoryCreateRequest,
  estimateShots: number,
  qcEnabled: boolean,
): number {
  const keyframe = request.referenceUrl === null ? 0.05 : 0.08
  // FR-586: both presets use a 5–6 s unit; the 10 s quality unit is out of scope.
  const video = 0.35
  const retryReserve = request.costMode === 'budget' && request.targetDurationSeconds === 15
    ? video
    : 0
  const directorReserve = 0.032
  const qcReserve = qcEnabled ? estimateShots * 0.02 : 0

  return estimateShots * (keyframe + video) + retryReserve + directorReserve + qcReserve
}

function pollAfterFor(status: StoryStatus, pollAfterMs: number): number {
  if (
    status === 'READY'
    || status === 'FAILED'
    || status === 'CANCELLED'
    || status === 'WAITING_QC'
  ) {
    return 0
  }

  return pollAfterMs > 0 ? pollAfterMs : ACTIVE_POLL_MS
}

function shotError(shot: ReelShotRecord): StoryJobError | null {
  const code: StoryErrorCode | null = shot.status === 'VIDEO_FAILED'
    ? shot.videoError
    : shot.status === 'KEYFRAME_FAILED'
      ? shot.keyframeError
      : null

  if (!code) return null

  return {
    code,
    message: storyErrorMessage(code),
    retryable: getStoryErrorDefinition(code).retryable,
  }
}

function toShotDto(shot: ReelShotRecord): StoryShot {
  return {
    id: shot.id,
    sceneId: shot.sceneId,
    sceneOrder: shot.sceneOrder,
    order: shot.order,
    indexInScene: shot.indexInScene,
    durationSeconds: shot.durationSeconds,
    camera: shot.camera as StoryShot['camera'],
    framing: shot.framing,
    subject: shot.subject,
    action: shot.action,
    visualPrompt: shot.visualPrompt,
    transition: 'cut',
    locationId: shot.locationId,
    status: shot.status,
    keyframeUrl: shot.keyframeUrl,
    keyframeAttempts: shot.keyframeAttempts,
    videoUrl: shot.videoUrl,
    videoAttempts: shot.videoAttempts,
    error: shotError(shot),
  }
}

function sceneStatus(scene: ReelSceneRecord): SceneStatus {
  return scene.shots.length > 0
    ? deriveSceneStatus(scene.shots)
    : scene.status
}

function toSceneDto(scene: ReelSceneRecord): StoryScene {
  const shots = scene.shots
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(toShotDto)
  const narrative = scene.scene

  return {
    id: scene.id,
    order: scene.order,
    narration: narrative?.narration ?? scene.narration,
    sceneRole: narrative?.sceneRole ?? 'development',
    locationId: narrative?.locationId ?? 'legacy-location',
    timeOfDay: narrative?.timeOfDay ?? 'morning',
    weather: narrative?.weather ?? 'clear',
    characters: narrative?.characters ?? [],
    props: narrative?.props ?? [],
    storyFunction: narrative?.storyFunction ?? 'complication',
    gag: narrative?.gag ?? null,
    status: sceneStatus(scene),
    plannedDurationSeconds: shots.reduce(
      (total, shot) => total + shot.durationSeconds,
      0,
    ),
    shots,
  }
}

function storyError(record: ReelStoryRecord): StoryJobError | null {
  if (!record.errorCode) return null

  return {
    code: record.errorCode,
    message: record.errorMessage ?? storyErrorMessage(record.errorCode),
    retryable: getStoryErrorDefinition(record.errorCode).retryable,
  }
}

function planOrNull(plan: StoryPlan): StoryPlan | null {
  return plan.scenes.length > 0 ? plan : null
}

export function toReelStoryJob(
  record: ReelStoryRecord,
  pollAfterMs: number,
): {
  readonly storyId: string
  readonly status: ReelStoryRecord['status']
  readonly version: number
  readonly pollAfterMs: number
} {
  return {
    storyId: record.id,
    status: record.status,
    version: record.version,
    pollAfterMs: pollAfterFor(record.status, pollAfterMs),
  }
}

export function toReelStoryDto(
  record: ReelStoryRecord,
  pollAfterMs: number,
  now: number,
): Story {
  const referenceActive =
    record.referenceUrl !== null
    && record.referenceExpiresAt !== null
    && record.referenceExpiresAt.getTime() > now
  const qc = record.qc as StoryQC | null
  const qcHidden =
    (record.status === 'ASSEMBLING' || record.status === 'READY')
    && qc?.override == null

  return {
    id: record.id,
    status: record.status,
    premise: record.premise,
    title: record.title,
    logline: record.logline,
    referenceUrl: referenceActive ? record.referenceUrl : null,
    referenceExpiresAt: referenceActive && record.referenceExpiresAt
      ? record.referenceExpiresAt.toISOString()
      : null,
    preset: record.preset,
    visualStyle: record.visualStyle,
    mode: record.mode,
    platform: record.platform,
    costMode: record.costMode,
    modelId: record.preset === 'quality' ? 'kling-2.5-turbo-pro' : 'minimax-hailuo-02',
    targetDurationSeconds: record.targetDurationSeconds as Story['targetDurationSeconds'],
    maxDurationSeconds: record.maxDurationSeconds as Story['maxDurationSeconds'],
    plannedDurationSeconds: record.scenes
      .flatMap((scene) => scene.shots)
      .reduce((total, shot) => total + shot.durationSeconds, 0),
    shotCount: record.shots.length,
    finalDurationSeconds: record.finalDurationSeconds,
    sceneCount: record.scenes.length as Story['sceneCount'],
    aspectRatio: '9:16',
    plan: planOrNull(record.plan),
    scenes: record.scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(toSceneDto),
    finalVideoUrl: record.finalVideoUrl,
    finalVideoExpiresAt: record.finalVideoExpiresAt?.toISOString() ?? null,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    version: record.version,
    error: storyError(record),
    qc: qcHidden ? null : qc,
    pollAfterMs: pollAfterFor(record.status, pollAfterMs),
  }
}

export class ReelStoryServiceImpl implements ReelStoryService {
  private readonly repository: ReelStoryRepository
  private readonly director: ReelPlanDirector | null
  private readonly rateLimiter: StoryRateLimiter
  private readonly config: ReelStoryServiceConfig
  private readonly keyframes: ShotKeyframeOrchestrator | null
  private readonly videos: ShotVideoOrchestrator | null
  private readonly costGuard: ReelCostGuard | null
  private readonly qcEnabled: boolean
  private readonly now: () => number

  constructor(options: ReelStoryServiceOptions) {
    this.repository = options.repository
    this.director = options.director
    this.rateLimiter = options.rateLimiter
    this.config = options.config
    this.keyframes = options.keyframes ?? null
    this.videos = options.videos ?? null
    this.costGuard = options.costGuard ?? null
    this.qcEnabled = options.qcEnabled ?? false
    this.now = options.now ?? Date.now
  }

  async create(input: CreateReelStoryServiceInput): Promise<CreateReelStoryResult> {
    const director = this.director

    if (!director) throw new StoryError('director-not-configured')

    const profile = costProfile(input.request.costMode, input.request.targetDurationSeconds)

    if (!profile) throw new StoryError('invalid-cost-mode')

    const replay = await this.resolveReplay(input)

    if (replay) return replay

    const sessionActive = await this.repository.countActive(input.sessionId)
    const globalActive = await this.repository.countActiveGlobal()

    this.rateLimiter.assertCanCreate(input.sessionId, sessionActive, globalActive)
    this.rateLimiter.consumeCreate(input.sessionId)

    const durationPlan = durationPlanFor(
      input.request.costMode,
      input.request.targetDurationSeconds,
      input.request.platform,
      input.request.referenceUrl !== null,
    )
    const estimateShots = durationPlan.exactShotCount ?? durationPlan.shotCount.max
    const estimate = estimateCreationCost(
      input.request,
      estimateShots,
      this.qcEnabled,
    )

    if (estimate > profileCapUsd(profile)) {
      throw new StoryError('story-budget-exhausted')
    }

    this.rateLimiter.consumeDailyBudget(estimate)
    this.rateLimiter.beginCreation(input.sessionId)

    try {
      const reel = await director.createPlan({
        premise: input.request.premise,
        mode: input.request.mode,
        preset: input.request.preset,
        durationPlan,
        referenceUrl: input.request.referenceUrl,
      })
      const now = new Date(this.now())
      const expiresAt = new Date(now.getTime() + this.config.storyTtlMs)
      const record = await this.repository.createStory({
        sessionId: input.sessionId,
        status: 'GENERATING_KEYFRAMES',
        premise: input.request.premise,
        title: reel.plan.title.length > 0 ? reel.plan.title : null,
        logline: reel.plan.logline.length > 0 ? reel.plan.logline : null,
        referenceUrl: input.request.referenceUrl,
        referenceExpiresAt: input.request.referenceExpiresAt
          ? new Date(input.request.referenceExpiresAt)
          : null,
        preset: input.request.preset,
        visualStyle: input.request.visualStyle ?? 'cartoon3d',
        mode: input.request.mode,
        platform: input.request.platform,
        costMode: input.request.costMode,
        targetDurationSeconds: input.request.targetDurationSeconds,
        maxDurationSeconds: input.request.maxDurationSeconds,
        plan: reel.plan,
        shotPlan: reel.shotPlan,
        idempotencyKey: input.idempotencyKey,
        now,
        expiresAt,
      })

      return { story: record, replayed: false }
    } catch (error) {
      if (isUniqueConstraintError(error) && input.idempotencyKey) {
        const existing = await this.repository.findBySessionAndIdempotencyKey(
          input.sessionId,
          input.idempotencyKey,
        )

        if (existing) {
          if (!sameRequest(existing, input.request)) {
            throw new StoryError('idempotency-conflict')
          }

          return { story: existing, replayed: true }
        }
      }

      const normalized = toStoryError(error)

      throw normalized
    } finally {
      this.rateLimiter.endCreation(input.sessionId)
    }
  }

  async get(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.repository.findOwnedById(id, sessionId)

    if (!story) throw new StoryError('story-not-found')

    if (story.expiresAt.getTime() <= this.now()) {
      throw new StoryError('story-expired')
    }

    this.rateLimiter.consumePoll(story.id)

    return story
  }

  async inspect(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.repository.findOwnedById(id, sessionId)

    if (!story) throw new StoryError('story-not-found')
    if (story.expiresAt.getTime() <= this.now()) {
      throw new StoryError('story-expired')
    }

    return story
  }

  async approve(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (story.status === 'GENERATING_VIDEOS'
      || story.status === 'VIDEOS_READY'
      || story.status === 'QC'
      || story.status === 'ASSEMBLING'
      || story.status === 'READY') {
      return story
    }

    if (story.status !== 'WAITING_APPROVAL') {
      throw new StoryError('story-not-ready')
    }

    if (story.shots.length === 0
      || !story.shots.every((shot) =>
        shot.status === 'KEYFRAME_READY' || shot.status === 'VIDEO_READY')) {
      throw new StoryError('story-not-ready')
    }

    if (this.costGuard) {
      this.costGuard.assertWithinCap(
        story,
        this.costGuard.estimateVideosApproval(story),
      )
    }

    const updated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_APPROVAL'], version: story.version },
      { status: 'GENERATING_VIDEOS', approvedAt: new Date(this.now()) },
    )

    if (updated === 0) {
      const current = await this.findOwned(id, sessionId)
      if (current.status === 'GENERATING_VIDEOS' || current.status === 'VIDEOS_READY') {
        return current
      }
      throw new StoryError('story-not-ready')
    }

    return this.reload(id)
  }

  async cancel(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (story.status === 'CANCELLED') return story
    if (story.status === 'READY' || story.status === 'FAILED') {
      throw new StoryError('story-not-cancellable')
    }

    const cancelled = await this.repository.cancel(id, sessionId, new Date(this.now()))

    if (!cancelled) {
      const current = await this.repository.findOwnedById(id, sessionId)
      if (current?.status === 'CANCELLED') return current
      throw new StoryError('cancel-failed')
    }

    for (const shot of story.shots) {
      if (this.keyframes
        && shot.keyframeRequestId
        && (shot.status === 'KEYFRAME_QUEUED' || shot.status === 'KEYFRAME_RUNNING')
        && shot.keyframeCancelUrl) {
        try {
          await this.keyframes.cancel(shot)
        } catch {
          // Best effort: the story is already cancelled.
        }
      }

      if (this.videos
        && shot.videoRequestId
        && (shot.status === 'VIDEO_QUEUED' || shot.status === 'VIDEO_RUNNING')
        && shot.videoCancelUrl) {
        try {
          await this.videos.cancel(shot)
        } catch {
          // Best effort: the story is already cancelled.
        }
      }
    }

    return this.reload(id)
  }

  async approveQc(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (
      (story.status === 'ASSEMBLING' || story.status === 'READY')
      && story.qc?.override?.approved === true
    ) {
      return story
    }

    if (story.status !== 'WAITING_QC' || story.qc === null) {
      throw new StoryError('story-not-ready')
    }

    if (!story.shots.every((shot) => shot.status === 'VIDEO_READY')) {
      throw new StoryError('story-not-ready')
    }

    const override = {
      at: new Date(this.now()).toISOString(),
      approved: true as const,
    }
    const updated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_QC'], version: story.version },
      {
        status: 'ASSEMBLING',
        qc: { ...story.qc, override },
        qcCheckedAt: story.qc.checkedAt ? new Date(story.qc.checkedAt) : null,
        errorCode: null,
        errorMessage: null,
      },
    )

    if (updated === 0) throw new StoryError('story-not-ready')

    return this.reload(id)
  }

  async retryQc(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)

    if (story.status === 'VIDEOS_READY' || story.status === 'QC') {
      return story
    }

    if (story.status !== 'WAITING_QC') {
      throw new StoryError('story-not-ready')
    }

    const revalidatable = story.shots.every((shot) => {
      if (shot.videoUrl === null) return false
      if (shot.status === 'VIDEO_READY') return true
      return shot.status === 'VIDEO_FAILED'
        && shot.videoError === 'provider-invalid-output'
    })

    if (!revalidatable) throw new StoryError('story-not-ready')

    const shotIds = story.shots
      .filter((shot) => shot.status === 'VIDEO_FAILED')
      .map((shot) => shot.id)
    const updated = await this.repository.revalidateQcShots(
      story.id,
      { statuses: ['WAITING_QC'], version: story.version },
      shotIds,
    )

    if (!updated) throw new StoryError('story-not-ready')

    return this.reload(id)
  }

  async regenerateShot(
    id: string,
    sessionId: string,
    shotId: string,
    update: StoryShotUpdateRequest,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const shot = story.shots.find((item) => item.id === shotId)

    if (!shot || shot.id.startsWith('legacy-')) throw new StoryError('shot-not-found')

    const visualPrompt = update.visualPrompt ?? shot.visualPrompt
    const durationSeconds = update.durationSeconds ?? shot.durationSeconds
    const promptChanged = visualPrompt !== shot.visualPrompt
    const durationOnly = update.visualPrompt === undefined
      && update.durationSeconds !== undefined
      && update.regenerate !== true

    if (durationOnly) {
      if (story.status !== 'WAITING_APPROVAL') {
        throw new StoryError('story-not-ready')
      }
      if (shot.status !== 'KEYFRAME_READY' && shot.status !== 'KEYFRAME_FAILED') {
        throw new StoryError('scene-not-ready')
      }
      if (!isShotDurationAllowed(
        { costMode: story.costMode, targetDurationSeconds: story.targetDurationSeconds },
        story.preset,
        durationSeconds,
      )) {
        throw new StoryError('invalid-shot-duration')
      }

      const nextTotal = story.plannedDurationSeconds
        - shot.durationSeconds
        + durationSeconds

      if (
        nextTotal < story.targetDurationSeconds - 1
        || nextTotal > story.maxDurationSeconds
      ) {
        throw new StoryError('invalid-shot-duration')
      }

      const changed = await this.repository.updateShotDuration(
        story.id,
        shot.id,
        { version: shot.version },
        durationSeconds as StoryShotDurationSeconds,
      )
      if (changed === 0) throw new StoryError('shot-not-found')

      return this.reload(id)
    }

    if (!promptChanged && update.regenerate !== true && update.durationSeconds === undefined) {
      throw new StoryError('invalid-request')
    }

    const storyAllowed = story.status === 'WAITING_APPROVAL'
      || (story.status === 'FAILED' && story.errorCode === 'keyframe-failed')

    if (!storyAllowed) throw new StoryError('story-not-ready')

    if (shot.status !== 'KEYFRAME_READY' && shot.status !== 'KEYFRAME_FAILED') {
      throw new StoryError('scene-not-ready')
    }

    if (!isShotDurationAllowed(
      { costMode: story.costMode, targetDurationSeconds: story.targetDurationSeconds },
      story.preset,
      durationSeconds,
    )) {
      throw new StoryError('invalid-shot-duration')
    }

    const nextTotal = story.plannedDurationSeconds
      - shot.durationSeconds
      + durationSeconds

    if (
      nextTotal < story.targetDurationSeconds - 1
      || nextTotal > story.maxDurationSeconds
    ) {
      throw new StoryError('invalid-shot-duration')
    }

    await this.assertBudgetForShotAttempt(story, shot, 'keyframe')

    if (!promptChanged && shot.keyframeAttempts >= 2) {
      throw new StoryError('keyframe-limit-reached')
    }

    const keyframeAttempts = promptChanged && story.costMode !== 'budget'
      ? 0
      : shot.keyframeAttempts
    const videoAttempts = story.costMode === 'budget'
      ? shot.videoAttempts
      : 0

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: [story.status], version: story.version },
      {
        status: 'GENERATING_KEYFRAMES',
        approvedAt: null,
        qc: null,
        qcCheckedAt: null,
        finalVideoUrl: null,
        finalVideoExpiresAt: null,
        finalDurationSeconds: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )

    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    const shotUpdated = await this.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'KEYFRAME_QUEUED',
        visualPrompt,
        durationSeconds,
        keyframeUrl: null,
        keyframeRequestId: null,
        keyframeStatusUrl: null,
        keyframeResponseUrl: null,
        keyframeCancelUrl: null,
        keyframeError: null,
        keyframeAttempts,
        videoUrl: null,
        videoRequestId: null,
        videoStatusUrl: null,
        videoResponseUrl: null,
        videoCancelUrl: null,
        videoError: null,
        videoAttempts,
      },
    )

    if (shotUpdated === 0) throw new StoryError('shot-not-found')

    return this.reload(id)
  }

  async retryVideoShot(
    id: string,
    sessionId: string,
    shotId: string,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const shot = story.shots.find((item) => item.id === shotId)

    if (!shot || shot.id.startsWith('legacy-')) throw new StoryError('shot-not-found')

    const storyAllowed = story.status === 'GENERATING_VIDEOS'
      || (story.status === 'FAILED' && story.errorCode === 'video-failed')
      || story.status === 'WAITING_QC'

    if (!storyAllowed) throw new StoryError('story-not-ready')
    if (shot.status !== 'VIDEO_FAILED') throw new StoryError('scene-not-ready')
    if (shot.videoAttempts >= 2) throw new StoryError('video-retry-limit-reached')
    if (!shot.keyframeUrl) throw new StoryError('shot-not-found')

    await this.assertBudgetForShotAttempt(story, shot, 'video')

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { version: story.version },
      {
        status: 'GENERATING_VIDEOS',
        qc: null,
        qcCheckedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )
    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    const shotUpdated = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: ['VIDEO_FAILED'], version: shot.version },
      {
        status: 'VIDEO_QUEUED',
        videoRequestId: null,
        videoStatusUrl: null,
        videoResponseUrl: null,
        videoCancelUrl: null,
        videoError: null,
      },
    )
    if (shotUpdated === 0) throw new StoryError('scene-not-ready')

    return this.reload(id)
  }

  async recoverShot(
    id: string,
    sessionId: string,
    shotId: string,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const shot = story.shots.find((item) => item.id === shotId)

    if (!shot || shot.id.startsWith('legacy-')) throw new StoryError('shot-not-found')
    if (story.status !== 'WAITING_QC') throw new StoryError('story-not-ready')

    const recoverable = shot.status === 'VIDEO_READY'
      || (shot.status === 'VIDEO_FAILED'
        && shot.videoError === 'provider-invalid-output')

    if (!recoverable) throw new StoryError('scene-not-ready')
    if (story.costMode === 'budget' && shot.keyframeAttempts >= 2) {
      throw new StoryError('keyframe-limit-reached')
    }
    if (story.costMode === 'budget' && shot.videoAttempts >= 2) {
      throw new StoryError('video-retry-limit-reached')
    }

    await this.assertBudgetForShotAttempt(story, shot, 'keyframe')

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_QC'], version: story.version },
      {
        status: 'GENERATING_KEYFRAMES',
        qc: null,
        qcCheckedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )
    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    const shotUpdated = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: [shot.status], version: shot.version },
      {
        status: 'KEYFRAME_QUEUED',
        keyframeUrl: null,
        keyframeRequestId: null,
        keyframeStatusUrl: null,
        keyframeResponseUrl: null,
        keyframeCancelUrl: null,
        keyframeError: null,
        videoUrl: null,
        videoRequestId: null,
        videoStatusUrl: null,
        videoResponseUrl: null,
        videoCancelUrl: null,
        videoError: null,
        keyframeAttempts: story.costMode === 'budget' ? shot.keyframeAttempts : 0,
        videoAttempts: story.costMode === 'budget' ? shot.videoAttempts : 0,
      },
    )
    if (shotUpdated === 0) throw new StoryError('scene-not-ready')

    return this.reload(id)
  }

  async regenerateSceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const scene = story.scenes.find((item) => item.id === sceneId)

    if (!scene) throw new StoryError('beat-not-found')
    if (scene.shots.some((shot) => shot.id.startsWith('legacy-'))) {
      throw new StoryError('shot-not-found')
    }

    const allowed = story.status === 'WAITING_APPROVAL'
      || (story.status === 'FAILED' && story.errorCode === 'keyframe-failed')
    if (!allowed) throw new StoryError('story-not-ready')

    const regenerable = scene.shots.filter((shot) =>
      (shot.status === 'KEYFRAME_READY' || shot.status === 'KEYFRAME_FAILED')
      && shot.keyframeAttempts < 2)

    if (regenerable.length !== scene.shots.length) {
      throw new StoryError('keyframe-limit-reached')
    }

    for (const shot of regenerable) {
      await this.assertBudgetForShotAttempt(story, shot, 'keyframe')
    }

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: [story.status], version: story.version },
      {
        status: 'GENERATING_KEYFRAMES',
        approvedAt: null,
        qc: null,
        qcCheckedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )
    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    for (const shot of regenerable) {
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: [shot.status], version: shot.version },
        {
          status: 'KEYFRAME_QUEUED',
          keyframeUrl: null,
          keyframeRequestId: null,
          keyframeStatusUrl: null,
          keyframeResponseUrl: null,
          keyframeCancelUrl: null,
          keyframeError: null,
          videoUrl: null,
          videoRequestId: null,
          videoStatusUrl: null,
          videoResponseUrl: null,
          videoCancelUrl: null,
          videoError: null,
          videoAttempts: story.costMode === 'budget' ? shot.videoAttempts : 0,
        },
      )
    }

    return this.reload(id)
  }

  async retrySceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const scene = story.scenes.find((item) => item.id === sceneId)

    if (!scene) throw new StoryError('beat-not-found')
    if (scene.shots.some((shot) => shot.id.startsWith('legacy-'))) {
      throw new StoryError('shot-not-found')
    }

    const allowed = story.status === 'GENERATING_VIDEOS'
      || (story.status === 'FAILED' && story.errorCode === 'video-failed')
      || story.status === 'WAITING_QC'
    if (!allowed) throw new StoryError('story-not-ready')

    const failed = scene.shots.filter((shot) => shot.status === 'VIDEO_FAILED')

    if (failed.length === 0) throw new StoryError('scene-not-ready')
    if (failed.some((shot) => shot.videoAttempts >= 2)) {
      throw new StoryError('video-retry-limit-reached')
    }

    const shots = failed

    for (const shot of shots) {
      await this.assertBudgetForShotAttempt(story, shot, 'video')
    }

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: [story.status], version: story.version },
      {
        status: 'GENERATING_VIDEOS',
        qc: null,
        qcCheckedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )
    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    for (const shot of shots) {
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_FAILED'], version: shot.version },
        {
          status: 'VIDEO_QUEUED',
          videoRequestId: null,
          videoStatusUrl: null,
          videoResponseUrl: null,
          videoCancelUrl: null,
          videoError: null,
        },
      )
    }

    return this.reload(id)
  }

  async recoverSceneShots(
    id: string,
    sessionId: string,
    sceneId: string,
  ): Promise<ReelStoryRecord> {
    const story = await this.findOwned(id, sessionId)
    const scene = story.scenes.find((item) => item.id === sceneId)

    if (!scene) throw new StoryError('beat-not-found')
    if (scene.shots.some((shot) => shot.id.startsWith('legacy-'))) {
      throw new StoryError('shot-not-found')
    }
    if (story.status !== 'WAITING_QC') throw new StoryError('story-not-ready')

    const shots = scene.shots.filter((shot) =>
      shot.status === 'VIDEO_READY'
      || (shot.status === 'VIDEO_FAILED'
        && shot.videoError === 'provider-invalid-output'))

    if (scene.shots.length === 0 || shots.length !== scene.shots.length) {
      throw new StoryError('scene-not-ready')
    }

    for (const shot of shots) {
      if (story.costMode === 'budget' && shot.keyframeAttempts >= 2) {
        throw new StoryError('keyframe-limit-reached')
      }
      if (story.costMode === 'budget' && shot.videoAttempts >= 2) {
        throw new StoryError('video-retry-limit-reached')
      }

      await this.assertBudgetForShotAttempt(story, shot, 'keyframe')
    }

    const storyUpdated = await this.repository.updateStory(
      story.id,
      { statuses: ['WAITING_QC'], version: story.version },
      {
        status: 'GENERATING_KEYFRAMES',
        qc: null,
        qcCheckedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    )
    if (storyUpdated === 0) throw new StoryError('story-not-ready')

    for (const shot of shots) {
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: [shot.status], version: shot.version },
        {
          status: 'KEYFRAME_QUEUED',
          keyframeUrl: null,
          keyframeRequestId: null,
          keyframeStatusUrl: null,
          keyframeResponseUrl: null,
          keyframeCancelUrl: null,
          keyframeError: null,
          videoUrl: null,
          videoRequestId: null,
          videoStatusUrl: null,
          videoResponseUrl: null,
          videoCancelUrl: null,
          videoError: null,
          keyframeAttempts: story.costMode === 'budget' ? shot.keyframeAttempts : 0,
          videoAttempts: story.costMode === 'budget' ? shot.videoAttempts : 0,
        },
      )
    }

    return this.reload(id)
  }

  private async assertBudgetForShotAttempt(
    story: ReelStoryRecord,
    shot: { readonly keyframeAttempts: number; readonly videoAttempts: number },
    stage: 'keyframe' | 'video',
  ): Promise<void> {
    if (!this.costGuard) return

    const next = stage === 'keyframe'
      ? this.costGuard.estimateKeyframeAttempt(story)
      : this.costGuard.estimateVideoAttempt(story)

    this.costGuard.assertWithinCap(story, next)

    if (story.costMode === 'budget') {
      if (stage === 'keyframe' && shot.keyframeAttempts >= 2) {
        throw new StoryError('keyframe-limit-reached')
      }
      if (stage === 'video' && shot.videoAttempts >= 2) {
        throw new StoryError('video-retry-limit-reached')
      }
    }
  }

  private async findOwned(id: string, sessionId: string): Promise<ReelStoryRecord> {
    const story = await this.repository.findOwnedById(id, sessionId)

    if (!story) throw new StoryError('story-not-found')
    if (story.expiresAt.getTime() <= this.now()) {
      throw new StoryError('story-expired')
    }

    return story
  }

  private async reload(id: string): Promise<ReelStoryRecord> {
    const story = await this.repository.findById(id)
    if (!story) throw new StoryError('story-not-found')
    return story
  }

  private async resolveReplay(
    input: CreateReelStoryServiceInput,
  ): Promise<CreateReelStoryResult | null> {
    if (!input.idempotencyKey) return null

    const existing = await this.repository.findBySessionAndIdempotencyKey(
      input.sessionId,
      input.idempotencyKey,
    )

    if (!existing) return null

    if (!sameRequest(existing, input.request)) {
      throw new StoryError('idempotency-conflict')
    }

    return { story: existing, replayed: true }
  }
}

export function createReelStoryService(
  options: ReelStoryServiceOptions,
): ReelStoryService {
  return new ReelStoryServiceImpl(options)
}

export { hashStoryBody }
export type { StoryMode, StoryShotDurationSeconds }
