import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerReferencePicker from '~/components/composer/ComposerReferencePicker.vue'
import type {
  ComposerReference,
  ComposerValidationIssue,
} from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const IMAGE_REFERENCE: ComposerReference = {
  id: 'ref-1',
  kind: 'image',
  name: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  thumbnailUrl: 'blob:foto',
  durationSeconds: null,
}

function makeFile(name: string, type: string, size = 1024): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

async function mountPicker(
  references: readonly ComposerReference[] = [],
  issues: readonly ComposerValidationIssue[] = [],
  maxReferences = 3,
) {
  return mountSuspended(ComposerReferencePicker, {
    props: { references, issues, maxReferences },
  })
}

async function selectFiles(
  wrapper: Awaited<ReturnType<typeof mountPicker>>,
  files: File[],
) {
  const input = wrapper.get('[data-testid="composer-reference-input"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: files,
  })
  await input.trigger('change')
}

describe('ComposerReferencePicker', () => {
  it('renders the labelled section and normative helper copy', async () => {
    const wrapper = await mountPicker()
    const section = wrapper.get('[data-testid="composer-references"]')
    const heading = wrapper.get('#composer-references-heading')

    expect(section.element.tagName).toBe('SECTION')
    expect(section.attributes('aria-labelledby')).toBe('composer-references-heading')
    expect(normalize(heading.text())).toBe('Referencias (opcional)')
    expect(normalize(wrapper.text())).toContain(
      'Hasta 3 imágenes o vídeos. Se quedan en tu navegador y no se suben.',
    )
  })

  it('exposes the hidden multiple file input with the exact accept list', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="composer-reference-input"]')

    expect(input.element.tagName).toBe('INPUT')
    expect(input.attributes('type')).toBe('file')
    expect(input.attributes('multiple')).toBeDefined()
    expect(input.attributes('accept')).toBe(
      'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime',
    )
    expect(input.attributes('tabindex')).toBe('-1')
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
    expect(normalize(add.text())).toBe('Añadir referencia')
    expect(add.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('0 de 3')
    expect(normalize(wrapper.get('[data-testid="composer-reference-empty"]').text())).toBe(
      'Sin referencias. Puedes generar solo con texto.',
    )
  })

  it('emits all selected files in a single multiple selection and resets the input', async () => {
    const wrapper = await mountPicker()
    const files = [
      makeFile('a.png', 'image/png'),
      makeFile('b.mp4', 'video/mp4'),
      makeFile('c.webp', 'image/webp'),
    ]

    await selectFiles(wrapper, files)

    const emitted = wrapper.emitted('add')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toEqual(files)
    expect(
      (wrapper.get('[data-testid="composer-reference-input"]').element as HTMLInputElement).value,
    ).toBe('')
  })

  it('does not emit add when the user cancels the file picker', async () => {
    const wrapper = await mountPicker()

    await selectFiles(wrapper, [])

    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('disables the add button and shows the limit copy at three references', async () => {
    const references = [
      IMAGE_REFERENCE,
      { ...IMAGE_REFERENCE, id: 'ref-2' as const, name: 'b.png' },
      { ...IMAGE_REFERENCE, id: 'ref-3' as const, name: 'c.png' },
    ]
    const wrapper = await mountPicker(references)
    const add = wrapper.get('[data-testid="composer-reference-add"]')

    expect(add.attributes('disabled')).toBeDefined()
    expect((add.element as HTMLButtonElement).disabled).toBe(true)
    expect(normalize(add.text())).toBe('Añadir referencia')
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('3 de 3')
    expect(normalize(wrapper.text())).toContain(
      'Máximo 3 referencias. Elimina una para añadir otra.',
    )
    expect(wrapper.find('[data-testid="composer-reference-empty"]').exists()).toBe(false)
  })

  it('renders one card per reference and forwards remove events', async () => {
    const wrapper = await mountPicker([IMAGE_REFERENCE])
    const cards = wrapper.findAll('[data-testid="composer-reference-card"]')

    expect(cards).toHaveLength(1)
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('1 de 3')

    await wrapper.get('[data-testid="composer-reference-remove"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['ref-1']])
  })

  it('announces every deduplicated issue in a single alert region', async () => {
    const issues: ComposerValidationIssue[] = [
      {
        code: 'reference-type',
        field: 'references',
        message: 'Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.',
      },
      {
        code: 'reference-too-large',
        field: 'references',
        message: 'La imagen supera el máximo de 8 MB.',
      },
    ]
    const wrapper = await mountPicker([], issues)
    const error = wrapper.get('[data-testid="composer-reference-error"]')

    expect(error.attributes('role')).toBe('alert')
    expect(error.attributes('aria-live')).toBe('assertive')
    expect(normalize(error.text())).toContain(issues[0]!.message)
    expect(normalize(error.text())).toContain(issues[1]!.message)
    expect(error.findAll('p')).toHaveLength(2)
  })

  it('does not render an error region when there are no issues', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.find('[data-testid="composer-reference-error"]').exists()).toBe(false)
  })
})
