import { describe, expect, it } from 'vitest'
import type { StoryCreateRequest } from '~/models/story'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import {
  canonicalReelStoryBody,
  createReelStoryService,
  toReelStoryDto,
} from '../../../server/story/reel-service'
import { StoryError } from '../../../server/story/errors'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import type { StoryCostConfig } from '../../../server/story/cost'
import { hashStoryBody } from '../../../server/story/story-service'
import {
  FakeReelPlanDirector,
  FakeReelStoryRepository,
} from '../../helpers/story-reel'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const SESSION = 'story-session-reel-0001'
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function request(overrides: Partial<StoryCreateRequest> = {}): StoryCreateRequest {
  return {
    premise: PREMISE,
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: null,
    referenceExpiresAt: null,
    ...overrides,
  }
}

function setup(costs: StoryCostConfig = DEFAULT_STORY_COST_CONFIG) {
  const repository = new FakeReelStoryRepository()
  const director = new FakeReelPlanDirector()
  const service = createReelStoryService({
    repository,
    director,
    costGuard: createReelCostGuard({ costs }),
    rateLimiter: createStoryRateLimiter({
      config: {
        ...DEFAULT_STORY_RATE_LIMIT_CONFIG,
        maxActiveStories: 20,
        createLimit: 20,
        dailyBudgetUsd: 500,
      },
      now: () => NOW,
    }),
    config: { storyTtlMs: 86_400_000, pollAfterMs: 2_500 },
    now: () => NOW,
  })

  return { repository, director, service }
}

function createInput(
  input: StoryCreateRequest,
  idempotencyKey: string | null = null,
) {
  const canonical = canonicalReelStoryBody(input)

  return {
    sessionId: SESSION,
    request: input,
    idempotencyKey,
    bodyHash: hashStoryBody(canonical),
  }
}

async function waitingApproval(
  setupValue: ReturnType<typeof setup>,
  input: StoryCreateRequest = request(),
) {
  const created = await setupValue.service.create(createInput(input))
  let story = (await setupValue.repository.findById(created.story.id))!

  for (const shot of story.shots) {
    await setupValue.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'KEYFRAME_READY',
        keyframeUrl: `https://v3.fal.media/files/test/kf-${shot.order}.jpg`,
        keyframeAttempts: 1,
      },
    )
  }

  await setupValue.repository.updateStory(
    story.id,
    { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
    { status: 'WAITING_APPROVAL' },
  )
  story = (await setupValue.repository.findById(story.id))!

  return story
}

function budgetRequest(): StoryCreateRequest {
  return request({
    costMode: 'budget',
    targetDurationSeconds: 15,
    maxDurationSeconds: 15,
  })
}

async function waitingVideoReady(
  setupValue: ReturnType<typeof setup>,
  input: StoryCreateRequest = request(),
) {
  const story = await waitingApproval(setupValue, input)

  for (const shot of story.shots) {
    const current = story.shots.find((item) => item.id === shot.id)!
    await setupValue.repository.updateShot(
      story.id,
      current.id,
      { version: current.version },
      {
        status: 'VIDEO_READY',
        videoUrl: 'https://v3.fal.media/files/test/video.mp4',
        keyframeAttempts: 1,
        videoAttempts: 1,
      },
    )
  }

  await setupValue.repository.updateStory(
    story.id,
    { statuses: ['WAITING_APPROVAL'], version: story.version },
    { status: 'WAITING_QC', approvedAt: new Date(NOW) },
  )

  return (await setupValue.repository.findById(story.id))!
}

