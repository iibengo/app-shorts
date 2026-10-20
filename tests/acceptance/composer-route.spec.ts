// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

process.env.NUXT_FAL_KEY = 'test-key'
process.env.NUXT_COMPOSER_JOB_SECRET = 'test-secret-with-at-least-32-characters'

const COPY = {
  title: 'AI Shorts — Estudio de creación',
  description:
    'Estudio de creación de AI Shorts: describe una idea, añade una imagen opcional y genera un vídeo vertical de 9:16 con IA.',
  h1: 'Crea un short con IA',
  intro:
    'Describe una idea, añade una imagen de referencia opcional y genera un vídeo vertical de 9:16. La generación es real y consume créditos.',
  beta:
    'BETA. La generación de vídeo con IA es real, consume créditos y puede tardar varios minutos.',
  nojs:
    'El estudio de creación necesita JavaScript para generar un vídeo con IA. Puedes volver al feed de prueba.',
  privacy:
    'Tu idea y tu imagen se envían a Fal para generar el vídeo. AI Shorts no las guarda. La imagen de referencia se elimina del almacenamiento de Fal en 1 hora.',
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

describe('GET /composer SSR acceptance', () => {
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
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1)

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

  it('renders the intro, BETA badge and accessible explanation', () => {
    expect(html).toContain(COPY.intro)
    expect(html).toContain('data-testid="composer-beta-badge"')
    expect(html).toContain('>BETA</span>')
    expect(html).toContain(COPY.beta)
    expect(html).not.toContain('DEMO')
    expect(html).not.toContain('SIMULACIÓN')
  })

  it('renders the three-step progress navigation in input state', () => {
    expect(html).toContain('aria-label="Progreso de creación"')
    expect((html.match(/data-testid="composer-step"/g) ?? []).length).toBe(3)
    expect(html).toMatch(/data-step="input"[^>]*data-state="current"/)
    expect(html).toContain('Paso 1 de 3: Idea, actual')
    expect(html).toContain('Paso 2 de 3: Generación, pendiente')
    expect(html).toContain('Paso 3 de 3: Resultado, pendiente')
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

  it('renders the preset radiogroup with Rápido selected by default', () => {
    expect(html).toContain('data-testid="composer-preset-group"')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('Calidad de generación')
    expect(html).toContain('data-testid="composer-preset-fast"')
    expect(html).toContain('data-testid="composer-preset-quality"')
    expect(html).toMatch(/data-testid="composer-preset-fast"[^>]*\bchecked\b|data-testid="composer-preset-fast"[^>]*\schecked=/)
    expect(html).toContain('Rápido')
    expect(html).toContain('Calidad')
    expect(html).toContain('MiniMax Hailuo 02')
    expect(html).toContain('Kling 2.5 Turbo Pro')
    expect(html).not.toMatch(/fal-ai\/|endpointId/)
  })

  it('renders the single-image reference picker with the exact accept list', () => {
    expect(html).toContain('data-testid="composer-reference"')
    expect(html).toContain('Imagen de referencia (opcional)')
    expect(html).toContain('data-testid="composer-reference-add"')
    expect(html).toContain('Añadir imagen')
    expect(html).toContain('data-testid="composer-reference-input"')
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"')
    expect(html).not.toMatch(/type="file"[^>]*\bmultiple\b|\bmultiple\b[^>]*type="file"/)
    expect(html).toContain('data-testid="composer-reference-count"')
    expect(html).toContain('0 de 1')
    expect(html).toContain('data-testid="composer-reference-empty"')
    expect(html).toContain('Sin imagen. Puedes generar solo con texto.')
    expect(html).toContain(
      'Una imagen PNG, JPG o WebP de hasta 8 MB. Se envía a Fal para generar el vídeo y se elimina en 1 hora.',
    )
  })

  it('renders Ajustes with the 6 s default and the exact duration options', () => {
    expect(html).toContain('data-testid="composer-settings"')
    expect(html).toContain('data-testid="composer-settings-summary"')
    expect(html).toContain('Ajustes · 6 s')
    expect(html).toContain('data-testid="composer-duration"')
    expect(html).toContain('6 s')
    expect(html).toContain('10 s')
    expect(html).toContain('La duración afecta al tiempo de espera y al coste.')
  })

  it('renders the privacy notice and Generar vídeo submit', () => {
    expect(html).toContain('data-testid="composer-privacy"')
    expect(html).toContain(COPY.privacy)
    expect(html).toContain('data-testid="composer-generate"')
    expect(html).toContain('Generar vídeo')
    expect(html).toMatch(/<button\b[^>]*type="submit"[^>]*data-testid="composer-generate"|<button\b[^>]*data-testid="composer-generate"[^>]*type="submit"/)
  })

  it('renders the no-JS notice', () => {
    expect(html).toContain('data-testid="composer-nojs-notice"')
    expect(html).toContain(COPY.nojs)
  })

  it('does not render progress, result, references or media in the initial state', () => {
    expect(html).not.toContain('data-testid="composer-generation"')
    expect(html).not.toContain('data-testid="composer-result"')
    expect(html).not.toContain('data-testid="composer-partial"')
    expect(html).not.toContain('data-testid="composer-reference-card"')
    expect(html).not.toContain('data-testid="composer-reference-thumbnail"')
    expect(html).not.toMatch(/<video\b/i)
    expect(html).not.toMatch(/<audio\b/i)
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/\bautoplay\b/i)
    expect(html).not.toContain('blob:')
    expect(html).not.toContain('data-testid="composer-cancel"')
    expect(html).not.toContain('data-testid="composer-retry"')
  })

  it('does not leak the key, job token, Fal URLs or internal headers', () => {
    expect(html).not.toContain('NUXT_FAL_KEY')
    expect(html).not.toContain('falKey')
    expect(html).not.toContain('test-key')
    expect(html).not.toContain('Authorization')
    expect(html).not.toContain('Key test-key')
    expect(html).not.toMatch(/\bv1\./)
    expect(html).not.toContain('jobId')
    expect(html).not.toContain('statusUrl')
    expect(html).not.toContain('responseUrl')
    expect(html).not.toContain('cancelUrl')
    expect(html).not.toContain('queue.fal.run')
    expect(html).not.toContain('fal.run')
    expect(html).not.toContain('rest.fal.ai')
    expect(html).not.toContain('v3.fal.media')
    expect(html).not.toContain('v3b.fal.media')
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
    expect(html).not.toContain('/mock/composer/')
  })
})
