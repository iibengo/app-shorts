import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerReferenceCard from '~/components/composer/ComposerReferenceCard.vue'
import type { ComposerReference } from '~/models/composer'

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

const VIDEO_REFERENCE: ComposerReference = {
  id: 'ref-2',
  kind: 'video',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  sizeBytes: 5_242_880,
  thumbnailUrl: null,
  durationSeconds: null,
}

async function mountCard(reference: ComposerReference) {
  return mountSuspended(ComposerReferenceCard, { props: { reference } })
}

describe('ComposerReferenceCard', () => {
  it('renders an image card with a decorative local thumbnail', async () => {
    const wrapper = await mountCard(IMAGE_REFERENCE)
    const card = wrapper.get('[data-testid="composer-reference-card"]')
    const thumbnail = wrapper.get('[data-testid="composer-reference-thumbnail"]')

    expect(card.element.tagName).toBe('LI')
    expect(card.attributes('data-reference-id')).toBe('ref-1')
    expect(card.attributes('data-reference-kind')).toBe('image')
    expect(thumbnail.element.tagName).toBe('IMG')
    expect(thumbnail.attributes('src')).toBe('blob:foto')
    expect(thumbnail.attributes('alt')).toBe('')
    expect(normalize(wrapper.text())).toContain('foto.png')
    expect(normalize(wrapper.text())).toContain('Imagen · 1 KB')
  })

  it('renders a video card without any video element or playback', async () => {
    const wrapper = await mountCard(VIDEO_REFERENCE)

    expect(wrapper.findAll('video')).toHaveLength(0)
    expect(wrapper.findAll('audio')).toHaveLength(0)
    expect(wrapper.findAll('[autoplay]')).toHaveLength(0)
    expect(wrapper.findAll('[controls]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="composer-reference-thumbnail"]').exists()).toBe(false)
    expect(normalize(wrapper.text())).toContain('clip.mp4')
    expect(normalize(wrapper.text())).toContain('Vídeo · 5 MB')
  })

  it('falls back to a generic icon when an image has no thumbnail URL', async () => {
    const wrapper = await mountCard({ ...IMAGE_REFERENCE, thumbnailUrl: null })

    expect(wrapper.find('[data-testid="composer-reference-thumbnail"]').exists()).toBe(false)
    expect(wrapper.findAll('svg').length).toBeGreaterThan(0)
    expect(normalize(wrapper.text())).toContain('Imagen')
  })

  it('wraps long names while keeping the full remove label', async () => {
    const longName = `${'nombre-muy-largo-'.repeat(6)}.png`
    const wrapper = await mountCard({ ...IMAGE_REFERENCE, name: longName })
    const name = wrapper.findAll('p')[0]

    expect(normalize(name?.text())).toBe(longName)
    expect(name?.classes()).toContain('break-words')
    expect(name?.classes()).toContain('line-clamp-2')
    expect(wrapper.get('[data-testid="composer-reference-remove"]').attributes('aria-label')).toBe(
      `Eliminar ${longName}`,
    )
  })

  it('renders a 44px remove button with the exact accessible name and emits remove', async () => {
    const wrapper = await mountCard(IMAGE_REFERENCE)
    const remove = wrapper.get('[data-testid="composer-reference-remove"]')

    expect(remove.element.tagName).toBe('BUTTON')
    expect(remove.attributes('type')).toBe('button')
    expect(remove.attributes('aria-label')).toBe('Eliminar foto.png')
    expect(remove.classes()).toContain('size-11')
    expect(normalize(remove.text())).toBe('Eliminar foto.png')

    await remove.trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['ref-1']])
  })
})
