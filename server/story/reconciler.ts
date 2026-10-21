import { randomBytes } from 'node:crypto'
import type { SceneStatus, StoryErrorCode } from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import type { StoryAssembler } from './assembly-service'
import type { StoryCostGuard } from './cost'
import { StoryError, toStoryError, storyErrorMessage } from './errors'
import type { KeyframeOrchestrator } from './keyframe-orchestrator'
import type { SceneRecord, StoryRecord, StoryRepository } from './repository'
import type { VideoOrchestrator } from './video-orchestrator'

export interface StoryReconcilerConfig {
  readonly leaseMs: number
  readonly assemblyLeaseMs: number
  readonly tickBudgetMs: number
  readonly keyframeConcurrency: number
  readonly videoConcurrency: number
  readonly claimLimit: number
  readonly cleanupIntervalMs: number
  readonly cleanupBatchSize: number
  readonly cleanupGraceMs: number
}

export interface StoryReconcilerEvent {
  readonly event: string
  readonly storyId?: string
  readonly sceneOrder?: number
  readonly errorCode?: string
}

export interface StoryReconcilerOptions {
  readonly repository: StoryRepository
  readonly keyframes: KeyframeOrchestrator
  readonly videos: VideoOrchestrator
  readonly assembler: StoryAssembler
  readonly costGuard: StoryCostGuard
  readonly config: StoryReconcilerConfig
  readonly owner?: string
  readonly now?: () => number
  readonly onEvent?: (event: StoryReconcilerEvent) => void
}

const KEYFRAME_ACTIVE_STATUSES: readonly SceneStatus[] = [
  'KEYFRAME_QUEUED',
  'KEYFRAME_RUNNING',
]

const VIDEO_ACTIVE_STATUSES: readonly SceneStatus[] = [
  'VIDEO_QUEUED',
  'VIDEO_RUNNING',
]

const VIDEO_PENDING_STATUSES: readonly SceneStatus[] = [
  'KEYFRAME_READY',
  'VIDEO_QUEUED',
]

export const DEFAULT_STORY_RECONCILER_CONFIG: StoryReconcilerConfig = {
  leaseMs: 60_000,
  // Longer than the 180 s FFmpeg budget so a crashed assembly cannot be
  // double-claimed while the first process is still working.
  assemblyLeaseMs: 240_000,
  tickBudgetMs: 45_000,
  keyframeConcurrency: 3,
  videoConcurrency: 2,
  claimLimit: 5,
  cleanupIntervalMs: 600_000,
  cleanupBatchSize: 50,
  cleanupGraceMs: 3_600_000,
}

export class StoryReconciler {
  private readonly repository: StoryRepository
  private readonly keyframes: KeyframeOrchestrator
  private readonly videos: VideoOrchestrator
  private readonly assembler: StoryAssembler
  private readonly costGuard: StoryCostGuard
  private readonly config: StoryReconcilerConfig
  private readonly owner: string
  private readonly now: () => number
  private readonly onEvent: (event: StoryReconcilerEvent) => void
  private assemblyInFlight = false
  private lastCleanupAt = 0

  constructor(options: StoryReconcilerOptions) {
    this.repository = options.repository
    this.keyframes = options.keyframes
    this.videos = options.videos
    this.assembler = options.assembler
    this.costGuard = options.costGuard
    this.config = options.config
    this.owner = options.owner ?? `story-reconciler-${randomBytes(6).toString('hex')}`
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent ?? (() => undefined)
  }

  async runOnce(): Promise<void> {
    const now = this.now()

    await this.maybeCleanup(now)

    const claimable = await this.repository.listClaimable(
      new Date(now),
      this.config.claimLimit,
    )

    for (const candidate of claimable) {
      const claimNow = this.now()
      const assemblyPhase =
        candidate.status === 'VIDEOS_READY' || candidate.status === 'ASSEMBLING'
      const leaseMs = assemblyPhase ? this.config.assemblyLeaseMs : this.config.leaseMs
      const claimed = await this.repository.claim(
        candidate.id,
        this.owner,
        new Date(claimNow + leaseMs),
        new Date(claimNow),
      )

      if (!claimed) {
        continue
      }

      this.onEvent({ event: 'story.reconciler.claim', storyId: candidate.id })

      try {
        await this.process(candidate.id)
      } catch (error) {
        this.onEvent({
          event: 'story.reconciler.error',
          storyId: candidate.id,
          errorCode: toStoryError(error).code,
        })
      } finally {
        await this.repository.release(candidate.id, this.owner)
      }
    }
  }

  private async process(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.leaseOwner !== this.owner) {
      return
    }

    if (story.status === 'GENERATING_KEYFRAMES') {
      await this.processKeyframes(story)
      return
    }

