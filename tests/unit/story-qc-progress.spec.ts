import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryQCProgress from '~/components/story/StoryQCProgress.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('StoryQCProgress', () => {
  it('renders the real stage without percentages or ETA', async () => {
    const wrapper = await mountSuspended(StoryQCProgress, {
      attachTo: document.body,
    })
    const heading = wrapper.get('[data-testid="story-qc-progress-heading"]')

    expect(heading.element.tagName).toBe('H2')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(normalize(heading.text())).toBe('Revisando la continuidad')
    expect(normalize(wrapper.text())).toContain(
      'Comprobamos que cada escena mantiene a los mismos personajes, la ropa, los objetos, la hora y el clima.',
    )
    expect(wrapper.text()).not.toMatch(/%|\bETA\b/)
    expect(wrapper.html()).toContain('motion-safe:animate-pulse')
    expect(wrapper.html()).toContain('motion-reduce:hidden')
  })
})
