import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'

const COPY = {
  brand: 'AI Shorts',
  badge: 'EN CONSTRUCCIÓN',
  heading: 'Tus ideas, convertidas en shorts.',
  valueProposition:
    'Estamos construyendo la forma más rápida de convertir tus ideas en videos cortos con IA: del concepto al guion, y del guion al video, en minutos.',
  features: ['Idea → guion → video', 'Edición automática', 'Publica en minutos'],
  cta: 'Avísame del lanzamiento',
  ctaHelperPrefix: 'Próximamente',
  footer: '© 2026 AI Shorts · Hecho para creadores.',
} as const

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPage() {
  return mountSuspended(IndexPage, { route: '/' })
}

describe('landing page content contract (US1)', () => {
  it('renders the landing page root', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="landing-page"]').exists()).toBe(true)
  })

  it('renders the brand mark with the AI Shorts wordmark', async () => {
    const wrapper = await mountPage()
    const brandMark = wrapper.get('[data-testid="brand-mark"]')
    expect(normalize(brandMark.text())).toContain(COPY.brand)
    // The brand is typographic; the mark is an inline SVG, never an external asset.
    expect(brandMark.find('img').exists()).toBe(false)
  })

  it('renders the construction badge with exactly EN CONSTRUCCIÓN', async () => {
    const wrapper = await mountPage()
    const badge = wrapper.get('[data-testid="construction-badge"]')
    expect(normalize(badge.text())).toBe(COPY.badge)
  })

  it('renders exactly one h1 with the normative headline', async () => {
    const wrapper = await mountPage()
    const headings = wrapper.findAll('h1')
    expect(headings).toHaveLength(1)
    const heading = wrapper.get('[data-testid="hero-heading"]')
    expect(heading.element.tagName).toBe('H1')
    expect(normalize(heading.text())).toBe(COPY.heading)
  })

  it('renders the exact normative value proposition', async () => {
    const wrapper = await mountPage()
    const valueProposition = wrapper.get('[data-testid="value-proposition"]')
    expect(normalize(valueProposition.text())).toBe(COPY.valueProposition)
    expect(normalize(valueProposition.text())).toContain('videos cortos con IA')
  })

  it('renders exactly three feature hints in order', async () => {
    const wrapper = await mountPage()
    const items = wrapper.get('[data-testid="feature-list"]').findAll('li')
    expect(items).toHaveLength(3)
    expect(items.map((item) => normalize(item.text()))).toEqual([...COPY.features])
  })

  it('renders the CTA as a natively disabled, described button', async () => {
    const wrapper = await mountPage()
    const cta = wrapper.get('[data-testid="primary-cta"]')

    expect(cta.element.tagName).toBe('BUTTON')
    expect(normalize(cta.text())).toBe(COPY.cta)
    expect(cta.element.hasAttribute('disabled')).toBe(true)
    expect((cta.element as HTMLButtonElement).disabled).toBe(true)
    expect(cta.attributes('aria-disabled')).toBe('true')
    expect(cta.attributes('aria-describedby')).toBe('cta-helper')
    expect(cta.attributes('href')).toBeUndefined()
    expect(cta.element.closest('form')).toBeNull()
  })

  it('renders the CTA helper with the expected id and prefix', async () => {
    const wrapper = await mountPage()
    const helper = wrapper.get('[data-testid="cta-helper"]')
    expect(helper.attributes('id')).toBe('cta-helper')
    expect(normalize(helper.text())).toContain(COPY.ctaHelperPrefix)
    expect(normalize(helper.text()).startsWith(COPY.ctaHelperPrefix)).toBe(true)
  })

  it('renders the exact footer copyright line', async () => {
    const wrapper = await mountPage()
    const footer = wrapper.get('[data-testid="site-footer"]')
    expect(normalize(footer.text())).toBe(COPY.footer)
  })

  it('contains no fake-claim markers', async () => {
    const wrapper = await mountPage()
    const text = normalize(wrapper.text())

    const forbidden = [
      /Iniciar sesión/i,
      /Registrarse/i,
      /Precio/i,
      /€/,
      /testimonio/i,
      /valoración/i,
      /\+\s*\d+\s*(usuarios|creadores|descargas)/i,
      /\d+\s*(usuarios|creadores|descargas)/i,
    ]

    for (const pattern of forbidden) {
      expect(text, `forbidden fake-claim marker ${pattern}`).not.toMatch(pattern)
    }
  })

  it('contains no images, links, or external src/href references', async () => {
    const wrapper = await mountPage()

    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.findAll('a')).toHaveLength(0)

    const referenced = wrapper.findAll('[src], [href]')
    for (const element of referenced) {
      for (const attribute of ['src', 'href']) {
        const value = element.attributes(attribute)
        if (value !== undefined) {
          expect(value, `${element.element.tagName} ${attribute}`).not.toMatch(
            /^(?:[a-z][a-z\d+.-]*:)?\/\//i,
          )
        }
      }
    }
  })

  it('hides the decorative glow layer from assistive technology', async () => {
    const wrapper = await mountPage()
    const glow = wrapper.get('[data-testid="decorative-glow"]')
    expect(glow.attributes('aria-hidden')).toBe('true')
  })
})
