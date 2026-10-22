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
const NOW = Date.now()

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
    repository,
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

describe('008 Presupuesto profiles', () => {
  it('creates a Presupuesto 15 micro-story with 4–5 shots and 12–15 planned seconds', async () => {
    const { post } = setup()
    const response = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      platform: 'tiktok',
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      preset: 'fast',
      finalDurationSeconds: null,
    })

    const story = response.body as {
      shotCount: number
      sceneCount: number
      plannedDurationSeconds: number
      scenes: readonly { readonly storyFunction: string; readonly shots: readonly { readonly durationSeconds: number }[] }[]
    }

    expect(story.shotCount).toBeGreaterThanOrEqual(4)
    expect(story.shotCount).toBeLessThanOrEqual(5)
    expect(story.sceneCount).toBeGreaterThanOrEqual(2)
    expect(story.sceneCount).toBeLessThanOrEqual(3)
    expect(story.plannedDurationSeconds).toBeGreaterThanOrEqual(12)
    expect(story.plannedDurationSeconds).toBeLessThanOrEqual(15)
    expect(story.scenes[0]?.storyFunction).toBe('hook')
    expect(story.scenes[story.scenes.length - 1]?.storyFunction).toBe('payoff')
    expect(story.scenes.flatMap((scene) => scene.shots)
      .every((shot) => shot.durationSeconds >= 2 && shot.durationSeconds <= 5)).toBe(true)
  })

  it('uses exactly four shots when Presupuesto 15 has a reference', async () => {
    const { post } = setup()
    const referenceExpiresAt = new Date(NOW + 3_600_000).toISOString()
    const withReference = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      referenceUrl: 'https://v3.fal.media/files/test/reference.webp',
      referenceExpiresAt,
    }))
    const withoutReference = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }))

    expect(withReference.status).toBe(201)
    expect(withoutReference.status).toBe(201)
    expect((withReference.body as { shotCount: number }).shotCount).toBe(4)

    const noReferenceShots = (withoutReference.body as { shotCount: number }).shotCount
    expect(noReferenceShots).toBeGreaterThanOrEqual(4)
    expect(noReferenceShots).toBeLessThanOrEqual(5)
  })

  it('persists finalDurationSeconds ≤ max on a Presupuesto 15 story', async () => {
    const { post, get, repository } = setup()
    const created = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }))
    const id = (created.body as { id: string }).id
    const sessionId = sessionOf(created.setCookie)
    const record = repository.records.find((item) => item.id === id)!

    repository.records[repository.records.indexOf(record)] = {
      ...record,
      status: 'READY',
      finalDurationSeconds: 15,
      plannedDurationSeconds: 15,
    }

    const detail = await get(id, sessionId)

    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({
      status: 'READY',
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      plannedDurationSeconds: 15,
      finalDurationSeconds: 15,
    })
    expect((detail.body as { finalDurationSeconds: number }).finalDurationSeconds)
      .toBeLessThanOrEqual((detail.body as { maxDurationSeconds: number }).maxDurationSeconds)
  })

  it('creates a Presupuesto 90 story with exactly 15 shots of 6 seconds', async () => {
    const { post } = setup()
    const response = await post(body({
      costMode: 'budget',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    }))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      costMode: 'budget',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      plannedDurationSeconds: 90,
      shotCount: 15,
      preset: 'fast',
    })

    const story = response.body as {
      sceneCount: number
      scenes: readonly { readonly shots: readonly { readonly durationSeconds: number }[] }[]
    }
    expect(story.sceneCount).toBeGreaterThanOrEqual(5)
    expect(story.sceneCount).toBeLessThanOrEqual(8)
    expect(story.scenes.flatMap((scene) => scene.shots)
      .every((shot) => shot.durationSeconds === 6)).toBe(true)
  })
})

describe('008 Producción 90 profile', () => {
  it('creates 26–30 shots in 7–10 scenes with the quality preset', async () => {
    const { post } = setup()
    const response = await post(body({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      preset: 'quality',
    }))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      preset: 'quality',
    })

    const story = response.body as {
      shotCount: number
      sceneCount: number
      plannedDurationSeconds: number
      scenes: readonly { readonly shots: readonly { readonly durationSeconds: number }[] }[]
    }
    expect(story.shotCount).toBeGreaterThanOrEqual(26)
    expect(story.shotCount).toBeLessThanOrEqual(30)
    expect(story.sceneCount).toBeGreaterThanOrEqual(7)
    expect(story.sceneCount).toBeLessThanOrEqual(10)
    expect(story.plannedDurationSeconds).toBeGreaterThanOrEqual(89)
    expect(story.plannedDurationSeconds).toBeLessThanOrEqual(90)
    expect(story.scenes.flatMap((scene) => scene.shots)
      .every((shot) => shot.durationSeconds >= 2 && shot.durationSeconds <= 5)).toBe(true)
  })

  it('rejects Estándar 90 and Producción 30 with invalid-cost-mode', async () => {
    const { post } = setup()
    const standard90 = await post(body({
      costMode: 'standard',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    }))
    const production30 = await post(body({
      costMode: 'production',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
    }))

    expect(standard90.status).toBe(400)
    expect(errorCode(standard90)).toBe('invalid-cost-mode')
    expect(production30.status).toBe(400)
    expect(errorCode(production30)).toBe('invalid-cost-mode')
  })
})
