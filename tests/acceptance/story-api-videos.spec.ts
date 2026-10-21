// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import {
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: retryVideo } = await import(
  '../../../server/api/story/[id]/beats/[beatId]/retry.post'
)

function videoStory(options: {
  status?: StoryStatus
  sceneStatus?: 'VIDEO_FAILED' | 'VIDEO_READY'
  videoAttempts?: number
  errorCode?: 'video-failed' | null
} = {}) {
  const sceneStatus = options.sceneStatus ?? 'VIDEO_FAILED'
  const scenes = makeScenes(5, {
    status: 'VIDEO_READY',
    keyframeAttempts: 1,
    videoAttempts: 1,
    keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
  })
  const target = scenes[2]!

  scenes[2] = {
    ...target,
    status: sceneStatus,
    videoAttempts: options.videoAttempts ?? 1,
    videoError: sceneStatus === 'VIDEO_FAILED' ? 'provider-error' : null,
    videoRequestId: 'video-request-1',
    videoStatusUrl: 'https://queue.fal.run/status',
    videoResponseUrl: 'https://queue.fal.run/result',
    videoCancelUrl: 'https://queue.fal.run/cancel',
  }

  return makeStoryRecord({
    status: options.status ?? 'GENERATING_VIDEOS',
    scenes,
    errorCode: options.errorCode ?? null,
    errorMessage: options.errorCode
      ? 'No se pudieron generar todos los vídeos de la historia.'
      : null,
  })
}

function setup(
  story = videoStory(),
  options: Parameters<typeof makeStoryRuntime>[0] = {},
) {
  const videos = (options.videos ?? new FakeVideoOrchestrator()) as FakeVideoOrchestrator
  const repository = new FakeStoryRepository([story])
  const runtime = makeStoryRuntime({ repository, videos, ...options })

  return {
    story,
    repository,
    videos,
    runtime,
    post(
      callOptions: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime' | 'params'> = {},
      beatId = story.scenes[2]!.id,
    ) {
      return callStoryRoute(retryVideo, {
        method: 'POST',
        path: `/api/story/${story.id}/beats/${beatId}/retry`,
        runtime,
        params: { id: story.id, beatId },
        cookieSessionId: SESSION_ID,
        ...callOptions,
      })
    },
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } })?.error?.code
}

describe('POST /api/story/[id]/beats/[beatId]/retry success', () => {
  it('requeues only the failed scene with 202', async () => {
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
    expect(updated.scenes[2]).toMatchObject({
      status: 'VIDEO_QUEUED',
      videoAttempts: 1,
      videoError: null,
      videoRequestId: null,
      videoStatusUrl: null,
      videoResponseUrl: null,
      videoCancelUrl: null,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    expect(updated.scenes.filter((scene) => scene.status === 'VIDEO_READY')).toHaveLength(4)
    expect(videos.submits).toHaveLength(0)
  })

  it('recovers a FAILED video-failed story', async () => {
    const { post, repository, story } = setup(videoStory({
      status: 'FAILED',
      errorCode: 'video-failed',
    }))

    const response = await post()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('GENERATING_VIDEOS')
    expect(repository.find(story.id)?.errorCode).toBeNull()
  })
})

describe('POST /api/story/[id]/beats/[beatId]/retry guards', () => {
  it('rejects a third attempt with 409', async () => {
    const { post } = setup(videoStory({ videoAttempts: 2 }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('video-retry-limit-reached')
  })

  it('rejects a scene that is not VIDEO_FAILED', async () => {
    const { post } = setup(videoStory({ sceneStatus: 'VIDEO_READY' }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('scene-not-ready')
  })

  it('rejects a story that is not generating videos', async () => {
    const { post } = setup(videoStory({ status: 'WAITING_APPROVAL' }))

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('returns 404 for an unknown story or beat and without cookie', async () => {
    const { runtime, story, post } = setup()

    const unknownStory = await callStoryRoute(retryVideo, {
      method: 'POST',
      path: '/api/story/missing/beats/x/retry',
      runtime,
      params: { id: 'missing', beatId: story.scenes[2]!.id },
      cookieSessionId: SESSION_ID,
    })
    const unknownBeat = await post({}, 'missing')
    const noCookie = await post({ cookieSessionId: undefined })

    expect(unknownStory.status).toBe(404)
    expect(errorCode(unknownStory)).toBe('story-not-found')
    expect(unknownBeat.status).toBe(404)
    expect(errorCode(unknownBeat)).toBe('beat-not-found')
    expect(noCookie.status).toBe(404)
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post({ origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })
})

describe('POST /api/story/[id]/beats/[beatId]/retry limits and infrastructure', () => {
  it('returns 429 story-budget-exhausted before retrying', async () => {
    const { post, repository, story } = setup(undefined, {
      cost: { maxStoryCostUsd: 0.1 },
    })

    const response = await post()

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('story-budget-exhausted')
    expect(repository.find(story.id)?.scenes[2]?.status).toBe('VIDEO_FAILED')
  })

  it('returns 429 rate-limited for too many commands', async () => {
    const { post } = setup(videoStory({ sceneStatus: 'VIDEO_READY' }), {
      rateLimit: { commandLimit: 1 },
    })

    const first = await post()
    const second = await post()

    expect(first.status).toBe(409)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
  })

  it('returns 503 database-unavailable', async () => {
    const story = videoStory()
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(retryVideo, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${story.scenes[2]!.id}/retry`,
      runtime,
      params: { id: story.id, beatId: story.scenes[2]!.id },
      cookieSessionId: SESSION_ID,
    })

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
  })

  it('maps database and unexpected failures without leaking details', async () => {
    const database = setup()
    vi.spyOn(database.repository, 'findOwnedById').mockRejectedValueOnce(
      Object.assign(new Error('connection refused'), { code: 'P1001' }),
    )
    const databaseResponse = await database.post()

    expect(databaseResponse.status).toBe(503)
    expect(errorCode(databaseResponse)).toBe('database-unavailable')
    expect(JSON.stringify(databaseResponse.body)).not.toContain('connection refused')

    const unexpected = setup()
    vi.spyOn(unexpected.repository, 'findOwnedById').mockRejectedValueOnce(
      new Error('boom secret'),
    )
    const unexpectedResponse = await unexpected.post()

    expect(unexpectedResponse.status).toBe(500)
    expect(errorCode(unexpectedResponse)).toBe('internal-error')
    expect(JSON.stringify(unexpectedResponse.body)).not.toContain('secret')
  })
})
