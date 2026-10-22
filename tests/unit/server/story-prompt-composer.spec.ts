// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  KLING_LEGACY_NEGATIVE_PROMPT,
  STORY_PROMPT_MAX_LENGTH,
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  VIDEO_STAGE_BLOCK,
  composeGlobalBlock,
  composeKeyframe,
  composeNegative,
  composeVideo,
  composeVideoGlobalBlock,
  storyBeatForScene,
  storyKeyframeFluxPrompt,
  storyVideoLegacyPrompt,
  storyPromptComposer,
} from '../../../server/story/story-prompt-composer'
import type { StoryPlan } from '~/models/story'
import { StoryError } from '../../../server/story/errors'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import creative from '../../fixtures/story/plan-creative-scene-changes.json'

const PLAN = plan5 as StoryPlan
const BIBLE = PLAN.storyBible!

function beats(plan: StoryPlan) {
  return plan.beats.map((beat) => storyBeatForScene(plan, beat, plan.beats.length))
}

describe('story-prompt-composer: global canon', () => {
  it('uses a full global block for keyframes and a compact one for video', () => {
    const global = composeGlobalBlock(BIBLE)

    for (const beat of beats(PLAN)) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })
      const video = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

      expect(keyframe.prompt.startsWith(global)).toBe(true)
      expect(video.prompt.startsWith(composeVideoGlobalBlock(BIBLE, beat))).toBe(true)
    }
  })

  it('keeps the scene location, time and weather in each scene block', () => {
    const creativePlan = creative as StoryPlan
    const scenes = beats(creativePlan)
    const first = composeKeyframe({
      bible: creativePlan.storyBible!,
      beat: scenes[0]!,
      hasReference: false,
    })
    const second = composeKeyframe({
      bible: creativePlan.storyBible!,
      beat: scenes[3]!,
      hasReference: false,
    })

    expect(first.prompt).toContain('Obrador de Clara')
    expect(second.prompt).toContain('Calle')
    expect(second.prompt).toContain('noche')
  })

  it('keeps video prompts under 2000 and never includes narration or gag', () => {
    for (const beat of beats(creative as StoryPlan)) {
      const keyframe = composeKeyframe({
        bible: (creative as StoryPlan).storyBible!,
        beat,
        hasReference: false,
      })
      const video = composeVideo({ bible: (creative as StoryPlan).storyBible!, beat, preset: 'fast' })

      expect(keyframe.prompt).not.toContain(beat.narration)
      if (beat.gag) expect(keyframe.prompt).not.toContain(beat.gag)
      expect(video.prompt.length).toBeLessThanOrEqual(STORY_VIDEO_PROMPT_MAX_LENGTH)
      expect(video.prompt).toContain(VIDEO_STAGE_BLOCK)
      expect(video.prompt).toContain(beat.visualPrompt)
      expect(video.prompt).not.toContain(beat.narration)
      if (beat.gag) expect(video.prompt).not.toContain(beat.gag)
    }
  })

  it('keeps keyframe prompts under 4000', () => {
    for (const beat of beats(PLAN)) {
      const keyframe = composeKeyframe({ bible: BIBLE, beat, hasReference: false })

      expect(keyframe.prompt.length).toBeLessThanOrEqual(STORY_PROMPT_MAX_LENGTH)
    }
  })
})

describe('story-prompt-composer: negative', () => {
  it('derives contrast from the scene, not from a fixed bicycle list', () => {
    const beat = beats(PLAN)[1]!
    const terms = composeNegative(BIBLE, beat).split(', ')

    expect(terms).not.toContain('bicycle')
  })

  it('filters canon names and the scene context from the negative', () => {
    const beat = beats(PLAN)[1]!
    const terms = composeNegative(BIBLE, beat).split(', ')

    for (const character of BIBLE.characters) {
      expect(terms).not.toContain(character.id)
      expect(terms).not.toContain(character.name)
    }
    for (const location of BIBLE.locations) {
      expect(terms).not.toContain(location.id)
      expect(terms).not.toContain(location.name)
    }
  })

  it('adds Avoid for fast and uses a field for quality', () => {
    const beat = beats(PLAN)[1]!
    const fast = composeVideo({ bible: BIBLE, beat, preset: 'fast' })
    const quality = composeVideo({ bible: BIBLE, beat, preset: 'quality' })

    expect(fast.prompt).toContain('Avoid:')
    expect(quality.prompt).not.toContain('Avoid:')
    expect(quality.negativePrompt.length).toBeGreaterThan(0)
  })
})

describe('story-prompt-composer: legacy', () => {
  it('returns the exact 005 templates with bible null', () => {
    const beat = beats(PLAN)[0]!
    const keyframe = composeKeyframe({ bible: null, beat, hasReference: false })
    const video = composeVideo({ bible: null, beat, preset: 'quality' })

    expect(keyframe.prompt).toBe(storyKeyframeFluxPrompt(beat.visualPrompt))
    expect(video.prompt).toBe(storyVideoLegacyPrompt(beat.visualPrompt))
    expect(video.negativePrompt).toBe(KLING_LEGACY_NEGATIVE_PROMPT)
  })

  it('exposes the StoryPromptComposer contract', () => {
    expect(storyPromptComposer.composeGlobalBlock(BIBLE)).toBe(composeGlobalBlock(BIBLE))
  })
})
