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
  const runtime = makeStoryRuntime({ hasDeepSeekKey: true, reelService })

  return {
    director,
    runtime,
    post(
      payload: unknown,
      options: {
        readonly idempotencyKey?: string
        readonly cookieSessionId?: string
      } = {},
    ) {
      return callStoryRoute(createStory, {
        method: 'POST',
        path: '/api/story',
        runtime,
        body: payload,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        ...(options.cookieSessionId ? { cookieSessionId: options.cookieSessionId } : {}),
      })
    },
  }
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    premise: PREMISE,
    preset: 'fast',
    mode: 'faithful',
    ...overrides,
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

function sessionOf(setCookie: string | null): string {
  return setCookie?.match(/story_sid=([^;]+)/)?.[1] ?? ''
}

describe('POST /api/story duration and profile validation', () => {
  it('applies the 008 defaults without any 008 field', async () => {
    const { post, director } = setup()
    const response = await post(body())

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 12,
      sceneCount: 3,
      preset: 'fast',
      mode: 'faithful',
    })
    expect(director.calls).toHaveLength(1)
  })

  it('accepts a 90 s production story', async () => {
    const { post } = setup()
    const response = await post(body({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      preset: 'quality',
    }))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      platform: 'tiktok',
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    })

    const story = response.body as {
      shotCount: number
      sceneCount: number
      scenes: readonly unknown[]
      plannedDurationSeconds: number
    }
    expect(story.shotCount).toBeGreaterThanOrEqual(26)
    expect(story.shotCount).toBeLessThanOrEqual(30)
    expect(story.sceneCount).toBeGreaterThanOrEqual(7)
    expect(story.sceneCount).toBeLessThanOrEqual(10)
    expect(story.scenes.length).toBeGreaterThanOrEqual(7)
    expect(story.scenes.length).toBeLessThanOrEqual(10)
    expect(story.plannedDurationSeconds).toBe(90)
  })

  it('tolerates and ignores sceneCount, including in the idempotency hash', async () => {
    const { post, director } = setup()
    const key = 'duration-scene-count-key-0001'
    const first = await post(body({ sceneCount: 99 }), { idempotencyKey: key })
    const sessionId = sessionOf(first.setCookie)
    const replay = await post(
      body({ sceneCount: 4 }),
      { idempotencyKey: key, cookieSessionId: sessionId },
    )

    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect((replay.body as { id: string }).id).toBe((first.body as { id: string }).id)
    expect((first.body as { scenes: unknown[] }).scenes).toHaveLength(3)
    expect(director.calls).toHaveLength(1)
  })

  it('rejects every invalid platform before calling DeepSeek', async () => {
    const { post, director } = setup()

    for (const platform of ['shorts', null, '', 'TikTok']) {
      const response = await post(body({ platform }))

      expect(response.status, String(platform)).toBe(400)
      expect(errorCode(response)).toBe('invalid-platform')
    }

    expect(director.calls).toHaveLength(0)
  })

  it('rejects invalid duration values before calling DeepSeek', async () => {
    const { post, director } = setup()

    for (const duration of [20, 75, '30']) {
      const response = await post(body({ targetDurationSeconds: duration }))

      expect(response.status, String(duration)).toBe(400)
      expect(errorCode(response)).toBe('invalid-duration')
    }

    expect(director.calls).toHaveLength(0)
  })

  it('rejects a maximum different from the target duration', async () => {
    const { post, director } = setup()
    const response = await post(body({
      targetDurationSeconds: 60,
      maxDurationSeconds: 90,
    }))

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('invalid-duration')
    expect(director.calls).toHaveLength(0)
  })

  it('rejects unknown fields before platform or duration', async () => {
    const { post, director } = setup()
    const unknown = await post(body({ unexpected: true }))
    const precedence = await post(body({
      unexpected: true,
      platform: 'shorts',
      targetDurationSeconds: 20,
    }))

    expect(unknown.status).toBe(400)
    expect(errorCode(unknown)).toBe('invalid-request')
    expect(precedence.status).toBe(400)
    expect(errorCode(precedence)).toBe('invalid-request')
    expect(director.calls).toHaveLength(0)
  })

  it('rejects unknown cost modes before calling DeepSeek', async () => {
    const { post, director } = setup()

    for (const costMode of [null, '', 'Budget', 'premium']) {
      const response = await post(body({ costMode }))

      expect(response.status, String(costMode)).toBe(400)
      expect(errorCode(response)).toBe('invalid-cost-mode')
    }

    expect(director.calls).toHaveLength(0)
  })

  it('rejects every profile combination outside the table', async () => {
    const { post, director } = setup()
    const invalid: readonly (readonly [string, number])[] = [
      ['budget', 30],
      ['budget', 45],
      ['budget', 60],
      ['standard', 90],
      ['production', 15],
      ['production', 30],
      ['production', 45],
      ['production', 60],
    ]

    for (const [costMode, duration] of invalid) {
      const response = await post(body({
        costMode,
        targetDurationSeconds: duration,
        maxDurationSeconds: duration,
      }))

      expect(response.status, `${costMode} ${duration}`).toBe(400)
      expect(errorCode(response)).toBe('invalid-cost-mode')
    }

    expect(director.calls).toHaveLength(0)
  })

  it('rejects quality in Presupuesto before calling DeepSeek', async () => {
    const { post, director } = setup()
    const response = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      preset: 'quality',
    }))

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('invalid-cost-mode')
    expect(director.calls).toHaveLength(0)
  })
})
