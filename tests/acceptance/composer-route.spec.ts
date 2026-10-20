// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

const COPY = {
  title: 'AI Shorts — Estudio de creación (demo)',
  description:
    'Estudio de creación simulado de AI Shorts: describe una idea, añade referencias opcionales y genera una vista previa ficticia. No se crea ni se publica ningún vídeo real.',
  h1: 'Crea un short de prueba',
  intro:
    'Describe una idea, añade referencias opcionales y genera una vista previa simulada. No se crea ni se publica ningún vídeo real.',
  nojs:
    'El estudio de creación necesita JavaScript para generar la vista previa simulada. Puedes volver al feed de prueba.',
} as const

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textContent = (fragment: string) =>
  normalize(fragment.replace(/<[^>]*>/g, ''))

await setup({ server: true })

let status = 0
let html = ''

beforeAll(async () => {
  html = await $fetch<string>('/composer')
  const response = await fetch('/composer')
  status = response.status
})

describe('GET /composer (server-rendered route acceptance)', () => {
  it('responds with HTTP 200', () => {
    expect(status).toBe(200)
  })

  it('declares Spanish language and dark theme metadata', () => {
    expect(html).toMatch(/<html\b[^>]*\blang="es"/)
    expect(html).toContain('<meta name="color-scheme" content="dark">')
    expect(html).toContain('<meta name="theme-color" content="#09090b">')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
  })

  it('renders the exact title and meta description', () => {
    expect(html).toContain(`<title>${COPY.title}</title>`)
    expect(html).toContain(`<meta name="description" content="${COPY.description}">`)
  })

  it('renders exactly one h1 with the normative headline', () => {
    const h1Count = (html.match(/<h1\b/g) ?? []).length
    expect(h1Count).toBe(1)

    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
    expect(h1, 'missing h1').not.toBeNull()
    expect(textContent(h1?.[1] ?? '')).toBe(COPY.h1)
  })

  it('renders one header and one main landmark', () => {
    expect((html.match(/<header\b/g) ?? []).length).toBe(1)
    expect((html.match(/<main\b/g) ?? []).length).toBe(1)
    expect(html).toContain('data-testid="composer-header"')
    expect(html).toContain('data-testid="composer-page"')
  })

  it('renders the normative intro and DEMO explanation', () => {
    expect(html).toContain(COPY.intro)
    expect(html).toContain(
      'DEMO. El estudio de creación es una simulación: no se crea ni se publica ningún vídeo real y los archivos no se suben.',
    )
    expect(html).toContain('data-testid="composer-demo-badge"')
  })

  it('renders the three-step progress navigation in the input state', () => {
    expect(html).toContain('aria-label="Progreso de creación"')
    expect((html.match(/data-testid="composer-step"/g) ?? []).length).toBe(3)
    expect(html).toMatch(/data-step="input"[^>]*data-state="current"/)
    expect(html).toContain('Paso 1 de 3: Idea, actual')
    expect(html).toContain('Paso 2 de 3: Generación, pendiente')
    expect(html).toContain('Paso 3 de 3: Vista previa, pendiente')
  })

  it('renders a labelled form with the textarea and prompt copy', () => {
    expect(html).toContain('data-testid="composer-form"')
    expect(html).toMatch(/<form\b[^>]*novalidate/)
    expect(html).toContain('for="composer-prompt-input"')
    expect(html).toContain('id="composer-prompt-input"')
    expect(html).toContain('placeholder="Un short sobre cómo preparar tu primer set de grabación."')
    expect(html).toContain('maxlength="280"')
    expect(html).toContain('aria-required="true"')
    expect(html).toContain('Máximo 280 caracteres.')
    expect(html).toContain('0/280')
    expect(html).toContain('0 de 280 caracteres')
  })

  it('renders the reference picker and the generate action', () => {
    expect(html).toContain('data-testid="composer-references"')
    expect(html).toContain('Referencias (opcional)')
    expect(html).toContain(
      'Hasta 3 imágenes o vídeos. Se quedan en tu navegador y no se suben.',
    )
    expect(html).toContain('data-testid="composer-reference-add"')
    expect(html).toContain('Añadir referencia')
    expect(html).toContain('data-testid="composer-reference-input"')
    expect(html).toContain(
      'accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"',
    )
    expect(html).toMatch(/type="file"[^>]*\bmultiple\b|\bmultiple\b[^>]*type="file"/)
    expect(html).toContain('data-testid="composer-reference-empty"')
    expect(html).toContain('Sin referencias. Puedes generar solo con texto.')
    expect(html).toContain('data-testid="composer-generate"')
    expect(html).toContain('Generar short')
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*data-testid="composer-generate"|<button\b[^>]*data-testid="composer-generate"[^>]*type="submit"/)
  })

  it('renders the no-JS notice', () => {
    expect(html).toContain('data-testid="composer-nojs-notice"')
    expect(html).toContain(COPY.nojs)
  })

  it('does not render preview, progress, references or timers in the initial state', () => {
    expect(html).not.toContain('data-testid="composer-preview"')
    expect(html).not.toContain('data-testid="composer-generation"')
    expect(html).not.toContain('data-testid="composer-generation-progress"')
    expect(html).not.toContain('data-testid="composer-reference-card"')
    expect(html).not.toContain('data-testid="composer-reference-thumbnail"')
    expect(html).not.toContain('Vista previa simulada')
    expect(html).not.toContain('Generando tu short simulado')
    expect(html).not.toContain('blob:')
  })

  it('does not render playable media or iframes', () => {
    expect(html).not.toMatch(/<video\b/i)
    expect(html).not.toMatch(/<audio\b/i)
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/\bautoplay\b/i)
  })

  it('does not reference external hosts or feed posters', () => {
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

    expect(html).not.toContain('/mock/shorts/')
  })
})
