import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerPage from '~/pages/composer.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPage() {
  return mountSuspended(ComposerPage, { route: '/composer', attachTo: document.body })
}

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

async function submitPrompt(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  prompt: string,
) {
  await wrapper.get('[data-testid="composer-prompt-input"]').setValue(prompt)
  await wrapper.get('[data-testid="composer-form"]').trigger('submit')
  await nextTick()
}

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('composer page initial render', () => {
  it('renders the idle page with a single h1, stepper and form', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="composer-page"]').exists()).toBe(true)
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(normalize(wrapper.get('[data-testid="composer-h1"]').text())).toBe(
      'Crea un short de prueba',
    )
    expect(normalize(wrapper.get('[data-testid="composer-intro"]').text())).toBe(
      'Describe una idea, añade referencias opcionales y genera una vista previa simulada. No se crea ni se publica ningún vídeo real.',
    )
    expect(wrapper.get('[data-testid="composer-stepper"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-prompt-input"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-reference-add"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-generate"]').exists()).toBe(true)

    const currentStep = wrapper.findAll('[data-testid="composer-step"]')[0]
    expect(currentStep?.attributes('data-step')).toBe('input')
    expect(currentStep?.attributes('data-state')).toBe('current')

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-preview"]').exists()).toBe(false)
  })

  it('renders the no-JS notice in the markup', async () => {
    const wrapper = await mountPage()
    const html = wrapper.html()

    expect(html).toContain('data-testid="composer-nojs-notice"')
    expect(html).toContain(
      'El estudio de creación necesita JavaScript para generar la vista previa simulada. Puedes volver al feed de prueba.',
    )
  })

  it('does not render publication, download or sharing actions', async () => {
    const wrapper = await mountPage()
    const text = normalize(wrapper.text())

    expect(text).not.toMatch(/\b(Publicar|Descargar|Compartir)\b/)
    expect(wrapper.findAll('a')).toHaveLength(1)
  })
})

describe('composer page prompt validation', () => {
  it('announces the required error, focuses the prompt and does not generate', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="composer-form"]').trigger('submit')
    await nextTick()

    const error = wrapper.get('[data-testid="composer-prompt-error"]')
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    expect(normalize(error.text())).toBe('Escribe una idea para generar tu short.')
    expect(error.attributes('role')).toBe('alert')
    expect(textarea.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(textarea.element)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
  })
})

describe('composer page generation flow', () => {
  it('runs the full simulated flow and moves focus between headings', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Un short sobre luz natural')

    expect(wrapper.find('[data-testid="composer-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Analizando tu idea',
    )
    expect(wrapper.get('[data-testid="composer-generation-progress"]').attributes('aria-valuenow')).toBe(
      '15',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )
    expect(normalize(wrapper.get('[data-testid="composer-status"]').text())).toBe('')

    vi.advanceTimersByTime(800)
    await nextTick()
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Componiendo la escena',
    )
    expect(wrapper.get('[data-testid="composer-generation-progress"]').attributes('aria-valuenow')).toBe(
      '50',
    )

    vi.advanceTimersByTime(800)
    await nextTick()
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Preparando la vista previa',
    )
    expect(wrapper.get('[data-testid="composer-generation-progress"]').attributes('aria-valuenow')).toBe(
      '80',
    )

    vi.advanceTimersByTime(800)
    await nextTick()

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-preview"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-preview-badge"]').text()).toBe('SIMULACIÓN')
    expect(normalize(wrapper.get('[data-testid="composer-preview-prompt"]').text())).toBe(
      'Un short sobre luz natural',
    )
    expect(normalize(wrapper.get('[data-testid="composer-preview-references"]').text())).toBe(
      '0 referencias',
    )
    expect(normalize(wrapper.get('[data-testid="composer-preview-attempt"]').text())).toBe(
      'Intento 1',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-preview-heading"]').element,
    )
    expect(normalize(wrapper.get('[data-testid="composer-status"]').text())).toBe(
      'Vista previa lista.',
    )
    expect(wrapper.get('[data-testid="composer-preview-note"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="composer-regenerate"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="composer-edit"]')).toHaveLength(1)
  })

  it('does not duplicate a generation on a double submit', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()
    const form = wrapper.get('[data-testid="composer-form"]')

    await wrapper.get('[data-testid="composer-prompt-input"]').setValue('Idea única')
    await form.trigger('submit')
    await form.trigger('submit')
    await nextTick()

    vi.advanceTimersByTime(2400)
    await nextTick()

    expect(wrapper.findAll('[data-testid="composer-preview"]')).toHaveLength(1)
    expect(normalize(wrapper.get('[data-testid="composer-preview-attempt"]').text())).toBe(
      'Intento 1',
    )
  })

  it('cancels, preserves the draft and returns focus to the prompt', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    await submitPrompt(wrapper, 'Borrador que se conserva')
    vi.advanceTimersByTime(800)
    await nextTick()

    await wrapper.get('[data-testid="composer-cancel"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('Borrador que se conserva')
    expect(normalize(wrapper.get('[data-testid="composer-status"]').text())).toBe(
      'Generación cancelada.',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-prompt-input"]').element,
    )

    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(wrapper.find('[data-testid="composer-preview"]').exists()).toBe(false)
    expect(textarea.exists()).toBe(true)
  })

  it('edits from the preview preserving the draft and focus', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea para editar')
    vi.advanceTimersByTime(2400)
    await nextTick()

    await wrapper.get('[data-testid="composer-edit"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="composer-preview"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('Idea para editar')
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-prompt-input"]').element,
    )
  })

  it('regenerates with attempt 2 and a different poster', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea para regenerar')
    vi.advanceTimersByTime(2400)
    await nextTick()

    const firstPoster = wrapper
      .get('[data-testid="composer-preview-poster"]')
      .attributes('src')

    await wrapper.get('[data-testid="composer-regenerate"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )

    vi.advanceTimersByTime(2400)
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-preview-attempt"]').text())).toBe(
      'Intento 2',
    )
    expect(
      wrapper.get('[data-testid="composer-preview-poster"]').attributes('src'),
    ).not.toBe(firstPoster)
  })

  it('counts references in the preview and never renders media playback', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (file: Blob) => `blob:mock/${(file as File).name}`,
    )
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const wrapper = await mountPage()
    vi.useFakeTimers()

    const input = wrapper.get('[data-testid="composer-reference-input"]')
    const files = [
      makeFile('foto.png', 'image/png', 1024),
      makeFile('clip.mp4', 'video/mp4', 4096),
    ]
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: files,
    })
    await input.trigger('change')
    await nextTick()

    expect(wrapper.findAll('[data-testid="composer-reference-card"]')).toHaveLength(2)
    expect(wrapper.findAll('video, audio, iframe')).toHaveLength(0)

    await submitPrompt(wrapper, 'Idea con referencias')
    vi.advanceTimersByTime(2400)
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-preview-references"]').text())).toBe(
      '2 referencias',
    )
    expect(wrapper.findAll('video, audio, iframe')).toHaveLength(0)
  })
})
