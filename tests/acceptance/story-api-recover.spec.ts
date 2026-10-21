// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryQC } from '~/models/story'
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

const { default: recover } = await import(
  '../../../server/api/story/[id]/beats/[beatId]/recover.post'
)

function qc(): StoryQC {
  return {
    status: 'FAILED',
    errorCode: null,
    evaluator: 'vision',
    checkedAt: new Date(TEST_NOW).toISOString(),
    confidence: 0.5,
    scenes: [],
    issues: [],
    override: null,
  }
}

function waitingStory(overrides: Parameters<typeof makeStoryRecord>[0] = {}) {
  return makeStoryRecord({
    status: 'WAITING_QC',
    qc: qc(),
    approvedAt: new Date(TEST_NOW),
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/scene.jpeg',
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      videoRequestId: 'video-request-1',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
      videoCancelUrl: 'https://queue.fal.run/cancel',
    }),
    ...overrides,
  })
}

function setup(
  story = waitingStory(),
  options: Parameters<typeof makeStoryRuntime>[0] = {},
) {
  const repository = new FakeStoryRepository([story])
  const runtime = makeStoryRuntime({ repository, ...options })
  const scene = story.scenes[2]!

  return {
    story,
    scene,
    repository,
    runtime,
    post(callOptions: Partial<Parameters<typeof callStoryRoute>[1]> = {}) {
      return callStoryRoute(recover, {
        method: 'POST',
        path: `/api/story/${story.id}/beats/${scene.id}/recover`,
        runtime,
        params: { id: story.id, beatId: scene.id },
        cookieSessionId: SESSION_ID,
        ...callOptions,
      })
    },
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } })?.error?.code
}

describe('POST /api/story/[id]/beats/[beatId]/recover', () => {
  it('requeues the keyframe and clears the video and the QC', async () => {
    const { post, repository, story, scene } = setup()
    const response = await post()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('GENERATING_KEYFRAMES')

    const updated = repository.find(story.id)!

    expect(updated.status).toBe('GENERATING_KEYFRAMES')
    expect(updated.qc).toBeNull()
    expect(updated.qcCheckedAt).toBeNull()
    expect(updated.approvedAt?.getTime()).toBe(TEST_NOW)

    const updatedScene = updated.scenes.find((item) => item.id === scene.id)!

    expect(updatedScene).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeUrl: scene.keyframeUrl,
      videoUrl: null,
      videoRequestId: null,
      videoStatusUrl: null,
      videoResponseUrl: null,
      videoCancelUrl: null,
      videoError: null,
      keyframeRequestId: null,
      keyframeError: null,
    })
  })

  it('rejects an unknown beat and a non-waiting story', async () => {
    const { post, runtime, story } = setup()

    const unknown = await callStoryRoute(recover, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/missing/recover`,
      runtime,
      params: { id: story.id, beatId: 'missing' },
      cookieSessionId: SESSION_ID,
    })

    expect(unknown.status).toBe(404)
    expect(errorCode(unknown)).toBe('beat-not-found')

    const generating = setup(waitingStory({ status: 'GENERATING_VIDEOS' }))
    const response = await generating.post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('rejects a second consecutive recover with scene-not-ready', async () => {
    const { post } = setup()

    expect((await post()).status).toBe(202)

    const second = await post()

    expect(second.status).toBe(409)
    expect(errorCode(second)).toBe('scene-not-ready')
  })

  it('rejects a scene that is not VIDEO_READY or has exhausted keyframe retries', async () => {
    const failed = waitingStory()
    failed.scenes[2] = { ...failed.scenes[2]!, status: 'VIDEO_FAILED' }
    expect(errorCode(await setup(failed).post())).toBe('scene-not-ready')

    const exhausted = waitingStory()
    exhausted.scenes[2] = { ...exhausted.scenes[2]!, keyframeAttempts: 2 }
    const response = await setup(exhausted).post()

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('keyframe-limit-reached')
  })

  it('rejects when the keyframe budget is exhausted', async () => {
    const { post } = setup(waitingStory(), { cost: { maxStoryCostUsd: 0.01 } })
    const response = await post()

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('story-budget-exhausted')
  })

  it('enforces ownership, cross-origin and the command limit', async () => {
    const { post } = setup()

    expect((await post({ cookieSessionId: 'other-session-abcdefghij' })).status)
      .toBe(404)
    expect((await post({ origin: 'https://evil.example', host: 'localhost' })).status)
      .toBe(403)

    const limited = setup(waitingStory(), { rateLimit: { commandLimit: 1 } })

    expect((await limited.post()).status).toBe(202)
    expect((await limited.post()).status).toBe(429)
  })
})
