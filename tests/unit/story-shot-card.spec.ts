import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryShotCard from '../../app/components/story/StoryShotCard.vue'
import type { StoryScene, StoryShot } from '../../app/models/story'

function shot(overrides: Partial<StoryShot> = {}): StoryShot {
  return {
    id: 'shot-1',
    order: 1,
    durationSeconds: 3,
    camera: 'static',
    framing: 'close-up',
    subject: 'Pixel teclea rápido',
    action: 'El gato teclea y luego finge dormir',
    visualPrompt: 'A small low-poly cat typing on a keyboard',
    transition: 'cut',
    locationId: 'desk',
    status: 'KEYFRAME_READY',
    keyframeUrl: null,
    keyframeAttempts: 1,
    videoUrl: null,
    videoAttempts: 0,
    ...overrides,
  } as unknown as StoryShot
}

function scene(characters: readonly string[]): StoryScene {
  return {
    id: 'scene-1',
    order: 1,
    characters,
    props: [],
    locationId: 'desk',
  } as unknown as StoryScene
}

describe('StoryShotCard focus line', () => {
  it('names the character the shot is about', async () => {
    const wrapper = await mountSuspended(StoryShotCard, {
      props: { shot: shot(), total: 4, scene: scene(['Pixel']) },
    })

    const focus = wrapper.get('[data-testid="story-shot-focus"]')

    expect(focus.text()).toContain('Pixel')
  })

  it('draws no focus line when the subject names nobody in the scene', async () => {
    const wrapper = await mountSuspended(StoryShotCard, {
      props: {
        shot: shot({ subject: 'Un portátil encendido' }),
        total: 4,
        scene: scene(['Pixel']),
      },
    })

    expect(wrapper.find('[data-testid="story-shot-focus"]').exists()).toBe(false)
  })

  it('matches a name with accents and different case', async () => {
    const wrapper = await mountSuspended(StoryShotCard, {
      props: { shot: shot({ subject: 'IÓNÍAS lee la nota' }), total: 4, scene: scene(['Ionias']) },
    })

    expect(wrapper.get('[data-testid="story-shot-focus"]').text()).toContain('Ionias')
  })
})

describe('focus label', () => {
  it('shows the canon name, not the internal id', async () => {
    // Production ids are lowercase, so the card used to read "En foco: pixel".
    // The earlier tests hid it by using already-capitalised ids.
    const wrapper = await mountSuspended(StoryShotCard, {
      props: {
        shot: shot({ subject: 'pixel teclea rápido' }),
        total: 4,
        scene: { id: 'scene-1', order: 1, characters: ['pixel'], props: [], locationId: 'desk' } as never,
        characterNames: { pixel: 'Pixel' },
      },
    })

    const text = wrapper.get('[data-testid="story-shot-focus"]').text()

    expect(text).toContain('Pixel')
    // Sólo aparece el id en minúsculas si no se resolvió el nombre.
    expect(text.toLowerCase().replace('pixel', '')).not.toContain('pixel')
  })
})
