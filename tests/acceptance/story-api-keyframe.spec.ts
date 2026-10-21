// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import {
  FakeStoryRepository,
  SESSION_ID,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: updateKeyframe } = await import(
  '../../../server/api/story/[id]/beats/[beatId]/keyframe.post'
)

const NEW_PROMPT = 'Una repostera abre el obrador al amanecer con luz cálida.'

function waitingStory() {
  return makeStoryRecord({
    status: 'WAITING_APPROVAL',
    scenes: makeScenes(5, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    }),
  })
}

function setup(story = waitingStory(), options: Parameters<typeof makeStoryRuntime>[0] = {}) {
  const repository = new FakeStoryRepository([story])
  const runtime = makeStoryRuntime({ repository, ...options })

  return {
    story,
    repository,
    runtime,
    post(
      payload: unknown,
      callOptions: Omit<Parameters<typeof callStoryRoute>[1], 'method' | 'path' | 'runtime' | 'params'> = {},
    ) {
      return callStoryRoute(updateKeyframe, {
        method: 'POST',
        path: `/api/story/${story.id}/beats/${story.scenes[1]!.id}/keyframe`,
        runtime,
        params: { id: story.id, beatId: story.scenes[1]!.id },
        cookieSessionId: SESSION_ID,
        body: payload,
        ...callOptions,
      })
    },
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

describe('POST /api/story/[id]/beats/[beatId]/keyframe success', () => {
  it('regenerates a single scene with 202 and a minimal job body', async () => {
    const { post, repository, story } = setup()

    const response = await post({
      visualPrompt: NEW_PROMPT,
      narration: 'Una narración nueva que sigue siendo válida.',
      regenerate: true,
    })

    expect(response.status).toBe(202)

    const job = response.body as Record<string, unknown>

    expect(job).toEqual({
      storyId: story.id,
      status: 'GENERATING_KEYFRAMES',
      version: expect.any(Number),
      pollAfterMs: 2_500,
    })
    expect(Object.keys(job).sort()).toEqual(['pollAfterMs', 'status', 'storyId', 'version'])
    expect(JSON.stringify(job)).not.toContain('keyframeRequestId')
    expect(JSON.stringify(job)).not.toContain('statusUrl')

    const updated = repository.find(story.id)!

    expect(updated.status).toBe('GENERATING_KEYFRAMES')
    expect(updated.approvedAt).toBeNull()
    expect(updated.scenes[1]).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      visualPrompt: NEW_PROMPT,
      narration: 'Una narración nueva que sigue siendo válida.',
      keyframeAttempts: 1,
    })
    expect(updated.scenes[0]?.keyframeUrl).toBe(story.scenes[0]?.keyframeUrl)
  })

  it('updates only the narration when regenerate is false and the prompt is unchanged', async () => {
    const { post, repository, story } = setup()

    const response = await post({
      visualPrompt: story.scenes[1]!.visualPrompt,
      narration: 'Solo cambia la narración de la escena.',
      regenerate: false,
    })

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('WAITING_APPROVAL')
    expect(repository.find(story.id)?.scenes[1]).toMatchObject({
      status: 'KEYFRAME_READY',
      narration: 'Solo cambia la narración de la escena.',
    })
  })

  it('accepts the minimum and maximum prompt lengths', async () => {
    for (const visualPrompt of ['a'.repeat(20), 'a'.repeat(600)]) {
      const { post } = setup()

      const response = await post({ visualPrompt })

      expect(response.status, visualPrompt.length.toString()).toBe(202)
    }
  })
})

describe('POST /api/story/[id]/beats/[beatId]/keyframe validation', () => {
  it.each([
    [{ visualPrompt: 'corto' }, 'invalid-visual-prompt', 400],
    [{ visualPrompt: '<b>HTML</b> con longitud suficiente' }, 'invalid-visual-prompt', 400],
    [{ visualPrompt: 'a'.repeat(601) }, 'invalid-visual-prompt', 400],
    [{ visualPrompt: NEW_PROMPT, narration: 'corta' }, 'invalid-narration', 400],
    [{ visualPrompt: NEW_PROMPT, regenerate: 'yes' }, 'invalid-request', 400],
    [{ visualPrompt: NEW_PROMPT, model: 'x' }, 'invalid-request', 400],
    [{ visualPrompt: NEW_PROMPT, statusUrl: 'https://queue.fal.run/x' }, 'invalid-request', 400],
  ])('rejects %# with the stable code', async (payload, code, status) => {
    const { post, repository, story } = setup()

    const response = await post(payload)

    expect(response.status).toBe(status)
    expect(errorCode(response)).toBe(code)
    expect(repository.find(story.id)?.status).toBe('WAITING_APPROVAL')
  })

  it('rejects non-JSON content types with 415', async () => {
    const { post } = setup()

    const response = await post({ visualPrompt: NEW_PROMPT }, { contentType: 'text/plain' })

    expect(response.status).toBe(415)
    expect(errorCode(response)).toBe('unsupported-media-type')
  })

  it('rejects bodies larger than 8 KiB with 413', async () => {
    const { post } = setup()

    const response = await post({ visualPrompt: NEW_PROMPT, narration: 'a'.repeat(9_000) })

    expect(response.status).toBe(413)
    expect(errorCode(response)).toBe('payload-too-large')
  })

  it('rejects cross-origin requests with 403', async () => {
    const { post } = setup()

    const response = await post({ visualPrompt: NEW_PROMPT }, { origin: 'https://evil.example' })

    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('cross-origin-request')
  })
})

