// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textContent = (fragment: string) =>
  normalize(fragment.replace(/<[^>]*>/g, ''))

const TITLES = [
  'Tu primera idea en un short',
  'De idea a guion en 60 segundos',
  'El encuadre que arruina tu vertical',
  'Ilumina tu set con una lámpara',
  'Ritmo y corte en tres pasos',
  'Publica con intención, no por inercia',
] as const

await setup({ server: true })

let status = 0
let html = ''

beforeAll(async () => {
  html = await $fetch<string>('/feed')
  const response = await fetch('/feed')
  status = response.status
})

describe('GET /feed (regression acceptance)', () => {
  it('responds with HTTP 200 and keeps the feed metadata', () => {
    expect(status).toBe(200)
    expect(html).toMatch(/<html\b[^>]*\blang="es"/)
    expect(html).toContain('<title>AI Shorts — Feed de prueba</title>')
    expect(html).toContain(
      '<meta name="description" content="Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación simulado.">',
    )
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  it('renders exactly one h1 with the feed headline', () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1)

    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    expect(h1, 'missing h1').not.toBeNull()
    expect(textContent(h1?.[1] ?? '')).toBe('Feed de shorts de prueba')
  })

  it('renders the six fixture shorts in order', () => {
    expect((html.match(/data-testid="short-card"/g) ?? []).length).toBe(6)

    let lastIndex = -1
    for (const title of TITLES) {
      const index = html.indexOf(title)
      expect(index, `missing title ${title}`).toBeGreaterThan(-1)
      expect(index, `title out of order: ${title}`).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('keeps the first short active in SSR', () => {
    expect((html.match(/data-active="true"/g) ?? []).length).toBe(1)
    expect(html).toMatch(
      /data-short-id="short-001"[^>]*data-active="true"|data-active="true"[^>]*data-short-id="short-001"/,
    )
    expect(html).toMatch(/aria-current="true"/)
  })

  it('renders the CTA as a link to /composer with the exact testid', () => {
    const cta = html.match(/<a\b[^>]*\bdata-testid="feed-cta"[^>]*>([\s\S]*?)<\/a>/i)
    expect(cta, 'missing feed CTA anchor').not.toBeNull()

    const tag = cta?.[0]?.match(/^<a\b[^>]*>/i)?.[0] ?? ''
    expect(tag).toContain('href="/composer"')
    expect(tag).not.toContain('aria-haspopup')
    expect(normalize(textContent(cta?.[1] ?? ''))).toBe('Crear short')
  })

  it('removes the retired Próximamente notice and dialog contract', () => {
    expect(html).not.toContain('Próximamente')
    expect(html).not.toContain('data-testid="create-short-notice"')
    expect(html).not.toContain('data-testid="notice-overlay"')
    expect(html).not.toContain('data-testid="notice-heading"')
    expect(html).not.toContain('data-testid="notice-body"')
    expect(html).not.toContain('data-testid="notice-close"')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-modal="true"')
    expect(html).not.toContain('La creación de shorts con IA todavía no está disponible.')
  })

  it('keeps the DEMO badge and its accessible explanation', () => {
    expect(html).toContain('data-testid="demo-badge"')
    expect(html).toContain('>DEMO</span>')
    expect(html).toContain(
      'DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.',
    )
  })

  it('keeps the local posters and their loading priorities', () => {
    expect((html.match(/data-testid="short-poster"/g) ?? []).length).toBe(6)

    for (let index = 1; index <= 6; index += 1) {
      expect(html).toContain(`/mock/shorts/short-00${index}.svg`)
    }

    const firstPoster = html.match(/<img\b[^>]*data-testid="short-poster"[^>]*>/i)?.[0] ?? ''
    expect(firstPoster).toContain('loading="eager"')
    expect(firstPoster).toContain('fetchpriority="high"')
  })

  it('keeps the feed end panel and the share status region', () => {
    expect(html).toContain('data-testid="feed-end"')
    expect(html).toContain('Fin del feed de prueba')
    expect(html).toContain(
      'Estos seis shorts son ficticios y existen solo para validar el diseño. No hay más contenido ni scroll infinito.',
    )
    expect(html).toContain('data-testid="share-status"')
  })

  it('renders the updated no-JS copy', () => {
    expect(html).toContain(
      'La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. El estudio de creación también necesita JavaScript.',
    )
  })

  it('keeps no playable media and no external origins', () => {
    expect(html).not.toMatch(/<video\b/i)
    expect(html).not.toMatch(/<audio\b/i)
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/\bautoplay\b/i)

    const tags = html.match(/<(?:link|img|script)\b[^>]*>/gi) ?? []

    for (const tag of tags) {
      const attributePattern = /\b(?:href|src)="([^"]*)"/gi
      let match: RegExpExecArray | null

      while ((match = attributePattern.exec(tag)) !== null) {
        const value = match[1] ?? ''
        expect(value, `external reference in tag: ${tag}`).not.toMatch(
          /^(?:[a-z][a-z\d+.-]*:)?\/\//i,
        )
        expect(value, `external host in tag: ${tag}`).not.toMatch(
          /(?:fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|fontawesome|use\.typekit)/i,
        )
      }
    }
  })
})
