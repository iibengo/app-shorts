// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBriefingNarrativeDirector } from '../../../server/story/briefing-director'
import { createDeepSeekClient } from '../../../server/story/deepseek-client'
import { createStoryDirector } from '../../../server/story/director'
import { createStoryNarrativeDirector } from '../../../server/story/narrative-director'
import { createStoryVisualDirector } from '../../../server/story/visual-director'
import { analyzePremise, renderBriefBlock } from '../../../server/story/premise-brief'
import { beats5, canon5, narrative5, startDeepSeekStub } from '../helpers/deepseek-stub'
import { FakeStoryRepository } from '../helpers/story'
import invalidContinuity from '../fixtures/deepseek/deepseek-plan-invalid-continuity.json'
import invalidStoryboard from '../fixtures/deepseek/storyboard-invalid-order.json'
import storyboardValid from '../fixtures/deepseek/storyboard-valid.json'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')

const KEY = 'test-deepseek-key'
const PREMISE = 'Mar de luz azul'
const stub = await startDeepSeekStub()

function setup() {
  const client = createDeepSeekClient({ apiKey: KEY, baseUrl: stub.baseUrl })
  const director = createStoryDirector({
    narrative: createBriefingNarrativeDirector(createStoryNarrativeDirector({
      client,
      timeoutMs: 2_000,
    })),
    visual: createStoryVisualDirector({ client, timeoutMs: 2_000 }),
    totalTimeoutMs: 5_000,
  })
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
      body: typeof payload === 'object' && payload !== null
        ? { mode: 'faithful', ...payload }
        : payload,
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
  it('creates the story with canon, beats and visual calls and the original premise', async () => {
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE })
    const story = response.body as Record<string, unknown>

    expect(PREMISE).toHaveLength(15)
    expect(response.status).toBe(201)
    expect(story.premise).toBe(PREMISE)
    expect(story.status).toBe('GENERATING_KEYFRAMES')
    expect(story.sceneCount).toBe(5)
    expect(story.scenes).toHaveLength(5)
    expect(stub.requests).toHaveLength(3)

    expect(repository.records).toHaveLength(1)
    expect(repository.records[0]?.premise).toBe(PREMISE)
  })

  it('rejects an invalid continuity bible twice with 502 and creates nothing', async () => {
    stub.state.contents = [invalidContinuity, invalidContinuity]
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE, sceneCount: 4 })

    expect(response.status).toBe(502)
    expect((response.body as { error?: { code?: string } }).error?.code)
      .toBe('director-invalid-output')
    expect(stub.requests).toHaveLength(2)
    expect(repository.records).toHaveLength(0)
    expect(JSON.stringify(response.body)).not.toContain('Bart')
  })

  it('returns 502 after two invalid storyboards and persists nothing', async () => {
    stub.state.contents = [canon5, beats5, invalidStoryboard, invalidStoryboard]
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE })

    expect(response.status).toBe(502)
    expect((response.body as { error?: { code?: string } }).error?.code)
      .toBe('director-invalid-output')
    expect(stub.requests).toHaveLength(4)
    expect(repository.records).toHaveLength(0)
  })

  it('returns 502 after two storyboards copying the narration and persists nothing', async () => {
    const copied = structuredClone(storyboardValid)
    copied.beats[0] = {
      ...copied.beats[0],
      visualPrompt: narrative5.beats[0]!.narration,
    }
    stub.state.contents = [canon5, beats5, copied, copied]
    const { repository, post } = setup()

    const response = await post({ premise: PREMISE })

    expect(response.status).toBe(502)
    expect((response.body as { error?: { code?: string } }).error?.code)
      .toBe('director-invalid-output')
    expect(stub.requests).toHaveLength(4)
    expect(repository.records).toHaveLength(0)
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
    expect(body.max_tokens).toBe(8_000)
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
    expect(Object.keys(record.plan ?? {}).sort()).toEqual(['beats', 'logline', 'storyBible', 'title', 'tone'])
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
    expect(stub.requests).toHaveLength(3)
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
