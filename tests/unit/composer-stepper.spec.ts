import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerStepper from '~/components/composer/ComposerStepper.vue'
import type { ComposerStep } from '~/models/composer'

const STEPS = [
  { id: 'input', label: 'Idea' },
  { id: 'generating', label: 'Generación' },
  { id: 'preview', label: 'Vista previa' },
] as const

async function mountStepper(current: ComposerStep) {
  return mountSuspended(ComposerStepper, { props: { current } })
}

describe('ComposerStepper', () => {
  it('renders a labelled navigation with three ordered steps', async () => {
    const wrapper = await mountStepper('input')
    const nav = wrapper.get('nav')
    const list = wrapper.get('[data-testid="composer-stepper"]')
    const items = wrapper.findAll('[data-testid="composer-step"]')

    expect(nav.attributes('aria-label')).toBe('Progreso de creación')
    expect(list.element.tagName).toBe('OL')
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.attributes('data-step'))).toEqual(
      STEPS.map((step) => step.id),
    )
  })

  it('shows the exact visible labels in order', async () => {
    const wrapper = await mountStepper('input')
    const items = wrapper.findAll('[data-testid="composer-step"]')

    expect(items.map((item) => item.findAll('span')[1]?.text())).toEqual(
      STEPS.map((step) => step.label),
    )
  })

  it('marks only the current step with aria-current="step" in the input state', async () => {
    const wrapper = await mountStepper('input')
    const items = wrapper.findAll('[data-testid="composer-step"]')

    expect(items.map((item) => item.attributes('data-state'))).toEqual([
      'current',
      'upcoming',
      'upcoming',
    ])
    expect(items.map((item) => item.attributes('aria-current'))).toEqual([
      'step',
      undefined,
      undefined,
    ])
  })

  it('marks the input as complete during generation', async () => {
    const wrapper = await mountStepper('generating')
    const items = wrapper.findAll('[data-testid="composer-step"]')

    expect(items.map((item) => item.attributes('data-state'))).toEqual([
      'complete',
      'current',
      'upcoming',
    ])
    expect(items[0]?.attributes('aria-current')).toBeUndefined()
    expect(items[1]?.attributes('aria-current')).toBe('step')
  })

  it('marks both previous steps as complete during preview', async () => {
    const wrapper = await mountStepper('preview')
    const items = wrapper.findAll('[data-testid="composer-step"]')

    expect(items.map((item) => item.attributes('data-state'))).toEqual([
      'complete',
      'complete',
      'current',
    ])
    expect(items[2]?.attributes('aria-current')).toBe('step')
  })

  it('exposes the normative accessible label for every step state', async () => {
    const inputWrapper = await mountStepper('input')
    expect(
      inputWrapper
        .findAll('[data-testid="composer-step"]')
        .map((item) => item.attributes('aria-label')),
    ).toEqual([
      'Paso 1 de 3: Idea, actual',
      'Paso 2 de 3: Generación, pendiente',
      'Paso 3 de 3: Vista previa, pendiente',
    ])

    const previewWrapper = await mountStepper('preview')
    expect(
      previewWrapper
        .findAll('[data-testid="composer-step"]')
        .map((item) => item.attributes('aria-label')),
    ).toEqual([
      'Paso 1 de 3: Idea, completado',
      'Paso 2 de 3: Generación, completado',
      'Paso 3 de 3: Vista previa, actual',
    ])
  })

  it('is a passive indicator without interactive elements', async () => {
    const wrapper = await mountStepper('generating')

    expect(wrapper.findAll('a, button, input, select, textarea')).toHaveLength(0)
    expect(wrapper.findAll('[tabindex]')).toHaveLength(0)
  })
})
