import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StorySceneCard from '~/components/story/StorySceneCard.vue'
import { makeSceneDto } from '../helpers/story'
import type { StoryScene } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const PROMPT = 'Una repostera abre el obrador al amanecer con luz cálida.'

function scene(overrides: Partial<StoryScene> = {}): StoryScene {
  return makeSceneDto({
    id: 'scene-2',
    order: 2,
    visualPrompt: PROMPT,
    narration: 'Cada mañana, antes de encender el horno, Clara escucha.',
    ...overrides,
  })
}

async function mountCard(options: {
  scene?: Partial<StoryScene>
  total?: number
  disabled?: boolean
} = {}) {
  return mountSuspended(StorySceneCard, {
    attachTo: document.body,
    props: {
      scene: scene(options.scene),
      total: options.total ?? 5,
      disabled: options.disabled ?? false,
    },
  })
}

describe('StorySceneCard', () => {
  it('renders the scene heading, keyframe and narration', async () => {
    const wrapper = await mountCard()
    const heading = wrapper.get('h3')
    const image = wrapper.get('[data-testid="story-scene-keyframe"]')

    expect(normalize(heading.text())).toBe('Escena 2 de 5')
    expect(image.element.tagName).toBe('IMG')
    expect(image.attributes('src')).toBe('https://v3.fal.media/files/test/keyframe.jpeg')
    expect(image.attributes('alt')).toBe('Imagen de la escena 2')
    expect(image.classes()).toContain('aspect-[9/16]')
    expect(normalize(wrapper.get('[data-testid="story-scene-narration"]').text())).toBe(
      'Cada mañana, antes de encender el horno, Clara escucha.',
    )
    expect(normalize(wrapper.text())).toContain('Narración (solo en pantalla)')
    expect(normalize(wrapper.text())).toContain('Prompt visual')
    expect(normalize(wrapper.get('[data-testid="story-scene-attempt"]').text())).toBe(
      'Imagen 1 de 2',
    )
    expect(wrapper.get('[data-testid="story-scene-card"]').attributes('data-scene-order'))
      .toBe('2')
    expect(wrapper.get('[data-testid="story-scene-card"]').attributes('data-scene-status'))
      .toBe('KEYFRAME_READY')
  })

  it('renders a labelled prompt textarea with the scene prompt', async () => {
    const wrapper = await mountCard()
    const textarea = wrapper.get('[data-testid="story-scene-prompt"]')

    expect(textarea.element.tagName).toBe('TEXTAREA')
    expect((textarea.element as HTMLTextAreaElement).value).toBe(PROMPT)
    expect(textarea.attributes('maxlength')).toBe('600')
    expect(textarea.classes()).toContain('text-base')
    expect(wrapper.get('label').attributes('for')).toBe('story-scene-prompt-scene-2')
  })

  it('emits a regeneration request with the edited prompt', async () => {
    const wrapper = await mountCard()
    const next = 'Una repostera abre el obrador con luz aún más cálida.'

    await wrapper.get('[data-testid="story-scene-prompt"]').setValue(next)
    await wrapper.get('[data-testid="story-scene-regenerate"]').trigger('click')

    expect(wrapper.emitted('regenerate')).toEqual([[
      {
        visualPrompt: next,
        narration: 'Cada mañana, antes de encender el horno, Clara escucha.',
        regenerate: true,
      },
    ]])
    expect(normalize(wrapper.text())).toContain('Regenerando imagen…')
  })

  it('rejects an invalid prompt locally without emitting', async () => {
    const wrapper = await mountCard()

    await wrapper.get('[data-testid="story-scene-prompt"]').setValue('<b>mal</b>')
    await wrapper.get('[data-testid="story-scene-regenerate"]').trigger('click')

    expect(wrapper.emitted('regenerate')).toBeUndefined()
    expect(normalize(wrapper.text())).toContain('El prompt visual no es válido.')
  })

  it('shows the attempt limit and disables the button at two attempts', async () => {
    const wrapper = await mountCard({
      scene: { keyframeAttempts: 2, status: 'KEYFRAME_READY' },
    })

    expect(normalize(wrapper.get('[data-testid="story-scene-attempt"]').text())).toBe(
      'Imagen 2 de 2',
    )
    expect(wrapper.get('[data-testid="story-scene-regenerate"]').attributes('disabled'))
      .toBeDefined()
    expect(normalize(wrapper.text())).toContain('Esta escena ya no puede regenerar la imagen.')
  })

  it('disables regeneration when the parent disables it', async () => {
    const wrapper = await mountCard({ disabled: true })

    expect(wrapper.get('[data-testid="story-scene-regenerate"]').attributes('disabled'))
      .toBeDefined()
  })

  it('renders the scene error as an alert without the raw provider message', async () => {
    const wrapper = await mountCard({
      scene: {
        status: 'KEYFRAME_FAILED',
        error: {
          code: 'provider-error',
          message: 'El servicio de generación no está disponible ahora mismo.',
          retryable: true,
        },
      },
    })
    const error = wrapper.get('[data-testid="story-scene-error"]')

    expect(error.attributes('role')).toBe('alert')
    expect(normalize(error.text())).toBe('No se pudo regenerar la imagen.')
    expect(wrapper.html()).not.toContain('raw provider')
  })

  it('shows a placeholder instead of an image when the keyframe is missing', async () => {
    const wrapper = await mountCard({ scene: { keyframeUrl: null } })

    expect(wrapper.find('[data-testid="story-scene-keyframe"]').exists()).toBe(false)
    expect(normalize(wrapper.text())).toContain('Preparando las imágenes')
  })

  it('keeps the 44px touch target and focusable card', async () => {
    const wrapper = await mountCard()

    expect(wrapper.get('[data-testid="story-scene-card"]').attributes('tabindex')).toBe('-1')
    expect(wrapper.get('[data-testid="story-scene-regenerate"]').classes()).toContain('min-h-11')
  })
})
