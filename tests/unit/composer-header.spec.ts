import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerHeader from '~/components/composer/ComposerHeader.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('ComposerHeader', () => {
  it('renders the feed header landmark and the shared brand mark', async () => {
    const wrapper = await mountSuspended(ComposerHeader)

    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.get('[data-testid="composer-header"]').element.tagName).toBe('HEADER')
    expect(normalize(wrapper.get('[data-testid="brand-mark"]').text())).toContain('AI Shorts')
  })

  it('renders the DEMO badge with the exact normative explanation', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const badge = wrapper.get('[data-testid="composer-demo-badge"]')

    expect(badge.text()).toBe('DEMO')
    expect(badge.attributes('aria-label')).toBe(
      'DEMO. El estudio de creación es una simulación: no se crea ni se publica ningún vídeo real y los archivos no se suben.',
    )
  })

  it('renders Volver al feed as a real link to /feed', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const link = wrapper.get('[data-testid="composer-back-link"]')

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('/feed')
    expect(normalize(link.text())).toBe('Volver al feed')
    expect(link.attributes('type')).toBeUndefined()
  })

  it('does not render generation controls, dialogs or dead links', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const html = wrapper.html()

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0)
    expect(html).not.toContain('Generar short')
    expect(html).not.toContain('Próximamente')
    expect(wrapper.findAll('a')).toHaveLength(1)
  })
})
