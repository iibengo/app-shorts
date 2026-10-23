// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryBeat, StoryBible } from '~/models/story'
import {
  KEYFRAME_PROMPT_MAX_CHARS,
  composeKeyframe,
} from '../../../server/story/story-prompt-composer'

const BIBLE = {
  style: 'low-poly papercraft',
  tone: 'humor',
  theme: 'coffee and code',
  leadCharacterId: 'ionias',
  signaturePropId: 'mug',
  characters: [{ id: 'ionias', name: 'Ionias', description: 'Low-poly admin with a beard', wardrobe: 'black t-shirt', source: 'premise' }],
  locations: [{ id: 'desk', name: 'Admin Desk', description: 'A minimal white desk', source: 'premise' }],
  props: [{ id: 'mug', name: 'Mug', description: 'A glowing green mug', source: 'premise' }],
  forbidden: ['cars'],
  continuityRules: ['Keep the same t-shirt.'],
} as unknown as StoryBible

function beat(framing: StoryBeat['framing']): StoryBeat {
  return {
    order: 1,
    sceneRole: 'establishing',
    locationId: 'desk',
    timeOfDay: 'morning',
    weather: 'clear',
    characters: ['ionias'],
    props: ['mug'],
    action: 'Ionias sits at the desk and sips coffee while reading the screen.',
    narration: 'Revisa su web.',
    storyFunction: 'hook',
    gag: null,
    visualPrompt: 'Establishing shot of Ionias at his desk with the mug.',
    camera: 'wide',
    continuityFromPrevious: null,
    transition: 'cut',
    subject: 'Ionias',
    framing,
  }
}

describe('identity block never hides the face', () => {
  it('asks for a readable face in wide and establishing framings', () => {
    for (const framing of ['wide', 'establishing'] as const) {
      const prompt = composeKeyframe({
        bible: BIBLE,
        beat: beat(framing),
        hasReference: true,
        visualStyle: 'papercraft',
        withIdentityLock: true,
      }).prompt

      expect(prompt, framing).toContain('face is clearly visible')
      expect(prompt, framing).not.toContain('in the distance')
    }
  })

  it('keeps the face readable in an over-the-shoulder shot', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('over-the-shoulder'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
    }).prompt

    expect(prompt).toContain('three-quarters')
    expect(prompt).not.toContain('from behind')
  })

  it('still fits the keyframe budget', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('wide'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
    }).prompt

    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })
})

describe('single frame guard', () => {
  it('forbids grids and panels when a sheet reference is used', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('medium'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
    }).prompt

    expect(prompt).toContain('no grid')
    expect(prompt).toContain('no collage')
    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })
})
