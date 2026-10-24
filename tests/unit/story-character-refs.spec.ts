import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryCharacterRefs from '../../app/components/story/StoryCharacterRefs.vue'
import type { StoryCharacterReference } from '../../app/models/story'

function ref(partial: Partial<StoryCharacterReference>): StoryCharacterReference {
  return {
    characterId: 'pixel',
    source: 'generated',
    status: 'pending',
    imageUrl: null,
    ...partial,
  }
}

describe('StoryCharacterRefs', () => {
  it('shows one entry per character while they are being prepared', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [ref({})],
        names: { pixel: 'Pixel' },
      },
    })

    expect(wrapper.find('[data-testid="story-character-refs"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="story-character-ref-pixel"]').text()).toContain('Pixel')
    expect(wrapper.get('[data-testid="story-character-ref-status-pixel"]').text())
      .toContain('Preparando a Pixel')
    expect(wrapper.find('[data-testid="story-character-ref-image-pixel"]').exists()).toBe(false)
  })

  it('shows the thumbnail once the reference is ready', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [ref({ status: 'ready', imageUrl: 'https://v3b.fal.media/files/x.png' })],
        names: { pixel: 'Pixel' },
      },
    })

    const image = wrapper.get('[data-testid="story-character-ref-image-pixel"]')

    expect(image.attributes('src')).toBe('https://v3b.fal.media/files/x.png')
    expect(image.attributes('alt')).toBe('Pixel')
  })

  it('tells the user the story continues when a reference fails', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [ref({ status: 'failed' })],
        names: { pixel: 'Pixel' },
      },
    })

    const status = wrapper.get('[data-testid="story-character-ref-status-pixel"]')

    expect(status.text()).toContain('Referencia no disponible')
    // Informative, never an alert: a failed reference does not block the story.
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('La historia continúa')
  })

  it('renders nothing when there is no character to prepare', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, { props: { refs: [] } })

    expect(wrapper.find('[data-testid="story-character-refs"]').exists()).toBe(false)
  })

  it('counts only the ready characters', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [
          ref({ characterId: 'a', status: 'ready', imageUrl: 'https://v3b.fal.media/files/a.png' }),
          ref({ characterId: 'b', status: 'pending' }),
        ],
        names: { a: 'Ionias', b: 'Pixel' },
      },
    })

    expect(wrapper.text()).toContain('1 personajes con imagen propia')
  })
})

describe('failure reason', () => {
  it('says why a reference failed when the server kept a code', async () => {
    // "Not available" alone leaves the user guessing whether it was the photo,
    // the provider or the budget.
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [ref({ status: 'failed', errorCode: 'provider-timeout' })],
        names: { pixel: 'Pixel' },
      },
    })

    expect(wrapper.text()).toContain('tardó demasiado')
  })

  it('falls back to a neutral sentence for an unknown code', async () => {
    const wrapper = await mountSuspended(StoryCharacterRefs, {
      props: {
        refs: [ref({ status: 'failed', errorCode: 'something-new' })],
        names: { pixel: 'Pixel' },
      },
    })

    expect(wrapper.text()).toContain('No se pudo generar la imagen')
  })
})
