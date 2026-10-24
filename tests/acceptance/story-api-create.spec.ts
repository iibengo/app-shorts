// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import { validateStoryPlan } from '../../../server/story/plan-validator'
import {
  FakeStoryDirector,
  FakeStoryRepository,
  TEST_NOW,
  createTestClock,
  longGlobalPlan,
  longVideoPlan,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute, readSetCookieAttribute } from '../helpers/story-route'
import type { StoryRouteOptions } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')

const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

function body(overrides: Record<string, unknown> = {}) {
  return {
    premise: PREMISE,
    legacy: true,
    sceneCount: 5,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: null,
    referenceExpiresAt: null,
    ...overrides,
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

function sessionOf(response: { setCookie: string | null }): string | undefined {
  return response.setCookie?.match(/story_sid=([^;]+)/)?.[1]
}

function setup(options: Parameters<typeof makeStoryRuntime>[0] = {}) {
  const clock = createTestClock(TEST_NOW)
  const runtime = makeStoryRuntime({ ...options, now: clock.now })

  return {
    runtime,
    clock,
    post(
      payload: unknown,
      callOptions: Omit<StoryRouteOptions, 'method' | 'path' | 'runtime'> = {},
    ) {
      return callStoryRoute(createStory, {
        method: 'POST',
        path: '/api/story',
        runtime,
        body: payload,
        ...callOptions,
      })
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/story success', () => {
  it('creates a story and returns 201 with the full public contract', async () => {
    const { runtime, post } = setup()

    const response = await post(body())

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-type')).toBeUndefined()

    const story = response.body as Record<string, unknown>

    expect(story).toMatchObject({
      status: 'GENERATING_KEYFRAMES',
      premise: PREMISE,
      preset: 'fast',
      mode: 'faithful',
      modelId: 'minimax-hailuo-02',
      sceneCount: 5,
      durationSeconds: 6,
      totalDurationSeconds: 30,
      aspectRatio: '9:16',
      referenceUrl: null,
      referenceExpiresAt: null,
      finalVideoUrl: null,
      approvedAt: null,
      completedAt: null,
      version: 1,
      error: null,
      pollAfterMs: 2_500,
    })
    expect(story.id).toMatch(/^story-\d+$/)
    expect(story.title).toBeDefined()
    expect(story.logline).toBeDefined()
    expect(story.plan).toMatchObject({ tone: 'humor' })
    expect(story.scenes).toHaveLength(5)
    expect((story.scenes as { order: number }[]).map((scene) => scene.order)).toEqual([
      1, 2, 3, 4, 5,
    ])
    expect((story.scenes as { status: string }[]).every((scene) => scene.status === 'PENDING'))
      .toBe(true)

    expect(runtime.director).toBeInstanceOf(FakeStoryDirector)

    const cookies = response.setCookie

    expect(cookies).toContain('story_sid=')
    expect(readSetCookieAttribute(cookies, 'httponly')).toBe('true')
    expect(readSetCookieAttribute(cookies, 'samesite')).toBe('lax')
    expect(readSetCookieAttribute(cookies, 'path')).toBe('/')
    expect(readSetCookieAttribute(cookies, 'max-age')).toBe('604800')
  })

  it('never leaks internal identifiers, transport URLs or keys', async () => {
    const { post } = setup({
      director: new FakeStoryDirector(),
    })

    const response = await post(body())
    const serialized = JSON.stringify(response.body)

    for (const forbidden of [
      'sessionId',
      'idempotencyKey',
      'leaseOwner',
      'leaseUntil',
      'statusUrl',
      'responseUrl',
      'cancelUrl',
      'requestId',
      'keyframeRequestId',
      'videoRequestId',
      'NUXT_FAL_KEY',
      'NUXT_DEEPSEEK_KEY',
      'falKey',
      'deepseekKey',
      'DATABASE_URL',
      'Authorization',
      'queue.fal.run',
      'rest.fal.ai',
      'fal-ai/',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })

  it('persists a valid reference and returns it', async () => {
    const expiresAt = new Date(Date.now() + 1_000).toISOString()
    const { post } = setup()

    const response = await post(body({ referenceUrl: REFERENCE, referenceExpiresAt: expiresAt }))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      referenceUrl: REFERENCE,
      referenceExpiresAt: expiresAt,
    })
  })

  it('replays the same idempotency key with 200 and without calling the director twice', async () => {
    const director = new FakeStoryDirector()
    const { post } = setup({ director })
    const payload = body()

    const first = await post(payload, { idempotencyKey: 'idem-key-12345678' })
    const second = await post(payload, {
      idempotencyKey: 'idem-key-12345678',
      cookieSessionId: sessionOf(first),
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id)
    expect(director.calls).toHaveLength(1)
  })

  it('accepts a plan whose long action still fits the motion-only video prompt', async () => {
    // 013: the video prompt no longer repeats location, time, weather, wardrobe
    // or props, so a long action no longer overflows it. The keyframe keeps its
    // own budget. This used to be rejected with 502 and must not be any more.
    const plan = longVideoPlan()
    const validation = validateStoryPlan(plan, { sceneCount: 5, mode: 'faithful' })

    expect(validation.ok, validation.ok ? '' : validation.reason).toBe(true)
  })

  it('rejects the same idempotency key with another body', async () => {
    const { post } = setup()

    const first = await post(body(), { idempotencyKey: 'idem-key-12345678' })
    const conflict = await post(
      body({ premise: 'Otra premisa completamente diferente.' }),
      { idempotencyKey: 'idem-key-12345678', cookieSessionId: sessionOf(first) },
    )

    expect(conflict.status).toBe(409)
    expect(errorCode(conflict)).toBe('idempotency-conflict')
  })

  it('rejects the same idempotency key when only the mode changes', async () => {
    const { post } = setup()

    const first = await post(body({ mode: 'faithful' }), {
      idempotencyKey: 'idem-key-mode-01',
    })
    const conflict = await post(body({ mode: 'creative' }), {
      idempotencyKey: 'idem-key-mode-01',
      cookieSessionId: sessionOf(first),
    })

    expect(first.status).toBe(201)
    expect(conflict.status).toBe(409)
    expect(errorCode(conflict)).toBe('idempotency-conflict')
  })
})

describe('POST /api/story validation', () => {
  it.each([
    [{ premise: '   ' }, 'premise-required', 400],
    [{ premise: 'a'.repeat(601) }, 'premise-too-long', 400],
    [{ premise: 'Una premisa\u0000rota' }, 'invalid-premise', 400],
    [{ sceneCount: 3 }, 'invalid-scene-count', 400],
    [{ sceneCount: '5' }, 'invalid-scene-count', 400],
    [{ preset: 'pro' }, 'invalid-preset', 400],
    [{ mode: undefined }, 'invalid-mode', 400],
    [{ mode: null }, 'invalid-mode', 400],
    [{ mode: '' }, 'invalid-mode', 400],
    [{ mode: 'Creative' }, 'invalid-mode', 400],
    [{ mode: 'faithful ' }, 'invalid-mode', 400],
    [{ mode: 1 }, 'invalid-mode', 400],
    [{ referenceUrl: 'https://evil.example/a.webp', referenceExpiresAt: new Date(TEST_NOW + 1_000).toISOString() }, 'invalid-reference', 400],
    [{ referenceUrl: REFERENCE }, 'invalid-reference', 400],
    [{ referenceExpiresAt: new Date(TEST_NOW + 1_000).toISOString() }, 'invalid-reference', 400],
    [{ model: 'kling-2.5-turbo-pro' }, 'invalid-request', 400],
    [{ endpointId: 'fal-ai/flux/dev' }, 'invalid-request', 400],
    [{ durationSeconds: 10 }, 'invalid-request', 400],
    [{ beats: [] }, 'invalid-request', 400],
    [{ statusUrl: 'https://queue.fal.run/x' }, 'invalid-request', 400],
    [{ responseUrl: 'https://queue.fal.run/x' }, 'invalid-request', 400],
    [{ cancelUrl: 'https://queue.fal.run/x' }, 'invalid-request', 400],
    [{ webhookUrl: 'https://evil.example' }, 'invalid-request', 400],
    [{ sessionId: 'abc' }, 'invalid-request', 400],
  ])('rejects %# with %s', async (overrides, code, status) => {
    const { post } = setup()

    const response = await post(body(overrides))

    expect(response.status).toBe(status)
    expect(errorCode(response)).toBe(code)
    expect(response.body).toMatchObject({
      error: { code, retryable: expect.any(Boolean), message: expect.any(String) },
    })
  })

  it('accepts a premise of exactly 600 characters', async () => {
    const { post } = setup()

    const response = await post(body({ premise: 'a'.repeat(600) }))

    expect(response.status).toBe(201)
  })

  it('rejects non-JSON content types with 415', async () => {
    const { post } = setup()

    const response = await post(body(), { contentType: 'text/plain' })

    expect(response.status).toBe(415)
    expect(errorCode(response)).toBe('unsupported-media-type')
  })

  it('accepts application/json with a charset', async () => {
    const { post } = setup()

    const response = await post(body(), { contentType: 'application/json; charset=utf-8' })

    expect(response.status).toBe(201)
  })

  it('rejects bodies larger than 16 KiB with 413', async () => {
    const { post } = setup()

    const response = await post({ premise: 'a'.repeat(20_000) })

    expect(response.status).toBe(413)
    expect(errorCode(response)).toBe('payload-too-large')
  })

  it('rejects malformed and non-object JSON with 400', async () => {
    const { post } = setup()

    for (const payload of ['not-json', [], 'text', null]) {
      const response = await callStoryRoute(createStory, {
        method: 'POST',
        path: '/api/story',
        runtime: setup().runtime,
        body: payload,
      })

      expect(response.status).toBe(400)
      expect(errorCode(response)).toBe('invalid-request')
    }
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post(body(), { origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })

  it('accepts same-origin requests', async () => {
    const { post } = setup()

    const response = await post(body(), {
      origin: 'https://ai-shorts.example',
      host: 'ai-shorts.example',
    })

    expect(response.status).toBe(201)
  })

  it('rejects an invalid idempotency key with 400', async () => {
    const { post } = setup()

    const response = await post(body(), { idempotencyKey: 'short' })

    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('invalid-request')
  })
})

describe('POST /api/story limits and concurrency', () => {
  it('rejects a second active story for the session with 409', async () => {
    const { post } = setup()

    const first = await post(body())
    const second = await post(
      body({ premise: 'Otra premisa distinta y suficientemente larga.' }),
      { cookieSessionId: sessionOf(first) },
    )

    expect(first.status).toBe(201)
    expect(second.status).toBe(409)
    expect(errorCode(second)).toBe('story-in-progress')
  })

  it('returns 429 rate-limited with Retry-After', async () => {
    const { post, runtime } = setup({ rateLimit: { createLimit: 1 } })

    const first = await post(body())
    expect(first.status).toBe(201)

    const stored = (runtime.repository as { records: { status: string }[] }).records[0]!
    stored.status = 'READY'

    const second = await post(
      body({ premise: 'Segunda premisa distinta y suficientemente larga.' }),
      { cookieSessionId: sessionOf(first) },
    )

    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((second.body as { error: { retryAfterSeconds: number } }).error.retryAfterSeconds)
      .toBeGreaterThan(0)
  })

  it('returns 429 server-busy when the instance is full', async () => {
    const active = makeStoryRecord({
      id: 'story-other',
      sessionId: 'other-session-abcdefghij',
      status: 'WAITING_APPROVAL',
    })
    const { post } = setup({
      repository: new FakeStoryRepository([active]),
      rateLimit: { maxActiveStories: 1 },
    })

    const response = await post(body())

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('server-busy')
    expect(response.body).toMatchObject({ error: { retryAfterSeconds: 30 } })
    expect(Number(response.headers.get('retry-after'))).toBe(30)
  })

  it('returns 429 daily-budget-exhausted when the daily cap is spent', async () => {
    const { post } = setup({ rateLimit: { dailyBudgetUsd: 1 } })

    const response = await post(body())

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('daily-budget-exhausted')
  })

  it('returns 429 story-budget-exhausted when the story cap is below the base cost', async () => {
    const { post } = setup({ cost: { maxStoryCostUsd: 1 } })

    const response = await post(body())

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('story-budget-exhausted')
  })
})

describe('POST /api/story provider and infrastructure errors', () => {
  it('returns 503 director-not-configured without a DeepSeek key', async () => {
    const { post } = setup({ director: null, hasDeepSeekKey: false })

    const response = await post(body())

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('director-not-configured')
  })

  it('returns 503 database-unavailable without a database', async () => {
    const { post } = setup({ hasDatabase: false })

    const response = await post(body())

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
    expect(response.headers.get('retry-after')).toBeUndefined()
  })

  it('returns 502 director-invalid-output after the director repair fails', async () => {
    const { post } = setup({
      director: new FakeStoryDirector(undefined, new StoryError('director-invalid-output')),
    })

    const response = await post(body())

    expect(response.status).toBe(502)
    expect(errorCode(response)).toBe('director-invalid-output')
    expect(response.body).toMatchObject({
      error: { code: 'director-invalid-output', retryable: true },
    })
  })

  it('returns 504 director-timeout and does not create a story', async () => {
    const { post, runtime } = setup({
      director: new FakeStoryDirector(undefined, new StoryError('director-timeout')),
    })

    const response = await post(body())

    expect(response.status).toBe(504)
    expect(errorCode(response)).toBe('director-timeout')
    expect(response.headers.get('retry-after')).toBeUndefined()
    expect((runtime.repository as { records: unknown[] }).records).toHaveLength(0)
  })

  it('maps a provider content block to 422', async () => {
    const { post } = setup({
      director: new FakeStoryDirector(undefined, new StoryError('content-blocked')),
    })

    const response = await post(body())

    expect(response.status).toBe(422)
    expect(errorCode(response)).toBe('content-blocked')
  })

  it('returns 500 internal-error for an unexpected failure without leaking it', async () => {
    const director = new FakeStoryDirector()
    director.createPlan = async () => {
      throw new Error('unexpected stack with secret fal_test_key')
    }
    const { post } = setup({ director })

    const response = await post(body())
    const serialized = JSON.stringify(response.body)

    expect(response.status).toBe(500)
    expect(errorCode(response)).toBe('internal-error')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('stack')
  })
})