    if (story.status === 'GENERATING_VIDEOS') {
      await this.processVideos(story)
      return
    }

    if (story.status === 'VIDEOS_READY') {
      await this.processAssembly(story, false)
      return
    }

    if (story.status === 'ASSEMBLING') {
      await this.processAssembly(story, true)
    }
  }

  private async processKeyframes(story: StoryRecord): Promise<void> {
    const deadline = this.now() + this.config.tickBudgetMs

    if (this.referenceExpired(story)) {
      await this.failStory(story, 'reference-expired', ['GENERATING_KEYFRAMES'])
      return
    }

    for (const scene of story.scenes) {
      if (this.now() > deadline) {
        break
      }

      const fresh = await this.repository.findById(story.id)

      if (
        !fresh
        || fresh.status !== 'GENERATING_KEYFRAMES'
        || fresh.leaseOwner !== this.owner
      ) {
        return
      }

      const freshScene = fresh.scenes.find((item) => item.id === scene.id)

      if (!freshScene) {
        continue
      }

      await this.processKeyframeScene(fresh, freshScene)
    }

    await this.finalizeKeyframes(story.id)
  }

  private async processKeyframeScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    if (
      scene.keyframeRequestId
      && KEYFRAME_ACTIVE_STATUSES.includes(scene.status)
    ) {
      await this.pollKeyframeScene(story, scene)
      return
    }

    if (scene.status !== 'PENDING' && scene.status !== 'KEYFRAME_QUEUED') {
      return
    }

    if (scene.keyframeAttempts >= 2) {
      return
    }

    const active = await this.repository.countActiveProviderJobs('keyframe')

    if (active >= this.config.keyframeConcurrency) {
      return
    }

    try {
      try {
        this.costGuard.assertWithinBudget(
          this.costGuard.estimateAfterKeyframeAttempt(story),
        )
      } catch (error) {
        if (toStoryError(error).code === 'story-budget-exhausted') {
          await this.failSceneAndStory(
            story,
            scene,
            'story-budget-exhausted',
            'keyframe',
          )
          return
        }

        throw error
      }

      const incremented = await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['PENDING', 'KEYFRAME_QUEUED'] },
        {
          status: 'KEYFRAME_QUEUED',
          keyframeAttempts: scene.keyframeAttempts + 1,
          keyframeError: null,
        },
      )

      if (incremented === 0) {
        return
      }

      await this.submitKeyframeScene(story, scene)
    } catch (error) {
      const code = toStoryError(error).code

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['PENDING', 'KEYFRAME_QUEUED'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )

      this.onEvent({
        event: 'story.keyframe.failed',
        storyId: story.id,
        sceneOrder: scene.order,
        errorCode: code,
      })
    }
  }

  private async submitKeyframeScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    try {
      const submission = await this.keyframes.submit(scene, story)

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_QUEUED'] },
        {
          keyframeRequestId: submission.requestId,
          keyframeStatusUrl: submission.statusUrl,
          keyframeResponseUrl: submission.responseUrl,
          keyframeCancelUrl: submission.cancelUrl,
        },
      )

      this.onEvent({
        event: 'story.keyframe.submitted',
        storyId: story.id,
        sceneOrder: scene.order,
      })
    } catch (error) {
      throw toStoryError(error)
    }
  }

  private async pollKeyframeScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    try {
      const result = await this.keyframes.poll(scene)

      if (result.state === 'IN_QUEUE') {
        if (scene.status !== 'KEYFRAME_QUEUED') {
          await this.repository.updateScene(
            story.id,
            scene.id,
            { statuses: ['KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_QUEUED' },
          )
        }

        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (scene.status !== 'KEYFRAME_RUNNING') {
          await this.repository.updateScene(
            story.id,
            scene.id,
            { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_RUNNING' },
          )
        }

        return
      }

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        {
          status: 'KEYFRAME_READY',
          keyframeUrl: result.keyframeUrl,
          keyframeError: null,
        },
      )

      this.onEvent({
        event: 'story.keyframe.succeeded',
        storyId: story.id,
        sceneOrder: scene.order,
      })
    } catch (error) {
      const code = toStoryError(error).code

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )

      this.onEvent({
        event: 'story.keyframe.failed',
        storyId: story.id,
        sceneOrder: scene.order,
        errorCode: code,
      })
    }
  }

  private async finalizeKeyframes(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_KEYFRAMES') {
      return
    }

    if (story.scenes.every((scene) => scene.status === 'KEYFRAME_READY')) {
      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
        { status: 'WAITING_APPROVAL', approvedAt: null },
      )

      return
    }

    const hasFailed = story.scenes.some((scene) => scene.status === 'KEYFRAME_FAILED')
    const hasActive = story.scenes.some(
      (scene) =>
        scene.status === 'PENDING'
        || KEYFRAME_ACTIVE_STATUSES.includes(scene.status),
    )

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'keyframe-failed', ['GENERATING_KEYFRAMES'])
    }
  }

  private async processVideos(story: StoryRecord): Promise<void> {
    const deadline = this.now() + this.config.tickBudgetMs

    for (const scene of story.scenes) {
      if (this.now() > deadline) {
        break
      }

      const fresh = await this.repository.findById(story.id)

      if (
        !fresh
        || fresh.status !== 'GENERATING_VIDEOS'
        || fresh.leaseOwner !== this.owner
      ) {
        return
      }

      const freshScene = fresh.scenes.find((item) => item.id === scene.id)

      if (!freshScene) {
        continue
      }

      await this.processVideoScene(fresh, freshScene)
    }

    await this.finalizeVideos(story.id)
  }

  private async processVideoScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    if (scene.videoRequestId && VIDEO_ACTIVE_STATUSES.includes(scene.status)) {
      await this.pollVideoScene(story, scene)
      return
    }

    if (!VIDEO_PENDING_STATUSES.includes(scene.status)) {
      return
    }

    if (scene.videoAttempts >= 2) {
      return
    }

    const active = await this.repository.countActiveProviderJobs('video')

    if (active >= this.config.videoConcurrency) {
      return
    }

    try {
      try {
        this.costGuard.assertWithinBudget(
          this.costGuard.estimateAfterVideoAttempt(story),
        )
      } catch (error) {
        if (toStoryError(error).code === 'story-budget-exhausted') {
          await this.failSceneAndStory(
            story,
            scene,
            'story-budget-exhausted',
            'video',
          )
          return
        }

        throw error
      }

      const incremented = await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_READY', 'VIDEO_QUEUED'] },
        {
          status: 'VIDEO_QUEUED',
          videoAttempts: scene.videoAttempts + 1,
          videoError: null,
        },
      )

      if (incremented === 0) {
        return
      }

      await this.submitVideoScene(story, scene)
    } catch (error) {
      const code = toStoryError(error).code

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_READY', 'VIDEO_QUEUED'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )

      this.onEvent({
        event: 'story.video.failed',
        storyId: story.id,
        sceneOrder: scene.order,
        errorCode: code,
      })
    }
  }

  private async submitVideoScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    const submission = await this.videos.submit(scene, story)

    await this.repository.updateScene(
      story.id,
      scene.id,
      { statuses: ['VIDEO_QUEUED'] },
      {
        videoRequestId: submission.requestId,
        videoStatusUrl: submission.statusUrl,
        videoResponseUrl: submission.responseUrl,
        videoCancelUrl: submission.cancelUrl,
      },
    )

    this.onEvent({
      event: 'story.video.submitted',
      storyId: story.id,
      sceneOrder: scene.order,
    })
  }

  private async pollVideoScene(
    story: StoryRecord,
    scene: SceneRecord,
  ): Promise<void> {
    try {
      const result = await this.videos.poll(scene)

      if (result.state === 'IN_QUEUE') {
        if (scene.status !== 'VIDEO_QUEUED') {
          await this.repository.updateScene(
            story.id,
            scene.id,
            { statuses: ['VIDEO_RUNNING'] },
            { status: 'VIDEO_QUEUED' },
          )
        }

        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (scene.status !== 'VIDEO_RUNNING') {
          await this.repository.updateScene(
            story.id,
            scene.id,
            { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
            { status: 'VIDEO_RUNNING' },
          )
        }

        return
      }

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        {
          status: 'VIDEO_READY',
          videoUrl: result.videoUrl,
          videoError: null,
        },
      )

      this.onEvent({
        event: 'story.video.succeeded',
        storyId: story.id,
        sceneOrder: scene.order,
      })
    } catch (error) {
      const code = toStoryError(error).code

      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )

      this.onEvent({
        event: 'story.video.failed',
        storyId: story.id,
        sceneOrder: scene.order,
        errorCode: code,
      })
    }
  }

  private async finalizeVideos(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_VIDEOS') {
      return
    }

    if (story.scenes.every((scene) => scene.status === 'VIDEO_READY')) {
      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_VIDEOS'], version: story.version },
        { status: 'VIDEOS_READY', errorCode: null, errorMessage: null },
      )

      return
    }

    const hasFailed = story.scenes.some((scene) => scene.status === 'VIDEO_FAILED')
    const hasActive = story.scenes.some(
      (scene) =>
        scene.status === 'KEYFRAME_READY'
        || VIDEO_ACTIVE_STATUSES.includes(scene.status),
    )

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'video-failed', ['GENERATING_VIDEOS'])
    }
  }

  private async processAssembly(
    story: StoryRecord,
    alreadyAssembling: boolean,
  ): Promise<void> {
    if (this.assemblyInFlight) {
      return
    }

    const fresh = await this.repository.findById(story.id)

    if (!fresh || fresh.leaseOwner !== this.owner) {
      return
    }

    if (!fresh.scenes.every((scene) => scene.status === 'VIDEO_READY')) {
      if (!alreadyAssembling) {
        await this.failStory(fresh, 'assembly-failed', ['VIDEOS_READY'])
      }

      return
    }

    if (fresh.finalVideoUrl) {
      await this.repository.updateStory(
        fresh.id,
        { statuses: ['ASSEMBLING'], version: fresh.version },
        {
          status: 'READY',
          completedAt: fresh.completedAt ?? new Date(this.now()),
          errorCode: null,
          errorMessage: null,
        },
      )

      return
    }

    if (!alreadyAssembling) {
      const started = await this.repository.updateStory(
        fresh.id,
        { statuses: ['VIDEOS_READY'], version: fresh.version },
        { status: 'ASSEMBLING', errorCode: null, errorMessage: null },
      )

      if (started === 0) {
        return
      }
    }

    const assembling = await this.repository.findById(story.id)

    if (!assembling || assembling.status !== 'ASSEMBLING') {
      return
    }

    this.assemblyInFlight = true

    try {
      const clips = assembling.scenes
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((scene) => ({
          order: scene.order,
          url: scene.videoUrl ?? '',
        }))

      this.onEvent({ event: 'story.assembly.start', storyId: assembling.id })

      const result = await this.assembler.assemble({
        storyId: assembling.id,
        clips,
      })

      let safeUrl: string

      try {
        safeUrl = assertFalMediaUrl(result.fileUrl)
      } catch {
        throw new StoryError('assembly-failed')
      }

      const updated = await this.repository.updateStory(
        assembling.id,
        { statuses: ['ASSEMBLING'], version: assembling.version },
        {
          status: 'READY',
          finalVideoUrl: safeUrl,
          finalVideoExpiresAt: new Date(result.expiresAt),
          completedAt: new Date(this.now()),
          errorCode: null,
          errorMessage: null,
        },
      )

      if (updated === 0) {
        this.onEvent({
          event: 'story.assembly.failed',
          storyId: assembling.id,
          errorCode: 'internal-error',
        })

        return
      }

      this.onEvent({ event: 'story.assembly.ok', storyId: assembling.id })
    } catch (error) {
      const code = toStoryError(error).code
      const failure = code === 'assembly-timeout'
        ? 'assembly-timeout'
        : code === 'ffmpeg-not-configured'
          ? 'ffmpeg-not-configured'
          : 'assembly-failed'

      await this.failStory(assembling, failure, ['ASSEMBLING'])

      this.onEvent({
        event: 'story.assembly.failed',
        storyId: assembling.id,
        errorCode: failure,
      })
    } finally {
      this.assemblyInFlight = false
    }
  }

  private async failStory(
    story: StoryRecord,
    code: StoryErrorCode,
    fromStatuses: readonly StoryRecord['status'][],
  ): Promise<void> {
    await this.repository.updateStory(
      story.id,
      { statuses: fromStatuses, version: story.version },
      {
        status: 'FAILED',
        errorCode: code,
        errorMessage: storyErrorMessage(code),
      },
    )
  }

  private async failSceneAndStory(
    story: StoryRecord,
    scene: SceneRecord,
    code: StoryErrorCode,
    stage: 'keyframe' | 'video',
  ): Promise<void> {
    if (stage === 'keyframe') {
      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['PENDING', 'KEYFRAME_QUEUED'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )
    } else {
      await this.repository.updateScene(
        story.id,
        scene.id,
        { statuses: ['KEYFRAME_READY', 'VIDEO_QUEUED'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )
    }

    await this.failStory(
      story,
      code,
      stage === 'keyframe' ? ['GENERATING_KEYFRAMES'] : ['GENERATING_VIDEOS'],
    )
  }

  private referenceExpired(story: StoryRecord): boolean {
    if (!story.referenceUrl) {
      return false
    }

    if (!story.referenceExpiresAt) {
      return true
    }

    return story.referenceExpiresAt.getTime() <= this.now()
  }

  private async maybeCleanup(now: number): Promise<void> {
    if (now - this.lastCleanupAt < this.config.cleanupIntervalMs) {
      return
    }

    this.lastCleanupAt = now

    const deleted = await this.repository.deleteExpired(
      new Date(now - this.config.cleanupGraceMs),
      this.config.cleanupBatchSize,
    )

    if (deleted > 0) {
      this.onEvent({ event: 'story.cleanup' })
    }
  }
}

export function createStoryReconciler(options: StoryReconcilerOptions): StoryReconciler {
  return new StoryReconciler(options)
}
