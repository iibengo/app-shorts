import { randomBytes } from 'node:crypto'
import type { SceneStatus, StoryErrorCode } from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import { StoryError, toStoryError } from './errors'
import type { ReelCostGuard } from './reel-cost'
import type {
  ReelSceneRecord,
  ReelShotRecord,
  ReelStoryRecord,
  ReelStoryRepository,
} from './reel-repository'
import type { ShotAssembler } from './shot-assembly-service'
import type { ShotKeyframeOrchestrator } from './shot-keyframe-orchestrator'
import type { ShotQCService } from './shot-qc-service'
import type { ShotVideoOrchestrator } from './shot-video-orchestrator'

const KEYFRAME_ACTIVE: readonly SceneStatus[] = ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING']
const VIDEO_ACTIVE: readonly SceneStatus[] = ['VIDEO_QUEUED', 'VIDEO_RUNNING']

export interface ReelReconcilerConfig {
  readonly leaseMs: number
  readonly assemblyLeaseMs: number
  readonly qcLeaseMs: number
  readonly tickBudgetMs: number
  readonly keyframeConcurrency: number
  readonly videoConcurrency: number
  readonly claimLimit: number
}

export const DEFAULT_REEL_RECONCILER_CONFIG: ReelReconcilerConfig = {
  leaseMs: 60_000,
  assemblyLeaseMs: 480_000,
  qcLeaseMs: 720_000,
  tickBudgetMs: 45_000,
  keyframeConcurrency: 6,
  videoConcurrency: 4,
  claimLimit: 5,
}

export interface ReelReconcilerOptions {
  readonly repository: ReelStoryRepository
  readonly keyframes: ShotKeyframeOrchestrator
  readonly videos: ShotVideoOrchestrator
  readonly assembler: ShotAssembler
  readonly qcService: ShotQCService | null
  readonly costGuard: ReelCostGuard
  readonly config: ReelReconcilerConfig
  readonly qcEnabled: boolean
  readonly owner?: string
  readonly now?: () => number
  readonly onEvent?: (event: {
    readonly event: string
    readonly storyId?: string
    readonly shotId?: string
    readonly order?: number
    readonly errorCode?: string
  }) => void
}

export class ReelStoryReconciler {
  private readonly repository: ReelStoryRepository
  private readonly keyframes: ShotKeyframeOrchestrator
  private readonly videos: ShotVideoOrchestrator
  private readonly assembler: ShotAssembler
  private readonly qcService: ShotQCService | null
  private readonly costGuard: ReelCostGuard
  private readonly config: ReelReconcilerConfig
  private readonly qcEnabled: boolean
  private readonly owner: string
  private readonly now: () => number
  private readonly onEvent: ReelReconcilerOptions['onEvent']
  private assemblyInFlight = false
  private qcInFlight = false

  constructor(options: ReelReconcilerOptions) {
    this.repository = options.repository
    this.keyframes = options.keyframes
    this.videos = options.videos
    this.assembler = options.assembler
    this.qcService = options.qcService
    this.costGuard = options.costGuard
    this.config = options.config
    this.qcEnabled = options.qcEnabled
    this.owner = options.owner ?? `reel-reconciler-${randomBytes(6).toString('hex')}`
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent
  }

