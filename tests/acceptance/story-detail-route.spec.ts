// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

process.env.NUXT_DEEPSEEK_KEY = 'deepseek-test-key'
process.env.NUXT_FAL_KEY = 'fal-test-key'

const COPY = {
  title: 'Tu historia — AI Shorts',
  loading: 'Cargando tu historia…',
  nojs:
    'Esta historia necesita JavaScript para mostrar su progreso. Puedes volver al feed de prueba.',
} as const

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textContent = (fragment: string) =>
  normalize(fragment.replace(/<[^>]*>/g, ''))

await setup({ server: true })

let status = 0
let html = ''
let setCookie: string | null = null

beforeAll(async () => {
  html = await $fetch<string>('/story/story-abc')
  const response = await fetch('/story/story-abc')
  status = response.status
  setCookie = response.headers.get('set-cookie')
})

describe('GET /story/[id] SSR acceptance', () => {
  it('responds with HTTP 200', () => {
    expect(status).toBe(200)
  })

  it('declares Spanish language, dark theme metadata and the exact title', () => {
    expect(html).toMatch(/<html\b[^>]*\blang="es"/)
    expect(html).toContain('<meta name="color-scheme" content="dark">')
    expect(html).toContain('<meta name="theme-color" content="#09090b">')
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain(`<title>${COPY.title}</title>`)
  })

  it('renders a deterministic shell with one h1, header and main', () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1)
    expect((html.match(/<header\b/g) ?? []).length).toBe(1)
    expect((html.match(/<main\b/g) ?? []).length).toBe(1)
    expect(html).toContain('data-testid="story-detail"')
    expect(html).toContain('data-testid="story-header"')
    expect(html).toContain('data-testid="story-detail-heading"')

    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)

    expect(textContent(h1?.[1] ?? '')).toBe('Tu historia')
  })

  it('renders the loading shell and no-JS notice', () => {
    expect(html).toContain('data-testid="story-loading"')
    expect(html).toContain(COPY.loading)
    expect(html).toContain('data-testid="story-nojs-notice"')
    expect(html).toContain(COPY.nojs)
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
  })

  it('renders the back link and BETA explanation', () => {
    expect(html).toContain('href="/feed"')
    expect(html).toContain('Volver al feed')
    expect(html).toContain('BETA')
    expect(html).toContain(
      'BETA. La creación de historias con IA es real, consume créditos y puede tardar varios minutos.',
    )
  })

  it('does not render review, videos, assembly, result or error states', () => {
    expect(html).not.toContain('data-testid="story-review"')
    expect(html).not.toContain('data-testid="story-scene-card"')
    expect(html).not.toContain('data-testid="story-videos"')
    expect(html).not.toContain('data-testid="story-assembling"')
    expect(html).not.toContain('data-testid="story-result"')
    expect(html).not.toContain('data-testid="story-final-video"')
    expect(html).not.toContain('data-testid="story-error"')
    expect(html).not.toContain('data-testid="story-expired"')
    expect(html).not.toContain('data-testid="story-not-owned"')
    expect(html).not.toMatch(/<video\b/i)
    expect(html).not.toMatch(/\bautoplay\b/i)
    expect(html).not.toContain('blob:')
  })

  it('does not query the database or expose story data during SSR', () => {
    // The current route path is serialized by Nuxt for hydration; it is not
    // story data. Strip the payload script before checking for leaked data.
    const markup = html.replace(
      /<script[^>]*id="__NUXT_DATA__"[\s\S]*?<\/script>/g,
      '',
    )

    expect(markup).not.toContain('story-abc')
    expect(markup).not.toContain('El azúcar lo sabe')
    expect(markup).not.toContain('premise')
    expect(markup).not.toContain('keyframeUrl')
    expect(markup).not.toContain('finalVideoUrl')
    expect(markup).not.toContain('"scenes"')
    expect(setCookie).toBeNull()
  })

  it('does not leak keys, cookies or provider URLs', () => {
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
  })

  it('renders the same shell for any story id', async () => {
    const other = await $fetch<string>('/story/another-story-id')

    expect((other.match(/<h1\b/g) ?? []).length).toBe(1)
    expect(other).toContain('data-testid="story-loading"')
    expect(other).toContain(COPY.loading)

    const otherMarkup = other.replace(
      /<script[^>]*id="__NUXT_DATA__"[\s\S]*?<\/script>/g,
      '',
    )

    expect(otherMarkup).not.toContain('another-story-id')
  })
})
