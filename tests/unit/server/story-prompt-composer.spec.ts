// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  KLING_LEGACY_NEGATIVE_PROMPT,
  composeGlobalBlock,
  composeKeyframe,
  composeNegative,
  composeVideo,
  storyBeatForScene,
  storyKeyframeFluxPrompt,
  storyKeyframeKontextPrompt,
  storyPromptComposer,
  storyVideoLegacyPrompt,
} from '../../../server/story/story-prompt-composer'
import type { StoryBible, StoryPlan } from '~/models/story'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'

const PLAN = plan5 as StoryPlan
const BIBLE = PLAN.storyBible!

function beats() {
  return PLAN.beats.map((beat) => storyBeatForScene(PLAN, beat, PLAN.beats.length))
}

describe('story-prompt-composer: global block', () => {
  it('is byte-identical for every scene and stage', () => {
    const global = composeGlobalBlock(BIBLE)
    const scenes = beats()

    for (const beat of scenes) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })
      const kontext = composeKeyframe({ bible: BIBLE, beat, hasReference: true })
      const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
      const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

      expect(keyframe.prompt.startsWith(global)).toBe(true)
      expect(kontext.prompt.startsWith(global)).toBe(true)
      expect(fast.prompt.startsWith(global)).toBe(true)
      expect(quality.prompt.startsWith(global)).toBe(true)
    }
  })

  it('keeps the global block under the 2600 character budget', () => {
    expect(composeGlobalBlock(BIBLE).length).toBeLessThanOrEqual(2_600)
  })

  it('orders global, scene, stage and Avoid', () => {
    const beat = beats()[1]!
    const prompt = composeKeyframe({ bible: BIBLE, beat, hasReference: false }).prompt
    const globalIndex = prompt.indexOf('CONTINUIDAD GLOBAL')
    const sceneIndex = prompt.indexOf('ESCENA 2')
    const stageIndex = prompt.indexOf('Fotograma estático')
    const avoidIndex = prompt.indexOf('Avoid:')

    expect(globalIndex).toBe(0)
    expect(sceneIndex).toBeGreaterThan(globalIndex)
    expect(stageIndex).toBeGreaterThan(sceneIndex)
    expect(avoidIndex).toBeGreaterThan(stageIndex)
  })

  it('never includes the narration in any prompt', () => {
    for (const beat of beats()) {
      const prompts = [
        composeKeyframe({ bible: BIBLE, beat, hasReference: false }).prompt,
        composeVideo({ bible: BIBLE, beat, preset: 'fast' }).prompt,
        composeVideo({ bible: BIBLE, beat, preset: 'quality' }).prompt,
      ]

      for (const prompt of prompts) {
        expect(prompt).not.toContain(beat.narration)
      }
    }
  })

  it('is deterministic', () => {
    const beat = beats()[3]!
    const first = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const second = composeVideo({ bible: BIBLE, beat, preset: 'fast' })

    expect(first).toEqual(second)
  })
})

describe('story-prompt-composer: negative', () => {
  it('derives the base, the forbidden list and the contrast terms once', () => {
    const beat = beats()[1]!
    const negative = composeNegative(BIBLE, beat)
    const terms = negative.split(', ')

    for (const expected of [
      'extra characters',
      'characters not in the story bible',
      'different vehicle or prop',
      'different clothing',
      'different weather',
      'different time of day',
      'text',
      'subtitles',
      'watermark',
      'logo',
      'low quality',
      'artifacts',
      'Homer',
      'bicicleta',
      'lluvia',
      'noche',
      'night',
      'rain',
      'storm',
      'snow',
      'fog',
      'bicycle',
    ]) {
      expect(terms).toContain(expected)
    }

    expect(new Set(terms).size).toBe(terms.length)
  })

  it('never contradicts night, rain or a bicycle signature prop', () => {
    const bible: StoryBible = {
      ...BIBLE,
      timeOfDay: 'night',
      weather: 'rain',
      props: [
        {
          id: 'bicycle',
          name: 'Bicicleta roja',
          description: 'Bicicleta roja con cesta de mimbre y timbre plateado.',
        },
      ],
      signaturePropId: 'bicycle',
      forbidden: ['texto'],
    }
    const beat = { ...beats()[0]!, props: ['bicycle'] }
    const terms = composeNegative(bible, beat).split(', ')

    expect(terms).not.toContain('night')
    expect(terms).not.toContain('rain')
    expect(terms).not.toContain('bicycle')
  })

  it('uses Avoid for MiniMax and a field for Kling', () => {
    const beat = beats()[2]!
    const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

    expect(fast.prompt).toContain(`Avoid: ${fast.negativePrompt}`)
    expect(quality.prompt).not.toContain('Avoid:')
    expect(quality.negativePrompt.length).toBeGreaterThan(0)
    expect(quality.negativePrompt).toBe(fast.negativePrompt)
  })
})

describe('story-prompt-composer: legacy templates', () => {
  it('returns the exact 005 templates without inventing a bible', () => {
    const beat = beats()[0]!
    const flux = composeKeyframe({ bible: null, beat, hasReference: false })
    const kontext = composeKeyframe({ bible: null, beat, hasReference: true })
    const video = composeVideo({ bible: null, beat, preset: 'quality' })

    expect(flux.prompt).toBe(storyKeyframeFluxPrompt(beat.visualPrompt))
    expect(kontext.prompt).toBe(storyKeyframeKontextPrompt(beat.visualPrompt))
    expect(video.prompt).toBe(storyVideoLegacyPrompt(beat.visualPrompt))
    expect(video.negativePrompt).toBe(KLING_LEGACY_NEGATIVE_PROMPT)
  })

  it('exposes the composer contract', () => {
    const beat = beats()[0]!

    expect(storyPromptComposer.composeGlobalBlock(BIBLE)).toBe(composeGlobalBlock(BIBLE))
    expect(storyPromptComposer.composeKeyframe({ bible: BIBLE, beat, hasReference: false }))
      .toEqual(composeKeyframe({ bible: BIBLE, beat, hasReference: false }))
  })
})
