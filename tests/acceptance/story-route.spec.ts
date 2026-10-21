// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

process.env.NUXT_DEEPSEEK_KEY = 'deepseek-test-key'
process.env.NUXT_FAL_KEY = 'fal-test-key'

const COPY = {
  title: 'AI Shorts — Historias con IA',
  description:
    'Crea una historia de 4 a 6 escenas con IA: revisa las imágenes, genera los vídeos y recibe un vídeo vertical de hasta 36 segundos.',
  h1: 'Crea una historia con IA',
  intro:
    'Escribe una premisa. La IA prepara entre 4 y 6 escenas de 6 segundos con sus imágenes y tú decides cuándo generar los vídeos.',
  nojs:
    'La creación de historias necesita JavaScript. Puedes volver al feed de prueba.',
  privacy:
    'Tu premisa se envía a DeepSeek para escribir el guion. Fal genera las imágenes y los vídeos, y DeepSeek revisa fotogramas de los clips para comprobar la continuidad. AI Shorts guarda la historia 24 horas para que puedas volver a ella desde este navegador. La imagen de referencia se elimina de Fal en 1 hora.',
} as const

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textContent = (fragment: string) =>
  normalize(fragment.replace(/<[^>]*>/g, ''))

await setup({ server: true })

let status = 0
let html = ''

beforeAll(async () => {
  html = await $fetch<string>('/story')
  const response = await fetch('/story')
  status = response.status
})