describe('ReelStoryService.create', () => {
  it('creates a 008 story with narrative scenes and pending shots', async () => {
    const { service, director } = setup()
    const input = request()
    const result = await service.create(createInput(input))

    expect(result.replayed).toBe(false)
    expect(result.story).toMatchObject({
      status: 'GENERATING_KEYFRAMES',
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 12,
      preset: 'fast',
      mode: 'faithful',
    })
    expect(result.story.plan.scenes).toHaveLength(3)
    expect(result.story.scenes).toHaveLength(3)
    expect(result.story.shots).toHaveLength(12)
    expect(result.story.shots.every((shot) => shot.status === 'PENDING')).toBe(true)
    expect(director.calls).toHaveLength(1)
  })

  it('uses exactly four shots for Presupuesto 15 with a reference', async () => {
    const { service } = setup()
    const input = request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      referenceUrl: 'https://v3.fal.media/files/test/reference.webp',
      referenceExpiresAt: new Date(NOW + 3_600_000).toISOString(),
    })
    const result = await service.create(createInput(input))

    expect(result.story.shotCount).toBe(4)
    expect(result.story.scenes).toHaveLength(3)
    expect(result.story.plannedDurationSeconds).toBe(15)
    expect(result.story.shots.map((shot) => shot.durationSeconds))
      .toEqual([3, 4, 4, 4])
  })

  it('uses fifteen 6 s shots for Presupuesto 90', async () => {
    const { service } = setup()
    const result = await service.create(createInput(request({
      costMode: 'budget',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    })))

    expect(result.story.shotCount).toBe(15)
    expect(result.story.plannedDurationSeconds).toBe(90)
    expect(result.story.shots.every((shot) => shot.durationSeconds === 6)).toBe(true)
    expect(result.story.scenes).toHaveLength(5)
  })

  it('creates a Producción 90 story with 26–30 shots', async () => {
    const { service } = setup()
    const result = await service.create(createInput(request({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      preset: 'quality',
    })))

    expect(result.story.shotCount).toBe(30)
    expect(result.story.plannedDurationSeconds).toBe(90)
    expect(result.story.scenes.length).toBeGreaterThanOrEqual(7)
    expect(result.story.scenes.length).toBeLessThanOrEqual(10)
  })

  it('derives the DTO from scenes and shots', async () => {
    const { service } = setup()
    const result = await service.create(createInput(request()))
    const dto = toReelStoryDto(result.story, 2_500, NOW)

    expect(dto).toMatchObject({
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 12,
      aspectRatio: '9:16',
      modelId: 'minimax-hailuo-02',
      pollAfterMs: 2_500,
    })
    expect(dto.scenes[0]).toMatchObject({
      order: 1,
      status: 'PENDING',
      storyFunction: 'hook',
      sceneRole: 'establishing',
    })
    expect(dto.scenes[0]?.shots[0]).toMatchObject({
      order: 1,
      indexInScene: 1,
      sceneOrder: 1,
      status: 'PENDING',
      transition: 'cut',
    })
    expect(dto.scenes.flatMap((scene) => scene.shots)).toHaveLength(12)
  })

  it('replays the same idempotency key without a second director call', async () => {
    const { service, director } = setup()
    const input = request()
    const first = await service.create(createInput(input, 'reel-idem-key-01'))
    const second = await service.create(createInput(input, 'reel-idem-key-01'))

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.story.id).toBe(first.story.id)
    expect(director.calls).toHaveLength(1)
  })

  it('rejects the same key with a different canonical body', async () => {
    const { service } = setup()
    await service.create(createInput(request(), 'reel-idem-key-02'))

    await expect(service.create(createInput(request({
      targetDurationSeconds: 45,
      maxDurationSeconds: 45,
    }), 'reel-idem-key-02'))).rejects.toMatchObject({
      code: 'idempotency-conflict',
    })
  })

  it('does not expose ownership to another session', async () => {
    const { service } = setup()
    const created = await service.create(createInput(request()))

    await expect(service.get(created.story.id, 'other-session'))
      .rejects.toBeInstanceOf(StoryError)
    await expect(service.get(created.story.id, 'other-session'))
      .rejects.toMatchObject({ code: 'story-not-found' })
  })
})

