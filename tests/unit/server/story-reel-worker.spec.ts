import { describe, expect, it } from 'vitest'
import type { ReelShotRecord } from '../../../server/story/reel-repository'
import type {
  ShotAssembler,
  ShotAssemblyInput,
} from '../../../server/story/shot-assembly-service'
import type {
  ShotKeyframeOrchestrator,
  ShotProviderSubmission,
} from '../../../server/story/shot-keyframe-orchestrator'
import type {
  ShotVideoOrchestrator,
  ShotVideoProviderSubmission,
} from '../../../server/story/shot-video-orchestrator'
import {
  DEFAULT_REEL_RECONCILER_CONFIG,
  createReelStoryReconciler,
} from '../../../server/story/reel-reconciler'
import type { ShotQCService } from '../../../server/story/shot-qc-service'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import { createReelStoryService } from '../../../server/story/reel-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import type { StoryCreateRequest } from '~/models/story'
import {
  FakeReelPlanDirector,
  FakeReelStoryRepository,
} from '../../helpers/story-reel'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

class FakeShotKeyframes implements ShotKeyframeOrchestrator {
  readonly submitted: string[] = []
  readonly cancelled: string[] = []
  failPoll = false

  async submit(shot: ReelShotRecord): Promise<ShotProviderSubmission> {
    this.submitted.push(shot.id)
    return {
      requestId: `kf-${shot.order}`,
      statusUrl: `https://queue.fal.run/test/kf-${shot.order}/status`,
      responseUrl: `https://queue.fal.run/test/kf-${shot.order}`,
      cancelUrl: `https://queue.fal.run/test/kf-${shot.order}/cancel`,
    }
  }

  async poll(shot: ReelShotRecord) {
    if (this.failPoll) throw new Error('provider-error')

    return {
      state: 'COMPLETED' as const,
      keyframeUrl: `https://v3.fal.media/files/test/kf-${shot.order}.jpg`,
    }
  }

  async cancel(shot: ReelShotRecord): Promise<void> {
    this.cancelled.push(shot.id)
  }
}

class FakeShotVideos implements ShotVideoOrchestrator {
  readonly submitted: string[] = []
  readonly cancelled: string[] = []

  async submit(shot: ReelShotRecord): Promise<ShotVideoProviderSubmission> {
    this.submitted.push(shot.id)
    return {
      requestId: `video-${shot.order}`,
      statusUrl: `https://queue.fal.run/test/video-${shot.order}/status`,
      responseUrl: `https://queue.fal.run/test/video-${shot.order}`,
      cancelUrl: `https://queue.fal.run/test/video-${shot.order}/cancel`,
    }
  }

  async poll(shot: ReelShotRecord) {
    return {
      state: 'COMPLETED' as const,
      videoUrl: `https://v3.fal.media/files/test/video-${shot.order}.mp4`,
    }
  }

  async cancel(shot: ReelShotRecord): Promise<void> {
    this.cancelled.push(shot.id)
  }
}

class FakeAssembler implements ShotAssembler {
  readonly calls: ShotAssemblyInput[] = []

  async assemble(input: ShotAssemblyInput) {
    this.calls.push(input)

    return {
      fileUrl: 'https://v3.fal.media/files/test/final.mp4',
      expiresAt: new Date(NOW + 86_400_000).toISOString(),
      width: 720 as const,
      height: 1280 as const,
      durationSeconds: input.plannedDurationSeconds,
    }
  }
}

class FakeShotQc implements ShotQCService {
  readonly runs: string[] = []
  status: 'PASSED' | 'FAILED' | 'UNAVAILABLE' = 'PASSED'
  errorCode: 'qc-disabled' | 'qc-not-configured' | null = null

  async run(input: { readonly story: { readonly id: string } }) {
    this.runs.push(input.story.id)
    const checkedAt = new Date(NOW).toISOString()

    return {
      qc: {
        status: this.status,
        errorCode: this.errorCode,
        evaluator: this.status === 'UNAVAILABLE' ? 'none' as const : 'vision' as const,
        checkedAt,
        confidence: 0.9,
        shots: [],
        issues: [],
        variety: null,
        override: null,
      },
      technicalFailures: [],
    }
  }
}

