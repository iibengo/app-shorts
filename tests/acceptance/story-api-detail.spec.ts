// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import {
  FakeStoryRepository,
  SESSION_ID,
  TEST_NOW,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: getStory } = await import('../../../server/api/story/[id].get')

const OTHER_SESSION = 'other-session-abcdefghij'

function keyframeScenes(count = 5) {
  return makeScenes(count, {
    status: 'KEYFRAME_READY',
    keyframeAttempts: 1,
    keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  })
}

function videoScenes(count = 5, status: 'VIDEO_READY' | 'VIDEO_RUNNING' = 'VIDEO_READY') {
  return makeScenes(count, {
    status,
    keyframeAttempts: 1,
    videoAttempts: 1,
    keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    videoUrl: status === 'VIDEO_READY' ? 'https://v3.fal.media/files/test/clip.mp4' : null,
  })
}

function setup(story = makeStoryRecord({ status: 'WAITING_APPROVAL', scenes: keyframeScenes() })) {
  const repository = new FakeStoryRepository([story])
  const runtime = makeStoryRuntime({ repository })

  return {
    story,
    repository,
    runtime,
    get(id = story.id, options: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime'> = {}) {
      return callStoryRoute(getStory, {
        method: 'GET',
        path: `/api/story/${id}`,
        runtime,
        params: { id },
        cookieSessionId: SESSION_ID,
        ...options,
      })
    },
  }
}

describe('GET /api/story/[id] success', () => {
  it('returns 200 with the review contract and no internal fields', async () => {
    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      version: 14,
      scenes: keyframeScenes(),
    })
    const { get } = setup(story)

    const response = await get()
    const serialized = JSON.stringify(response.body)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.setCookie).toBeNull()

    expect(response.body).toMatchObject({
      id: story.id,
      status: 'WAITING_APPROVAL',
      title: story.title,
      logline: story.logline,
      preset: 'fast',
      modelId: 'minimax-hailuo-02',
      sceneCount: 5,
      durationSeconds: 6,
      totalDurationSeconds: 30,
      aspectRatio: '9:16',
      approvedAt: null,
      completedAt: null,
      finalVideoUrl: null,
      version: 14,
      error: null,
      pollAfterMs: 2_500,
    })
    expect((response.body as { scenes: unknown[] }).scenes).toHaveLength(5)

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
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })

  it.each<[StoryStatus, number]>([
    ['GENERATING_KEYFRAMES', 2_500],
    ['WAITING_APPROVAL', 2_500],
    ['GENERATING_VIDEOS', 2_500],
    ['VIDEOS_READY', 2_500],
    ['ASSEMBLING', 2_500],
    ['READY', 0],
    ['FAILED', 0],
    ['CANCELLED', 0],
  ])('returns the %s state with pollAfterMs %i', async (status, pollAfterMs) => {
    const scenes = status === 'GENERATING_VIDEOS'
      ? videoScenes(5, 'VIDEO_RUNNING')
      : status === 'READY' || status === 'ASSEMBLING' || status === 'VIDEOS_READY'
        ? videoScenes()
        : keyframeScenes()
    const story = makeStoryRecord({
      status,
      scenes,
      finalVideoUrl: status === 'READY' ? 'https://v3.fal.media/files/test/final.mp4' : null,
      errorCode: status === 'FAILED' ? 'keyframe-failed' : null,
      errorMessage: status === 'FAILED'
        ? 'No se pudieron crear todas las imágenes de la historia.'
        : null,
      completedAt: status === 'READY' ? new Date(TEST_NOW) : null,
    })
    const { get } = setup(story)

    const response = await get()

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status,
      pollAfterMs,
      version: story.version,
    })
  })

  it('hides an expired reference URL', async () => {
    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      scenes: keyframeScenes(),
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
      referenceExpiresAt: new Date(TEST_NOW - 1),
    })
    const { get } = setup(story)

    const response = await get()

    expect(response.body).toMatchObject({
      referenceUrl: null,
      referenceExpiresAt: null,
    })
  })

  it('is read only: no writes, no Fal, no DeepSeek and no FFmpeg', async () => {
    const { get, repository } = setup()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await get()

    expect(repository.calls).toEqual(['findOwnedById'])
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  })
})

