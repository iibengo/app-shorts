// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  FakeKeyframeOrchestrator,
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  TEST_NOW,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: approveStory } = await import('../../../server/api/story/[id]/approve.post')

function waitingStory(overrides: Parameters<typeof makeStoryRecord>[0] = {}) {
  return makeStoryRecord({
    status: 'WAITING_APPROVAL',
    scenes: makeScenes(5, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    }),
    ...overrides,
  })
}

function setup(
  story = waitingStory(),
  options: Parameters<typeof makeStoryRuntime>[0] = {},
) {
  const keyframes = (options.keyframes ?? new FakeKeyframeOrchestrator()) as FakeKeyframeOrchestrator
  const videos = (options.videos ?? new FakeVideoOrchestrator()) as FakeVideoOrchestrator
  const repository = new FakeStoryRepository([story])
  const runtime = makeStoryRuntime({ repository, keyframes, videos, ...options })

  return {
    story,
    repository,
    runtime,
    keyframes,
    videos,
    post(
      callOptions: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime' | 'params'> = {},
    ) {
      return callStoryRoute(approveStory, {
        method: 'POST',
        path: `/api/story/${story.id}/approve`,
        runtime,
        params: { id: story.id },
        cookieSessionId: SESSION_ID,
        ...callOptions,
      })
    },
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } })?.error?.code
}

describe('POST /api/story/[id]/approve success', () => {
  it('returns 202, persists the approval and submits no video synchronously', async () => {
    const { post, repository, story, videos } = setup()

    const response = await post()

    expect(response.status).toBe(202)
    expect(response.body).toEqual({
      storyId: story.id,
      status: 'GENERATING_VIDEOS',
      version: expect.any(Number),
      pollAfterMs: 2_500,
    })

    const updated = repository.find(story.id)!

    expect(updated.status).toBe('GENERATING_VIDEOS')
    expect(updated.approvedAt?.getTime()).toBeGreaterThanOrEqual(TEST_NOW)
    expect(updated.errorCode).toBeNull()
    expect(videos.submits).toHaveLength(0)
    expect(updated.scenes.every((scene) => scene.status === 'KEYFRAME_READY')).toBe(true)
  })

  it.each([
    ['GENERATING_VIDEOS', 'GENERATING_VIDEOS'],
    ['VIDEOS_READY', 'VIDEOS_READY'],
    ['READY', 'READY'],
  ] as const)('is idempotent from %s', async (status, expected) => {
    const { post, repository } = setup(waitingStory({ status }))

    const response = await post()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe(expected)
    expect(repository.calls).not.toContain('updateStory')
  })
})

describe('POST /api/story/[id]/approve guards', () => {
  it('rejects approval when a scene is not ready', async () => {
    const scenes = makeScenes(5, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    scenes[2] = { ...scenes[2]!, status: 'KEYFRAME_QUEUED' }
    const { post } = setup(waitingStory({ scenes }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('rejects approval from an earlier state', async () => {
    const { post } = setup(makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      scenes: makeScenes(5, { status: 'PENDING' }),
    }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('returns 404 without the session cookie and for a foreign story', async () => {
    const { post } = setup()

    const missing = await post({ cookieSessionId: undefined })
    const foreign = await post({ cookieSessionId: 'other-session-abcdefghij' })

    expect(missing.status).toBe(404)
    expect(foreign.status).toBe(404)
    expect(errorCode(missing)).toBe('story-not-found')
  })

  it('returns 404 for an unknown story', async () => {
    const { runtime } = setup()

    const response = await callStoryRoute(approveStory, {
      method: 'POST',
      path: '/api/story/missing/approve',
      runtime,
      params: { id: 'missing' },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('story-not-found')
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post({ origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })
})

describe('POST /api/story/[id]/approve limits and infrastructure', () => {
  it('returns 429 story-budget-exhausted before approving', async () => {
    const { post, repository, videos, story } = setup(
      waitingStory({ preset: 'quality' }),
      { cost: { maxStoryCostUsd: 1 } },
    )

    const response = await post()

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('story-budget-exhausted')
    expect(repository.find(story.id)?.status).toBe('WAITING_APPROVAL')
    expect(videos.submits).toHaveLength(0)
  })

  it('returns 429 rate-limited when too many commands are sent', async () => {
    const { post } = setup(waitingStory({ status: 'GENERATING_VIDEOS' }), {
      rateLimit: { commandLimit: 1 },
    })

    const first = await post()
    const second = await post()

    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
  })

  it('returns 503 database-unavailable', async () => {
    const story = waitingStory()
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(approveStory, {
      method: 'POST',
      path: `/api/story/${story.id}/approve`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
  })

  it('maps a Prisma failure to 503 and an unexpected one to 500', async () => {
    const prisma = setup()
    vi.spyOn(prisma.repository, 'findOwnedById').mockRejectedValueOnce(
      Object.assign(new Error('db down'), { name: 'PrismaClientInitializationError' }),
    )
    const prismaResponse = await prisma.post()

    expect(prismaResponse.status).toBe(503)
    expect(errorCode(prismaResponse)).toBe('database-unavailable')

    const unexpected = setup()
    vi.spyOn(unexpected.repository, 'findOwnedById').mockRejectedValueOnce(
      new Error('unexpected stack'),
    )
    const unexpectedResponse = await unexpected.post()

    expect(unexpectedResponse.status).toBe(500)
    expect(errorCode(unexpectedResponse)).toBe('internal-error')
    expect(JSON.stringify(unexpectedResponse.body)).not.toContain('stack')
  })
})
