import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerPresetPicker from '~/components/composer/ComposerPresetPicker.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPicker(preset: 'fast' | 'quality' = 'fast') {
  return mountSuspended(ComposerPresetPicker, { props: { preset } })
}

describe('ComposerPresetPicker', () => {
  it('renders a labelled fieldset and radiogroup', async () => {
    const wrapper = await mountPicker()
    const group = wrapper.get('[data-testid="composer-preset-group"]')
    const radiogroup = wrapper.get('[role="radiogroup"]')

    expect(group.element.tagName).toBe('FIELDSET')
    expect(normalize(group.get('legend').text())).toBe('Calidad de generación')
    expect(radiogroup.attributes('aria-labelledby')).toBe('composer-preset-legend')
    expect(group.get('legend').attributes('id')).toBe('composer-preset-legend')
  })

  it('renders exactly the two preset radios with their copy and models', async () => {
    const wrapper = await mountPicker()
    const radios = wrapper.findAll('input[type="radio"]')

    expect(radios).toHaveLength(2)
    expect(radios.map((radio) => radio.attributes('name'))).toEqual([
      'composer-preset',
      'composer-preset',
    ])
    expect(wrapper.get('[data-testid="composer-preset-fast"]').attributes('value')).toBe('fast')
    expect(wrapper.get('[data-testid="composer-preset-quality"]').attributes('value')).toBe('quality')

    const text = normalize(wrapper.text())
    expect(text).toContain('Rápido')
    expect(text).toContain('Menos espera, ideal para probar.')
    expect(text).toContain('MiniMax Hailuo 02')
    expect(text).toContain('Calidad')
    expect(text).toContain('Más detalle y movimiento, tarda más.')
    expect(text).toContain('Kling 2.5 Turbo Pro')
  })

  it('selects the fast preset by default', async () => {
    const wrapper = await mountPicker('fast')

    expect(
      (wrapper.get('[data-testid="composer-preset-fast"]').element as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-preset-quality"]').element as HTMLInputElement).checked,
    ).toBe(false)
  })

  it('selects the quality preset when passed', async () => {
    const wrapper = await mountPicker('quality')

    expect(
      (wrapper.get('[data-testid="composer-preset-quality"]').element as HTMLInputElement).checked,
    ).toBe(true)
  })

  it('emits update:preset when the user selects a different radio', async () => {
    const wrapper = await mountPicker('fast')
    const quality = wrapper.get('[data-testid="composer-preset-quality"]')

    await quality.setValue(true)

    expect(wrapper.emitted('update:preset')).toEqual([['quality']])
  })

  it('does not emit when the checked radio receives a redundant change', async () => {
    const wrapper = await mountPicker('fast')
    const fast = wrapper.get('[data-testid="composer-preset-fast"]')
    const input = fast.element as HTMLInputElement

    input.checked = false
    await fast.trigger('change')

    expect(wrapper.emitted('update:preset')).toBeUndefined()
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
