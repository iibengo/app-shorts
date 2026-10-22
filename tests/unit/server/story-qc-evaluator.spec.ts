// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryBible } from '~/models/story'
import {
  NullQCEvaluator,
  QC_EVALUATOR_MAX_TOKENS,
  QC_EVALUATOR_MODEL,
  createStoryQCEvaluator,
} from '../../../server/story/qc-evaluator'
import type { QCSceneExpectation } from '../../../server/story/qc-types'
import { NativeDeepSeekClient } from '../../../server/story/deepseek-client'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import observedPass from '../../fixtures/story/qc-observed-pass.json'
import invalidObservation from '../../fixtures/story/qc-evaluator-invalid.json'

const BIBLE = plan5.storyBible as StoryBible
const EXPECTATION: QCSceneExpectation = {
  sceneId: 'scene-1',
  order: 1,
  sceneRole: 'establishing',
  locationId: 'obrador',
  locationName: 'Obrador de Clara',
  locationDescription: 'Cocina pequeña con azulejos blancos y horno antiguo.',
  timeOfDay: 'morning',
  weather: 'clear',
  leadCharacterId: 'clara',
  characters: ['clara'],
  props: ['merengue'],
  signaturePropId: 'merengue',
  action: 'Clara abre el obrador al amanecer.',
  visualPrompt: 'Clara abre el obrador al amanecer.',
  continuityFromPrevious: null,
  camera: 'wide',
}

interface Call {
  readonly body: {
    readonly model: string
    readonly messages: readonly { readonly role: string; readonly content: unknown }[]
    readonly response_format: { readonly type: string }
    readonly temperature: number
    readonly max_tokens: number
    readonly stream: boolean
  }
}

function completion(content: string | null): Response {
  return new Response(JSON.stringify({
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: content ?? '' },
        finish_reason: 'stop',
      },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function evaluatorWith(
  responses: readonly (Response | Error)[],
  options: { readonly apiKey?: string; readonly timeoutMs?: number } = {},
) {
  const calls: Call[] = []
  let index = 0
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? '{}')) as Call['body'] })

    const next = responses[Math.min(index, responses.length - 1)]!
    index += 1

    if (next instanceof Error) throw next

    return next
  }

  const client = new NativeDeepSeekClient({
    apiKey: options.apiKey ?? 'test-deepseek-key',
    baseUrl: 'https://deepseek.test',
    fetchImpl: fetchImpl as typeof fetch,
  })
  const evaluator = createStoryQCEvaluator({
    client,
    timeoutMs: options.timeoutMs ?? 1_000,
  })

  return { evaluator, calls }
}

describe('qc-evaluator: request contract', () => {
  it('sends one image, JSON mode, temperature 0 and the closed schema', async () => {
    const { evaluator, calls } = evaluatorWith([completion(JSON.stringify(observedPass))])

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result.kind).toBe('observed')
    expect(calls).toHaveLength(1)

    const body = calls[0]!.body

    expect(body.model).toBe(QC_EVALUATOR_MODEL)
    expect(body.model).toBe('deepseek-flash')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(QC_EVALUATOR_MAX_TOKENS)
    expect(body.stream).toBe(false)

    const user = body.messages[1]!.content as readonly {
      readonly type: string
      readonly text?: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(user.filter((block) => block.type === 'image_url')).toHaveLength(1)
    expect(user.find((block) => block.type === 'image_url')?.image_url?.url)
      .toBe('https://v3.fal.media/files/test/strip.jpg')
    const text = user.find((block) => block.type === 'text')?.text ?? ''
    expect(text).toContain('CONTINUIDAD GLOBAL')
    expect(text).toContain('CONTEXTO DE ESCENA')
    expect(text).toContain('Localización: Obrador de Clara.')
    expect(text).toContain('Personajes declarados: clara.')
    expect(text).toContain('Props declarados: merengue.')
    expect(text).toContain('Protagonista declarado en esta escena: sí.')
    expect(text).toContain('Prop característico declarado en esta escena: sí.')
    expect(text).toContain('Un cambio de localización, hora o clima respecto a la escena anterior es correcto')
    expect(text).toContain('Analiza el strip')
    expect(text).toContain('"confidence": 0.0')
    expect(text).not.toContain(plan5.beats[0]!.narration)
  })

  it('sends the real sceneRole and camera of the beat, not placeholders', async () => {
    const { evaluator, calls } = evaluatorWith([completion(JSON.stringify(observedPass))])

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: {
        ...EXPECTATION,
        order: 3,
        sceneRole: 'climax',
        camera: 'close-up',
        visualPrompt: 'Clara levanta el merengue sobre la mesa.',
        continuityFromPrevious: 'Clara sigue en el obrador.',
      },
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result.kind).toBe('observed')

    const user = calls[0]!.body.messages[1]!.content as readonly {
      readonly type: string
      readonly text?: string
    }[]
    const text = user.find((block) => block.type === 'text')?.text ?? ''

    expect(text).toContain('ESCENA 3 (clímax)')
    expect(text).toContain('Cámara: primer plano')
    expect(text).toContain('Clara levanta el merengue sobre la mesa.')
    expect(text).toContain('Continúa de la escena anterior: Clara sigue en el obrador.')
    expect(text).not.toContain('ESCENA 1 (presentación)')
    expect(text).not.toContain('Cámara: plano general')
  })
})

describe('qc-evaluator: repair and failure mapping', () => {
  it('repairs invalid JSON exactly once', async () => {
    const { evaluator, calls } = evaluatorWith([
      completion('not json'),
      completion(JSON.stringify(observedPass)),
    ])

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result.kind).toBe('observed')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.body.messages.some((message) => message.role === 'assistant'))
      .toBe(true)
  })

  it('returns qc-evaluator-invalid-output after two invalid payloads', async () => {
    const invalid = JSON.stringify(invalidObservation)
    const { evaluator, calls } = evaluatorWith([completion(invalid), completion(invalid)])

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result).toEqual({
      kind: 'unavailable',
      errorCode: 'qc-evaluator-invalid-output',
    })
    expect(calls).toHaveLength(2)
  })

  it('returns qc-evaluator-timeout on abort', async () => {
    const never = new Promise<Response>((_resolve, reject) => {
      setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 20)
    })
    const fetchImpl = (() => never) as unknown as typeof fetch
    const client = new NativeDeepSeekClient({
      apiKey: 'test-deepseek-key',
      baseUrl: 'https://deepseek.test',
      fetchImpl,
    })
    const evaluator = createStoryQCEvaluator({
      client,
      timeoutMs: 5,
    })

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result).toEqual({ kind: 'unavailable', errorCode: 'qc-evaluator-timeout' })
  })

  it.each([401, 403, 429, 500, 503])('maps %i to qc-evaluator-unavailable', async (status) => {
    const { evaluator } = evaluatorWith([new Response('{}', { status })])

    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result).toEqual({ kind: 'unavailable', errorCode: 'qc-evaluator-unavailable' })
  })

  it('fails honestly without a key', async () => {
    const evaluator = createStoryQCEvaluator({ apiKey: '' })

    expect(evaluator).toBeInstanceOf(NullQCEvaluator)
    const result = await evaluator.evaluate({
      bible: BIBLE,
      expectation: EXPECTATION,
      previous: null,
      imageUrl: 'https://v3.fal.media/files/test/strip.jpg',
    })

    expect(result).toEqual({ kind: 'unavailable', errorCode: 'qc-not-configured' })
  })
})
