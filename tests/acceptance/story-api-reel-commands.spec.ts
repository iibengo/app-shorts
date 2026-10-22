// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryCreateRequest } from '~/models/story'
import { createReelStoryService } from '../../../server/story/reel-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import {
  FakeReelPlanDirector,
  FakeReelStoryRepository,
} from '../helpers/story-reel'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: approveStory } = await import('../../../server/api/story/[id]/approve.post')
const { default: cancelStory } = await import('../../../server/api/story/[id]/cancel.post')
const { default: keyframeShot } = await import('../../../server/api/story/[id]/shots/[shotId]/keyframe.post')
const { default: retryShot } = await import('../../../server/api/story/[id]/shots/[shotId]/retry.post')
const { default: keyframeScene } = await import('../../../server/api/story/[id]/beats/[beatId]/keyframe.post')
const { default: retryScene } = await import('../../../server/api/story/[id]/beats/[beatId]/retry.post')
const { default: recoverScene } = await import('../../../server/api/story/[id]/beats/[beatId]/recover.post')
const { default: retryQc } = await import('../../../server/api/story/[id]/qc/retry.post')

const SESSION = 'story-session-reel-command-0001'
const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function request(): StoryCreateRequest {
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
  }
}

async function setup() {
  const repository = new FakeReelStoryRepository()
  const service = createReelStoryService({
    repository,
    director: new FakeReelPlanDirector(),
    costGuard: createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG }),
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
  const created = await service.create({
    sessionId: SESSION,
    request: request(),
    idempotencyKey: null,
    bodyHash: 'body',
  })
  const runtime = makeStoryRuntime({
    hasDeepSeekKey: true,
    reelService: service,
  })

  return { repository, service, story: created.story, runtime }
}

function cookie(session = SESSION): string {
  return session
}