describe('GET /story SSR acceptance', () => {
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
    expect(html).toContain('data-testid="story-header"')
    expect(html).toContain('data-testid="story-page"')
  })

  it('renders the intro, BETA badge, explanation and feed link', () => {
    expect(html).toContain(COPY.intro)
    expect(html).toContain('data-testid="story-beta-badge"')
    expect(html).toContain('>BETA</span>')
    expect(html).toContain(
      'BETA. La creación de historias con IA es real, consume créditos y puede tardar varios minutos.',
    )
    expect(html).toContain('data-testid="story-back-link"')
    expect(html).toContain('href="/feed"')
    expect(html).toContain('Volver al feed')
  })

  it('renders the four-step stepper in the plan step', () => {
    expect(html).toContain('aria-label="Progreso de la historia"')
    expect((html.match(/data-testid="story-step"/g) ?? []).length).toBe(4)
    expect(html).toMatch(/data-step="plan"[^>]*data-state="current"/)
    expect(html).toContain('Paso 1 de 4: Guion, actual')
    expect(html).toContain('Paso 2 de 4: Imágenes, pendiente')
    expect(html).toContain('Paso 3 de 4: Vídeos, pendiente')
    expect(html).toContain('Paso 4 de 4: Resultado, pendiente')
    expect(html).toContain('aria-current="step"')
  })

  it('renders a labelled premise form with the exact copy', () => {
    expect(html).toContain('data-testid="story-create-form"')
    expect(html).toMatch(/<form\b[^>]*novalidate/)
    expect(html).toContain('for="story-premise-input"')
    expect(html).toContain('id="story-premise-input"')
    expect(html).toContain('placeholder="Una repostera descubre que sus postres pueden predecir el futuro."')
    expect(html).toContain('maxlength="600"')
    expect(html).toContain('aria-required="true"')
    expect(html).toContain('Máximo 600 caracteres.')
    expect(html).toContain('0/600')
    expect(html).toContain('aria-label="0 de 600 caracteres"')
    expect(html).toContain('data-testid="story-premise-help"')
  })

  it('renders the scene radiogroup with 5 scenes selected by default', () => {
    expect(html).toContain('data-testid="story-scene-count"')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-labelledby="story-scene-count-legend"')
    expect(html).toContain('Escenas')
    expect(html).toContain('data-testid="story-scene-count-4"')
    expect(html).toContain('data-testid="story-scene-count-5"')
    expect(html).toContain('data-testid="story-scene-count-6"')
    expect(html).toMatch(/data-testid="story-scene-count-5"[^>]*\bchecked\b/)
    expect(html).not.toMatch(/data-testid="story-scene-count-4"[^>]*\bchecked\b/)
    expect(html).toContain('4 escenas')
    expect(html).toContain('5 escenas')
    expect(html).toContain('6 escenas')
    expect(html).toContain('Cada escena dura 6 segundos.')
  })

  it('renders the quality radiogroup with Rápido selected by default', () => {
    expect(html).toContain('data-testid="story-preset-group"')
    expect(html).toContain('Calidad de vídeo')
    expect(html).toContain('data-testid="story-preset-fast"')
    expect(html).toContain('data-testid="story-preset-quality"')
    expect(html).toMatch(/data-testid="story-preset-fast"[^>]*\bchecked\b/)
    expect(html).toContain('Rápido')
    expect(html).toContain('MiniMax Hailuo 02. Menos espera.')
    expect(html).toContain('Calidad')
    expect(html).toContain('Kling 2.5 Turbo Pro. Más detalle y coste.')
    expect(html).not.toMatch(/fal-ai\/|endpointId/)
  })

  it('renders the optional single reference picker', () => {
    expect(html).toContain('data-testid="story-reference"')
    expect(html).toContain('Imagen de referencia (opcional)')
    expect(html).toContain('data-testid="story-reference-add"')
    expect(html).toContain('Añadir imagen')
    expect(html).toContain('data-testid="story-reference-input"')
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"')
    expect(html).not.toMatch(/type="file"[^>]*\bmultiple\b|\bmultiple\b[^>]*type="file"/)
    expect(html).toContain('data-testid="story-reference-count"')
    expect(html).toContain('0 de 1')
    expect(html).toContain('data-testid="story-reference-empty"')
    expect(html).toContain('Sin imagen. Puedes crear la historia solo con texto.')
    expect(html).toContain(
      'Una imagen PNG, JPG o WebP de hasta 8 MB. Se usa para el guion y para las imágenes de todas las escenas. Se envía a DeepSeek y a Fal; Fal la elimina en 1 hora.',
    )
    expect(html).not.toContain('data-testid="story-reference-card"')
  })

  it('renders the privacy notice and a disabled create button', () => {
    expect(html).toContain('data-testid="story-privacy"')
    expect(html).toContain(COPY.privacy)
    expect(html).toContain('data-testid="story-create"')
    expect(html).toContain('Crear historia')
    expect(html).toMatch(
      /<button\b[^>]*type="submit"[^>]*data-testid="story-create"[^>]*disabled|<button\b[^>]*disabled[^>]*data-testid="story-create"/,
    )
  })

  it('renders the no-JS notice', () => {
    expect(html).toContain('data-testid="story-nojs-notice"')
    expect(html).toContain(COPY.nojs)
  })

  it('does not render progress, results, media or planning states initially', () => {
    expect(html).not.toContain('data-testid="story-planning"')
    expect(html).not.toContain('data-testid="story-keyframes"')
    expect(html).not.toContain('data-testid="story-review"')
    expect(html).not.toContain('data-testid="story-videos"')
    expect(html).not.toContain('data-testid="story-result"')
    expect(html).not.toContain('data-testid="story-error"')
    expect(html).not.toMatch(/<video\b/i)
    expect(html).not.toMatch(/<audio\b/i)
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/\bautoplay\b/i)
    expect(html).not.toContain('blob:')
    expect(html).not.toContain('data-testid="story-cancel"')
    expect(html).not.toContain('data-testid="story-scene-card"')
  })

  it('does not leak keys, cookies, story data or provider URLs', () => {
    expect(html).not.toContain('NUXT_DEEPSEEK_KEY')
    expect(html).not.toContain('NUXT_FAL_KEY')
    expect(html).not.toContain('deepseek-test-key')
    expect(html).not.toContain('fal-test-key')
    expect(html).not.toContain('Authorization')
    expect(html).not.toContain('story_sid')
    expect(html).not.toContain('sessionId')
    expect(html).not.toContain('statusUrl')
    expect(html).not.toContain('responseUrl')
    expect(html).not.toContain('cancelUrl')
    expect(html).not.toContain('requestId')
    expect(html).not.toContain('queue.fal.run')
    expect(html).not.toContain('rest.fal.ai')
    expect(html).not.toContain('v3.fal.media')
    expect(html).not.toContain('v3b.fal.media')
  })

  it('loads no external hosts or third-party scripts', () => {
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
