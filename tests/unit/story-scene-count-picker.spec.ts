import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StorySceneCountPicker from '~/components/story/StorySceneCountPicker.vue'
import type { StorySceneCount } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPicker(sceneCount: StorySceneCount = 5) {
  return mountSuspended(StorySceneCountPicker, {
    attachTo: document.body,
    props: { sceneCount },
  })
}

describe('StorySceneCountPicker', () => {
  it('renders a labelled fieldset and a radiogroup', async () => {
    const wrapper = await mountPicker()
    const fieldset = wrapper.get('fieldset')
    const group = wrapper.get('[data-testid="story-scene-count"]')

    expect(fieldset.element.tagName).toBe('FIELDSET')
    expect(normalize(fieldset.get('legend').text())).toBe('Escenas')
    expect(group.element.tagName).toBe('DIV')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-labelledby')).toBe('story-scene-count-legend')
    expect(fieldset.get('legend').attributes('id')).toBe('story-scene-count-legend')
  })

  it('renders exactly the three scene counts with their labels', async () => {
    const wrapper = await mountPicker()
    const radios = wrapper.findAll('input[type="radio"]')

    expect(radios).toHaveLength(3)
    expect(wrapper.get('[data-testid="story-scene-count-4"]').attributes('value')).toBe('4')
    expect(wrapper.get('[data-testid="story-scene-count-5"]').attributes('value')).toBe('5')
    expect(wrapper.get('[data-testid="story-scene-count-6"]').attributes('value')).toBe('6')

    const text = normalize(wrapper.text())

    expect(text).toContain('4 escenas')
    expect(text).toContain('5 escenas')
    expect(text).toContain('6 escenas')
    expect(text).toContain('Cada escena dura 6 segundos.')
  })

  it('selects five scenes by default and switches with the prop', async () => {
    const five = await mountPicker(5)

    expect((five.get('[data-testid="story-scene-count-5"]').element as HTMLInputElement).checked)
      .toBe(true)

    const four = await mountPicker(4)

    expect((four.get('[data-testid="story-scene-count-4"]').element as HTMLInputElement).checked)
      .toBe(true)
    expect((four.get('[data-testid="story-scene-count-5"]').element as HTMLInputElement).checked)
      .toBe(false)
  })

  it('emits update:sceneCount when another radio is selected', async () => {
    const wrapper = await mountPicker(5)

    await wrapper.get('[data-testid="story-scene-count-6"]').setValue(true)

    expect(wrapper.emitted('update:sceneCount')).toEqual([[6]])
  })

  it('does not emit for a redundant change', async () => {
    const wrapper = await mountPicker(5)
    const input = wrapper.get('[data-testid="story-scene-count-5"]')
    const element = input.element as HTMLInputElement

    element.checked = false
    await input.trigger('change')

    expect(wrapper.emitted('update:sceneCount')).toBeUndefined()
  })

  it('keeps the 44px touch target and forced-colors border on the options', async () => {
    const wrapper = await mountPicker()
    const labels = wrapper.findAll('label')

    expect(labels).toHaveLength(3)

    for (const label of labels) {
      const span = label.get('span')

      expect(span.classes()).toContain('min-h-11')
      expect(span.classes()).toContain('forced-colors:border')
      expect(span.classes()).toContain('peer-focus-visible:ring-2')
    }
  })

  it('exposes no free scene count input', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.findAll('input[type="number"], input[type="text"], select')).toHaveLength(0)
  })
})
