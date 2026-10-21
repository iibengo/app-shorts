// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryQC } from '~/models/story'
import {
  FakeStoryRepository,
  SESSION_ID,
  makeScenes,
  makeStoryRecord,
} from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: getStory } = await import('../../../server/api/story/[id].get')
const { default: retryQc } = await import('../../../server/api/story/[id]/qc/retry.post')
const { default: approveQc } = await import('../../../server/api/story/[id]/qc/approve.post')

type RouteOptions = Omit<
  Parameters<typeof callStoryRoute>[1],
  'method' | 'path' | 'runtime' | 'params'
>

function qc(overrides: Partial<StoryQC> = {}): StoryQC {
  return {
    status: 'FAILED',
    errorCode: null,
    evaluator: 'vision',
    checkedAt: '2026-10-21T18:20:00.000Z',
    confidence: 0.62,
    scenes: [],
    issues: [],
    override: null,
    ...overrides,
  }
}

function waitingStory(overrides: Parameters<typeof makeStoryRecord>[0] = {}) {
  return makeStoryRecord({
    status: 'WAITING_QC',
    qc: qc(),
    approvedAt: new Date('2026-10-21T18:00:00.000Z'),
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
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

  return {
    story,
    repository,
    runtime,
    get(callOptions: RouteOptions = {}) {
      return callStoryRoute(getStory, {
        method: 'GET',
        path: `/api/story/${story.id}`,
        runtime,
        params: { id: story.id },
        cookieSessionId: SESSION_ID,
        ...callOptions,
      })
    },
    retry(callOptions: RouteOptions = {}) {
      return callStoryRoute(retryQc, {
        method: 'POST',
        path: `/api/story/${story.id}/qc/retry`,
        runtime,
        params: { id: story.id },
        cookieSessionId: SESSION_ID,
        ...callOptions,
      })
    },
    approve(callOptions: RouteOptions = {}) {
      return callStoryRoute(approveQc, {
        method: 'POST',
        path: `/api/story/${story.id}/qc/approve`,
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

describe('GET /api/story/[id] with QC', () => {
  it('returns the validated QC, its override and no polling in WAITING_QC', async () => {
    const { get, story } = setup()
    const response = await get()
    const body = response.body as {
      qc: StoryQC
      status: string
      pollAfterMs: number
      [key: string]: unknown
    }

    expect(response.status).toBe(200)
    expect(body.status).toBe('WAITING_QC')
    expect(body.pollAfterMs).toBe(0)
    expect(body.qc.status).toBe('FAILED')
    expect(body.qc.evaluator).toBe('vision')
    expect(JSON.stringify(body)).not.toContain('qcJson')
    expect(JSON.stringify(body)).not.toContain('sessionId')
    expect(JSON.stringify(body)).not.toContain('requestId')
    expect(body.id).toBe(story.id)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('returns qc null before the QC runs', async () => {
    const story = waitingStory({ status: 'VIDEOS_READY', qc: null })
    const { get } = setup(story)
    const body = (await get()).body as { qc: unknown }

    expect(body.qc).toBeNull()
  })

  it('returns 404 for a foreign story', async () => {
    const { get } = setup()

    const response = await get({ cookieSessionId: 'other-session-abcdefghij' })

    expect(response.status).toBe(404)
    expect(errorCode(response)).toBe('story-not-found')
  })

  it('is read-only and does not call providers', async () => {
    const { get, runtime } = setup()

    await get()

    expect(runtime.keyframes).toBeNull()
    expect(runtime.videos).toBeNull()
  })
})

describe('POST /api/story/[id]/qc/retry', () => {
  it('returns 202 and queues a fresh QC', async () => {
    const { retry, repository, story } = setup()
    const response = await retry()

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('VIDEOS_READY')
    expect(repository.find(story.id)).toMatchObject({
      status: 'VIDEOS_READY',
      qc: null,
      qcCheckedAt: null,
    })
  })

  it('is idempotent from QC and VIDEOS_READY', async () => {
    for (const status of ['QC', 'VIDEOS_READY'] as const) {
      const { retry, story } = setup(waitingStory({ status, qc: null }))
      const response = await retry()

      expect(response.status).toBe(202)
      expect((response.body as { status: string }).status).toBe(status)
    }
  })

  it('rejects a non waiting state and limits retries', async () => {
    const { retry } = setup(waitingStory({ status: 'WAITING_APPROVAL' }))

    expect((await retry()).status).toBe(409)

    const limited = setup(waitingStory(), { rateLimit: { qcRetryLimit: 1 } })
    expect((await limited.retry()).status).toBe(202)

    const record = limited.repository.find(limited.story.id)!
    const index = limited.repository.records.indexOf(record)

    limited.repository.records[index] = { ...record, status: 'WAITING_QC' }

    const second = await limited.retry()

    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('rejects cross-origin, foreign and missing cookies', async () => {
    const { retry } = setup()

    expect((await retry({ origin: 'https://evil.example', host: 'localhost' })).status)
      .toBe(403)
    expect((await retry({ cookieSessionId: 'other-session-abcdefghij' })).status)
      .toBe(404)
    expect((await retry({ cookieSessionId: undefined })).status).toBe(404)
  })

  it('does not let a foreign session consume the per-story qc/retry quota', async () => {
    const limited = setup(waitingStory(), { rateLimit: { qcRetryLimit: 1 } })

    expect((await limited.retry({ cookieSessionId: 'other-session-abcdefghij' })).status)
      .toBe(404)
    expect((await limited.retry({ cookieSessionId: 'third-session-abcdefghij' })).status)
      .toBe(404)
    expect(limited.repository.find(limited.story.id)?.status).toBe('WAITING_QC')

    expect((await limited.retry()).status).toBe(202)

    const record = limited.repository.find(limited.story.id)!
    const index = limited.repository.records.indexOf(record)

    limited.repository.records[index] = { ...record, status: 'WAITING_QC' }

    const second = await limited.retry()

    expect(second.status).toBe(429)
    expect(errorCode(second)).toBe('rate-limited')
  })
})

describe('POST /api/story/[id]/qc/approve', () => {
  it('requires confirm: true', async () => {
    const { approve } = setup()

    expect((await approve({ body: { confirm: false } })).status).toBe(400)
    expect((await approve({ body: { confirm: true, extra: true } })).status).toBe(400)
    expect((await approve({ body: { confirm: true }, contentType: 'text/plain' })).status)
      .toBe(415)
    expect((await approve({ body: { confirm: true, padding: 'x'.repeat(5_000) } })).status)
      .toBe(413)
  })

  it('sets the override and moves to ASSEMBLING without rewriting the status', async () => {
    const { approve, repository, story } = setup()
    const response = await approve({ body: { confirm: true } })
    const record = repository.find(story.id)!

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('ASSEMBLING')
    expect(record.qc?.status).toBe('FAILED')
    expect(record.qc?.override?.approved).toBe(true)
    expect(record.qc?.override?.at).toBeTruthy()
    expect(record.errorCode).toBeNull()
  })

  it('allows the manual override when the automatic QC was disabled', async () => {
    const story = waitingStory({
      qc: qc({
        status: 'UNAVAILABLE',
        errorCode: 'qc-disabled',
        evaluator: 'none',
        scenes: [],
      }),
    })
    const { approve, repository } = setup(story)
    const response = await approve({ body: { confirm: true } })

    expect(response.status).toBe(202)
    expect((response.body as { status: string }).status).toBe('ASSEMBLING')
    expect(repository.find(story.id)?.qc).toMatchObject({
      status: 'UNAVAILABLE',
      evaluator: 'none',
      override: { approved: true },
    })
  })

  it('is idempotent and keeps the original override timestamp', async () => {
    const { approve, repository, story } = setup()
    const first = await approve({ body: { confirm: true } })
    const firstAt = repository.find(story.id)?.qc?.override?.at

    expect(first.status).toBe(202)

    const second = await approve({ body: { confirm: true } })

    expect(second.status).toBe(202)
    expect(repository.find(story.id)?.qc?.override?.at).toBe(firstAt)
  })

  it('rejects a story with a technically broken clip', async () => {
    const story = waitingStory()
    story.scenes[2] = { ...story.scenes[2]!, status: 'VIDEO_FAILED' }
    const { approve } = setup(story)
    const response = await approve({ body: { confirm: true } })

    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('story-not-ready')
  })

  it('returns 403 cross-origin and 404 for a foreign story', async () => {
    const { approve } = setup()

    expect((await approve({
      body: { confirm: true },
      origin: 'https://evil.example',
      host: 'localhost',
    })).status).toBe(403)
    expect((await approve({
      body: { confirm: true },
      cookieSessionId: 'other-session-abcdefghij',
    })).status).toBe(404)
  })

  it('applies the command rate limit', async () => {
    const { approve } = setup(waitingStory(), { rateLimit: { commandLimit: 1 } })

    expect((await approve({ body: { confirm: true } })).status).toBe(202)
    expect((await approve({ body: { confirm: true } })).status).toBe(429)
  })
})

describe('QC route payload hygiene', () => {
  it('never returns qcJson, provider URLs, sessions or requests', async () => {
    const { get } = setup()
    const serialized = JSON.stringify((await get()).body)

    expect(serialized).not.toContain('qcJson')
    expect(serialized).not.toContain('leaseOwner')
    expect(serialized).not.toContain('queue.fal.run')
    expect(serialized).not.toContain('sessionId')
    expect(serialized).not.toContain('requestId')
    expect(serialized).not.toContain('negativePrompt')
  })
})
