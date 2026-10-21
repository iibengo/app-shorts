// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import type { StoryRecord } from '../../../server/story/repository'
import {
  FakeStoryRepository,
  SESSION_ID,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: assembleStory } = await import('../../../server/api/story/[id]/assemble.post')

function videosReadyStory(id = 'story-videos-ready', sessionId = SESSION_ID) {
  return makeStoryRecord({
    id,
    sessionId,
    status: 'VIDEOS_READY',
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    }),
  })
}

function setup(
  stories: readonly StoryRecord[] = [videosReadyStory()],
  options: Parameters<typeof makeStoryRuntime>[0] = {},
) {
  const list = stories
  const repository = new FakeStoryRepository(list)
  const runtime = makeStoryRuntime({ repository, ...options })
  const story = list[0]!

  return {
    story,
    repository,
    runtime,
    post(
      callOptions: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime' | 'params'> = {},
    ) {
      return callStoryRoute(assembleStory, {
        method: 'POST',
        path: `/api/story/${story.id}/assemble`,
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

describe('POST /api/story/[id]/assemble success', () => {
  it('returns 202 from VIDEOS_READY without assembling synchronously', async () => {
    const { post, repository, story } = setup()

    const response = await post()

    expect(response.status).toBe(202)
    expect(response.body).toEqual({
      storyId: story.id,
      status: 'VIDEOS_READY',
      version: expect.any(Number),
      pollAfterMs: 2_500,
    })
    expect(repository.find(story.id)?.status).toBe('VIDEOS_READY')
  })

  it.each([
    ['FAILED', 'assembly-failed'],
    ['FAILED', 'assembly-timeout'],
    ['FAILED', 'ffmpeg-not-configured'],
  ] as const)('returns 202 from %s with %s', async (status, errorCodeValue) => {
    const base = videosReadyStory()
    const story = {
      ...base,
      status: status as StoryStatus,
      errorCode: errorCodeValue,
      errorMessage: 'No se pudo montar el vídeo final. Puedes reintentar el montaje.',
    }
    const { post, repository } = setup([story])

    const response = await post()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('VIDEOS_READY')
    expect(repository.find(story.id)?.errorCode).toBeNull()
  })

  it.each<StoryStatus>(['ASSEMBLING', 'READY'])('is idempotent from %s', async (status) => {
    const base = videosReadyStory()
    const story = {
      ...base,
      status,
      finalVideoUrl: status === 'READY' ? 'https://v3.fal.media/files/test/final.mp4' : null,
    }
    const { post, repository } = setup([story])
    repository.clearCalls()

    const response = await post()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe(status)
    expect(repository.calls).not.toContain('updateStory')
  })
})

describe('POST /api/story/[id]/assemble guards', () => {
  it('rejects assembly when a clip is not ready', async () => {
    const base = videosReadyStory()
    const scenes = base.scenes.slice()
    scenes[1] = { ...scenes[1]!, status: 'VIDEO_FAILED' }
    const { post } = setup([{ ...base, status: 'FAILED', errorCode: 'assembly-failed', scenes }])

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('rejects assembly from a non-assemblable state', async () => {
    const base = videosReadyStory()
    const { post } = setup([{ ...base, status: 'GENERATING_VIDEOS' }])

    const response = await post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('returns 503 ffmpeg-not-configured when the binaries are missing', async () => {
    const { post } = setup(undefined, { hasFfmpeg: false })

    const response = await post()

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('ffmpeg-not-configured')
  })

  it('returns 429 assembly-busy when more than two stories are waiting', async () => {
    const { post } = setup([
      videosReadyStory(),
      videosReadyStory('story-ready-2', 'other-session-1'),
      videosReadyStory('story-ready-3', 'other-session-2'),
    ])

    const response = await post()

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('assembly-busy')
    expect(Number(response.headers.get('retry-after'))).toBe(30)
  })

  it('returns 429 rate-limited after the assembly limit', async () => {
    const { post } = setup(undefined, { rateLimit: { assembleLimit: 1 } })

    const first = await post()
    const second = await post()

    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
  })

  it('returns 404 for a foreign story and without cookie', async () => {
    const { post } = setup()

    const foreign = await post({ cookieSessionId: 'other-session-abcdefghij' })
    const noCookie = await post({ cookieSessionId: undefined })

    expect(foreign.status).toBe(404)
    expect(noCookie.status).toBe(404)
    expect(errorCode(foreign)).toBe('story-not-found')
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post({ origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })

  it('returns 503 database-unavailable', async () => {
    const story = videosReadyStory()
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(assembleStory, {
      method: 'POST',
      path: `/api/story/${story.id}/assemble`,
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