describe('ReelStoryService shot commands', () => {
  it('regenerates an approved keyframe shot and resets attempts for a new prompt', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 1, videoAttempts: 1, status: 'KEYFRAME_READY' },
    )

    const next = await ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      { visualPrompt: 'Un nuevo plano de la repostera con el postre azul.', regenerate: true },
    )

    expect(next.status).toBe('GENERATING_KEYFRAMES')
    expect(next.shots[0]).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 0,
      videoAttempts: 0,
    })
  })

  it('does not reset attempts when regenerating the same prompt', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 2, status: 'KEYFRAME_READY' },
    )

    await expect(ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      { visualPrompt: shot.visualPrompt, regenerate: true },
    )).rejects.toMatchObject({ code: 'keyframe-limit-reached' })
  })

  it('edits only duration without calling Fal and updates totals', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    const callsBefore = ctx.director.calls.length

    const next = await ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      { durationSeconds: 2, regenerate: false },
    )

    expect(ctx.director.calls).toHaveLength(callsBefore)
    expect(next.status).toBe('WAITING_APPROVAL')
    expect(next.plannedDurationSeconds).toBe(29)
    expect(next.shotCount).toBe(12)
    expect(next.shots[0]).toMatchObject({
      status: 'KEYFRAME_READY',
      durationSeconds: 2,
      keyframeAttempts: 1,
    })
  })

  it('rejects a 6 s duration edit in quality', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx, request({ preset: 'quality' }))
    const shot = story.shots[0]!

    await expect(ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      { durationSeconds: 6, regenerate: false },
    )).rejects.toMatchObject({ code: 'invalid-shot-duration' })
  })

  it('rejects video retry from WAITING_APPROVAL', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { status: 'VIDEO_FAILED', videoError: 'provider-error' },
    )

    await expect(ctx.service.retryVideoShot(story.id, SESSION, shot.id))
      .rejects.toMatchObject({ code: 'story-not-ready' })
  })

  it('approves quality with the 0.35 short-video unit and stays under the cap', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx, request({ preset: 'quality' }))

    const approved = await ctx.service.approve(story.id, SESSION)

    expect(approved.status).toBe('GENERATING_VIDEOS')
    expect(approved.approvedAt).not.toBeNull()
  })

  it('keeps QC retry atomic when the transition fails', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'VIDEO_FAILED',
        videoError: 'provider-invalid-output',
        videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      },
    )
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_QC' },
    )
    ctx.repository.failQcRetry = true

    await expect(ctx.service.retryQc(story.id, SESSION))
      .rejects.toMatchObject({ code: 'story-not-ready' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots[0]?.status).toBe('VIDEO_FAILED')
  })

  it('rejects a scene batch before writing when one shot is exhausted', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 2, videoAttempts: 1 },
    )

    await expect(ctx.service.regenerateSceneShots(story.id, SESSION, scene.id))
      .rejects.toMatchObject({ code: 'keyframe-limit-reached' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_APPROVAL')
    expect(after.scenes[0]?.shots[0]?.status).toBe('KEYFRAME_READY')
    expect(after.scenes[0]?.shots[0]?.videoAttempts).toBe(1)
  })

  it('resets video attempts and queues the whole scene on a valid batch', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { videoAttempts: 1 },
    )

    const next = await ctx.service.regenerateSceneShots(story.id, SESSION, scene.id)

    expect(next.status).toBe('GENERATING_KEYFRAMES')
    expect(next.scenes[0]?.shots.every((item) => item.status === 'KEYFRAME_QUEUED'))
      .toBe(true)
    expect(next.scenes[0]?.shots.every((item) => item.videoAttempts === 0))
      .toBe(true)
  })

  it('rejects a retry batch when a failed shot exhausted attempts', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { status: 'VIDEO_FAILED', videoAttempts: 2 },
    )
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'GENERATING_VIDEOS' },
    )

    await expect(ctx.service.retrySceneShots(story.id, SESSION, scene.id))
      .rejects.toMatchObject({ code: 'video-retry-limit-reached' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('GENERATING_VIDEOS')
    expect(after.scenes[0]?.shots[0]?.status).toBe('VIDEO_FAILED')
  })

  it('recovers a VIDEO_READY shot from WAITING_QC preserving approval', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'VIDEO_READY',
        videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      },
    )
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_QC', approvedAt: new Date(NOW) },
    )

    const next = await ctx.service.recoverShot(story.id, SESSION, shot.id)

    expect(next.status).toBe('GENERATING_KEYFRAMES')
    expect(next.approvedAt).not.toBeNull()
    expect(next.qc).toBeNull()
    expect(next.shots[0]?.status).toBe('KEYFRAME_QUEUED')
  })

  it('recovers a whole scene in standard resetting both counters', async () => {
    const ctx = setup()
    const story = await waitingVideoReady(ctx)
    const scene = story.scenes[0]!

    const next = await ctx.service.recoverSceneShots(story.id, SESSION, scene.id)

    expect(next.status).toBe('GENERATING_KEYFRAMES')
    expect(next.approvedAt).not.toBeNull()
    expect(next.scenes[0]?.shots.every((shot) =>
      shot.status === 'KEYFRAME_QUEUED'
      && shot.keyframeAttempts === 0
      && shot.videoAttempts === 0)).toBe(true)
  })

  it('keeps videoAttempts when regenerating a scene in Presupuesto', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx, budgetRequest())
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { videoAttempts: 1 },
    )

    const next = await ctx.service.regenerateSceneShots(story.id, SESSION, scene.id)

    expect(next.scenes[0]?.shots.every((item) => item.status === 'KEYFRAME_QUEUED'))
      .toBe(true)
    expect(next.shots.find((item) => item.id === shot.id)?.videoAttempts).toBe(1)
  })

  it('rejects a scene recover when a shot exhausted its video attempts in Presupuesto', async () => {
    const ctx = setup()
    const story = await waitingVideoReady(ctx, budgetRequest())
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 1, videoAttempts: 2 },
    )
    const before = (await ctx.repository.findById(story.id))!

    await expect(ctx.service.recoverSceneShots(story.id, SESSION, scene.id))
      .rejects.toMatchObject({ code: 'video-retry-limit-reached' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots).toEqual(before.shots)
    expect(after.scenes).toEqual(before.scenes)
  })

  it('rejects a scene recover over the cap without partial writes', async () => {
    const ctx = setup({
      ...DEFAULT_STORY_COST_CONFIG,
      keyframeCostUsd: 1,
      videoFastCostUsd: 1,
    })
    const story = await waitingVideoReady(ctx, budgetRequest())
    const scene = story.scenes[0]!
    const before = (await ctx.repository.findById(story.id))!

    await expect(ctx.service.recoverSceneShots(story.id, SESSION, scene.id))
      .rejects.toMatchObject({ code: 'story-budget-exhausted' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots).toEqual(before.shots)
    expect(after.scenes).toEqual(before.scenes)
  })

  it('rejects a scene recover when a shot is not recoverable without partial writes', async () => {
    const ctx = setup()
    const story = await waitingVideoReady(ctx, budgetRequest())
    const scene = story.scenes[0]!
    const shot = scene.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { status: 'VIDEO_FAILED', videoError: 'provider-error' },
    )
    const before = (await ctx.repository.findById(story.id))!

    await expect(ctx.service.recoverSceneShots(story.id, SESSION, scene.id))
      .rejects.toMatchObject({ code: 'scene-not-ready' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots).toEqual(before.shots)
  })
})