describe('008 command routes', () => {
  it('approves ready keyframes and starts video generation', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    for (const shot of story.shots) {
      await ctx.repository.updateShot(
        story.id,
        shot.id,
        { version: shot.version },
        {
          status: 'KEYFRAME_READY',
          keyframeUrl: `https://v3.fal.media/files/test/kf-${shot.order}.jpg`,
        },
      )
    }
    await ctx.repository.updateStory(
      story.id,
      { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
      { status: 'WAITING_APPROVAL' },
    )

    const response = await callStoryRoute(approveStory, {
      method: 'POST',
      path: `/api/story/${story.id}/approve`,
      runtime: ctx.runtime,
      params: { id: story.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({
      storyId: story.id,
      status: 'GENERATING_VIDEOS',
    })
    story = (await ctx.repository.findById(story.id))!
    expect(story.approvedAt).not.toBeNull()
  })

  it('cancels a generating 008 story', async () => {
    const ctx = await setup()
    const response = await callStoryRoute(cancelStory, {
      method: 'POST',
      path: `/api/story/${ctx.story.id}/cancel`,
      runtime: ctx.runtime,
      params: { id: ctx.story.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'CANCELLED' })
  })

  it('regenerates one shot and resets the story to keyframes', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    const shot = story.shots[0]!

    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_APPROVAL' },
    )
    story = (await ctx.repository.findById(story.id))!
    const current = story.shots.find((item) => item.id === shot.id)!
    await ctx.repository.updateShot(
      story.id,
      current.id,
      { version: current.version },
      { status: 'KEYFRAME_READY' },
    )

    const response = await callStoryRoute(keyframeShot, {
      method: 'POST',
      path: `/api/story/${story.id}/shots/${current.id}/keyframe`,
      runtime: ctx.runtime,
      params: { id: story.id, shotId: current.id },
      cookieSessionId: cookie(),
      body: { visualPrompt: 'Un nuevo plano visual de la repostera mirando el postre azul.' },
    })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({ status: 'GENERATING_KEYFRAMES' })
    story = (await ctx.repository.findById(story.id))!
    expect(story.qc).toBeNull()
    expect(story.shots.find((item) => item.id === current.id)?.status)
      .toBe('KEYFRAME_QUEUED')
  })

  it('queues every regenerable shot of a scene and rejects visualPrompt', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    const scene = story.scenes[0]!

    for (const shot of scene.shots) {
      await ctx.repository.updateShot(
        story.id,
        shot.id,
        { version: shot.version },
        { status: 'KEYFRAME_READY', keyframeUrl: `https://v3.fal.media/files/test/kf-${shot.order}.jpg` },
      )
    }
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_APPROVAL' },
    )
    const prompt = scene.shots[0]!.visualPrompt

    const response = await callStoryRoute(keyframeScene, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${scene.id}/keyframe`,
      runtime: ctx.runtime,
      params: { id: story.id, beatId: scene.id },
      cookieSessionId: cookie(),
      body: { regenerate: true },
    })

    expect(response.status).toBe(202)
    story = (await ctx.repository.findById(story.id))!
    const queued = story.scenes[0]!.shots
    expect(queued.every((shot) => shot.status === 'KEYFRAME_QUEUED')).toBe(true)
    expect(queued[0]?.visualPrompt).toBe(prompt)

    const invalid = await callStoryRoute(keyframeScene, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${scene.id}/keyframe`,
      runtime: ctx.runtime,
      params: { id: story.id, beatId: scene.id },
      cookieSessionId: cookie(),
      body: { visualPrompt: 'Un prompt que no debe aceptarse en modo escena.' },
    })
    expect(invalid.status).toBe(400)
  })

  it('retries failed shots of a scene', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    const scene = story.scenes[0]!

    for (const shot of scene.shots) {
      await ctx.repository.updateShot(
        story.id,
        shot.id,
        { version: shot.version },
        { status: 'VIDEO_FAILED', videoError: 'provider-error', keyframeUrl: 'https://v3.fal.media/files/test/kf.jpg' },
      )
    }
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'GENERATING_VIDEOS' },
    )

    const response = await callStoryRoute(retryScene, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${scene.id}/retry`,
      runtime: ctx.runtime,
      params: { id: story.id, beatId: scene.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(202)
    story = (await ctx.repository.findById(story.id))!
    expect(story.scenes[0]?.shots.every((shot) => shot.status === 'VIDEO_QUEUED'))
      .toBe(true)
  })

  it('recovers ready shots of a scene preserving approval', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    const scene = story.scenes[0]!

    for (const shot of scene.shots) {
      await ctx.repository.updateShot(
        story.id,
        shot.id,
        { version: shot.version },
        {
          status: 'VIDEO_READY',
          videoUrl: 'https://v3.fal.media/files/test/video.mp4',
        },
      )
    }
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_QC', approvedAt: new Date(NOW) },
    )

    const response = await callStoryRoute(recoverScene, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${scene.id}/recover`,
      runtime: ctx.runtime,
      params: { id: story.id, beatId: scene.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(202)
    story = (await ctx.repository.findById(story.id))!
    expect(story.status).toBe('GENERATING_KEYFRAMES')
    expect(story.approvedAt).not.toBeNull()
    expect(story.scenes[0]?.shots.every((shot) => shot.status === 'KEYFRAME_QUEUED'))
      .toBe(true)
  })

  it('retries a failed video shot', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!
    const shot = story.shots[0]!

    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'GENERATING_VIDEOS' },
    )
    story = (await ctx.repository.findById(story.id))!
    const current = story.shots.find((item) => item.id === shot.id)!
    await ctx.repository.updateShot(
      story.id,
      current.id,
      { version: current.version },
      {
        status: 'VIDEO_FAILED',
        keyframeUrl: 'https://v3.fal.media/files/test/kf-1.jpg',
        videoError: 'provider-error',
      },
    )

    const response = await callStoryRoute(retryShot, {
      method: 'POST',
      path: `/api/story/${story.id}/shots/${current.id}/retry`,
      runtime: ctx.runtime,
      params: { id: story.id, shotId: current.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(202)
    expect(response.body).toMatchObject({ status: 'GENERATING_VIDEOS' })
    story = (await ctx.repository.findById(story.id))!
    expect(story.shots.find((item) => item.id === current.id)?.status)
      .toBe('VIDEO_QUEUED')
  })

  it('does not offer or execute a QC revalidation that cannot succeed', async () => {
    const ctx = await setup()
    let story = (await ctx.repository.findById(ctx.story.id))!

    for (const shot of story.shots) {
      const current = story.shots.find((item) => item.id === shot.id)!
      await ctx.repository.updateShot(
        story.id,
        current.id,
        { version: current.version },
        {
          status: 'VIDEO_READY',
          videoUrl: 'https://v3.fal.media/files/test/video.mp4',
        },
      )
    }

    story = (await ctx.repository.findById(story.id))!
    const blocked = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      blocked.id,
      { version: blocked.version },
      {
        status: 'VIDEO_FAILED',
        videoError: 'provider-error',
        videoUrl: null,
      },
    )
    await ctx.repository.updateStory(
      story.id,
      { version: story.version },
      { status: 'WAITING_QC' },
    )
    const before = (await ctx.repository.findById(story.id))!

    const response = await callStoryRoute(retryQc, {
      method: 'POST',
      path: `/api/story/${story.id}/qc/retry`,
      runtime: ctx.runtime,
      params: { id: story.id },
      cookieSessionId: cookie(),
    })

    expect(response.status).toBe(409)
    expect((response.body as { error?: { code?: string } }).error?.code)
      .toBe('story-not-ready')

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots).toEqual(before.shots)
  })
})
