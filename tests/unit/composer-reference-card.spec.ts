import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerReferenceCard from '~/components/composer/ComposerReferenceCard.vue'
import type { ComposerReference } from '~/models/composer'

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

async function mountCard(reference: ComposerReference) {
  return mountSuspended(ComposerReferenceCard, { props: { reference } })
}

describe('ComposerReferenceCard', () => {
  it('renders an image card with a decorative local thumbnail', async () => {
    const wrapper = await mountCard(REFERENCE)
    const card = wrapper.get('[data-testid="composer-reference-card"]')
    const thumbnail = wrapper.get('[data-testid="composer-reference-thumbnail"]')

    expect(card.element.tagName).toBe('LI')
    expect(card.attributes('data-reference-id')).toBe('ref-1')
    expect(card.attributes('data-reference-kind')).toBe('image')
    expect(card.attributes('tabindex')).toBe('-1')
    expect(thumbnail.element.tagName).toBe('IMG')
    expect(thumbnail.attributes('src')).toBe('blob:foto')
    expect(thumbnail.attributes('alt')).toBe('')
    expect(normalize(wrapper.text())).toContain('foto.png')
    expect(normalize(wrapper.text())).toContain('Imagen · 1 KB')
  })

  it('uses a non-video fallback icon when the thumbnail is unavailable', async () => {
    const wrapper = await mountCard({ ...REFERENCE, previewUrl: null })

    expect(wrapper.find('[data-testid="composer-reference-thumbnail"]').exists()).toBe(false)
    expect(wrapper.findAll('svg').length).toBeGreaterThan(0)
    expect(wrapper.findAll('video, audio, iframe')).toHaveLength(0)
    expect(wrapper.findAll('[autoplay], [controls]')).toHaveLength(0)
  })

  it('formats the file size with Spanish decimals and never renders a video', async () => {
    const wrapper = await mountCard({ ...REFERENCE, sizeBytes: 7_864_320 })

    expect(normalize(wrapper.text())).toContain('Imagen · 7,5 MB')
    expect(wrapper.findAll('video')).toHaveLength(0)
  })

  it('wraps long names while keeping the full remove label', async () => {
    const longName = `${'nombre-muy-largo-'.repeat(6)}.png`
    const wrapper = await mountCard({ ...REFERENCE, fileName: longName })
    const name = wrapper.findAll('p')[0]

    expect(normalize(name?.text())).toBe(longName)
    expect(name?.classes()).toContain('break-words')
    expect(name?.classes()).toContain('line-clamp-2')
    expect(wrapper.get('[data-testid="composer-reference-remove"]').attributes('aria-label')).toBe(
      `Eliminar ${longName}`,
    )
  })

  it('renders a 44px remove button with the exact accessible name and emits remove', async () => {
    const wrapper = await mountCard(REFERENCE)
    const remove = wrapper.get('[data-testid="composer-reference-remove"]')

    expect(remove.element.tagName).toBe('BUTTON')
    expect(remove.attributes('type')).toBe('button')
    expect(remove.attributes('aria-label')).toBe('Eliminar foto.png')
    expect(remove.classes()).toContain('size-11')
    expect(normalize(remove.text())).toBe('Eliminar foto.png')

    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })
})
