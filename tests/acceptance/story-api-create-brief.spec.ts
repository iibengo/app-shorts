// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBriefingDirector } from '../../../server/story/briefing-director'
import { createStoryDirector } from '../../../server/story/director'
import { analyzePremise, renderBriefBlock } from '../../../server/story/premise-brief'
import { startDeepSeekStub } from '../helpers/deepseek-stub'
import { FakeStoryRepository } from '../helpers/story'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')

const KEY = 'test-deepseek-key'
const PREMISE = 'Mar de luz azul'
const stub = await startDeepSeekStub()

function setup() {
  const director = createBriefingDirector(createStoryDirector({
    apiKey: KEY,
    baseUrl: stub.baseUrl,
    timeoutMs: 2_000,
  }))
  const runtime = makeStoryRuntime({ director, hasDeepSeekKey: true })
  const repository = runtime.repository as FakeStoryRepository

  function post(
    payload: unknown,
    options: {
      readonly idempotencyKey?: string
      readonly cookieSessionId?: string
    } = {},
  ) {
    return callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: payload,
      ...(options.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: options.idempotencyKey }),
      ...(options.cookieSessionId === undefined
        ? {}
        : { cookieSessionId: options.cookieSessionId }),
    })
  }

  return { runtime, repository, post }
}

function sessionOf(response: { setCookie: string | null }): string | undefined {
  return response.setCookie?.match(/story_sid=([^;]+)/)?.[1]
}

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

describe('POST /api/story with a short premise and a real decorated director', () => {
  it('creates the story with one DeepSeek request and the original premise', async () => {
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE })
    const story = response.body as Record<string, unknown>

    expect(PREMISE).toHaveLength(15)
    expect(response.status).toBe(201)
    expect(story.premise).toBe(PREMISE)
    expect(story.status).toBe('GENERATING_KEYFRAMES')
    expect(story.sceneCount).toBe(5)
    expect(story.scenes).toHaveLength(5)
    expect(stub.requests).toHaveLength(1)

    expect(repository.records).toHaveLength(1)
    expect(repository.records[0]?.premise).toBe(PREMISE)
  })

  it('sends the premise verbatim plus the deterministic brief', async () => {
    const { post } = setup()

    await post({ premise: PREMISE })

    const body = stub.requests[0]?.body as {
      readonly model: string
      readonly max_tokens: number
      readonly messages: readonly { readonly role: string; readonly content: unknown }[]
    }
    const content = body.messages[1]?.content

    expect(body.model).toBe('deepseek-flash')
    expect(body.max_tokens).toBe(1_400)
    expect(typeof content).toBe('string')

    const text = content as string
    const block = renderBriefBlock(analyzePremise(PREMISE).brief)

    expect(block.length).toBeGreaterThan(0)
    expect(block.length).toBeLessThanOrEqual(500)
    expect(text.startsWith(`Premisa: ${PREMISE}`)).toBe(true)
    expect(text).toContain(block)
    expect(text.indexOf(block)).toBeGreaterThan(text.indexOf(PREMISE))
    expect(text.indexOf(PREMISE)).toBe(text.lastIndexOf(PREMISE))
    expect(text).not.toContain('image_url')
  })

  it('never persists or returns the brief', async () => {
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE })
    const record = repository.records[0]!

    expect(record.plan).not.toBeNull()
    expect(Object.keys(record.plan ?? {}).sort()).toEqual(['beats', 'logline', 'title'])
    expect(JSON.stringify(record)).not.toContain('Brief de producción')
    expect(JSON.stringify(response.body)).not.toContain('Brief de producción')
  })

  it('replays the idempotency key with 200 and without a second DeepSeek call', async () => {
    const { post } = setup()
    const payload = { premise: PREMISE }
    const idempotencyKey = 'idem-key-brief-01'

    const first = await post(payload, { idempotencyKey })
    const second = await post(payload, {
      idempotencyKey,
      cookieSessionId: sessionOf(first),
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((second.body as { id: string }).id).toBe((first.body as { id: string }).id)
    expect((second.body as { premise: string }).premise).toBe(PREMISE)
    expect(stub.requests).toHaveLength(1)
  })

  it('never leaks keys, provider hosts or transport URLs', async () => {
    const { post } = setup()

    const response = await post({ premise: PREMISE })
    const serialized = JSON.stringify(response.body)

    for (const forbidden of [
      KEY,
      'deepseek',
      'api.deepseek.com',
      'Authorization',
      'Bearer',
      'NUXT_DEEPSEEK_KEY',
      'briefApplied',
      'finishReason',
      'statusUrl',
      'requestId',
      'queue.fal.run',
      'rest.fal.ai',
    ]) {
      expect(serialized, forbidden).not.toContain(forbidden)
    }
  })
})
