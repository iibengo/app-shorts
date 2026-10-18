import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import IndexPage from '~/pages/index.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountPage() {
  return mountSuspended(IndexPage, { route: '/' })
}

describe('landing page accessibility semantics (US3)', () => {
  it('exposes exactly one header, main, and footer landmark', async () => {
    const wrapper = await mountPage()
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.findAll('footer')).toHaveLength(1)
  })

  it('has exactly one h1 and does not skip heading levels', async () => {
    const wrapper = await mountPage()
    const headings = wrapper.findAll('h1, h2, h3, h4, h5, h6')
    const levels = headings.map((heading) =>
      Number(heading.element.tagName.slice(1)),
    )

    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)

    for (let index = 1; index < levels.length; index += 1) {
      expect(
        levels[index],
        `heading order at index ${index} (${levels.join(',')})`,
      ).toBeLessThanOrEqual((levels[index - 1] ?? 0) + 1)
    }
  })

  it('hides every decorative SVG from assistive technology and focus', async () => {
    const wrapper = await mountPage()
    const svgs = wrapper.findAll('svg')
    expect(svgs.length).toBeGreaterThan(0)

    for (const svg of svgs) {
      expect(svg.attributes('aria-hidden')).toBe('true')
      expect(svg.attributes('focusable')).toBe('false')
    }
  })

  it('hides the decorative layer and makes it pointer-events-none', async () => {
    const wrapper = await mountPage()
    const glow = wrapper.get('[data-testid="decorative-glow"]')

    expect(glow.attributes('aria-hidden')).toBe('true')
    expect(glow.classes()).toContain('pointer-events-none')
  })

  it('resolves the CTA description to the helper containing Próximamente', async () => {
    const wrapper = await mountPage()
    const cta = wrapper.get('[data-testid="primary-cta"]')
    const describedBy = cta.attributes('aria-describedby')

    expect(describedBy).toBeTruthy()
    const helper = wrapper.get(`#${describedBy}`)

    expect(helper.exists()).toBe(true)
    expect(normalize(helper.text())).toContain('Próximamente')
  })

  it('marks the CTA disabled both natively and via aria-disabled', async () => {
    const wrapper = await mountPage()
    const cta = wrapper.get('[data-testid="primary-cta"]')

    expect(cta.attributes('disabled')).toBeDefined()
    expect(cta.attributes('aria-disabled')).toBe('true')
  })

  it('only applies animation classes behind motion-safe', async () => {
    const wrapper = await mountPage()
    const elements = [
      wrapper.element,
      ...Array.from(wrapper.element.querySelectorAll('*')),
    ]

    const animatedClasses: string[] = []
    for (const element of elements) {
      const classAttribute = element.getAttribute('class')
      if (!classAttribute) continue

      for (const className of classAttribute.split(/\s+/)) {
        if (className.includes('animate-')) {
          animatedClasses.push(className)
        }
      }
    }

    expect(animatedClasses.length).toBeGreaterThan(0)
    for (const className of animatedClasses) {
      expect(className, `animation class "${className}"`).toMatch(
        /^motion-safe:/,
      )
    }
  })

  it('has no positive tabindex', async () => {
    const wrapper = await mountPage()
    const focusable = wrapper.findAll('[tabindex]')

    for (const element of focusable) {
      expect(Number(element.attributes('tabindex'))).toBeLessThanOrEqual(0)
    }
  })

  it('contains no autoplay, audio, or video content', async () => {
    const wrapper = await mountPage()
    expect(wrapper.findAll('[autoplay]')).toHaveLength(0)
    expect(wrapper.findAll('audio')).toHaveLength(0)
    expect(wrapper.findAll('video')).toHaveLength(0)
  })

  it('does not render the old Nuxt welcome shell', async () => {
    const wrapper = await mountPage()
    const html = wrapper.html()

    expect(html).not.toContain('¡Tailwind funciona!')
    expect(html).not.toContain('NuxtWelcome')
    expect(normalize(wrapper.text())).not.toContain('Welcome to Nuxt')
  })
})
