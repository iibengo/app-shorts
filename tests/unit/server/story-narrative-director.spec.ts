// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NativeStoryNarrativeDirector, narrativeMaxTokens, narrativeRepairMaxTokens } from '../../../server/story/narrative-director'
import type { DeepSeekClient, DeepSeekCompletion, DeepSeekCompletionRequest } from '../../../server/story/deepseek-client'
import { StoryError } from '../../../server/story/errors'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'

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

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

describe('narrative director', () => {
  it('sends one JSON-mode call with the narrative budget and creative temperature', async () => {
    const { fake, calls } = client([
      { content: JSON.stringify(narrative), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.title).toBe(narrative.title)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.maxTokens).toBe(narrativeMaxTokens(5))
    expect(calls[0]?.temperature).toBe(0.7)
    expect(calls[0]?.messages[0]?.content).toContain('Eres un narrador')
  })

  it('uses temperature 0.4 in faithful mode', async () => {
    const faithful = structuredClone(narrative)
    faithful.storyBible.characters = faithful.storyBible.characters.map((character) => ({
      ...character,
      source: 'premise' as const,
    }))
    faithful.storyBible.locations = faithful.storyBible.locations.map((location) => ({
      ...location,
      source: 'premise' as const,
    }))
    faithful.storyBible.props = faithful.storyBible.props.map((prop) => ({
      ...prop,
      source: 'premise' as const,
    }))

    const { fake, calls } = client([
      { content: JSON.stringify(faithful), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'faithful',
      referenceUrl: null,
    })

    expect(calls[0]?.temperature).toBe(0.4)
  })

  it('uses one repair after an invalid payload', async () => {
    const { fake, calls } = client([
      { content: '{"title":"bad"}', finishReason: 'stop', httpStatus: 200 },
      { content: JSON.stringify(narrative), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.maxTokens).toBe(narrativeRepairMaxTokens(narrativeMaxTokens(5)))
  })

  it('repairs a valid payload when finish_reason is length', async () => {
    const { fake, calls } = client([
      { content: JSON.stringify(narrative), finishReason: 'length', httpStatus: 200 },
      { content: JSON.stringify(narrative), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    const draft = await director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.maxTokens).toBe(narrativeRepairMaxTokens(narrativeMaxTokens(5)))
  })

  it('rejects a valid payload that is still length after the repair', async () => {
    const response: DeepSeekCompletion = {
      content: JSON.stringify(narrative),
      finishReason: 'length',
      httpStatus: 200,
    }
    const { fake, calls } = client([response, response])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await expect(director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'creative',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(2)
  })

  it('repairs a truncated empty response and fails after two', async () => {
    const truncated: DeepSeekCompletion = {
      content: null,
      finishReason: 'length',
      httpStatus: 200,
    }
    const { fake, calls } = client([truncated, truncated])
    const director = new NativeStoryNarrativeDirector({ client: fake })

    await expect(director.createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'faithful',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(2)
  })

  it('does not make a third call for a content_filter response', async () => {
    const { fake, calls } = client([{
      content: null,
      finishReason: 'content_filter',
      httpStatus: 200,
    }])

    await expect(new NativeStoryNarrativeDirector({ client: fake }).createNarrative({
      premise: PREMISE,
      sceneCount: 5,
      mode: 'faithful',
      referenceUrl: null,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(1)
  })
})
