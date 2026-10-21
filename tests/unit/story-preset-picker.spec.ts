import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryPresetPicker from '~/components/story/StoryPresetPicker.vue'
import type { StoryPreset } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPicker(preset: StoryPreset = 'fast') {
  return mountSuspended(StoryPresetPicker, {
    attachTo: document.body,
    props: { preset },
  })
}

describe('StoryPresetPicker', () => {
  it('renders a labelled fieldset and radiogroup', async () => {
    const wrapper = await mountPicker()
    const fieldset = wrapper.get('fieldset')
    const group = wrapper.get('[data-testid="story-preset-group"]')

    expect(normalize(fieldset.get('legend').text())).toBe('Calidad de vídeo')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-labelledby')).toBe('story-preset-legend')
    expect(fieldset.get('legend').attributes('id')).toBe('story-preset-legend')
  })

  it('renders both presets with their model and description', async () => {
    const wrapper = await mountPicker()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="story-preset-fast"]').attributes('value')).toBe('fast')
    expect(wrapper.get('[data-testid="story-preset-quality"]').attributes('value')).toBe('quality')
    expect(text).toContain('Rápido')
    expect(text).toContain('MiniMax Hailuo 02. Menos espera.')
    expect(text).toContain('Calidad')
    expect(text).toContain('Kling 2.5 Turbo Pro. Más detalle y coste.')
  })

  it('selects Rápido by default and Calidad when passed', async () => {
    const fast = await mountPicker('fast')

    expect((fast.get('[data-testid="story-preset-fast"]').element as HTMLInputElement).checked)
      .toBe(true)

    const quality = await mountPicker('quality')

    expect((quality.get('[data-testid="story-preset-quality"]').element as HTMLInputElement).checked)
      .toBe(true)
  })

  it('emits update:preset when the user selects Calidad', async () => {
    const wrapper = await mountPicker('fast')

    await wrapper.get('[data-testid="story-preset-quality"]').setValue(true)

    expect(wrapper.emitted('update:preset')).toEqual([['quality']])
  })

  it('does not emit for a redundant change', async () => {
    const wrapper = await mountPicker('fast')
    const input = wrapper.get('[data-testid="story-preset-fast"]')
    const element = input.element as HTMLInputElement

    element.checked = false
    await input.trigger('change')

    expect(wrapper.emitted('update:preset')).toBeUndefined()
  })

  it('keeps 44px options and accessible focus styles', async () => {
    const wrapper = await mountPicker()

    for (const label of wrapper.findAll('label')) {
      const span = label.get('span')

      expect(span.classes()).toContain('min-h-11')
      expect(span.classes()).toContain('peer-focus-visible:ring-2')
      expect(span.classes()).toContain('forced-colors:border')
    }
  })

  it('exposes no free model, endpoint or advanced configuration', async () => {
    const wrapper = await mountPicker()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(wrapper.findAll('input[type="text"], input[type="number"]')).toHaveLength(0)
    expect(text).not.toMatch(/\bEndpoint\b|\bAspect ratio\b|\bResolución\b|\bSemilla\b/)
    expect(text).not.toMatch(/fal-ai\//)
  })
})
