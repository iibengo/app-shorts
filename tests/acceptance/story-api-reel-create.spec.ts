// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { createReelStoryService } from '../../../server/story/reel-service'
import { makeStoryRuntime } from '../helpers/story-runtime'
import {
  FakeReelPlanDirector,
  FakeReelStoryRepository,
} from '../helpers/story-reel'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')
const { default: getStory } = await import('../../../server/api/story/[id].get')

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'
const NOW = Date.parse('2026-10-22T12:00:00.000Z')

function setup() {
  const repository = new FakeReelStoryRepository()
  const director = new FakeReelPlanDirector()
  const reelService = createReelStoryService({
    repository,
    director,
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
  const runtime = makeStoryRuntime({
    hasDeepSeekKey: true,
    reelService,
  })

  return {
    repository,
    director,
    runtime,
    post(payload: unknown, idempotencyKey?: string) {
      return callStoryRoute(createStory, {
        method: 'POST',
        path: '/api/story',
        runtime,
        body: payload,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      })
    },
    get(id: string, sessionId: string) {
      return callStoryRoute(getStory, {
        method: 'GET',
        path: `/api/story/${id}`,
        runtime,
        params: { id },
        cookieSessionId: sessionId,
      })
    },
  }
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    premise: PREMISE,
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    preset: 'fast',
    mode: 'faithful',
    ...overrides,
  }
}

function sessionOf(setCookie: string | null): string {
  return setCookie?.match(/story_sid=([^;]+)/)?.[1] ?? ''
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

describe('POST /api/story with 008 fields', () => {
  it('creates a reel with platform, cost mode, duration, scenes and shots', async () => {
    const { post, get, runtime } = setup()
    const response = await post(body({ platform: 'reels' }))

    expect(response.status).toBe(201)
    const story = response.body as Record<string, unknown>

    expect(story).toMatchObject({
      status: 'GENERATING_KEYFRAMES',
      platform: 'reels',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 12,
      preset: 'fast',
      mode: 'faithful',
      aspectRatio: '9:16',
      version: 1,
      error: null,
      pollAfterMs: 2_500,
    })
    expect(story.scenes).toHaveLength(3)
    expect((story.scenes as { shots: unknown[] }[]).flatMap((scene) => scene.shots))
      .toHaveLength(12)
    expect(JSON.stringify(response.body)).not.toContain('statusUrl')

    const detail = await get(String(story.id), sessionOf(response.setCookie))
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({
      id: story.id,
      platform: 'reels',
      costMode: 'standard',
      targetDurationSeconds: 30,
    })
    expect(runtime.reelService).not.toBeNull()
  })

  it('creates 008 stories through the shared test runtime wiring', async () => {
    const runtime = makeStoryRuntime({ hasDeepSeekKey: true })
    const response = await callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: body(),
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      costMode: 'standard',
      targetDurationSeconds: 30,
      shotCount: 12,
    })
  })

  it('applies the 008 defaults with only premise, preset and mode', async () => {
    const { post } = setup()
    const response = await post({
      premise: PREMISE,
      preset: 'fast',
      mode: 'faithful',
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      shotCount: 12,
    })
  })

  it('tolerates and ignores sceneCount in the 008 contract', async () => {
    const { post } = setup()
    const response = await post({
      premise: PREMISE,
      sceneCount: 99,
      preset: 'fast',
      mode: 'faithful',
    })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
    })
  })

  it('ignores sceneCount from 008 clients', async () => {
    const { post, director } = setup()
    const response = await post(body({ sceneCount: 99 }))

    expect(response.status).toBe(201)
    expect(director.calls).toHaveLength(1)
    expect((response.body as { scenes: unknown[] }).scenes).toHaveLength(3)
  })

  it('replays the idempotency key and rejects a different body', async () => {
    const { post, runtime } = setup()
    const key = 'reel-api-idem-0001'
    const first = await post(body(), key)
    const sessionId = sessionOf(first.setCookie)
    const replay = (payload: unknown) => callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: payload,
      idempotencyKey: key,
      cookieSessionId: sessionId,
    })
    const second = await replay(body())
    const conflict = await replay(body({
      targetDurationSeconds: 45,
      maxDurationSeconds: 45,
    }))

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id)
    expect(conflict.status).toBe(409)
    expect(errorCode(conflict)).toBe('idempotency-conflict')
  })

  it('validates platform, profile and duration before any director call', async () => {
    const { post, director } = setup()

    const platform = await post(body({ platform: 'youtube' }))
    const duration = await post(body({ targetDurationSeconds: 20, maxDurationSeconds: 20 }))
    const combination = await post(body({ costMode: 'standard', targetDurationSeconds: 90, maxDurationSeconds: 90 }))
    const quality = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      preset: 'quality',
    }))

    expect(platform.status).toBe(400)
    expect(errorCode(platform)).toBe('invalid-platform')
    expect(duration.status).toBe(400)
    expect(errorCode(duration)).toBe('invalid-duration')
    expect(combination.status).toBe(400)
    expect(errorCode(combination)).toBe('invalid-cost-mode')
    expect(quality.status).toBe(400)
    expect(errorCode(quality)).toBe('invalid-cost-mode')
    expect(director.calls).toHaveLength(0)
  })
})

describe('POST /api/story — visual style', () => {
  it('defaults to cartoon3d without asking the client', async () => {
    const { post } = setup()
    const response = await post({ premise: PREMISE, preset: 'fast', mode: 'faithful' })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ visualStyle: 'cartoon3d' })
  })

  it('accepts every registered style id', async () => {
    for (const visualStyle of ['cartoon3d', 'papercraft', 'clay', 'anime', 'photo']) {
      const { post } = setup()
      const response = await post({
        premise: PREMISE,
        preset: 'fast',
        mode: 'faithful',
        visualStyle,
      })

      expect(response.status, visualStyle).toBe(201)
      expect(response.body).toMatchObject({ visualStyle })
    }
  })

  it('rejects an unknown style and never calls the director', async () => {
    const { post, runtime } = setup()
    const director = runtime.director as { readonly calls?: readonly unknown[] }
    const before = director.calls?.length ?? 0
    const response = await post({
      premise: PREMISE,
      preset: 'fast',
      mode: 'faithful',
      visualStyle: 'vaporwave',
    })

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('invalid-visual-style')
    expect(director.calls?.length ?? 0).toBe(before)
  })
})
