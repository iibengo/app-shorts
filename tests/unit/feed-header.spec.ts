import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FeedHeader from '~/components/shorts/FeedHeader.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('FeedHeader regression', () => {
  it('renders the brand, DEMO badge and accessible explanation', async () => {
    const wrapper = await mountSuspended(FeedHeader)

    expect(normalize(wrapper.get('[data-testid="brand-mark"]').text())).toContain('AI Shorts')

    const badge = wrapper.get('[data-testid="demo-badge"]')
    expect(badge.text()).toBe('DEMO')
    expect(badge.attributes('aria-label')).toBe(
      'DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.',
    )
  })

  it('renders the CTA as a link to /composer with the exact label', async () => {
    const wrapper = await mountSuspended(FeedHeader)
    const cta = wrapper.get('[data-testid="feed-cta"]')

    expect(cta.element.tagName).toBe('A')
    expect(cta.attributes('href')).toBe('/composer')
    expect(normalize(cta.text())).toBe('Crear short')
    expect(cta.attributes('type')).toBeUndefined()
  })

  it('does not expose the retired dialog contract', async () => {
    const wrapper = await mountSuspended(FeedHeader)
    const html = wrapper.html()

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('[data-testid="feed-cta"]').attributes('aria-haspopup')).toBeUndefined()
    expect(html).not.toContain('Próximamente')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('notice-')
    expect(wrapper.emitted()).toEqual({})
  })

  it('keeps exactly one navigation link and no dead destinations', async () => {
    const wrapper = await mountSuspended(FeedHeader)
    const links = wrapper.findAll('a')

    expect(links).toHaveLength(1)
    expect(links[0]?.attributes('href')).toBe('/composer')
  })
})