describe('GET /api/story/[id] ownership and expiry', () => {
  it('returns 404 without the session cookie', async () => {
    const { get } = setup()

    const response = await get(undefined, { cookieSessionId: undefined })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'story-not-found',
        message: 'Esta historia no está disponible en este navegador.',
        retryable: false,
      },
    })
    expect(response.setCookie).toBeNull()
  })

  it('returns 404 for another session and never 403', async () => {
    const { get } = setup()

    const response = await get(undefined, { cookieSessionId: OTHER_SESSION })

    expect(response.status).toBe(404)
    expect((response.body as { error: { code: string } }).error.code).toBe('story-not-found')
  })

  it('returns 404 for a story that does not exist', async () => {
    const { get } = setup()

    const response = await get('missing-story')

    expect(response.status).toBe(404)
    expect((response.body as { error: { code: string } }).error.code).toBe('story-not-found')
  })

  it('returns 410 for an expired story', async () => {
    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      scenes: keyframeScenes(),
      expiresAt: new Date(Date.now() - 1_000),
    })
    const { get } = setup(story)

    const response = await get()

    expect(response.status).toBe(410)
    expect(response.body).toEqual({
      error: {
        code: 'story-expired',
        message: 'Esta historia ya no está disponible. Empieza de nuevo.',
        retryable: false,
      },
    })
  })

  it('rejects cross-origin requests with 403', async () => {
    const { get } = setup()

    const response = await get(undefined, { origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect((response.body as { error: { code: string } }).error.code)
      .toBe('cross-origin-request')
  })

  it('rate limits polling with Retry-After', async () => {
    const { get } = setup()

    const first = await get()
    const second = await get()

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect((second.body as { error: { code: string } }).error.code).toBe('rate-limited')
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThanOrEqual(2)
  })
})

describe('GET /api/story/[id] infrastructure errors', () => {
  it('returns 503 database-unavailable without a configured database', async () => {
    const story = makeStoryRecord({ status: 'WAITING_APPROVAL', scenes: keyframeScenes() })
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(getStory, {
      method: 'GET',
      path: `/api/story/${story.id}`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(503)
    expect((response.body as { error: { code: string } }).error.code)
      .toBe('database-unavailable')
  })

  it('maps a Prisma failure to 503 database-unavailable', async () => {
    const story = makeStoryRecord({ status: 'WAITING_APPROVAL', scenes: keyframeScenes() })
    const repository = new FakeStoryRepository([story])
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      Object.assign(new Error('connection refused'), {
        name: 'PrismaClientInitializationError',
        code: 'P1001',
      }),
    )
    const runtime = makeStoryRuntime({ repository })

    const response = await callStoryRoute(getStory, {
      method: 'GET',
      path: `/api/story/${story.id}`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(503)
    expect((response.body as { error: { code: string } }).error.code)
      .toBe('database-unavailable')
    expect(JSON.stringify(response.body)).not.toContain('connection refused')
  })

  it('maps an unexpected failure to 500 without leaking it', async () => {
    const story = makeStoryRecord({ status: 'WAITING_APPROVAL', scenes: keyframeScenes() })
    const repository = new FakeStoryRepository([story])
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      new Error('stack trace with secret'),
    )
    const runtime = makeStoryRuntime({ repository })

    const response = await callStoryRoute(getStory, {
      method: 'GET',
      path: `/api/story/${story.id}`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(500)
    expect((response.body as { error: { code: string } }).error.code).toBe('internal-error')
    expect(JSON.stringify(response.body)).not.toContain('stack')
  })
})
