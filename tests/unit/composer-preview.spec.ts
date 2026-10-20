import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerPreview from '~/components/composer/ComposerPreview.vue'
import { COMPOSER_POSTERS, COMPOSER_TITLES } from '~/data/composer'
import type { GeneratedShortPreview } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const PREVIEW: GeneratedShortPreview = {
  id: 'preview-4f9f2cab-1',
  title: COMPOSER_TITLES[0]!,
  poster: COMPOSER_POSTERS[0]!,
  durationSeconds: 18,
  prompt: 'Un short sobre luz natural\ncon dos líneas',
  referenceCount: 0,
  attempt: 1,
}

async function mountPreview(overrides: Partial<GeneratedShortPreview> = {}) {
  return mountSuspended(ComposerPreview, {
    attachTo: document.body,
    props: { preview: { ...PREVIEW, ...overrides } },
  })
}

describe('ComposerPreview', () => {
  it('renders the SIMULACIÓN badge and the preview heading', async () => {
    const wrapper = await mountPreview()
    const badge = wrapper.get('[data-testid="composer-preview-badge"]')
    const heading = wrapper.get('[data-testid="composer-preview-heading"]')

    expect(normalize(badge.text())).toBe('SIMULACIÓN')
    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Vista previa simulada')
    expect(heading.attributes('tabindex')).toBe('-1')
  })

  it('moves focus to the preview heading when it mounts', async () => {
    const wrapper = await mountPreview()
    const heading = wrapper.get('[data-testid="composer-preview-heading"]')

    expect(document.activeElement).toBe(heading.element)
  })

  it('renders the local poster with intrinsic dimensions and eager decoding', async () => {
    const wrapper = await mountPreview()
    const poster = wrapper.get('[data-testid="composer-preview-poster"]')

    expect(poster.element.tagName).toBe('IMG')
    expect(poster.attributes('src')).toBe('/mock/composer/composer-01.svg')
    expect(poster.attributes('src')).toMatch(/^\/mock\/composer\/composer-0[1-4]\.svg$/)
    expect(poster.attributes('alt')).toBe(
      'Póster simulado abstracto violeta con ondas de luz.',
    )
    expect(poster.attributes('width')).toBe('1080')
    expect(poster.attributes('height')).toBe('1920')
    expect(poster.attributes('loading')).toBe('eager')
    expect(poster.attributes('decoding')).toBe('async')
  })

  it('renders the simulated title, duration and accessible duration label', async () => {
    const wrapper = await mountPreview()
    const duration = wrapper.get('[data-testid="composer-preview-duration"]')
    const labels = wrapper.findAll('dt').map((label) => normalize(label.text()))

    expect(labels).toEqual(['Duración', 'Referencias'])
    expect(normalize(wrapper.find('p.text-xs.uppercase').text())).toBe('Idea original')
    expect(normalize(wrapper.get('[data-testid="composer-preview-title"]').text())).toBe(
      COMPOSER_TITLES[0],
    )
    expect(normalize(duration.text())).toBe('0:18')
    expect(duration.attributes('aria-label')).toBe('Duración: 18 segundos')
  })

  it('formats the reference count for 0, 1, 2 and 3 references', async () => {
    for (const [count, copy] of [
      [0, '0 referencias'],
      [1, '1 referencia'],
      [2, '2 referencias'],
      [3, '3 referencias'],
    ] as const) {
      const wrapper = await mountPreview({ referenceCount: count })
      expect(
        normalize(wrapper.get('[data-testid="composer-preview-references"]').text()),
      ).toBe(copy)
    }
  })

  it('renders the attempt and preserves the original prompt line breaks', async () => {
    const wrapper = await mountPreview({ attempt: 3 })
    const prompt = wrapper.get('[data-testid="composer-preview-prompt"]')

    expect(normalize(wrapper.get('[data-testid="composer-preview-attempt"]').text())).toBe(
      'Intento 3',
    )
    expect(prompt.text()).toBe(PREVIEW.prompt)
    expect(prompt.classes()).toContain('whitespace-pre-wrap')
  })

  it('renders the exact honesty note', async () => {
    const wrapper = await mountPreview()

    expect(normalize(wrapper.get('[data-testid="composer-preview-note"]').text())).toBe(
      'Esta vista previa es ficticia. No se ha generado ningún vídeo, no se ha subido ningún archivo y no se ha publicado nada en el feed.',
    )
  })

  it('renders Regenerar and Editar idea as non-submit buttons that emit', async () => {
    const wrapper = await mountPreview()
    const regenerate = wrapper.get('[data-testid="composer-regenerate"]')
    const edit = wrapper.get('[data-testid="composer-edit"]')

    expect(regenerate.attributes('type')).toBe('button')
    expect(edit.attributes('type')).toBe('button')
    expect(normalize(regenerate.text())).toBe('Regenerar')
    expect(normalize(edit.text())).toBe('Editar idea')

    await regenerate.trigger('click')
    await edit.trigger('click')
    expect(wrapper.emitted('regenerate')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('is terminal: no creator, stats, feed actions, publishing or downloading', async () => {
    const wrapper = await mountPreview()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.findAll('video, audio, iframe')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="short-like"], [data-testid="short-save"], [data-testid="short-share"]')).toHaveLength(0)
    expect(text).not.toContain('@')
    expect(text).not.toMatch(/\b(Me gusta|Guardar|Compartir|Publicar|Descargar)\b/)
    expect(text).not.toMatch(/\b(likes|guardados|creador|handle)\b/i)
    expect(wrapper.findAll('button')).toHaveLength(2)
  })
})
