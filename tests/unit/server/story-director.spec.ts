// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEEPSEEK_MODEL,
  DIRECTOR_MAX_TOKENS,
  DIRECTOR_TEMPERATURE,
  NativeStoryDirector,
  createStoryDirector,
} from '../../../server/story/director'
import { StoryError } from '../../../server/story/errors'
import { startDeepSeekStub } from '../../helpers/deepseek-stub'
import invalidPlan from '../../fixtures/deepseek/deepseek-invalid.json'
import plan4 from '../../fixtures/deepseek/deepseek-plan-4.json'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import plan6 from '../../fixtures/deepseek/deepseek-plan-6.json'
import repairPlan from '../../fixtures/deepseek/deepseek-repair.json'

const KEY = 'test-deepseek-key'
const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

const stub = await startDeepSeekStub()

function director(options: { timeoutMs?: number } = {}): NativeStoryDirector {
  return new NativeStoryDirector({
    apiKey: KEY,
    baseUrl: stub.baseUrl,
    timeoutMs: options.timeoutMs ?? 2_000,
  })
}

function codeOf(error: unknown): string | undefined {
  return error instanceof StoryError ? error.code : undefined
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }

  throw new Error('expected the director to throw')
}

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

describe('NativeStoryDirector request contract', () => {
  it('calls the OpenAI-compatible DeepSeek endpoint with the fixed model and JSON mode', async () => {
    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.title).toBe(plan5.title)
    expect(plan.logline).toBe(plan5.logline)
    expect(plan.beats).toHaveLength(5)
    expect(stub.requests).toHaveLength(1)

    const request = stub.requests[0]!
    expect(request.method).toBe('POST')
    expect(request.path).toBe('/chat/completions')
    expect(request.authorization).toBe(`Bearer ${KEY}`)

    const body = request.body as {
      model: string
      messages: readonly { role: string; content: unknown }[]
      response_format: unknown
      temperature: number
      max_tokens: number
      stream: boolean
    }

    expect(body.model).toBe(DEEPSEEK_MODEL)
    expect(body.model).toBe('deepseek-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.temperature).toBe(DIRECTOR_TEMPERATURE)
    expect(body.max_tokens).toBe(DIRECTOR_MAX_TOKENS)
    expect(body.max_tokens).toBeLessThanOrEqual(8_000)
    expect(body.stream).toBe(false)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]?.role).toBe('system')
    expect(body.messages[1]?.role).toBe('user')
    expect(body.messages[1]?.content as string).toContain(PREMISE)
    expect(body.messages[1]?.content as string).toContain('"beats"')
  })

  it('passes the scene count to the system prompt', async () => {
    stub.state.contents = [plan4, plan6]

    await director().createPlan({ premise: PREMISE, sceneCount: 4, referenceUrl: null })
    await director().createPlan({ premise: PREMISE, sceneCount: 6, referenceUrl: null })

    const firstSystem = (stub.requests[0]?.body as { messages: { content: string }[] })
      .messages[0]!.content
    const secondSystem = (stub.requests[1]?.body as { messages: { content: string }[] })
      .messages[0]!.content

    expect(firstSystem).toContain('exactamente 4 beats')
    expect(secondSystem).toContain('exactamente 6 beats')
  })

  it('includes the reference image as an image_url user block', async () => {
    stub.state.contents = [plan4]

    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount: 4,
      referenceUrl: REFERENCE,
    })

    expect(plan.beats).toHaveLength(4)

    const messages = (stub.requests[0]?.body as { messages: readonly { content: unknown }[] })
      .messages
    const content = messages[1]?.content as readonly {
      readonly type: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(Array.isArray(content)).toBe(true)
    expect(content.some((block) => block.type === 'text')).toBe(true)
    expect(content.find((block) => block.type === 'image_url')?.image_url?.url).toBe(REFERENCE)
  })

  it('accepts a JSON object wrapped in a markdown code fence', async () => {
    stub.state.contents = [`\`\`\`json\n${JSON.stringify(plan4)}\n\`\`\``]

    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount: 4,
      referenceUrl: null,
    })

    expect(plan.title).toBe(plan4.title)
  })

  it.each([
    [4, plan4],
    [6, plan6],
  ])('accepts a %i scene plan', async (sceneCount, fixture) => {
    stub.state.contents = [fixture]

    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(sceneCount)
  })

  it('creates a director through the factory', async () => {
    const plan = await createStoryDirector({
      apiKey: KEY,
      baseUrl: stub.baseUrl,
    }).createPlan({ premise: PREMISE, sceneCount: 5, referenceUrl: null })

    expect(plan.title).toBe(plan5.title)
  })
})

