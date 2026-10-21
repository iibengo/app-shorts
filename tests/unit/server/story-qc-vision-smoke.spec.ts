// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createStoryQCEvaluator } from '../../../server/story/qc-evaluator'
import type { StoryBible } from '~/models/story'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import observedPass from '../../fixtures/story/qc-observed-pass.json'

const enabled = process.env.RUN_STORY_QC_VISION_SMOKE === '1'

describe.skipIf(!enabled)('RUN_STORY_QC_VISION_SMOKE=1', () => {
  it('sends a fixture strip to DeepSeek Vision and validates the JSON', async () => {
    const apiKey = process.env.NUXT_DEEPSEEK_KEY ?? ''
    const imageUrl = process.env.RUN_STORY_QC_VISION_IMAGE_URL ?? ''

    expect(apiKey.length).toBeGreaterThan(0)
    expect(imageUrl).toMatch(/^https:\/\/(?:[^/]+\.)?fal\.media\//)

    const evaluator = createStoryQCEvaluator({
      apiKey,
      baseUrl: process.env.NUXT_STORY_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    })

    const result = await evaluator.evaluate({
      bible: plan5.storyBible as StoryBible,
      expectation: {
        sceneId: 'smoke-scene',
        order: 1,
        leadCharacterId: 'clara',
        characters: ['clara'],
        props: ['merengue'],
        signaturePropId: 'merengue',
        visualPrompt: plan5.beats[0]!.visualPrompt,
        continuityFromPrevious: null,
        sceneRole: 'establishing',
        camera: 'wide',
      },
      previous: null,
      imageUrl,
    })

    expect(result.kind).toBe('observed')
    if (result.kind !== 'observed') return

    expect(Object.keys(result.observed).sort()).toEqual(
      Object.keys(observedPass).filter((key) => key !== 'confidence').sort(),
    )
    expect(result.confidence).toBeGreaterThanOrEqual(0)
  }, 60_000)
})
