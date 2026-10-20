import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerHeader from '~/components/composer/ComposerHeader.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const BETA_EXPLANATION =
  'BETA. La generación de vídeo con IA es real, consume créditos y puede tardar varios minutos.'

describe('ComposerHeader', () => {
  it('renders the header landmark and the shared brand mark', async () => {
    const wrapper = await mountSuspended(ComposerHeader)

    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.get('[data-testid="composer-header"]').element.tagName).toBe('HEADER')
    expect(normalize(wrapper.get('[data-testid="brand-mark"]').text())).toContain('AI Shorts')
  })

  it('renders the BETA badge with the exact accessible explanation', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const badge = wrapper.get('[data-testid="composer-beta-badge"]')

    expect(normalize(badge.text())).toBe('BETA')
    expect(badge.attributes('aria-label')).toBe(BETA_EXPLANATION)
    expect(badge.attributes('role')).toBe('note')
  })

  it('renders Volver al feed as a real link to /feed', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const link = wrapper.get('[data-testid="composer-back-link"]')

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('/feed')
    expect(normalize(link.text())).toBe('Volver al feed')
    expect(link.attributes('type')).toBeUndefined()
  })

  it('does not render DEMO, simulation, generation controls or dialogs', async () => {
    const wrapper = await mountSuspended(ComposerHeader)
    const html = wrapper.html()

    expect(wrapper.find('[data-testid="composer-demo-badge"]').exists()).toBe(false)
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0)
    expect(html).not.toContain('DEMO')
    expect(html).not.toContain('SIMULACIÓN')
    expect(html).not.toContain('Generar vídeo')
    expect(html).not.toContain('Próximamente')
    expect(wrapper.findAll('a')).toHaveLength(1)
  })
})
