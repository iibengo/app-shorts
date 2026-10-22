// @vitest-environment node
/**
 * Opt-in real DeepSeek smoke test.
 *
 *   RUN_STORY_NARRATIVE_SMOKE=1 NUXT_DEEPSEEK_KEY=... npx vitest run tests/unit/server/story-narrative-smoke.spec.ts
 *
 * No Fal, no FFmpeg and never runs in CI. Budget ceiling: 0.05 USD.
 */
import { describe, expect, it } from 'vitest'
import { createDeepSeekClient, DEFAULT_DEEPSEEK_BASE_URL } from '../../../server/story/deepseek-client'
import { createStoryDirector } from '../../../server/story/director'
import { createStoryNarrativeDirector } from '../../../server/story/narrative-director'
import { createStoryVisualDirector } from '../../../server/story/visual-director'

const enabled = process.env.RUN_STORY_NARRATIVE_SMOKE === '1'

describe.skipIf(!enabled)('RUN_STORY_NARRATIVE_SMOKE=1', () => {
  it('runs the narrative and visual passes against DeepSeek without Fal', async () => {
    const apiKey = process.env.NUXT_DEEPSEEK_KEY ?? ''

    expect(apiKey.length).toBeGreaterThan(0)

    const client = createDeepSeekClient({
      apiKey,
      baseUrl: process.env.NUXT_STORY_DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
    })
    const director = createStoryDirector({
      narrative: createStoryNarrativeDirector({ client }),
      visual: createStoryVisualDirector({ client }),
    })
    const plan = await director.createPlan({
      premise: 'Una repostera descubre que sus postres pueden predecir el futuro.',
      sceneCount: 5,
      referenceUrl: null,
      mode: 'creative',
    })

    expect(plan.beats).toHaveLength(5)
    expect(plan.storyBible?.locations.length).toBeGreaterThanOrEqual(1)
    expect(plan.tone).not.toBe('neutral')
    expect(plan.beats.every((beat) => beat.locationId.length > 0)).toBe(true)
  }, 90_000)
})