function request(
  costMode: StoryCreateRequest['costMode'] = 'standard',
  duration: StoryCreateRequest['targetDurationSeconds'] = 30,
  hasReference = false,
): StoryCreateRequest {
  return {
    premise: PREMISE,
    platform: 'tiktok',
    costMode,
    targetDurationSeconds: duration,
    maxDurationSeconds: duration,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: hasReference
      ? 'https://v3.fal.media/files/test/reference.webp'
      : null,
    referenceExpiresAt: hasReference
      ? new Date(NOW + 3_600_000).toISOString()
      : null,
  }
}

async function setup(options: {
  readonly qcEnabled?: boolean
  readonly qcService?: ShotQCService | null
  readonly request?: StoryCreateRequest
} = {}) {
  const repository = new FakeReelStoryRepository()
  const rateLimiter = createStoryRateLimiter({
    config: {
      ...DEFAULT_STORY_RATE_LIMIT_CONFIG,
      maxActiveStories: 50,
      createLimit: 50,
      dailyBudgetUsd: 1_000,
    },
    now: () => NOW,
  })
  const costGuard = createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG })
  const keyframes = new FakeShotKeyframes()
  const videos = new FakeShotVideos()
  let qcService = options.qcService ?? null

  if (options.qcService === undefined && options.qcEnabled !== true) {
    const technicalOnly = new FakeShotQc()
    technicalOnly.status = 'UNAVAILABLE'
    technicalOnly.errorCode = 'qc-disabled'
    qcService = technicalOnly
  }

  const service = createReelStoryService({
    repository,
    director: new FakeReelPlanDirector(),
    keyframes,
    videos,
    rateLimiter,
    costGuard,
    config: { storyTtlMs: 86_400_000, pollAfterMs: 2_500 },
    now: () => NOW,
  })
  const created = await service.create({
    sessionId: 'reel-worker-session',
    request: options.request ?? request(),
    idempotencyKey: null,
    bodyHash: 'worker-body',
  })
  const assembler = new FakeAssembler()
  const reconciler = createReelStoryReconciler({
    repository,
    keyframes,
    videos,
    assembler,
    qcService,
    costGuard,
    qcEnabled: options.qcEnabled ?? false,
    owner: 'worker-test',
    now: () => NOW + 1_000,
    config: {
      leaseMs: 60_000,
      assemblyLeaseMs: 480_000,
      qcLeaseMs: 720_000,
      tickBudgetMs: 45_000,
      keyframeConcurrency: 50,
      videoConcurrency: 50,
      claimLimit: 5,
    },
  })

  return {
    repository,
    service,
    costGuard,
    keyframes,
    videos,
    assembler,
    reconciler,
    story: created.story,
  }
}

async function advanceToVideosReady(
  ctx: Awaited<ReturnType<typeof setup>>,
): Promise<void> {
  await ctx.reconciler.runOnce()
  await ctx.reconciler.runOnce()
  await ctx.service.approve(ctx.story.id, 'reel-worker-session')
  await ctx.reconciler.runOnce()
  await ctx.reconciler.runOnce()
}

