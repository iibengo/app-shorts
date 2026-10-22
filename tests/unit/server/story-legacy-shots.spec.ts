// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizePlanScenes, synthesizeLegacyShot } from '../../../server/story/legacy-shots'

describe('legacy shots', () => {
  it('synthesizes one 6 s legacy shot', () => {
    const shot = synthesizeLegacyShot({
      id: 'scene-1',
      storyId: 'story-1',
      order: 2,
      visualPrompt: 'Un plano heredado.',
      narration: 'Narración heredada.',
      status: 'KEYFRAME_READY',
    })

    expect(shot).toMatchObject({
      id: 'legacy-scene-1',
      order: 2,
      durationSeconds: 6,
      framing: 'establishing',
      subject: 'Plano heredado',
      locationId: 'legacy-location',
      status: 'KEYFRAME_READY',
    })
  })

  it('normalizes 007 beats to narrative scenes and drops visual fields', () => {
    const scenes = normalizePlanScenes({
      beats: [{
        order: 1,
        sceneRole: 'establishing',
        locationId: 'obrador',
        timeOfDay: 'morning',
        weather: 'clear',
        characters: ['clara'],
        props: [],
        action: 'Clara abre el obrador con calma.',
        narration: 'Clara empieza el día.',
        storyFunction: 'hook',
        gag: null,
        continuityFromPrevious: 'Se ignora en la primera escena.',
      }],
    })

    expect(scenes[0]).toMatchObject({ order: 1, continuityFromPrevious: null })
    expect(scenes[0]).not.toHaveProperty('visualPrompt')
  })
})
