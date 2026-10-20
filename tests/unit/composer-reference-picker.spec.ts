import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerReferencePicker from '~/components/composer/ComposerReferencePicker.vue'
import type {
  ComposerReference,
  ComposerValidationIssue,
} from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const REFERENCE: ComposerReference = {
  id: 'ref-1',
  fileName: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 1_024,
  fileUrl: 'https://v3.fal.media/files/test/foto.png',
  previewUrl: 'blob:foto',
  width: null,
  height: null,
  expiresAt: '2026-10-21T19:00:00.000Z',
}

function makeFile(name: string, type: string, size = 1_024): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

async function mountPicker(
  reference: ComposerReference | null = null,
  uploadState: 'idle' | 'uploading' | 'error' = 'idle',
  issues: readonly ComposerValidationIssue[] = [],
) {
  return mountSuspended(ComposerReferencePicker, {
    props: { reference, uploadState, issues },
  })
}

describe('ComposerReferencePicker', () => {
  it('renders the labelled section and normative helper copy', async () => {
    const wrapper = await mountPicker()
    const section = wrapper.get('[data-testid="composer-reference"]')
    const heading = wrapper.get('#composer-reference-heading')

    expect(section.element.tagName).toBe('SECTION')
    expect(section.attributes('aria-labelledby')).toBe('composer-reference-heading')
    expect(normalize(heading.text())).toBe('Imagen de referencia (opcional)')
    expect(normalize(wrapper.text())).toContain(
      'Una imagen PNG, JPG o WebP de hasta 8 MB. Se envía a Fal para generar el vídeo y se elimina en 1 hora.',
    )
  })

  it('exposes the hidden single file input with the exact accept list', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="composer-reference-input"]')

    expect(input.element.tagName).toBe('INPUT')
    expect(input.attributes('type')).toBe('file')
    expect(input.attributes('multiple')).toBeUndefined()
    expect(input.attributes('accept')).toBe('image/png,image/jpeg,image/webp')
    expect(input.attributes('tabindex')).toBe('-1')
    expect(input.attributes('aria-label')).toBe('Añadir imagen')
    expect(input.classes()).toContain('sr-only')
  })

  it('opens the native file picker through the visible button', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="composer-reference-input"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click')

    await wrapper.get('[data-testid="composer-reference-add"]').trigger('click')

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('renders the add button, count and empty state', async () => {
    const wrapper = await mountPicker()
    const add = wrapper.get('[data-testid="composer-reference-add"]')

    expect(add.element.tagName).toBe('BUTTON')
    expect(add.attributes('type')).toBe('button')
    expect(normalize(add.text())).toBe('Añadir imagen')
    expect(add.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('0 de 1')
    expect(normalize(wrapper.get('[data-testid="composer-reference-empty"]').text())).toBe(
      'Sin imagen. Puedes generar solo con texto.',
    )
  })

  it('emits only the first selected file and resets the input', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="composer-reference-input"]')
    const files = [
      makeFile('a.png', 'image/png'),
      makeFile('b.webp', 'image/webp'),
    ]
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: files,
    })

    await input.trigger('change')

    const emitted = wrapper.emitted('select')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toBe(files[0])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('does not emit when the user cancels the file picker', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="composer-reference-input"]')

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [],
    })
    await input.trigger('change')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('disables add when a reference exists and keeps the one-image limit copy', async () => {
    const wrapper = await mountPicker(REFERENCE)
    const add = wrapper.get('[data-testid="composer-reference-add"]')

    expect(add.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('1 de 1')
    expect(normalize(wrapper.text())).toContain(
      'Máximo 1 imagen. Elimina la actual para cambiarla.',
    )
    expect(wrapper.find('[data-testid="composer-reference-empty"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="composer-reference-card"]')).toHaveLength(1)
  })

  it('forwards remove from the card', async () => {
    const wrapper = await mountPicker(REFERENCE)

    await wrapper.get('[data-testid="composer-reference-remove"]').trigger('click')

    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('announces uploading with a polite status and disables add', async () => {
    const wrapper = await mountPicker(null, 'uploading')
    const uploading = wrapper.get('[data-testid="composer-reference-uploading"]')

    expect(uploading.attributes('role')).toBe('status')
    expect(uploading.attributes('aria-live')).toBe('polite')
    expect(normalize(uploading.text())).toBe('Subiendo imagen…')
    expect(wrapper.get('[data-testid="composer-reference-add"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="composer-reference-empty"]').exists()).toBe(false)
  })

  it('announces a ready image without stealing focus', async () => {
    const wrapper = await mountPicker(REFERENCE)
    const status = wrapper.findAll('[role="status"]')
      .find((node) => normalize(node.text()) === 'Imagen lista.')

    expect(status?.attributes('aria-live')).toBe('polite')
  })

  it('renders validation issues and the upload error in a single alert with retry', async () => {
    const issues: ComposerValidationIssue[] = [
      {
        code: 'unsupported-reference-type',
        field: 'reference',
        message: 'Formato no admitido. Usa PNG, JPG o WebP.',
      },
    ]
    const wrapper = await mountPicker(null, 'error', issues)
    const error = wrapper.get('[data-testid="composer-reference-error"]')

    expect(error.attributes('role')).toBe('alert')
    expect(normalize(error.text())).toContain(issues[0]!.message)
    expect(normalize(error.text())).toContain('No se pudo subir la imagen. Inténtalo de nuevo.')
    expect(wrapper.get('[data-testid="composer-reference-retry"]').attributes('type')).toBe('button')

    await wrapper.get('[data-testid="composer-reference-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('does not render an error region when there are no issues', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.find('[data-testid="composer-reference-error"]').exists()).toBe(false)
  })
})
