// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NativeStoryVisualDirector, visualMaxTokens, visualRepairMaxTokens } from '../../../server/story/visual-director'
import type { DeepSeekClient, DeepSeekCompletion, DeepSeekCompletionRequest } from '../../../server/story/deepseek-client'
import type { DirectorLogEvent } from '../../../server/story/director-types'
import { StoryError } from '../../../server/story/errors'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'
import storyboard from '../../fixtures/deepseek/storyboard-valid.json'

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

describe('visual director', () => {
  it('sends the canon and narrative to the visual pass', async () => {
    const { fake, calls } = client([
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    const draft = await director.createStoryboard({
      premise: 'Una repostera descubre que sus postres predicen el futuro.',
      mode: 'creative',
      narrative,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.maxTokens).toBe(visualMaxTokens(5))
    expect(JSON.stringify(calls[0]?.messages)).toContain('obrador')
    expect(JSON.stringify(calls[0]?.messages)).toContain('calle')
  })

  it('repairs a storyboard that copies the narration and accepts a clean repair', async () => {
    const copied = structuredClone(storyboard)
    copied.beats[0] = {
      ...copied.beats[0],
      visualPrompt: narrative.beats[0]!.narration,
    }
    const { fake, calls } = client([
      { content: JSON.stringify(copied), finishReason: 'stop', httpStatus: 200 },
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    const draft = await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    })

    expect(draft.beats[0]?.visualPrompt).toBe(storyboard.beats[0]?.visualPrompt)
    expect(calls).toHaveLength(2)
  })

  it('returns 502 after two storyboards that copy the narration', async () => {
    const copied = structuredClone(storyboard)
    copied.beats[0] = {
      ...copied.beats[0],
      visualPrompt: narrative.beats[0]!.narration,
    }
    const { fake, calls } = client([
      { content: JSON.stringify(copied), finishReason: 'stop', httpStatus: 200 },
      { content: JSON.stringify(copied), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    const error = await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('director-invalid-output')
    expect((error as StoryError).status).toBe(502)
    expect(calls).toHaveLength(2)
  })

  it('allows a short common word without treating it as copied narration', async () => {
    const value = structuredClone(storyboard)
    value.beats[0] = {
      ...value.beats[0],
      visualPrompt: 'Un plano de Clara con el merengue y el delantal.',
    }
    const { fake, calls } = client([
      { content: JSON.stringify(value), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    await expect(director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    })).resolves.toBeDefined()
    expect(calls).toHaveLength(1)
  })

  it('includes usage tokens in the failed visual log when exposed', async () => {
    const invalid = structuredClone(storyboard)
    invalid.beats[0] = { ...invalid.beats[0], action: 'Cambia la acción' }
    const usage = { promptTokens: 44, completionTokens: 3_200, reasoningTokens: 700 }
    const { fake } = client([
      {
        content: JSON.stringify(invalid),
        finishReason: 'stop',
        httpStatus: 200,
        usage,
      },
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const events: DirectorLogEvent[] = []
    const director = new NativeStoryVisualDirector({
      client: fake,
      onEvent: (event) => events.push(event),
    })

    await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    })

    const failure = events.find((event) => event.event === 'story.visual.failed')

    expect(failure).toMatchObject({
      completionTokens: 3_200,
      reasoningTokens: 700,
    })
  })

  it('uses temperature 0.4 in faithful mode', async () => {
    const { fake, calls } = client([
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'faithful',
      narrative,
    })

    expect(calls[0]?.temperature).toBe(0.4)
  })

  it('repairs an invalid storyboard once and rejects extra narrative fields', async () => {
    const invalid = structuredClone(storyboard)
    invalid.beats[0] = { ...invalid.beats[0], action: 'Cambia la acción' }
    const { fake, calls } = client([
      { content: JSON.stringify(invalid), finishReason: 'stop', httpStatus: 200 },
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    const draft = await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.maxTokens).toBe(visualRepairMaxTokens(visualMaxTokens(5)))
  })

  it('repairs a valid storyboard when finish_reason is length', async () => {
    const { fake, calls } = client([
      { content: JSON.stringify(storyboard), finishReason: 'length', httpStatus: 200 },
      { content: JSON.stringify(storyboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const director = new NativeStoryVisualDirector({ client: fake })

    const draft = await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative,
    })

    expect(draft.beats).toHaveLength(5)
    expect(calls).toHaveLength(2)
  })

  it('fails after two invalid storyboards without a third call', async () => {
    const { fake, calls } = client([
      { content: '{"beats":[]}', finishReason: 'stop', httpStatus: 200 },
      { content: '{"beats":[]}', finishReason: 'stop', httpStatus: 200 },
    ])

    await expect(new NativeStoryVisualDirector({ client: fake }).createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'faithful',
      narrative,
    })).rejects.toBeInstanceOf(StoryError)

    expect(calls).toHaveLength(2)
  })

  it('accepts an oversized canon now that the video prompt only describes motion', async () => {
    const oversized = structuredClone(narrative) as typeof narrative
    const pad = (length: number, char: string): string => char.repeat(length)

    oversized.storyBible.style = pad(60, 's')
    oversized.storyBible.theme = pad(60, 't')
    oversized.storyBible.characters = oversized.storyBible.characters.map((character) => ({
      ...character,
      description: pad(120, 'c'),
      wardrobe: pad(100, 'w'),
    }))
    oversized.storyBible.locations = oversized.storyBible.locations.map((location) => ({
      ...location,
      description: pad(160, 'l'),
    }))
    oversized.storyBible.props = oversized.storyBible.props.map((prop) => ({
      ...prop,
      description: pad(100, 'p'),
    }))
    oversized.storyBible.forbidden = Array.from(
      { length: 8 },
      (_value, index) => `Prohibido ${index} ${pad(30, 'f')}`,
    )
    oversized.storyBible.continuityRules = Array.from(
      { length: 4 },
      (_value, index) => `Regla ${index} ${pad(110, 'r')}`,
    )
    oversized.beats = oversized.beats.map((beat) => ({
      ...beat,
      action: pad(600, 'a'),
      continuityFromPrevious: beat.order === 1 ? null : pad(200, 'q'),
    }))

    const longStoryboard = {
      beats: storyboard.beats.map((beat) => ({
        ...beat,
        visualPrompt: pad(600, 'v'),
        continuityFromPrevious: beat.order === 1 ? null : pad(200, 'c'),
      })),
    }
    const { fake, calls } = client([
      { content: JSON.stringify(longStoryboard), finishReason: 'stop', httpStatus: 200 },
      { content: JSON.stringify(longStoryboard), finishReason: 'stop', httpStatus: 200 },
    ])
    const events: { readonly event: string; readonly reason?: string }[] = []
    const director = new NativeStoryVisualDirector({
      client: fake,
      onEvent: (event) => events.push(event),
    })

    // 013: the video prompt no longer repeats location, time, weather, wardrobe
    // or props, so this canon composes fine instead of failing the storyboard.
    const plan = await director.createStoryboard({
      premise: 'Una premisa suficientemente larga.',
      mode: 'creative',
      narrative: oversized,
    })

    expect(plan.beats.length).toBeGreaterThan(0)
    expect(events.at(-1)?.event).not.toBe('story.visual.failed')
    void calls
  })
})
