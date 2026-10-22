import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryModePicker from '~/components/story/StoryModePicker.vue'

async function mountPicker(mode: 'faithful' | 'creative' = 'faithful') {
  return mountSuspended(StoryModePicker, {
    attachTo: document.body,
    props: { mode },
  })
}

describe('StoryModePicker', () => {
  it('renders a labelled radiogroup with faithful selected by default', async () => {
    const wrapper = await mountPicker()
    const group = wrapper.get('[data-testid="story-mode-group"]')

    expect(group.attributes('role')).toBe('radiogroup')
    expect(wrapper.get('legend').text()).toBe('Modo de la historia')
    expect((wrapper.get('[data-testid="story-mode-faithful"]').element as HTMLInputElement).checked)
      .toBe(true)
    expect((wrapper.get('[data-testid="story-mode-creative"]').element as HTMLInputElement).checked)
      .toBe(false)
    const labels = wrapper.findAll('label')

    expect(labels[0]?.get('span').classes()).toContain('min-h-11')
    expect(labels[1]?.get('span').classes()).toContain('min-h-11')
  })

  it('emits creative with one interaction', async () => {
    const wrapper = await mountPicker()

    await wrapper.get('[data-testid="story-mode-creative"]').setValue(true)

    expect(wrapper.emitted('update:mode')).toEqual([['creative']])
  })

  it('shows the creative notice only in creative mode and links it with aria-describedby', async () => {
    const faithful = await mountPicker('faithful')

    expect(faithful.find('[data-testid="story-mode-creative-notice"]').exists()).toBe(false)

    const creative = await mountPicker('creative')

    expect((creative.get('[data-testid="story-mode-creative"]').element as HTMLInputElement).checked)
      .toBe(true)
    expect(creative.get('[data-testid="story-mode-creative-notice"]').text())
      .toBe('En modo creativo pueden aparecer personajes, lugares y objetos que no están en tu premisa.')
    expect(creative.get('[data-testid="story-mode-group"]').attributes('aria-describedby'))
      .toContain('story-mode-creative-notice')
  })

  it('describes both modes with visible help', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.get('[data-testid="story-mode-help"]').text())
      .toBe('El guion se ciñe a lo que escribiste.')
  })

  it('keeps native keyboard semantics and a visible focus ring on both options', async () => {
    const wrapper = await mountPicker()
    const faithful = wrapper.get('[data-testid="story-mode-faithful"]')
    const creative = wrapper.get('[data-testid="story-mode-creative"]')
    const faithfulLabel = faithful.element.closest('label')?.querySelector('span')

    expect(faithful.attributes('type')).toBe('radio')
    expect(faithful.attributes('name')).toBe('story-mode')
    expect(creative.attributes('name')).toBe('story-mode')
    expect(faithful.attributes('disabled')).toBeUndefined()
    expect(creative.attributes('disabled')).toBeUndefined()
    expect(faithfulLabel?.className).toContain('peer-focus-visible:ring-2')
    expect(faithfulLabel?.className).toContain('peer-focus-visible:ring-brand-fuchsia')
  })
})
