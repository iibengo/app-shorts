// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BEATS_MAX_TOKENS,
  BEATS_REPAIR_MAX_TOKENS,
  BEATS_TIMEOUT_MS,
  CANON_MAX_TOKENS,
  CANON_REPAIR_MAX_TOKENS,
  CANON_TIMEOUT_MS,
  NativeStoryNarrativeDirector,
} from '../../../server/story/narrative-director'
import type {
  CanonDraft,
  DirectorLogEvent,
  NarrativeDraft,
} from '../../../server/story/director-types'
import type {
  DeepSeekClient,
  DeepSeekCompletion,
  DeepSeekCompletionRequest,
} from '../../../server/story/deepseek-client'
import { StoryError } from '../../../server/story/errors'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'

const FULL = narrative as NarrativeDraft
const CANON: CanonDraft = {
  title: FULL.title,
  logline: FULL.logline,
  tone: FULL.tone,
  storyBible: FULL.storyBible,
}
const BEATS = { beats: FULL.beats }
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function client(responses: readonly (DeepSeekCompletion | Error)[]) {
  const calls: DeepSeekCompletionRequest[] = []
  let index = 0

  const fake: DeepSeekClient = {
    async complete(input) {
      calls.push(input)
      const next = responses[Math.min(index, responses.length - 1)]!
      index += 1

      if (next instanceof Error) throw next

      return next
    },
  }

  return { fake, calls }
}

function ok(content: unknown, finishReason: 'stop' | 'length' = 'stop'): DeepSeekCompletion {
  return {
    content: JSON.stringify(content),
    finishReason,
    httpStatus: 200,
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { readonly type: 'text'; readonly text: string } =>
        typeof part === 'object'
        && part !== null
        && (part as { readonly type?: unknown }).type === 'text'
        && typeof (part as { readonly text?: unknown }).text === 'string')
      .map((part) => part.text)
      .join(' ')
  }

  return JSON.stringify(content)
}

describe('narrative director: canon + beats', () => {
  it('runs canon then beats and assembles a complete draft', async () => {
    const { fake, calls } = client([ok(CANON), ok(BEATS)])
    const events: DirectorLogEvent[] = []
    const director = new NativeStoryNarrativeDirector({
      client: fake,
      onEvent: (event) => events.push(event),
    })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.title).toBe(FULL.title)
    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      maxTokens: CANON_MAX_TOKENS,
      timeoutMs: CANON_TIMEOUT_MS,
      temperature: 0.7,
      thinking: { mode: 'disabled' },
    })
    expect(calls[1]).toMatchObject({
      maxTokens: BEATS_MAX_TOKENS,
      timeoutMs: BEATS_TIMEOUT_MS,
      temperature: 0.7,
      thinking: { mode: 'disabled' },
    })
    expect(textOf(calls[0]?.messages[1]?.content)).toContain('esquema de canon')
    expect(textOf(calls[1]?.messages[1]?.content)).toContain(JSON.stringify(CANON))
    expect(events.filter((event) => event.event === 'story.narrative.ok').map((event) => event.stage))
      .toEqual(['canon', 'beats'])
  })

  it('sends the reference image only to the canon stage', async () => {
    const { fake, calls } = client([ok(CANON), ok(BEATS)])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: 'https://v3.fal.media/files/test/reference.jpeg',
    })

    const canon = calls[0]?.messages[1]?.content
    const beats = calls[1]?.messages[1]?.content

    expect(Array.isArray(canon)).toBe(true)
    expect(JSON.stringify(canon)).toContain('image_url')
    expect(JSON.stringify(beats)).not.toContain('image_url')
  })

  it('uses temperature 0.4 in faithful mode', async () => {
    const faithfulCanon: CanonDraft = structuredClone(CANON)
    faithfulCanon.storyBible = {
      ...faithfulCanon.storyBible,
      characters: faithfulCanon.storyBible.characters.map((character) => ({
        ...character,
        source: 'premise' as const,
      })),
      locations: faithfulCanon.storyBible.locations.map((location) => ({
        ...location,
        source: 'premise' as const,
      })),
      props: faithfulCanon.storyBible.props.map((prop) => ({
        ...prop,
        source: 'premise' as const,
      })),
    }
    const { fake, calls } = client([ok(faithfulCanon), ok(BEATS)])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'faithful',
      referenceUrl: null,
    })

    expect(calls[0]?.temperature).toBe(0.4)
    expect(calls[1]?.temperature).toBe(0.4)
  })
})

