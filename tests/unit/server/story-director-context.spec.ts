// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { NativeStoryDirector } from '../../../server/story/director'
import {
  DIRECTOR_JSON_SCHEMA,
  storyDirectorUserMessage,
} from '../../../server/story/director-prompt'
import type { DirectorContext } from '../../../server/story/director-types'
import { analyzePremise, renderBriefBlock } from '../../../server/story/premise-brief'
import { startDeepSeekStub } from '../../helpers/deepseek-stub'

const KEY = 'test-deepseek-key'
const SHORT_PREMISE = 'Una repostera muy famosa'
const LONG_PREMISE = 'Una repostera descubre que sus postres predicen el futuro, aunque nadie lo sabe todavía.'
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

const stub = await startDeepSeekStub()

function director(): NativeStoryDirector {
  return new NativeStoryDirector({
    apiKey: KEY,
    baseUrl: stub.baseUrl,
    timeoutMs: 2_000,
  })
}

interface StubMessage {
  readonly role: string
  readonly content: unknown
}

interface StubBody {
  readonly model: string
  readonly messages: readonly StubMessage[]
  readonly max_tokens: number
}

function bodyAt(index: number): StubBody {
  return stub.requests[index]!.body as StubBody
}

function textContent(message: StubMessage): string {
  if (typeof message.content !== 'string') {
    throw new Error('expected a plain text message')
  }

  return message.content
}

function briefContext(premise: string): DirectorContext {
  return { brief: analyzePremise(premise).brief }
}

function referenceUserMessage(premise: string): string {
  const message = storyDirectorUserMessage(premise, null)

  return typeof message.content === 'string' ? message.content : ''
}

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

describe('NativeStoryDirector with a director context', () => {
  it('makes a single request and keeps the current shape without context', async () => {
    await director().createPlan({
      premise: LONG_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(stub.requests).toHaveLength(1)

    const body = bodyAt(0)

    expect(body.messages).toHaveLength(2)
    expect(body.messages[1]).toEqual(storyDirectorUserMessage(LONG_PREMISE, null))
  })

  it('places the premise, then the brief and then the schema', async () => {
    await director().createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
      context: briefContext(SHORT_PREMISE),
    })

    expect(stub.requests).toHaveLength(1)

    const content = textContent(bodyAt(0).messages[1]!)
    const premiseIndex = content.indexOf(`Premisa: ${SHORT_PREMISE}`)
    const blockIndex = content.indexOf(renderBriefBlock(briefContext(SHORT_PREMISE).brief))
    const schemaIndex = content.indexOf(DIRECTOR_JSON_SCHEMA)

    expect(premiseIndex).toBeGreaterThanOrEqual(0)
    expect(blockIndex).toBeGreaterThan(premiseIndex)
    expect(schemaIndex).toBeGreaterThan(blockIndex)
    expect(content.endsWith(DIRECTOR_JSON_SCHEMA)).toBe(true)
    expect(content.indexOf(SHORT_PREMISE)).toBe(content.lastIndexOf(SHORT_PREMISE))
    expect(content).toContain('\n\n')
  })

  it('keeps the schema as the last content and the block before it', async () => {
    await director().createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
      context: briefContext(SHORT_PREMISE),
    })

    const content = textContent(bodyAt(0).messages[1]!)
    const block = renderBriefBlock(briefContext(SHORT_PREMISE).brief)

    expect(block.length).toBeLessThanOrEqual(500)
    expect(content.slice(-DIRECTOR_JSON_SCHEMA.length)).toBe(DIRECTOR_JSON_SCHEMA)
    expect(content).toContain(`\n\n${block}\n\nDevuelve exactamente el JSON del esquema:`)
  })

  it('keeps the text part first and the image_url last with a reference', async () => {
    await director().createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 5,
      referenceUrl: REFERENCE,
      context: briefContext(SHORT_PREMISE),
    })

    const message = bodyAt(0).messages[1]!
    const blocks = message.content as readonly {
      readonly type: string
      readonly text?: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(Array.isArray(blocks)).toBe(true)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[0]?.text).toContain(`Premisa: ${SHORT_PREMISE}`)
    expect(blocks[0]?.text).toContain(renderBriefBlock(briefContext(SHORT_PREMISE).brief))
    expect(blocks[1]).toEqual({ type: 'image_url', image_url: { url: REFERENCE } })
  })

  it('is identical to the current message when the brief is inactive', async () => {
    const context = briefContext(LONG_PREMISE)

    expect(context.brief.applied).toBe(false)

    await director().createPlan({
      premise: LONG_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
      context,
    })

    expect(textContent(bodyAt(0).messages[1]!))
      .toBe(referenceUserMessage(LONG_PREMISE))
  })

  it('never sends the brief as a separate HTTP request', async () => {
    await director().createPlan({
      premise: SHORT_PREMISE,
      sceneCount: 5,
      referenceUrl: null,
      context: briefContext(SHORT_PREMISE),
    })

    expect(stub.requests).toHaveLength(1)
    expect(JSON.stringify(stub.requests[0]!.body)).not.toContain('Authorization')
  })
})
