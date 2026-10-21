// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_MAX_TOKENS,
  DIRECTOR_MAX_TOKENS_LIMIT,
  NativeStoryDirector,
  directorMaxTokens,
  directorRepairMaxTokens,
} from '../../../server/story/director'
import type { StoryDirectorLogEvent } from '../../../server/story/director'
import { StoryError } from '../../../server/story/errors'
import plan4 from '../../fixtures/deepseek/deepseek-plan-4.json'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import plan6 from '../../fixtures/deepseek/deepseek-plan-6.json'

const KEY = 'test-deepseek-key'
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

interface FakeCompletion {
  readonly content: string | null
  readonly finishReason?: string | null
}

interface RequestBody {
  readonly model: string
  readonly messages: readonly { readonly role: string; readonly content: unknown }[]
  readonly max_tokens: number
  readonly temperature: number
  readonly stream: boolean
  readonly response_format: { readonly type: string }
}

interface RecordedRequest {
  readonly body: RequestBody
}

function payload(completion: FakeCompletion): Record<string, unknown> {
  const choice: Record<string, unknown> = {
    index: 0,
    message: { role: 'assistant', content: completion.content ?? '' },
  }

  if (completion.finishReason !== undefined) {
    choice.finish_reason = completion.finishReason
  }

  return { id: 'chatcmpl-test', object: 'chat.completion', choices: [choice] }
}

function createFetchQueue(responses: readonly FakeCompletion[]): {
  readonly fetchImpl: typeof fetch
  readonly requests: RecordedRequest[]
} {
  const requests: RecordedRequest[] = []
  let index = 0

  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    void input

    const raw = typeof init?.body === 'string' ? init.body : '{}'
    requests.push({ body: JSON.parse(raw) as RequestBody })

    const completion = responses[Math.min(index, responses.length - 1)]!
    index += 1

    return new Response(JSON.stringify(payload(completion)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  return { fetchImpl: fetchImpl as typeof fetch, requests }
}

function planContent(plan: unknown): string {
  return JSON.stringify(plan)
}

const SCENE_BUDGETS: readonly {
  readonly sceneCount: number
  readonly plan: unknown
  readonly maxTokens: number
}[] = [
  { sceneCount: 4, plan: plan4, maxTokens: 1_400 },
  { sceneCount: 5, plan: plan5, maxTokens: 1_400 },
  { sceneCount: 6, plan: plan6, maxTokens: 1_900 },
]

function emitRecorder(): {
  readonly events: StoryDirectorLogEvent[]
  readonly onEvent: (event: StoryDirectorLogEvent) => void
} {
  const events: StoryDirectorLogEvent[] = []

  return { events, onEvent: (event) => events.push(event) }
}

function directorWith(
  responses: readonly FakeCompletion[],
  onEvent?: (event: StoryDirectorLogEvent) => void,
): { readonly director: NativeStoryDirector; readonly requests: RecordedRequest[] } {
  const queue = createFetchQueue(responses)

  return {
    director: new NativeStoryDirector({
      apiKey: KEY,
      baseUrl: 'https://deepseek.test',
      fetchImpl: queue.fetchImpl,
      ...(onEvent === undefined ? {} : { onEvent }),
    }),
    requests: queue.requests,
  }
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }

  throw new Error('expected the director to throw')
}

function codeOf(error: unknown): string | undefined {
  return error instanceof StoryError ? error.code : undefined
}

describe('director output budget', () => {
  it('derives max_tokens from the scene count', () => {
    expect(DIRECTOR_MAX_TOKENS).toBe(1_400)
    expect(DIRECTOR_MAX_TOKENS_LIMIT).toBe(2_000)

    expect(directorMaxTokens(4)).toBe(1_400)
    expect(directorMaxTokens(5)).toBe(1_400)
    expect(directorMaxTokens(6)).toBe(1_900)
    expect(directorMaxTokens(3)).toBe(1_400)
    expect(directorMaxTokens(9)).toBe(1_400)
    expect(directorMaxTokens(6)).toBeLessThanOrEqual(DIRECTOR_MAX_TOKENS_LIMIT)
  })

  it('caps the repair at 2000 tokens', () => {
    expect(directorRepairMaxTokens(1_400)).toBe(1_900)
    expect(directorRepairMaxTokens(1_800)).toBe(2_000)
    expect(directorRepairMaxTokens(1_900)).toBe(2_000)
    expect(directorRepairMaxTokens(2_000)).toBe(2_000)
  })

  it.each(SCENE_BUDGETS)(
    'sends $sceneCount scenes with a scene-based budget',
    async ({ sceneCount, plan, maxTokens }) => {
      const { director, requests } = directorWith([
        { content: planContent(plan), finishReason: 'stop' },
      ])

      const result = await director.createPlan({
        premise: PREMISE,
        sceneCount,
        referenceUrl: null,
      })

      expect(result.beats).toHaveLength(sceneCount)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.body.max_tokens).toBe(maxTokens)
      expect(requests[0]?.body.max_tokens).toBeLessThanOrEqual(2_000)
    },
  )
})