describe('NativeStoryDirector validation and single repair', () => {
  it('repairs one invalid JSON response with a second request', async () => {
    stub.state.contents = ['esto no es json', plan5]

    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(5)
    expect(stub.requests).toHaveLength(2)

    const repairMessages = (stub.requests[1]?.body as { messages: readonly { role: string; content: string }[] })
      .messages
    expect(repairMessages.some((message) => message.role === 'assistant')).toBe(true)
    expect(repairMessages.some((message) => message.content.includes('json inválido'))).toBe(true)
    expect(repairMessages.some((message) => message.content.includes('exactamente 5 beats')))
      .toBe(true)
  })

  it('repairs a plan with the wrong beat count exactly once', async () => {
    stub.state.contents = [invalidPlan, repairPlan]

    const plan = await director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(5)
    expect(stub.requests).toHaveLength(2)
  })

  it('fails with director-invalid-output when the repair also fails', async () => {
    stub.state.contents = [invalidPlan, invalidPlan]

    const error = await captureError(() => director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(error).toBeInstanceOf(StoryError)
    expect(codeOf(error)).toBe('director-invalid-output')
    expect((error as StoryError).status).toBe(502)
    expect(stub.requests).toHaveLength(2)
    expect(JSON.stringify(error)).not.toContain(KEY)
  })

  it('fails immediately when the assistant message has no content', async () => {
    stub.state.contents = ['', '']

    const error = await captureError(() => director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-invalid-output')
    expect(stub.requests).toHaveLength(1)
  })
})

describe('NativeStoryDirector error mapping', () => {
  it.each([401, 403, 429, 500, 503])(
    'maps DeepSeek %i to director-unavailable without retrying',
    async (status) => {
      stub.state.status = status
      stub.state.errorPayload = { detail: 'invalid credentials for secret key' }

      const error = await captureError(() => director().createPlan({
        premise: PREMISE,
        sceneCount: 5,
        referenceUrl: null,
      }))

      expect(codeOf(error)).toBe('director-unavailable')
      expect((error as StoryError).status).toBe(503)
      expect(stub.requests).toHaveLength(1)

      const serialized = JSON.stringify(error)
      expect(serialized).not.toContain('invalid credentials')
      expect(serialized).not.toContain(KEY)
    },
  )

  it('maps a 400 policy payload to content-blocked', async () => {
    stub.state.status = 400
    stub.state.errorPayload = { error: { message: 'Blocked by policy' } }

    const error = await captureError(() => director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('content-blocked')
    expect((error as StoryError).status).toBe(422)
  })

  it('maps a 422 nsfw payload to content-blocked', async () => {
    stub.state.status = 422
    stub.state.errorPayload = { detail: 'NSFW content detected' }

    const error = await captureError(() => director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('content-blocked')
  })

  it('maps a plain 400 to director-invalid-output', async () => {
    stub.state.status = 400
    stub.state.errorPayload = { error: { message: 'bad request' } }

    const error = await captureError(() => director().createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-invalid-output')
  })

  it('maps an aborted request to director-timeout', async () => {
    stub.state.delayMs = 200

    const error = await captureError(() => director({ timeoutMs: 20 }).createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-timeout')
    expect((error as StoryError).status).toBe(504)
  })

  it('maps a rejected fetch to director-unavailable', async () => {
    const failing = new NativeStoryDirector({
      apiKey: KEY,
      baseUrl: stub.baseUrl,
      fetchImpl: async () => {
        throw new TypeError('network down')
      },
    })

    const error = await captureError(() => failing.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-unavailable')
    expect(JSON.stringify(error)).not.toContain('network down')
  })
})