describe('shot reconciler', () => {
  it('uses the 008 concurrency and assembly lease defaults', () => {
    expect(DEFAULT_REEL_RECONCILER_CONFIG.keyframeConcurrency).toBe(6)
    expect(DEFAULT_REEL_RECONCILER_CONFIG.videoConcurrency).toBe(4)
    expect(DEFAULT_REEL_RECONCILER_CONFIG.assemblyLeaseMs).toBe(480_000)
  })

  it('moves a story from creation to READY in keyframe, approval, video and assembly phases', async () => {
    const ctx = await setup()
    let story = await ctx.repository.findById(ctx.story.id)

    expect(story?.status).toBe('GENERATING_KEYFRAMES')
    expect(ctx.story.shots).toHaveLength(12)

    await ctx.reconciler.runOnce()
    expect(ctx.keyframes.submitted).toHaveLength(12)
    expect((await ctx.repository.findById(ctx.story.id))?.status)
      .toBe('GENERATING_KEYFRAMES')

    await ctx.reconciler.runOnce()
    story = await ctx.repository.findById(ctx.story.id)
    expect(story?.status).toBe('WAITING_APPROVAL')
    expect(story?.shots.every((shot) => shot.status === 'KEYFRAME_READY')).toBe(true)

    await ctx.service.approve(ctx.story.id, 'reel-worker-session')
    expect((await ctx.repository.findById(ctx.story.id))?.status)
      .toBe('GENERATING_VIDEOS')

    await ctx.reconciler.runOnce()
    expect(ctx.videos.submitted).toHaveLength(12)
    await ctx.reconciler.runOnce()

    story = await ctx.repository.findById(ctx.story.id)
    expect(story?.status).toBe('VIDEOS_READY')
    expect(story?.shots.every((shot) => shot.status === 'VIDEO_READY')).toBe(true)

    await ctx.reconciler.runOnce()
    story = await ctx.repository.findById(ctx.story.id)

    expect(story?.status).toBe('READY')
    expect(story?.finalVideoUrl).toBe('https://v3.fal.media/files/test/final.mp4')
    expect(ctx.assembler.calls).toHaveLength(1)
    expect(ctx.assembler.calls[0]?.clips).toHaveLength(12)
    expect(ctx.assembler.calls[0]?.plannedDurationSeconds).toBe(30)
    expect(ctx.assembler.calls[0]?.maxDurationSeconds).toBe(30)
  })

  it('fails the story when a keyframe provider poll fails', async () => {
    const ctx = await setup()
    ctx.keyframes.failPoll = true

    await ctx.reconciler.runOnce()
    await ctx.reconciler.runOnce()

    const story = await ctx.repository.findById(ctx.story.id)
    expect(story?.status).toBe('FAILED')
    expect(story?.errorCode).toBe('keyframe-failed')
    expect(story?.shots.some((shot) => shot.status === 'KEYFRAME_FAILED')).toBe(true)
  })

  it.each([
    ['budget', 15, true],
    ['production', 90, false],
  ] as const)('drives %s %i to READY', async (costMode, duration, hasReference) => {
    const ctx = await setup({
      request: request(costMode, duration, hasReference),
    })

    await advanceToVideosReady(ctx)
    await ctx.reconciler.runOnce()

    const story = await ctx.repository.findById(ctx.story.id)
    expect(story?.status).toBe('READY')
    expect(story?.finalDurationSeconds).toBe(duration)
    expect(story?.shots).toHaveLength(
      costMode === 'budget' ? 4 : 30,
    )
  })

  it('runs shot QC and assembles only after a PASS', async () => {
    const qc = new FakeShotQc()
    const ctx = await setup({ qcEnabled: true, qcService: qc })

    await advanceToVideosReady(ctx)
    expect((await ctx.repository.findById(ctx.story.id))?.status).toBe('VIDEOS_READY')

    await ctx.reconciler.runOnce()
    const story = await ctx.repository.findById(ctx.story.id)

    expect(qc.runs).toHaveLength(1)
    expect(story?.status).toBe('READY')
    expect(story?.qc?.status).toBe('PASSED')
    expect(ctx.assembler.calls).toHaveLength(1)
  })

  it('does not assemble when shot QC does not pass', async () => {
    const qc = new FakeShotQc()
    qc.status = 'FAILED'
    const ctx = await setup({ qcEnabled: true, qcService: qc })

    await advanceToVideosReady(ctx)
    await ctx.reconciler.runOnce()

    const story = await ctx.repository.findById(ctx.story.id)
    expect(story?.status).toBe('WAITING_QC')
    expect(story?.qc?.status).toBe('FAILED')
    expect(ctx.assembler.calls).toHaveLength(0)
  })

  it('cancels active shot jobs through the reel service', async () => {
    const ctx = await setup()

    await ctx.reconciler.runOnce()
    const cancelled = await ctx.service.cancel(ctx.story.id, 'reel-worker-session')

    expect(cancelled.status).toBe('CANCELLED')
    expect(ctx.keyframes.cancelled.length).toBeGreaterThan(0)
  })
})
