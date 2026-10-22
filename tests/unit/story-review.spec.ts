import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryReview from '~/components/story/StoryReview.vue'
import { makeSceneDto, makeStoryDto } from '../helpers/story'
import type { StoryPlan } from '~/models/story'
import plan5 from '../fixtures/deepseek/deepseek-plan-5.json'
import creative from '../fixtures/story/plan-creative-scene-changes.json'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

function story(sceneStatus: 'KEYFRAME_READY' | 'KEYFRAME_QUEUED' = 'KEYFRAME_READY', count = 5) {
  return makeStoryDto({
    sceneCount: count,
    scenes: Array.from({ length: count }, (_value, index) =>
      makeSceneDto({
        order: index + 1,
        status: sceneStatus,
        keyframeAttempts: 1,
      }),
    ),
  })
}

async function mountReview(value = story()) {
  return mountSuspended(StoryReview, {
    attachTo: document.body,
    props: { story: value },
  })
}

describe('StoryReview', () => {
  it('renders the review heading with focus management', async () => {
    const wrapper = await mountReview()
    const heading = wrapper.get('[data-testid="story-review-heading"]')

    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Revisa las imágenes')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
  })

  it('renders exactly one ordered card per scene', async () => {
    const wrapper = await mountReview(story('KEYFRAME_READY', 4))
    const cards = wrapper.findAll('[data-testid="story-scene-card"]')

    expect(cards).toHaveLength(4)
    expect(cards.map((card) => card.attributes('data-scene-order'))).toEqual([
      '1', '2', '3', '4',
    ])

    const text = normalize(wrapper.text())

    expect(text).toContain(
      'Estas son las imágenes de tus 4 escenas. Puedes regenerar una imagen antes de aprobar.',
    )
    expect(text).toContain('Escena 1 de 4')
    expect(text).toContain('Escena 4 de 4')
  })

  it('renders the cost note and the approval button', async () => {
    const wrapper = await mountReview()

    expect(normalize(wrapper.get('[data-testid="story-approve-note"]').text())).toBe(
      'Al aprobar se generarán 5 vídeos de 6 segundos y se cobrarán 5 generaciones.',
    )
    expect(normalize(wrapper.get('[data-testid="story-approve"]').text())).toBe(
      'Aprobar y generar vídeos',
    )
    expect(wrapper.get('[data-testid="story-approve"]').attributes('disabled')).toBeUndefined()
  })

  it('emits approve when the button is pressed', async () => {
    const wrapper = await mountReview()

    await wrapper.get('[data-testid="story-approve"]').trigger('click')

    expect(wrapper.emitted('approve')).toHaveLength(1)
  })

  it('emits cancel from the review without touching approval', async () => {
    const wrapper = await mountReview()
    const cancel = wrapper.get('[data-testid="story-cancel"]')

    expect(normalize(cancel.text())).toBe('Cancelar historia')
    expect(cancel.classes()).toContain('min-h-11')

    await cancel.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('approve')).toBeUndefined()
  })

  it('disables approval when any scene is not ready', async () => {
    const value = story()
    const scenes = value.scenes.slice()
    scenes[2] = { ...scenes[2]!, status: 'KEYFRAME_QUEUED' }
    const wrapper = await mountReview({ ...value, scenes })

    expect(wrapper.get('[data-testid="story-approve"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="story-scene-card"]').attributes('data-scene-status'))
      .toBe('KEYFRAME_READY')
  })

  it('disables approval when the scene count does not match', async () => {
    const value = story('KEYFRAME_READY', 4)
    const wrapper = await mountReview({ ...value, sceneCount: 5 })

    expect(wrapper.get('[data-testid="story-approve"]').attributes('disabled')).toBeDefined()
  })

  it('forwards a scene regeneration with its id and input', async () => {
    const value = story()
    const wrapper = await mountReview(value)
    const card = wrapper.findAll('[data-testid="story-scene-card"]')[1]!
    const prompt = 'Un prompt visual nuevo con longitud suficiente.'

    await card.get('[data-testid="story-scene-prompt"]').setValue(prompt)
    await card.get('[data-testid="story-scene-regenerate"]').trigger('click')

    const emitted = wrapper.emitted('regenerate')

    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toBe(value.scenes[1]?.id)
    expect(emitted?.[0]?.[1]).toMatchObject({
      visualPrompt: prompt,
      narration: value.scenes[1]?.narration,
      regenerate: true,
    })
  })

  it('shows mode, tone, canon and invented labels in creative mode', async () => {
    const value = story()
    const wrapper = await mountReview({
      ...value,
      mode: 'creative',
      plan: creative as StoryPlan,
    })

    expect(normalize(wrapper.get('[data-testid="story-review-mode"]').text())).toBe('Modo creativo')
    expect(normalize(wrapper.get('[data-testid="story-review-tone"]').text())).toBe('Tono: Humor')
    expect(normalize(wrapper.get('[data-testid="story-canon"]').text())).toContain('Canon de la historia')
    expect(normalize(wrapper.get('[data-testid="story-canon"]').text())).toContain('Obrador de Clara')
    expect(wrapper.findAll('[data-testid="story-invented-character"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="story-invented-location"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="story-invented-prop"]')).toHaveLength(1)
  })

  it('shows scene context and a location change when the canon changes location', async () => {
    const value = story()
    const wrapper = await mountReview({
      ...value,
      plan: creative as StoryPlan,
    })
    const cards = wrapper.findAll('[data-testid="story-scene-card"]')

    expect(normalize(cards[0]?.get('[data-testid="story-scene-location"]').text()))
      .toContain('Obrador de Clara')
    expect(normalize(cards[2]?.get('[data-testid="story-scene-location"]').text()))
      .toContain('Calle')
    expect(cards[2]?.find('[data-testid="story-scene-location-change"]').exists()).toBe(true)
    expect(normalize(cards[2]?.get('[data-testid="story-scene-time"]').text())).toContain('Hora')
  })

  it('does not render canon rows for a legacy plan without a bible', async () => {
    const value = story()
    const wrapper = await mountReview({
      ...value,
      plan: { ...(plan5 as StoryPlan), storyBible: null, tone: 'neutral' },
    })

    expect(wrapper.find('[data-testid="story-canon"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="story-scene-context"]').exists()).toBe(false)
    expect(normalize(wrapper.get('[data-testid="story-review-mode"]').text()))
      .toBe('Fiel a la premisa')
    expect(normalize(wrapper.get('[data-testid="story-review-tone"]').text()))
      .toBe('Tono: Neutro')
  })

  it('does not expose internal provider data in the review', async () => {
    const wrapper = await mountReview()
    const markup = wrapper.html()

    expect(markup).not.toContain('statusUrl')
    expect(markup).not.toContain('responseUrl')
    expect(markup).not.toContain('cancelUrl')
    expect(markup).not.toContain('requestId')
    expect(markup).not.toContain('sessionId')
    expect(markup).not.toContain('queue.fal.run')
  })
})
