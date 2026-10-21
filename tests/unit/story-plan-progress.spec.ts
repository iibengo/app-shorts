import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryPlanProgress from '~/components/story/StoryPlanProgress.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('StoryPlanProgress', () => {
  it('renders the planning state with the exact copy and focus', async () => {
    const wrapper = await mountSuspended(StoryPlanProgress, {
      attachTo: document.body,
      props: { status: 'planning' },
    })
    const section = wrapper.get('[data-testid="story-planning"]')

    expect(section.attributes('aria-busy')).toBe('true')
    expect(normalize(section.get('h2').text())).toBe('Escribiendo el guion')
    expect(normalize(section.text())).toContain(
      'La IA está preparando las escenas. Puede tardar unos segundos.',
    )
    expect(section.findAll('[role="status"]')).toHaveLength(1)
    expect(document.activeElement).toBe(section.get('h2').element)
  })

  it('renders the keyframe state with the exact copy', async () => {
    const wrapper = await mountSuspended(StoryPlanProgress, {
      attachTo: document.body,
      props: { status: 'keyframes' },
    })
    const section = wrapper.get('[data-testid="story-keyframes"]')

    expect(normalize(section.get('h2').text())).toBe('Preparando las imágenes')
    expect(normalize(section.text())).toContain('Estamos creando una imagen por escena.')
    expect(section.get('h2').attributes('tabindex')).toBe('-1')
  })

  it('announces progress once without fake percentages', async () => {
    const wrapper = await mountSuspended(StoryPlanProgress, {
      attachTo: document.body,
      props: { status: 'planning' },
    })
    const text = normalize(wrapper.text())

    expect(text).not.toMatch(/\d+\s?%/)
    expect(wrapper.findAll('[aria-live="polite"]')).toHaveLength(1)
  })
})