  async runOnce(): Promise<void> {
    const now = this.now()
    const claimable = await this.repository.listClaimable(new Date(now), this.config.claimLimit)

    for (const candidate of claimable) {
      const claimNow = this.now()
      const leaseMs = candidate.status === 'ASSEMBLING'
        ? this.config.assemblyLeaseMs
        : candidate.status === 'QC'
          ? this.config.qcLeaseMs
          : this.config.leaseMs
      const claimed = await this.repository.claim(
        candidate.id,
        this.owner,
        new Date(claimNow + leaseMs),
        new Date(claimNow),
      )

      if (!claimed) continue

      this.onEvent?.({ event: 'reel.reconciler.claim', storyId: candidate.id })

      try {
        await this.process(candidate.id)
      } catch (error) {
        this.onEvent?.({
          event: 'reel.reconciler.error',
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

    if (!story || story.leaseOwner !== this.owner) return

    if (story.status === 'GENERATING_KEYFRAMES') {
      await this.processKeyframes(story)
      return
    }
    if (story.status === 'GENERATING_VIDEOS') {
      await this.processVideos(story)
      return
    }
    if (story.status === 'VIDEOS_READY') {
      if (this.shouldSkipQc(story)) {
        await this.processAssembly(story, false)
      } else {
        await this.processQc(story)
      }
      return
    }
    if (story.status === 'QC') {
      await this.processQc(story)
      return
    }
    if (story.status === 'ASSEMBLING') {
      await this.processAssembly(story, true)
    }
  }

  private shouldSkipQc(story: ReelStoryRecord): boolean {
    if (!story.qc) return false
    return story.qc.status === 'PASSED' || story.qc.override?.approved === true
  }

  private technicalOnlyPass(qc: ReelStoryRecord['qc']): boolean {
    return qc !== null
      && qc.status === 'UNAVAILABLE'
      && (qc.errorCode === 'qc-disabled' || qc.errorCode === 'qc-not-configured')
  }

  private referenceExpired(story: ReelStoryRecord): boolean {
    return story.referenceExpiresAt !== null
      && story.referenceExpiresAt.getTime() <= this.now()
  }

  private async processKeyframes(story: ReelStoryRecord): Promise<void> {
    if (this.referenceExpired(story)) {
      await this.failStory(story, 'reference-expired', ['GENERATING_KEYFRAMES'])
      return
    }

    const deadline = this.now() + this.config.tickBudgetMs

    for (const initial of story.shots) {
      if (this.now() > deadline) break

      const fresh = await this.repository.findById(story.id)

      if (!fresh || fresh.status !== 'GENERATING_KEYFRAMES' || fresh.leaseOwner !== this.owner) {
        return
      }

      const shot = fresh.shots.find((item) => item.id === initial.id)
      const scene = shot === undefined
        ? undefined
        : fresh.scenes.find((item) => item.id === shot.sceneId)

      if (!shot || !scene) continue

      await this.processKeyframeShot(fresh, shot, scene)
    }

    await this.finalizeKeyframes(story.id)
  }

  private async processKeyframeShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
  ): Promise<void> {
    if (shot.keyframeRequestId && KEYFRAME_ACTIVE.includes(shot.status)) {
      await this.pollKeyframeShot(story, shot)
      return
    }

    if (shot.status !== 'PENDING' && shot.status !== 'KEYFRAME_QUEUED') return
    if (shot.keyframeAttempts >= 2) return

    const active = await this.repository.countActiveProviderJobs('keyframe')
    if (active >= this.config.keyframeConcurrency) return

    try {
      this.costGuard.assertWithinCap(story, this.costGuard.estimateKeyframeAttempt(story))
    } catch (error) {
      if (toStoryError(error).code === 'story-budget-exhausted') {
        await this.failShotAndStory(story, shot, 'story-budget-exhausted', 'keyframe')
        return
      }
      throw error
    }

    const incremented = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: ['PENDING', 'KEYFRAME_QUEUED'], version: shot.version },
      {
        status: 'KEYFRAME_QUEUED',
        keyframeAttempts: shot.keyframeAttempts + 1,
        keyframeError: null,
      },
    )

    if (incremented === 0) return

    try {
      const submission = await this.keyframes.submit(shot, scene, story)

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED'] },
        {
          keyframeRequestId: submission.requestId,
          keyframeStatusUrl: submission.statusUrl,
          keyframeResponseUrl: submission.responseUrl,
          keyframeCancelUrl: submission.cancelUrl,
        },
      )

      this.onEvent?.({
        event: 'reel.keyframe.submitted',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )
      this.onEvent?.({
        event: 'reel.keyframe.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async pollKeyframeShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
  ): Promise<void> {
    try {
      const result = await this.keyframes.poll(shot)

      if (result.state === 'IN_QUEUE') {
        if (shot.status !== 'KEYFRAME_QUEUED') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_QUEUED' },
          )
        }
        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (shot.status !== 'KEYFRAME_RUNNING') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            { status: 'KEYFRAME_RUNNING' },
          )
        }
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        { status: 'KEYFRAME_READY', keyframeUrl: result.keyframeUrl, keyframeError: null },
      )
      this.onEvent?.({
        event: 'reel.keyframe.succeeded',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
        { status: 'KEYFRAME_FAILED', keyframeError: code },
      )
      this.onEvent?.({
        event: 'reel.keyframe.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async finalizeKeyframes(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_KEYFRAMES') return

    if (story.shots.every((shot) =>
      shot.status === 'KEYFRAME_READY' || shot.status === 'VIDEO_READY')) {
      const nextStatus = story.approvedAt !== null
        ? 'GENERATING_VIDEOS'
        : 'WAITING_APPROVAL'

      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
        { status: nextStatus, ...(nextStatus === 'WAITING_APPROVAL' ? { approvedAt: null } : {}) },
      )
      return
    }

    const hasFailed = story.shots.some((shot) => shot.status === 'KEYFRAME_FAILED')
    const hasActive = story.shots.some((shot) =>
      shot.status === 'PENDING'
      || shot.status === 'KEYFRAME_QUEUED'
      || shot.status === 'KEYFRAME_RUNNING')

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'keyframe-failed', ['GENERATING_KEYFRAMES'])
    }
  }

