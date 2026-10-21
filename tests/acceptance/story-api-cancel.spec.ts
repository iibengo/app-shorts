// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import {
  FakeKeyframeOrchestrator,
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  makeSceneRecord,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: cancelStory } = await import('../../../server/api/story/[id]/cancel.post')

function activeStory(status: StoryStatus = 'GENERATING_VIDEOS') {
  const scenes = makeScenes(5, {
    status: 'VIDEO_READY',
    keyframeAttempts: 1,
    videoAttempts: 1,
    videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
  })
  scenes[3] = makeSceneRecord({
    id: scenes[3]!.id,
    order: 4,
    status: 'VIDEO_RUNNING',
    keyframeAttempts: 1,
    videoAttempts: 1,
    keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    videoRequestId: 'video-request-1',
    videoStatusUrl: 'https://queue.fal.run/status',
    videoResponseUrl: 'https://queue.fal.run/result',
    videoCancelUrl: 'https://queue.fal.run/cancel',
  })

  return makeStoryRecord({ status, scenes })
}

function setup(
  story = activeStory(),
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
      return callStoryRoute(cancelStory, {
        method: 'POST',
        path: `/api/story/${story.id}/cancel`,
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

describe('POST /api/story/[id]/cancel success', () => {
  it.each<StoryStatus>([
    'GENERATING_KEYFRAMES',
    'WAITING_APPROVAL',
    'GENERATING_VIDEOS',
    'VIDEOS_READY',
    'ASSEMBLING',
  ])('cancels a story in %s with 200', async (status) => {
    const { post, repository, story } = setup(activeStory(status))

    const response = await post()
    const body = response.body as {
      id: string
      status: string
      pollAfterMs: number
      scenes: { status: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.id).toBe(story.id)
    expect(body.status).toBe('CANCELLED')
    expect(body.pollAfterMs).toBe(0)
    expect(body.scenes.filter((scene) => scene.status === 'VIDEO_READY')).toHaveLength(4)
    expect(body.scenes[3]?.status).toBe('CANCELLED')
    expect(repository.find(story.id)?.status).toBe('CANCELLED')
  })

  it('is idempotent when the story is already cancelled', async () => {
    const { post, repository } = setup(makeStoryRecord({ status: 'CANCELLED' }))
    repository.clearCalls()

    const response = await post()

    expect(response.status).toBe(200)
    expect((response.body as { status: string }).status).toBe('CANCELLED')
    expect(repository.calls).not.toContain('cancel')
  })

  it('cancels active provider jobs best effort', async () => {
    const scene = makeSceneRecord({
      order: 1,
      status: 'KEYFRAME_RUNNING',
      keyframeAttempts: 1,
      keyframeRequestId: 'kf-1',
      keyframeCancelUrl: 'https://queue.fal.run/cancel',
    })
    const story = makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      sceneCount: 1,
      scenes: [scene],
      plan: null,
    })
    const { post, keyframes } = setup(story)

    const response = await post()

    expect(response.status).toBe(200)
    expect(keyframes.cancels).toEqual([{ sceneId: scene.id, storyId: story.id }])
  })

  it('keeps the cancellation when a provider cancel fails', async () => {
    const videos = new FakeVideoOrchestrator()
    videos.cancelError = new Error('provider down')
    const { post } = setup(undefined, { videos })

    const response = await post()

    expect(response.status).toBe(200)
    expect((response.body as { status: string }).status).toBe('CANCELLED')
  })

  it('never leaks internal identifiers or provider URLs', async () => {
    const { post } = setup()

    const response = await post()
    const serialized = JSON.stringify(response.body)

    for (const forbidden of [
      'sessionId',
      'leaseOwner',
      'statusUrl',
      'responseUrl',
      'cancelUrl',
      'requestId',
      'queue.fal.run',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })
})

describe('POST /api/story/[id]/cancel guards', () => {
  it.each<StoryStatus>(['READY', 'FAILED'])('rejects cancelling a %s story', async (status) => {
    const base = activeStory(status)
    const story = {
      ...base,
      status,
      errorCode: status === 'FAILED' ? 'video-failed' as const : null,
    }
    const { post } = setup(story)

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-cancellable')
  })

  it('returns 404 for a foreign story, an unknown story and without cookie', async () => {
    const { post, runtime, story } = setup()

    const foreign = await post({ cookieSessionId: 'other-session-abcdefghij' })
    const noCookie = await post({ cookieSessionId: undefined })
    const unknown = await callStoryRoute(cancelStory, {
      method: 'POST',
      path: '/api/story/missing/cancel',
      runtime,
      params: { id: 'missing' },
      cookieSessionId: SESSION_ID,
    })

    for (const response of [foreign, noCookie, unknown]) {
      expect(response.status).toBe(404)
      expect(errorCode(response)).toBe('story-not-found')
    }

    expect(story.id).toBeDefined()
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post({ origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })

  it('returns 429 rate-limited after the cancellation limit', async () => {
    const { post } = setup(undefined, { rateLimit: { cancelLimit: 1 } })

    const first = await post()
    const second = await post()

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
  })

  it('returns 503 database-unavailable', async () => {
    const story = activeStory()
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(cancelStory, {
      method: 'POST',
      path: `/api/story/${story.id}/cancel`,
      runtime,
      params: { id: story.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
  })

  it('maps an unexpected failure to 500 without leaking it', async () => {
    const { post, repository } = setup()
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      new Error('boom with secret'),
    )

    const response = await post()

    expect(response.status).toBe(500)
    expect(errorCode(response)).toBe('internal-error')
    expect(JSON.stringify(response.body)).not.toContain('secret')
  })
})
