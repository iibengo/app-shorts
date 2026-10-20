import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerPromptForm from '~/components/composer/ComposerPromptForm.vue'
import type { ComposerValidationIssue } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const PROMPT_ERROR: ComposerValidationIssue = {
  code: 'prompt-required',
  field: 'prompt',
  message: 'Escribe una idea para generar tu short.',
}

async function mountForm(
  prompt = '',
  promptIssue: ComposerValidationIssue | null = null,
  submitDisabled = false,
) {
  return mountSuspended(ComposerPromptForm, {
    attachTo: document.body,
    props: { prompt, promptIssue, submitDisabled },
    slots: {
      preset: '<div data-testid="preset-slot">Preset</div>',
      reference: '<div data-testid="reference-slot">Referencia</div>',
      settings: '<div data-testid="settings-slot">Ajustes</div>',
    },
  })
}

describe('ComposerPromptForm', () => {
  it('renders a labelled form with the normative prompt copy', async () => {
    const wrapper = await mountForm()
    const form = wrapper.get('[data-testid="composer-form"]')
    const label = wrapper.get('label')
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    expect(form.element.tagName).toBe('FORM')
    expect(form.attributes('novalidate')).toBeDefined()
    expect(normalize(wrapper.get('h2').text())).toBe('Tu idea')
    expect(normalize(label.text())).toBe('Describe tu idea')
    expect(label.attributes('for')).toBe(textarea.attributes('id'))
    expect(textarea.attributes('id')).toBe('composer-prompt-input')
    expect(textarea.attributes('placeholder')).toBe(
      'Un short sobre cómo preparar tu primer set de grabación.',
    )
  })

  it('declares maxlength, required semantics and the help text', async () => {
    const wrapper = await mountForm()
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')
    const help = wrapper.get('[data-testid="composer-prompt-help"]')

    expect(textarea.attributes('maxlength')).toBe('280')
    expect(textarea.attributes('aria-required')).toBe('true')
    expect(textarea.attributes('required')).toBeUndefined()
    expect(textarea.attributes('aria-invalid')).toBeUndefined()
    expect(textarea.attributes('aria-describedby')).toBe('composer-prompt-help')
    expect(help.attributes('id')).toBe('composer-prompt-help')
    expect(normalize(help.text())).toBe('Máximo 280 caracteres.')
  })

  it('renders the visible and accessible character counter', async () => {
    const wrapper = await mountForm('Hola')
    const counter = wrapper.get('[data-testid="composer-prompt-counter"]')

    expect(counter.text()).toBe('4/280')
    expect(counter.attributes('aria-label')).toBe('4 de 280 caracteres')
  })

  it('shows the prompt issue exactly once with alert semantics and wiring', async () => {
    const wrapper = await mountForm('', PROMPT_ERROR)
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')
    const error = wrapper.get('[data-testid="composer-prompt-error"]')

    expect(error.attributes('role')).toBe('alert')
    expect(error.attributes('id')).toBe('composer-prompt-error')
    expect(normalize(error.text())).toBe(PROMPT_ERROR.message)
    expect(textarea.attributes('aria-invalid')).toBe('true')
    expect(textarea.attributes('aria-describedby')).toBe(
      'composer-prompt-help composer-prompt-error',
    )
    expect(wrapper.findAll('[data-testid="composer-prompt-error"]')).toHaveLength(1)
  })

  it('emits update:prompt on every input event', async () => {
    const wrapper = await mountForm()
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    await textarea.setValue('Una idea')
    expect(wrapper.emitted('update:prompt')).toEqual([['Una idea']])

    await textarea.setValue('Otra idea')
    expect(wrapper.emitted('update:prompt')).toEqual([['Una idea'], ['Otra idea']])
  })

  it('emits submit from the native form submission', async () => {
    const wrapper = await mountForm('Una idea')

    await wrapper.get('[data-testid="composer-form"]').trigger('submit')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('update:prompt')).toBeUndefined()
  })

  it('renders Generar vídeo as the only submit control', async () => {
    const wrapper = await mountForm('Una idea')
    const buttons = wrapper.findAll('button')

    expect(buttons).toHaveLength(1)
    expect(normalize(buttons[0]?.text())).toBe('Generar vídeo')
    expect(buttons[0]?.attributes('type')).toBe('submit')
    expect(buttons[0]?.attributes('data-testid')).toBe('composer-generate')
  })

  it('disables the submit button while uploading or offline', async () => {
    const wrapper = await mountForm('Una idea', null, true)
    const button = wrapper.get('[data-testid="composer-generate"]')

    expect(button.attributes('disabled')).toBeDefined()
  })

  it('exposes focusPrompt() and moves the focus to the textarea', async () => {
    const wrapper = await mountForm()
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    expect(typeof (wrapper.vm as unknown as { focusPrompt?: unknown }).focusPrompt).toBe(
      'function',
    )

    ;(wrapper.vm as unknown as { focusPrompt: () => void }).focusPrompt()
    expect(document.activeElement).toBe(textarea.element)
  })

  it('renders the preset, reference and settings slots', async () => {
    const wrapper = await mountForm()

    expect(wrapper.get('[data-testid="preset-slot"]').text()).toBe('Preset')
    expect(wrapper.get('[data-testid="reference-slot"]').text()).toBe('Referencia')
    expect(wrapper.get('[data-testid="settings-slot"]').text()).toBe('Ajustes')
  })

  it('keeps free model, endpoint and aspect-ratio configuration out of the form', async () => {
    const wrapper = await mountForm('Una idea')
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(text).not.toMatch(/\bSiguiente\b|\bContinuar\b|\bModelo\b|\bEstilo\b/)
    expect(text).not.toMatch(/\bAspect ratio\b|\bResolución\b|\bSemilla\b|\bEndpoint\b/)
  })
})
