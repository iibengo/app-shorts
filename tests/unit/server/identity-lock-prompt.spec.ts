// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  KEYFRAME_PROMPT_MAX_CHARS,
  IDENTITY_LOCK_BLOCK,
  composeKeyframe,
  identityLockFor,
} from '../../../server/story/story-prompt-composer'
import type { StoryBeat, StoryBible } from '~/models/story'

const BIBLE = {
  style: 'low-poly papercraft',
  tone: 'humor',
  theme: 'coffee and code',
  leadCharacterId: 'ionias',
  signaturePropId: 'mug',
  characters: [{ id: 'ionias', name: 'Ionias', description: 'Low-poly admin with a beard', wardrobe: 'black t-shirt', source: 'premise' }],
  locations: [{ id: 'desk', name: 'Desk', description: 'A minimal white desk', source: 'premise' }],
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
    action: 'Ionias types on the keyboard and sips coffee.',
    narration: 'Revisa su web.',
    storyFunction: 'hook',
    gag: null,
    visualPrompt: 'Medium shot of Ionias at his desk.',
    camera: 'medium',
    continuityFromPrevious: null,
    transition: 'cut',
    subject: 'Ionias',
    framing,
  }
}

describe('identity lock', () => {
  it('puts the identity block after the style and before the shot', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('medium'),
      hasReference: true,
      visualStyle: 'papercraft',
      withIdentityLock: true,
    }).prompt

    expect(prompt).toContain(IDENTITY_LOCK_BLOCK)
    expect(prompt.indexOf('low-poly papercraft')).toBeLessThan(prompt.indexOf(IDENTITY_LOCK_BLOCK))
    expect(prompt.indexOf(IDENTITY_LOCK_BLOCK)).toBeLessThan(prompt.indexOf('Medium shot'))
    expect(prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
  })

  it('omits the block when there is no reference', () => {
    const prompt = composeKeyframe({
      bible: BIBLE,
      beat: beat('medium'),
      hasReference: false,
      visualStyle: 'papercraft',
    }).prompt

    expect(prompt).not.toContain(IDENTITY_LOCK_BLOCK)
  })

  it('adapts the block to framings that hide the face', () => {
    expect(identityLockFor('wide')).toContain('wide shot')
    expect(identityLockFor('over-the-shoulder')).toContain('from behind')
    expect(identityLockFor('close-up')).toBe(IDENTITY_LOCK_BLOCK)
  })
})
