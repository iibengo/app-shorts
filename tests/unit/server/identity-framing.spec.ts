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

describe('focus size reaches the keyframe prompt', () => {
  it('states how much of the frame the focus occupies', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('close-up'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
      focusCharacterName: 'Pixel',
    }).prompt

    expect(prompt).toContain('two thirds of the frame width')
    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })

  it('adds no focus block when there is no resolved character', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('close-up'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
      focusCharacterName: null,
    }).prompt

    expect(prompt).not.toContain('frame width')
  })

  it('uses the style-only body when the reference is not a character', () => {
    const prompt = composeKeyframe({
      bible: null,
      beat: beat('wide'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
      styleOnlyReference: true,
    }).prompt

    expect(prompt).toContain('only for its visual style and palette')
    // 013: the absence is described, not forbidden, because the model has no
    // negative channel and a "do not" line names what it should avoid.
    expect(prompt).toContain('nobody from the reference present')
  })
})

describe('prompt budget never fails a shot', () => {
  it('degrades instead of throwing when the shot body is long', () => {
    const longBeat: Parameters<typeof composeKeyframe>[0]['beat'] = {
      ...beat('reaction'),
      subject: 'Ionias clutching the neon mug while Nina shows a cracked tablet in the server corner',
      action: 'He sips, frowns at the screen, types a correction, and glances sideways at the blinking rack behind him',
      visualPrompt: 'Ionias clutching the neon mug while Nina shows a cracked tablet in the server corner, he sips and frowns, dim green rack lights behind them, tangled cables on the floor',
    }

    // A 338-character scene used to exceed the budget and fail the shot with
    // invalid-visual-prompt. Real stories must always produce a frame.
    const composed = composeKeyframe({
      bible: BIBLE,
      beat: longBeat,
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
      focusCharacterName: 'Ionias',
    })

    expect(composed.prompt.length).toBeGreaterThan(50)
    expect(composed.prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })
})