  private async processVideos(story: ReelStoryRecord): Promise<void> {
    const deadline = this.now() + this.config.tickBudgetMs

    for (const initial of story.shots) {
      if (this.now() > deadline) break

      const fresh = await this.repository.findById(story.id)

      if (!fresh || fresh.status !== 'GENERATING_VIDEOS' || fresh.leaseOwner !== this.owner) {
        return
      }

      const shot = fresh.shots.find((item) => item.id === initial.id)
      const scene = shot === undefined
        ? undefined
        : fresh.scenes.find((item) => item.id === shot.sceneId)

      if (!shot || !scene) continue

      await this.processVideoShot(fresh, shot, scene)
    }

    await this.finalizeVideos(story.id)
  }

  private async processVideoShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
  ): Promise<void> {
    if (shot.videoRequestId && VIDEO_ACTIVE.includes(shot.status)) {
      await this.pollVideoShot(story, shot)
      return
    }

    if (shot.status !== 'KEYFRAME_READY' && shot.status !== 'VIDEO_QUEUED') return
    if (shot.videoAttempts >= 2 || !shot.keyframeUrl) return

    const active = await this.repository.countActiveProviderJobs('video')
    if (active >= this.config.videoConcurrency) return

    try {
      this.costGuard.assertWithinCap(story, this.costGuard.estimateVideoAttempt(story))
    } catch (error) {
      if (toStoryError(error).code === 'story-budget-exhausted') {
        await this.failShotAndStory(story, shot, 'story-budget-exhausted', 'video')
        return
      }
      throw error
    }

    const incremented = await this.repository.updateShot(
      story.id,
      shot.id,
      { statuses: ['KEYFRAME_READY', 'VIDEO_QUEUED'], version: shot.version },
      {
        status: 'VIDEO_QUEUED',
        videoAttempts: shot.videoAttempts + 1,
        videoError: null,
      },
    )

    if (incremented === 0) return

    try {
      const submission = await this.videos.submit(shot, scene, story)

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED'] },
        {
          videoRequestId: submission.requestId,
          videoStatusUrl: submission.statusUrl,
          videoResponseUrl: submission.responseUrl,
          videoCancelUrl: submission.cancelUrl,
        },
      )

      this.onEvent?.({
        event: 'reel.video.submitted',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )
      this.onEvent?.({
        event: 'reel.video.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async pollVideoShot(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
  ): Promise<void> {
    try {
      const result = await this.videos.poll(shot)

      if (result.state === 'IN_QUEUE') {
        if (shot.status !== 'VIDEO_QUEUED') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['VIDEO_RUNNING'] },
            { status: 'VIDEO_QUEUED' },
          )
        }
        return
      }

      if (result.state === 'IN_PROGRESS') {
        if (shot.status !== 'VIDEO_RUNNING') {
          await this.repository.updateShot(
            story.id,
            shot.id,
            { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
            { status: 'VIDEO_RUNNING' },
          )
        }
        return
      }

      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        { status: 'VIDEO_READY', videoUrl: result.videoUrl, videoError: null },
      )
      this.onEvent?.({
        event: 'reel.video.succeeded',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
      })
    } catch (error) {
      const code = toStoryError(error).code
      await this.repository.updateShot(
        story.id,
        shot.id,
        { statuses: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        { status: 'VIDEO_FAILED', videoError: code },
      )
      this.onEvent?.({
        event: 'reel.video.failed',
        storyId: story.id,
        shotId: shot.id,
        order: shot.order,
        errorCode: code,
      })
    }
  }

  private async finalizeVideos(storyId: string): Promise<void> {
    const story = await this.repository.findById(storyId)

    if (!story || story.status !== 'GENERATING_VIDEOS') return

    if (story.shots.every((shot) => shot.status === 'VIDEO_READY')) {
      await this.repository.updateStory(
        story.id,
        { statuses: ['GENERATING_VIDEOS'], version: story.version },
        { status: 'VIDEOS_READY', errorCode: null, errorMessage: null },
      )
      return
    }

    const hasFailed = story.shots.some((shot) => shot.status === 'VIDEO_FAILED')
    const hasActive = story.shots.some((shot) =>
      shot.status === 'KEYFRAME_READY'
      || shot.status === 'VIDEO_QUEUED'
      || shot.status === 'VIDEO_RUNNING')

    if (hasFailed && !hasActive) {
      await this.failStory(story, 'video-failed', ['GENERATING_VIDEOS'])
    }
  }

  private async processQc(story: ReelStoryRecord): Promise<void> {
    if (this.qcInFlight) return

    const service = this.qcService

    if (!service) {
      await this.failStory(story, 'ffmpeg-not-configured', ['VIDEOS_READY', 'QC'])
      return
    }

    let fresh = await this.repository.findById(story.id)

    if (!fresh || fresh.leaseOwner !== this.owner) return

    if (!fresh.shots.every((shot) => shot.videoUrl !== null
      && (shot.status === 'VIDEO_READY' || shot.status === 'VIDEO_FAILED'))) {
      await this.failStory(fresh, 'video-failed', ['VIDEOS_READY', 'QC'])
      return
    }

    if (fresh.status === 'VIDEOS_READY') {
      const started = await this.repository.updateStory(
        fresh.id,
        { statuses: ['VIDEOS_READY'], version: fresh.version },
        { status: 'QC', errorCode: null, errorMessage: null },
      )
      if (started === 0) return
      const reloaded = await this.repository.findById(fresh.id)
      if (!reloaded || reloaded.status !== 'QC' || reloaded.leaseOwner !== this.owner) return
      fresh = reloaded
    }

    this.qcInFlight = true

    try {
      const clips = fresh.shots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((shot) => ({ shotId: shot.id, url: shot.videoUrl ?? '' }))
      const result = await service.run({ story: fresh, clips })

      for (const failure of result.technicalFailures) {
        await this.repository.updateShot(
          fresh.id,
          failure.shotId,
          { statuses: ['VIDEO_READY'] },
          { status: 'VIDEO_FAILED', videoError: 'provider-invalid-output' },
        )
      }

      if (
        result.technicalFailures.length === 0
        && (result.qc.status === 'PASSED' || this.technicalOnlyPass(result.qc))
      ) {
        const applied = await this.repository.updateStory(
          fresh.id,
          { statuses: ['QC'], version: fresh.version },
          {
            status: 'ASSEMBLING',
            qc: result.qc,
            qcCheckedAt: new Date(result.qc.checkedAt),
            errorCode: null,
            errorMessage: null,
          },
        )
        if (applied === 0) return
        const assembling = await this.repository.findById(fresh.id)
        if (assembling && assembling.status === 'ASSEMBLING') {
          await this.processAssembly(assembling, true)
        }
        return
      }

      await this.repository.updateStory(
        fresh.id,
        { statuses: ['QC'], version: fresh.version },
        {
          status: 'WAITING_QC',
          qc: result.qc,
          qcCheckedAt: new Date(result.qc.checkedAt),
          errorCode: null,
          errorMessage: null,
        },
      )
    } catch (error) {
      if (toStoryError(error).code === 'ffmpeg-not-configured') {
        await this.failStory(fresh, 'ffmpeg-not-configured', ['QC'])
        return
      }
      this.onEvent?.({
        event: 'reel.qc.error',
        storyId: fresh.id,
        errorCode: toStoryError(error).code,
      })
    } finally {
      this.qcInFlight = false
    }
  }

  private async processAssembly(
    story: ReelStoryRecord,
    alreadyAssembling: boolean,
  ): Promise<void> {
    if (this.assemblyInFlight) return

    const fresh = await this.repository.findById(story.id)

    if (!fresh || fresh.leaseOwner !== this.owner) return

    if (!fresh.shots.every((shot) => shot.status === 'VIDEO_READY' && shot.videoUrl !== null)) {
      await this.failStory(
        fresh,
        'assembly-failed',
        alreadyAssembling ? ['ASSEMBLING'] : ['VIDEOS_READY'],
      )
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
      if (started === 0) return
    }

    const assembling = await this.repository.findById(story.id)
    if (!assembling || assembling.status !== 'ASSEMBLING') return

    this.assemblyInFlight = true

    try {
      const clips = assembling.shots
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((shot) => ({
          order: shot.order,
          url: shot.videoUrl ?? '',
          durationSeconds: shot.durationSeconds,
        }))
      const planned = clips.reduce((total, clip) => total + clip.durationSeconds, 0)

      if (planned !== assembling.plannedDurationSeconds
        || planned > assembling.maxDurationSeconds) {
        throw new StoryError('assembly-failed')
      }

      this.onEvent?.({ event: 'reel.assembly.start', storyId: assembling.id })
      const result = await this.assembler.assemble({
        storyId: assembling.id,
        clips,
        plannedDurationSeconds: assembling.plannedDurationSeconds,
        maxDurationSeconds: assembling.maxDurationSeconds,
      })
      const safeUrl = assertFalMediaUrl(result.fileUrl)

      await this.repository.updateStory(
        assembling.id,
        { statuses: ['ASSEMBLING'], version: assembling.version },
        {
          status: 'READY',
          finalVideoUrl: safeUrl,
          finalVideoExpiresAt: new Date(result.expiresAt),
          finalDurationSeconds: result.durationSeconds,
          completedAt: new Date(this.now()),
          errorCode: null,
          errorMessage: null,
        },
      )
      this.onEvent?.({ event: 'reel.assembly.ok', storyId: assembling.id })
    } catch (error) {
      const code = toStoryError(error).code
      await this.failStory(
        assembling,
        code === 'ffmpeg-not-configured'
          ? 'ffmpeg-not-configured'
          : code === 'assembly-timeout'
            ? 'assembly-timeout'
            : 'assembly-failed',
        ['ASSEMBLING'],
      )
    } finally {
      this.assemblyInFlight = false
    }
  }

  private async failShotAndStory(
    story: ReelStoryRecord,
    shot: ReelShotRecord,
    code: StoryErrorCode,
    stage: 'keyframe' | 'video',
  ): Promise<void> {
    await this.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      stage === 'keyframe'
        ? { status: 'KEYFRAME_FAILED', keyframeError: code }
        : { status: 'VIDEO_FAILED', videoError: code },
    )
    await this.repository.updateStory(
      story.id,
      { statuses: [story.status], version: story.version },
      { status: 'FAILED', errorCode: code, errorMessage: null },
    )
  }

  private async failStory(
    story: ReelStoryRecord,
    code: StoryErrorCode,
    statuses: readonly ReelStoryRecord['status'][],
  ): Promise<void> {
    await this.repository.updateStory(
      story.id,
      { statuses, version: story.version },
      { status: 'FAILED', errorCode: code, errorMessage: null },
    )
  }
}

export function createReelStoryReconciler(
  options: ReelReconcilerOptions,
): ReelStoryReconciler {
  return new ReelStoryReconciler(options)
}
