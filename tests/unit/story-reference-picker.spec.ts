import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryReferencePicker from '~/components/story/StoryReferencePicker.vue'
import type { StoryJobError, StoryReference } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const REFERENCE: StoryReference = {
  fileName: 'actor.webp',
  contentType: 'image/webp',
  sizeBytes: 1_048_576,
  fileUrl: 'https://v3.fal.media/files/test/story-ref.webp',
  expiresAt: '2026-10-21T19:00:00.000Z',
}

const ISSUE: StoryJobError = {
  code: 'reference-too-large',
  message: 'La imagen supera el máximo de 8 MB.',
  retryable: false,
}

async function mountPicker(options: {
  reference?: StoryReference | null
  uploadState?: 'idle' | 'uploading' | 'error'
  issues?: readonly StoryJobError[]
} = {}) {
  return mountSuspended(StoryReferencePicker, {
    attachTo: document.body,
    props: {
      reference: options.reference ?? null,
      uploadState: options.uploadState ?? 'idle',
      issues: options.issues ?? [],
    },
  })
}

describe('StoryReferencePicker', () => {
  it('renders the optional single-image section with exact copy', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.get('[data-testid="story-reference"]').element.tagName).toBe('SECTION')
    expect(normalize(wrapper.get('h3').text())).toBe('Imagen de referencia (opcional)')
    expect(normalize(wrapper.text())).toContain(
      'Una imagen PNG, JPG o WebP de hasta 8 MB. Se usa para el guion y para las imágenes de todas las escenas. Se envía a DeepSeek y a Fal; Fal la elimina en 1 hora.',
    )
  })

  it('renders a single hidden file input with the accepted types', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="story-reference-input"]')

    expect(input.attributes('type')).toBe('file')
    expect(input.attributes('accept')).toBe('image/png,image/jpeg,image/webp')
    expect(input.attributes('tabindex')).toBe('-1')
    expect(input.attributes('aria-label')).toBe('Añadir imagen')
    expect(input.attributes('multiple')).toBeUndefined()
    expect(input.classes()).toContain('sr-only')
  })

  it('renders the add button, counter and empty state', async () => {
    const wrapper = await mountPicker()

    expect(normalize(wrapper.get('[data-testid="story-reference-add"]').text())).toBe(
      'Añadir imagen',
    )
    expect(wrapper.get('[data-testid="story-reference-add"]').attributes('disabled'))
      .toBeUndefined()
    expect(normalize(wrapper.get('[data-testid="story-reference-count"]').text())).toBe('0 de 1')
    expect(normalize(wrapper.get('[data-testid="story-reference-empty"]').text())).toBe(
      'Sin imagen. Puedes crear la historia solo con texto.',
    )
    expect(wrapper.find('[data-testid="story-reference-card"]').exists()).toBe(false)
  })

  it('emits select when a file is chosen', async () => {
    const wrapper = await mountPicker()
    const input = wrapper.get('[data-testid="story-reference-input"]')
    const file = new File([new Uint8Array([1, 2, 3])], 'actor.webp', { type: 'image/webp' })

    Object.defineProperty(input.element, 'files', {
      value: [file],
      configurable: true,
    })
    await input.trigger('change')

    const emitted = wrapper.emitted('select')

    expect(emitted).toHaveLength(1)
    expect((emitted?.[0]?.[0] as File).name).toBe('actor.webp')
  })

  it('renders the reference card with name, size and remove label', async () => {
    const wrapper = await mountPicker({ reference: REFERENCE })
    const card = wrapper.get('[data-testid="story-reference-card"]')

    expect(card.element.tagName).toBe('LI')
    expect(normalize(card.text())).toContain('actor.webp')
    expect(normalize(card.text())).toContain('Imagen · 1 MB')
    expect(normalize(wrapper.get('[data-testid="story-reference-count"]').text())).toBe('1 de 1')
    expect(wrapper.get('[data-testid="story-reference-add"]').attributes('disabled'))
      .toBeDefined()
    expect(normalize(wrapper.text())).toContain(
      'Máximo 1 imagen. Elimina la actual para cambiarla.',
    )
    expect(wrapper.get('[data-testid="story-reference-remove"]').attributes('aria-label'))
      .toBe('Eliminar actor.webp')
    expect(wrapper.find('[data-testid="story-reference-empty"]').exists()).toBe(false)
  })

  it('announces that the image is ready and emits remove', async () => {
    const wrapper = await mountPicker({ reference: REFERENCE })
    const status = wrapper.findAll('[role="status"]').map((node) => normalize(node.text()))

    expect(status).toContain('Imagen lista.')

    await wrapper.get('[data-testid="story-reference-remove"]').trigger('click')

    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('renders the uploading state and disables adding', async () => {
    const wrapper = await mountPicker({ uploadState: 'uploading' })
    const uploading = wrapper.get('[data-testid="story-reference-uploading"]')

    expect(normalize(uploading.text())).toBe('Subiendo imagen…')
    expect(uploading.attributes('role')).toBe('status')
    expect(uploading.attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[data-testid="story-reference-add"]').attributes('disabled'))
      .toBeDefined()
  })

  it('renders issues as an alert with a retry action', async () => {
    const wrapper = await mountPicker({ uploadState: 'error', issues: [ISSUE] })
    const error = wrapper.get('[data-testid="story-reference-error"]')

    expect(error.attributes('role')).toBe('alert')
    expect(normalize(error.text())).toContain(ISSUE.message)
    expect(normalize(wrapper.get('[data-testid="story-reference-retry"]').text())).toBe(
      'Reintentar subida',
    )

    await wrapper.get('[data-testid="story-reference-retry"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('does not show a retry action for a validation issue', async () => {
    const wrapper = await mountPicker({ issues: [ISSUE] })

    expect(wrapper.get('[data-testid="story-reference-error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('[data-testid="story-reference-retry"]').exists()).toBe(false)
  })

  it('keeps 44px targets on add and remove', async () => {
    const wrapper = await mountPicker({ reference: REFERENCE })

    expect(wrapper.get('[data-testid="story-reference-add"]').classes()).toContain('min-h-11')
    expect(wrapper.get('[data-testid="story-reference-remove"]').classes()).toContain('size-11')
  })
})
