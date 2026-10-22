import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryCreateForm from '~/components/story/StoryCreateForm.vue'
import type { StoryJobError } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const ISSUE: StoryJobError = {
  code: 'premise-required',
  message: 'Escribe una premisa para crear tu historia.',
  retryable: false,
}

async function mountForm(props: {
  premise?: string
  issue?: StoryJobError | null
  submitDisabled?: boolean
} = {}) {
  return mountSuspended(StoryCreateForm, {
    attachTo: document.body,
    props: {
      premise: props.premise ?? '',
      issue: props.issue ?? null,
      submitDisabled: props.submitDisabled ?? true,
    },
  })
}

describe('StoryCreateForm', () => {
  it('renders a labelled, novalidate form with the exact copy', async () => {
    const wrapper = await mountForm()
    const form = wrapper.get('[data-testid="story-create-form"]')

    expect(form.element.tagName).toBe('FORM')
    expect(form.attributes('novalidate')).toBeDefined()
    expect(normalize(form.get('h2').text())).toBe('Tu historia')
    expect(normalize(wrapper.get('label[for="story-premise-input"]').text())).toBe('Premisa')
    expect(normalize(wrapper.get('[data-testid="story-premise-help"]').text())).toBe(
      'Máximo 600 caracteres.',
    )
    expect(wrapper.get('[data-testid="story-privacy"]').text()).toContain(
      'DeepSeek revisa fotogramas de los clips para comprobar la continuidad.',
    )
    expect(normalize(wrapper.get('[data-testid="story-create"]').text())).toBe('Crear historia')
  })

  it('renders the premise textarea with limits, placeholder and accessibility hooks', async () => {
    const wrapper = await mountForm()
    const textarea = wrapper.get('[data-testid="story-premise"]')

    expect(textarea.element.tagName).toBe('TEXTAREA')
    expect(textarea.attributes('placeholder')).toBe(
      'Una repostera descubre que sus postres pueden predecir el futuro.',
    )
    expect(textarea.attributes('maxlength')).toBe('600')
    expect(textarea.attributes('rows')).toBe('5')
    expect(textarea.attributes('aria-required')).toBe('true')
    expect(textarea.attributes('aria-invalid')).toBeUndefined()
    expect(textarea.attributes('aria-describedby')).toBe('story-premise-help')
    expect(textarea.classes()).toContain('text-base')
    expect(textarea.attributes('id')).toBe('story-premise-input')
  })

  it('renders the character counter with visible and accessible values', async () => {
    const wrapper = await mountForm({ premise: 'Hola' })
    const counter = wrapper.get('[data-testid="story-premise-counter"]')

    expect(normalize(counter.text())).toBe('4/600')
    expect(counter.attributes('aria-label')).toBe('4 de 600 caracteres')
  })

  it('emits update:premise on input', async () => {
    const wrapper = await mountForm()
    const textarea = wrapper.get('[data-testid="story-premise"]')

    await textarea.setValue('Una premisa nueva')

    expect(wrapper.emitted('update:premise')).toEqual([['Una premisa nueva']])
  })

  it('shows the issue as an alert and links it with aria-describedby', async () => {
    const wrapper = await mountForm({ issue: ISSUE })
    const alert = wrapper.get('[data-testid="story-premise-error"]')

    expect(alert.attributes('role')).toBe('alert')
    expect(normalize(alert.text())).toBe(ISSUE.message)
    expect(wrapper.get('[data-testid="story-premise"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[data-testid="story-premise"]').attributes('aria-describedby')).toBe(
      'story-premise-help story-premise-error',
    )
    expect(alert.attributes('id')).toBe('story-premise-error')
  })

  it('disables the submit button while requested', async () => {
    const wrapper = await mountForm({ submitDisabled: true })
    const button = wrapper.get('[data-testid="story-create"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('type')).toBe('submit')
  })

  it('emits submit and enables the button with a valid premise', async () => {
    const wrapper = await mountForm({ premise: 'Una premisa válida', submitDisabled: false })
    const button = wrapper.get('[data-testid="story-create"]')

    expect(button.attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-testid="story-create-form"]').trigger('submit')

    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('focuses the premise through the exposed method', async () => {
    const wrapper = await mountForm()

    wrapper.vm.focusPremise()

    expect(document.activeElement).toBe(wrapper.get('[data-testid="story-premise"]').element)
  })

  it('renders the 008 and reference slots', async () => {
    const wrapper = await mountSuspended(StoryCreateForm, {
      attachTo: document.body,
      props: { premise: '', issue: null, submitDisabled: true },
      slots: {
        mode: '<div data-testid="slot-mode">modo</div>',
        platform: '<div data-testid="slot-platform">plataforma</div>',
        costMode: '<div data-testid="slot-cost-mode">coste</div>',
        duration: '<div data-testid="slot-duration">duración</div>',
        preset: '<div data-testid="slot-preset">preset</div>',
        reference: '<div data-testid="slot-reference">referencia</div>',
      },
    })

    expect(
      wrapper.findAll('[data-testid^="slot-"]').map((slot) => slot.attributes('data-testid')),
    ).toEqual([
      'slot-mode',
      'slot-platform',
      'slot-cost-mode',
      'slot-duration',
      'slot-preset',
      'slot-reference',
    ])
  })

  it('exposes no free model, endpoint, duration or advanced field', async () => {
    const wrapper = await mountForm()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(wrapper.findAll('input[type="text"], input[type="number"]')).toHaveLength(0)
    expect(text).not.toMatch(/\bEndpoint\b|\bAspect ratio\b|\bResolución\b|\bSemilla\b/)
    expect(text).not.toMatch(/fal-ai\/|fal\.media/)
  })
})
