// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textContent = (fragment: string) =>
  normalize(fragment.replace(/<[^>]*>/g, ''))

const COPY = {
  badge: 'EN CONSTRUCCIÓN',
  heading: 'Tus ideas, convertidas en shorts.',
  valueProposition:
    'Estamos construyendo la forma más rápida de convertir tus ideas en videos cortos con IA: del concepto al guion, y del guion al video, en minutos.',
  features: ['Idea → guion → video', 'Edición automática', 'Publica en minutos'],
  cta: 'Avísame del lanzamiento',
  helper: 'Próximamente. Abriremos la lista de espera el día del lanzamiento.',
  footer: '© 2026 AI Shorts · Hecho para creadores.',
  title: 'AI Shorts — Próximamente',
  description:
    'Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.',
} as const

await setup({ server: true })

let status = 0
let html = ''

beforeAll(async () => {
  html = await $fetch<string>('/')

  const response = await fetch('/')
  status = response.status
})

describe('GET / (server-rendered route acceptance)', () => {
  it('responds with HTTP 200', () => {
    expect(status).toBe(200)
  })

  it('declares Spanish language metadata on the html element', () => {
    // Nuxt may render extra whitespace/attributes, so match the lang token itself.
    expect(html).toMatch(/<html\b[^>]*\blang="es"/)
  })

  it('renders the exact Spanish title', () => {
    expect(html).toContain(`<title>${COPY.title}</title>`)
  })

  it('renders the exact meta description', () => {
    expect(html).toContain(
      `<meta name="description" content="${COPY.description}">`,
    )
  })

  it('renders the complete normative copy deck', () => {
    const h1Markup = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    expect(h1Markup, 'missing h1').not.toBeNull()
    expect(textContent(h1Markup?.[1] ?? '')).toBe(COPY.heading)

    for (const string of [
      COPY.badge,
      COPY.valueProposition,
      ...COPY.features,
      COPY.cta,
      COPY.helper,
      COPY.footer,
    ]) {
      expect(html, `missing copy: ${string}`).toContain(string)
    }
  })

  it('renders exactly one h1', () => {
    const h1Count = (html.match(/<h1\b/g) ?? []).length
    expect(h1Count).toBe(1)
  })

  it('does not render the old Nuxt welcome content', () => {
    expect(html).not.toContain('¡Tailwind funciona!')
    expect(html).not.toContain('NuxtWelcome')
  })

  it('does not reference external font, image, or icon hosts', () => {
    const tags = html.match(/<(?:link|img|script)\b[^>]*>/gi) ?? []

    for (const tag of tags) {
      const attributePattern = /\b(?:href|src)="([^"]*)"/gi
      let match: RegExpExecArray | null

      while ((match = attributePattern.exec(tag)) !== null) {
        const value = match[1] ?? ''
        expect(value, `external reference in tag: ${tag}`).not.toMatch(
          /^(?:[a-z][a-z\d+.-]*:)?\/\//i,
        )
        expect(value, `external font/image/icon host in tag: ${tag}`).not.toMatch(
          /(?:fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|fontawesome|use\.typekit)/i,
        )
      }
    }
  })
})