describe('director finish_reason classification', () => {
  it.each([
    ['stop', 'stop'],
    ['length', 'length'],
    ['content_filter', 'content_filter'],
    ['unrecognised', 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
  ] as const)('classifies %s as %s', async (finishReason, expected) => {
    const { events, onEvent } = emitRecorder()
    const { director } = directorWith(
      [{ content: planContent(plan5), finishReason }],
      onEvent,
    )

    const plan = await director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(5)
    expect(events).toEqual([
      { event: 'story.plan.ok', attempt: 1, finishReason: expected },
    ])
  })

  it('reads finish_reason from the first choice only', async () => {
    const { events, onEvent } = emitRecorder()
    const queue = createFetchQueue([{ content: planContent(plan5), finishReason: 'stop' }])
    const director = new NativeStoryDirector({
      apiKey: KEY,
      baseUrl: 'https://deepseek.test',
      fetchImpl: queue.fetchImpl,
      onEvent,
    })

    await director.createPlan({ premise: PREMISE, sceneCount: 5, referenceUrl: null })

    expect(events).toHaveLength(1)
    expect(events[0]?.finishReason).toBe('stop')
  })
})

describe('director truncation repair', () => {
  it('accepts a valid plan even when finish_reason is length', async () => {
    const { events, onEvent } = emitRecorder()
    const { director, requests } = directorWith(
      [{ content: planContent(plan5), finishReason: 'length' }],
      onEvent,
    )

    const plan = await director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(5)
    expect(requests).toHaveLength(1)
    expect(events).toEqual([
      { event: 'story.plan.ok', attempt: 1, finishReason: 'length' },
    ])
  })

  it('adds one informative repair with a larger budget after truncation', async () => {
    const { events, onEvent } = emitRecorder()
    const { director, requests } = directorWith(
      [
        { content: 'esto no es json', finishReason: 'length' },
        { content: planContent(plan5), finishReason: 'stop' },
      ],
      onEvent,
    )

    const plan = await director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(plan.beats).toHaveLength(5)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.body.max_tokens).toBe(1_400)
    expect(requests[1]?.body.max_tokens).toBe(1_900)

    const repairMessages = requests[1]!.body.messages
    const repairText = repairMessages
      .filter((message) => message.role === 'user')
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n')

    expect(repairText).toContain('truncó')
    expect(repairText).toContain('exactamente 5 beats')

    expect(events).toEqual([
      {
        event: 'story.plan.failed',
        attempt: 1,
        finishReason: 'length',
        errorCode: 'director-invalid-output',
      },
      { event: 'story.plan.ok', attempt: 2, finishReason: 'stop' },
    ])
  })

  it('caps the repair budget at 2000 tokens for six scenes', async () => {
    const { director, requests } = directorWith([
      { content: 'esto no es json', finishReason: 'length' },
      { content: planContent(plan6), finishReason: 'stop' },
    ])

    await director.createPlan({ premise: PREMISE, sceneCount: 6, referenceUrl: null })

    expect(requests).toHaveLength(2)
    expect(requests[0]?.body.max_tokens).toBe(1_900)
    expect(requests[1]?.body.max_tokens).toBe(2_000)
  })

  it('keeps the base budget and no note for a non truncated failure', async () => {
    const { director, requests } = directorWith([
      { content: 'esto no es json', finishReason: 'stop' },
      { content: planContent(plan5), finishReason: 'stop' },
    ])

    await director.createPlan({ premise: PREMISE, sceneCount: 5, referenceUrl: null })

    expect(requests).toHaveLength(2)
    expect(requests[1]?.body.max_tokens).toBe(1_400)

    const repairText = requests[1]!.body.messages
      .filter((message) => message.role === 'user')
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .join('\n')

    expect(repairText).not.toContain('truncó')
    expect(repairText).toContain('json inválido')
  })

  it('never makes a third request and fails with director-invalid-output', async () => {
    const { events, onEvent } = emitRecorder()
    const { director, requests } = directorWith(
      [
        { content: 'esto no es json', finishReason: 'length' },
        { content: 'tampoco es json', finishReason: 'length' },
      ],
      onEvent,
    )

    const error = await captureError(() => director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-invalid-output')
    expect((error as StoryError).status).toBe(502)
    expect(requests).toHaveLength(2)
    expect(events.map((event) => event.attempt)).toEqual([1, 2])
    expect(events).toEqual([
      {
        event: 'story.plan.failed',
        attempt: 1,
        finishReason: 'length',
        errorCode: 'director-invalid-output',
      },
      {
        event: 'story.plan.failed',
        attempt: 2,
        finishReason: 'length',
        errorCode: 'director-invalid-output',
      },
    ])
  })

  it('reports a content_filter finish reason when the content is empty', async () => {
    const { events, onEvent } = emitRecorder()
    const { director, requests } = directorWith(
      [{ content: null, finishReason: 'content_filter' }],
      onEvent,
    )

    const error = await captureError(() => director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-invalid-output')
    expect(requests).toHaveLength(1)
    expect(events).toEqual([
      {
        event: 'story.plan.failed',
        attempt: 1,
        finishReason: 'content_filter',
        errorCode: 'director-invalid-output',
      },
    ])
  })
})

describe('director observability without leaking content', () => {
  it('keeps the same request bodies with and without a sink', async () => {
    const responses: readonly FakeCompletion[] = [
      { content: 'esto no es json', finishReason: 'length' },
      { content: planContent(plan5), finishReason: 'stop' },
    ]
    const withSink = directorWith(responses, () => undefined)
    const withoutSink = directorWith(responses)

    await withSink.director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })
    await withoutSink.director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    })

    expect(withSink.requests.map((request) => request.body))
      .toEqual(withoutSink.requests.map((request) => request.body))
  })

  it('never emits the premise, the plan, prompts or the key', async () => {
    const { events, onEvent } = emitRecorder()
    const { director } = directorWith(
      [{ content: planContent(plan5), finishReason: 'stop' }],
      onEvent,
    )

    await director.createPlan({ premise: PREMISE, sceneCount: 5, referenceUrl: null })

    const serialized = JSON.stringify(events)

    expect(serialized).not.toContain(PREMISE)
    expect(serialized).not.toContain(plan5.title)
    expect(serialized).not.toContain(KEY)
    expect(serialized).not.toContain('visualPrompt')

    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(
        ['attempt', 'event', 'finishReason'].sort(),
      )
    }
  })

  it('reports a transport failure once without a finish reason', async () => {
    const { events, onEvent } = emitRecorder()
    const failing: typeof fetch = async () => {
      throw new TypeError('network down')
    }
    const director = new NativeStoryDirector({
      apiKey: KEY,
      baseUrl: 'https://deepseek.test',
      fetchImpl: failing,
      onEvent,
    })

    const error = await captureError(() => director.createPlan({
      premise: PREMISE,
      sceneCount: 5,
      referenceUrl: null,
    }))

    expect(codeOf(error)).toBe('director-unavailable')
    expect(events).toEqual([
      {
        event: 'story.plan.failed',
        attempt: 1,
        finishReason: 'unknown',
        errorCode: 'director-unavailable',
      },
    ])
  })
})