describe('POST /api/story/[id]/beats/[beatId]/keyframe state guards', () => {
  it('rejects an unknown story or beat', async () => {
    const { runtime, story } = setup()

    const unknownStory = await callStoryRoute(updateKeyframe, {
      method: 'POST',
      path: '/api/story/missing/beats/x/keyframe',
      runtime,
      params: { id: 'missing', beatId: story.scenes[0]!.id },
      cookieSessionId: SESSION_ID,
      body: { visualPrompt: NEW_PROMPT },
    })
    const unknownBeat = await callStoryRoute(updateKeyframe, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/missing/keyframe`,
      runtime,
      params: { id: story.id, beatId: 'missing' },
      cookieSessionId: SESSION_ID,
      body: { visualPrompt: NEW_PROMPT },
    })

    expect(unknownStory.status).toBe(404)
    expect(errorCode(unknownStory)).toBe('story-not-found')
    expect(unknownBeat.status).toBe(404)
    expect(errorCode(unknownBeat)).toBe('beat-not-found')
  })

  it('returns 404 without the session cookie', async () => {
    const { post } = setup()

    const response = await post({ visualPrompt: NEW_PROMPT }, { cookieSessionId: undefined })

    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('story-not-found')
  })

  it('rejects a story that is not waiting for approval', async () => {
    const story = makeStoryRecord({
      status: 'GENERATING_VIDEOS',
      scenes: makeScenes(5, { status: 'VIDEO_READY', videoAttempts: 1 }),
    })
    const { post } = setup(story)

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('rejects a scene that is not ready or failed', async () => {
    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      scenes: makeScenes(5, { status: 'PENDING' }),
    })
    const { post } = setup(story)

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('scene-not-ready')
  })

  it('rejects a scene that already used both attempts', async () => {
    const story = makeStoryRecord({
      status: 'WAITING_APPROVAL',
      scenes: makeScenes(5, { status: 'KEYFRAME_READY', keyframeAttempts: 2 }),
    })
    const { post } = setup(story)

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('keyframe-limit-reached')
  })

  it('allows regeneration from a keyframe-failed story', async () => {
    const scenes = makeScenes(5, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    scenes[1] = {
      ...scenes[1]!,
      status: 'KEYFRAME_FAILED',
      keyframeError: 'provider-error',
      keyframeAttempts: 1,
    }
    const story = makeStoryRecord({
      status: 'FAILED',
      errorCode: 'keyframe-failed',
      errorMessage: 'No se pudieron crear todas las imágenes de la historia.',
      scenes,
    })
    const { post } = setup(story)

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('GENERATING_KEYFRAMES')
  })
})

describe('POST /api/story/[id]/beats/[beatId]/keyframe limits and infrastructure', () => {
  it('returns 429 rate-limited for too many commands', async () => {
    const { post } = setup(undefined, { rateLimit: { commandLimit: 1 } })

    const first = await post({ visualPrompt: NEW_PROMPT })
    const second = await post({ visualPrompt: NEW_PROMPT })

    expect(first.status).toBe(202)
    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('returns 429 story-budget-exhausted before regenerating', async () => {
    const { post, repository } = setup(undefined, { cost: { maxStoryCostUsd: 0.1 } })

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(429)
    expect(errorCode(response)).toBe('story-budget-exhausted')
    expect(repository.records[0]?.status).toBe('WAITING_APPROVAL')
  })

  it('returns 503 database-unavailable', async () => {
    const story = waitingStory()
    const runtime = makeStoryRuntime({
      repository: new FakeStoryRepository([story]),
      hasDatabase: false,
    })

    const response = await callStoryRoute(updateKeyframe, {
      method: 'POST',
      path: `/api/story/${story.id}/beats/${story.scenes[0]!.id}/keyframe`,
      runtime,
      params: { id: story.id, beatId: story.scenes[0]!.id },
      cookieSessionId: SESSION_ID,
      body: { visualPrompt: NEW_PROMPT },
    })

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
  })

  it('returns 500 internal-error for an unexpected failure', async () => {
    const { post, repository } = setup()
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      new Error('boom with secret'),
    )

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(500)
    expect(errorCode(response)).toBe('internal-error')
    expect(JSON.stringify(response.body)).not.toContain('secret')
  })

  it('maps a Prisma failure to 503 database-unavailable', async () => {
    const { post, repository } = setup()
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      Object.assign(new Error('db down'), { name: 'PrismaClientKnownRequestError' }),
    )

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(503)
    expect(errorCode(response)).toBe('database-unavailable')
  })

  it('does not expose a raw StoryError stack', async () => {
    const { post, repository } = setup()
    vi.spyOn(repository, 'findOwnedById').mockRejectedValueOnce(
      new StoryError('internal-error'),
    )

    const response = await post({ visualPrompt: NEW_PROMPT })

    expect(response.status).toBe(500)
    expect(JSON.stringify(response.body)).not.toContain('at ')
  })
})
