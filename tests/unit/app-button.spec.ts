import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppButton from '~/components/ui/AppButton.vue'

async function mountButton(options: Parameters<typeof mountSuspended>[1] = {}) {
  return mountSuspended(AppButton, options)
}

describe('AppButton primitive', () => {
  it('defaults to a primary button of type button', async () => {
    const wrapper = await mountButton({ slots: { default: 'Generar' } })
    const button = wrapper.get('button')

    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.text()).toBe('Generar')
    expect(button.classes()).toContain('from-brand-violet-deep')
    expect(button.classes()).toContain('to-brand-fuchsia-deep')
    expect(button.classes()).toContain('text-white')
  })

  it('renders the secondary variant classes', async () => {
    const wrapper = await mountButton({
      props: { variant: 'secondary' },
      slots: { default: 'Cancelar' },
    })
    const classes = wrapper.get('button').classes()

    expect(classes).toContain('border')
    expect(classes).toContain('bg-white/5')
    expect(classes).toContain('text-brand-text')
  })

  it('renders the quiet variant classes', async () => {
    const wrapper = await mountButton({
      props: { variant: 'quiet' },
      slots: { default: 'Silencioso' },
    })
    const classes = wrapper.get('button').classes()

    expect(classes).toContain('bg-transparent')
    expect(classes).toContain('text-brand-muted')
  })

  it('supports type="submit" and type="reset"', async () => {
    const submit = await mountButton({ props: { type: 'submit' } })
    expect(submit.get('button').attributes('type')).toBe('submit')

    const reset = await mountButton({ props: { type: 'reset' } })
    expect(reset.get('button').attributes('type')).toBe('reset')
  })

  it('renders the disabled state natively', async () => {
    const wrapper = await mountButton({
      props: { disabled: true },
      slots: { default: 'Deshabilitado' },
    })
    const button = wrapper.get('button')

    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.classes()).toContain('disabled:cursor-not-allowed')
    expect(button.classes()).toContain('disabled:opacity-50')
  })

  it('renders the default slot', async () => {
    const wrapper = await mountButton({
      slots: { default: '<span data-testid="slot-content">Contenido</span>' },
    })

    expect(wrapper.get('[data-testid="slot-content"]').text()).toBe('Contenido')
  })

  it('forwards class, data-testid and aria attributes through fallthrough', async () => {
    const wrapper = await mountButton({
      attrs: {
        class: 'custom-extra',
        'data-testid': 'custom-button',
        'aria-label': 'Acción personalizada',
        'aria-describedby': 'helper-id',
      },
      slots: { default: 'Acción' },
    })
    const button = wrapper.get('[data-testid="custom-button"]')

    expect(button.classes()).toContain('custom-extra')
    expect(button.classes()).toContain('min-h-11')
    expect(button.attributes('aria-label')).toBe('Acción personalizada')
    expect(button.attributes('aria-describedby')).toBe('helper-id')
  })

  it('exposes visible focus, motion-safe and forced-colors classes', async () => {
    const wrapper = await mountButton()
    const classes = wrapper.get('button').classes()

    expect(classes).toContain('focus-visible:ring-2')
    expect(classes).toContain('focus-visible:ring-brand-fuchsia')
    expect(classes).toContain('forced-colors:border')
    expect(classes.some((className) => className.startsWith('motion-safe:'))).toBe(true)
    expect(classes.some((className) => className.includes('animate-'))).toBe(false)
  })
})
