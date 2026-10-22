// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DIRECTOR_TOTAL_TIMEOUT_MS, NativeStoryDirector } from '../../../server/story/director'
import type {
  NarrativeDraft,
  StoryNarrativeDirector,
  StoryVisualDirector,
} from '../../../server/story/director-types'
import { NativeStoryNarrativeDirector } from '../../../server/story/narrative-director'
import { NativeStoryVisualDirector } from '../../../server/story/visual-director'
import { createBriefingNarrativeDirector } from '../../../server/story/briefing-director'
import type {
  DeepSeekClient,
  DeepSeekCompletionRequest,
} from '../../../server/story/deepseek-client'
import { StoryError } from '../../../server/story/errors'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'
import storyboard from '../../fixtures/deepseek/storyboard-valid.json'

function narrativeDirector(error?: Error) {
  const calls: unknown[] = []
  const director: StoryNarrativeDirector = {
    async createNarrative(input) {
      calls.push(input)
      if (error) throw error
      return narrative as NarrativeDraft
    },
  }
  return { director, calls }
}

function visualDirector(error?: Error) {
  const calls: unknown[] = []
  const director: StoryVisualDirector = {
    async createStoryboard(input) {
      calls.push(input)
      if (error) throw error
      return storyboard
    },
  }
  return { director, calls }
}

describe('story director pipeline', () => {
  it('runs narrative then visual and assembles the plan', async () => {
    const narrativePass = narrativeDirector()
    const visualPass = visualDirector()
    const director = new NativeStoryDirector({
      narrative: narrativePass.director,
      visual: visualPass.director,
    })

    const plan = await director.createPlan({
      premise: 'Una repostera descubre que sus postres predicen el futuro.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'creative',
    })

    expect(plan.beats).toHaveLength(5)
    expect(plan.tone).toBe('humor')
    expect(narrativePass.calls).toHaveLength(1)
    expect(visualPass.calls).toHaveLength(1)
  })

  it('does not call the visual pass when the narrative fails', async () => {
    const narrativePass = narrativeDirector(new StoryError('director-invalid-output'))
    const visualPass = visualDirector()
    const director = new NativeStoryDirector({
      narrative: narrativePass.director,
      visual: visualPass.director,
    })

    await expect(director.createPlan({
      premise: 'Una premisa suficientemente larga.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'faithful',
    })).rejects.toBeInstanceOf(StoryError)

    expect(visualPass.calls).toHaveLength(0)
  })

  it('defaults the total pipeline timeout to 85 seconds', () => {
    expect(DIRECTOR_TOTAL_TIMEOUT_MS).toBe(85_000)
  })

  it('aborts the total pipeline with director-timeout/504', async () => {
    const visualPass = visualDirector()
    let aborted = false
    const slowNarrative: StoryNarrativeDirector = {
      async createNarrative(input) {
        return new Promise((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new StoryError('director-timeout'))
          }, { once: true })
        })
      },
    }
    const director = new NativeStoryDirector({
      narrative: slowNarrative,
      visual: visualPass.director,
      totalTimeoutMs: 5,
    })

    const error = await director.createPlan({
      premise: 'Una premisa suficientemente larga.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'faithful',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('director-timeout')
    expect((error as StoryError).status).toBe(504)
    expect(aborted).toBe(true)
    expect(visualPass.calls).toHaveLength(0)
  })

  it('passes the brief context to the narrative only', async () => {
    const narrativePass = narrativeDirector()
    const visualPass = visualDirector()
    const director = new NativeStoryDirector({
      narrative: narrativePass.director,
      visual: visualPass.director,
    })

    await director.createPlan({
      premise: 'Una repostera descubre que sus postres predicen el futuro.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'creative',
      context: {
        brief: {
          applied: true,
          premise: 'Una repostera descubre que sus postres predicen el futuro.',
          hook: 'Un merengue imposible.',
          constraints: ['Sin audio.'],
        },
      },
    })

    expect(narrativePass.calls[0]).toMatchObject({ context: expect.any(Object) })
    expect(visualPass.calls[0]).not.toHaveProperty('context')
  })

  it('does not call visual after a visual timeout and returns 504', async () => {
    const narrativePass = narrativeDirector()
    const slowVisual: StoryVisualDirector = {
      async createStoryboard(input) {
        return new Promise((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => {
            reject(new StoryError('director-timeout'))
          }, { once: true })
        })
      },
    }
    const director = new NativeStoryDirector({
      narrative: narrativePass.director,
      visual: slowVisual,
      totalTimeoutMs: 5,
    })

    const error = await director.createPlan({
      premise: 'Una premisa suficientemente larga.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'faithful',
    }).catch((caught: unknown) => caught)

    expect((error as StoryError).code).toBe('director-timeout')
    expect((error as StoryError).status).toBe(504)
  })

  it('propagates mode to both passes', async () => {
    const narrativePass = narrativeDirector()
    const visualPass = visualDirector()
    const director = new NativeStoryDirector({
      narrative: narrativePass.director,
      visual: visualPass.director,
    })

    await director.createPlan({
      premise: 'Una premisa suficientemente larga.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'creative',
    })

    expect((narrativePass.calls[0] as { mode: string }).mode).toBe('creative')
    expect((visualPass.calls[0] as { mode: string }).mode).toBe('creative')
  })

  it('injects the deterministic brief into the narrative request only', async () => {
    const calls: DeepSeekCompletionRequest[] = []
    const client: DeepSeekClient = {
      async complete(input) {
        calls.push(input)
        const content = calls.length === 1
          ? JSON.stringify(narrative)
          : JSON.stringify(storyboard)

        return { content, finishReason: 'stop', httpStatus: 200 }
      },
    }
    const director = new NativeStoryDirector({
      narrative: createBriefingNarrativeDirector(
        new NativeStoryNarrativeDirector({ client }),
      ),
      visual: new NativeStoryVisualDirector({ client }),
    })

    await director.createPlan({
      premise: 'Clara y el merengue.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'creative',
    })

    expect(calls).toHaveLength(2)

    const narrativeRequest = JSON.stringify(calls[0]?.messages)
    const visualRequest = JSON.stringify(calls[1]?.messages)

    expect(narrativeRequest).toContain('Brief de producción')
    expect(narrativeRequest).toContain('no sustituye la premisa')
    expect(visualRequest).not.toContain('Brief de producción')
    expect(visualRequest).not.toContain('no sustituye la premisa')
    expect(visualRequest).toContain('obrador')
    expect(calls[1]?.temperature).toBe(0.7)
  })
})