describe('narrative director: canon repair', () => {
  it('repairs an invalid canon once and then requests beats', async () => {
    const { fake, calls } = client([
      ok({ title: 'bad' }),
      ok(CANON),
      ok(BEATS),
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(3)
    expect(calls[1]?.maxTokens).toBe(CANON_REPAIR_MAX_TOKENS)
    expect(calls[2]?.maxTokens).toBe(BEATS_MAX_TOKENS)
  })

  it('does not request beats after two invalid canons', async () => {
    const { fake, calls } = client([ok({ title: 'bad' }), ok({ title: 'bad' })])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await expect(director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(2)
    expect(calls.every((call) => call.maxTokens === CANON_MAX_TOKENS || call.maxTokens === CANON_REPAIR_MAX_TOKENS))
      .toBe(true)
  })

  it('repairs a truncated canon', async () => {
    const { fake, calls } = client([
      { content: null, finishReason: 'length', httpStatus: 200 },
      ok(CANON),
      ok(BEATS),
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(3)
    expect(textOf(calls[1]?.messages.at(-1)?.content)).toContain('se truncó')
  })

  it('repairs a valid canon when finish_reason is length', async () => {
    const { fake, calls } = client([ok(CANON, 'length'), ok(CANON), ok(BEATS)])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(calls).toHaveLength(3)
    expect(calls[1]?.maxTokens).toBe(CANON_REPAIR_MAX_TOKENS)
  })

  it('includes usage tokens in the failed log when the client exposes them', async () => {
    const usage = {
      promptTokens: 120,
      completionTokens: 8_000,
      reasoningTokens: 1_200,
    }
    const { fake } = client([
      { content: null, finishReason: 'length', httpStatus: 200, usage },
      ok(CANON),
      ok(BEATS),
    ])
    const events: DirectorLogEvent[] = []
    const director = new NativeStoryNarrativeDirector({
      client: fake,
      onEvent: (event) => events.push(event),
    })

    await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    const failure = events.find((event) =>
      event.event === 'story.narrative.failed' && event.stage === 'canon')

    expect(failure).toMatchObject({
      completionTokens: 8_000,
      reasoningTokens: 1_200,
    })
  })

  it('does not repair a content_filter canon', async () => {
    const { fake, calls } = client([{
      content: null,
      finishReason: 'content_filter',
      httpStatus: 200,
    }])

    await expect(new NativeStoryNarrativeDirector({ client: fake }).createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(1)
  })
})

describe('narrative director: beats repair', () => {
  it('repairs invalid beats once and returns the draft', async () => {
    const { fake, calls } = client([
      ok(CANON),
      ok({ beats: [] }),
      ok(BEATS),
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(3)
    expect(calls[1]?.maxTokens).toBe(BEATS_MAX_TOKENS)
    expect(calls[2]?.maxTokens).toBe(BEATS_REPAIR_MAX_TOKENS)
  })

  it('does not request a third beats call after two invalid responses', async () => {
    const { fake, calls } = client([
      ok(CANON),
      ok({ beats: [] }),
      ok({ beats: [] }),
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await expect(director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(3)
  })

  it('repairs truncated beats', async () => {
    const { fake, calls } = client([
      ok(CANON),
      { content: null, finishReason: 'length', httpStatus: 200 },
      ok(BEATS),
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(3)
    expect(textOf(calls[2]?.messages.at(-1)?.content)).toContain('se truncaron')
  })
})
