import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerResult from '~/components/composer/ComposerResult.vue'
import type { ComposerJob } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

type SucceededJob = Extract<ComposerJob, { status: 'succeeded' }>

const JOB: SucceededJob = {
  id: 'v1.payload.signature',
  status: 'succeeded',
  stage: 'finalizing',
  preset: 'fast',
  modelId: 'minimax-hailuo-02',
  durationSeconds: 6,
  posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  createdAt: '2026-10-21T18:00:00.000Z',
  expiresAt: '2026-10-21T19:00:00.000Z',
  pollAfterMs: 2_000,
  output: {
    videoUrl: 'https://v3.fal.media/files/test/video.mp4',
    posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    width: null,
    height: null,
    durationSeconds: 6,
    modelId: 'minimax-hailuo-02',
    expiresAt: '2026-10-21T19:00:00.000Z',
  },
}

async function mountResult(
  overrides: Partial<SucceededJob> = {},
  referenceCount: 0 | 1 = 0,
  attempt = 1,
) {
  return mountSuspended(ComposerResult, {
    attachTo: document.body,
    props: { job: { ...JOB, ...overrides }, referenceCount, attempt },
  })
}

describe('ComposerResult', () => {
  it('renders the IA badge and the result heading', async () => {
    const wrapper = await mountResult()
    const badge = wrapper.get('[data-testid="composer-result-badge"]')
    const heading = wrapper.get('[data-testid="composer-result-heading"]')

    expect(normalize(badge.text())).toBe('IA')
    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Tu short')
    expect(heading.attributes('tabindex')).toBe('-1')
  })

  it('moves focus to the result heading when it mounts', async () => {
    const wrapper = await mountResult()

    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-result-heading"]').element,
    )
  })

  it('renders the real video with controls, poster and playsinline but no autoplay or loop', async () => {
    const wrapper = await mountResult()
    const video = wrapper.get('[data-testid="composer-video"]')

    expect(video.element.tagName).toBe('VIDEO')
    expect(video.attributes('controls')).toBeDefined()
    expect(video.attributes('playsinline')).toBeDefined()
    expect(video.attributes('preload')).toBe('metadata')
    expect(video.attributes('poster')).toBe(JOB.output.posterUrl)
    expect(video.attributes('src')).toBe(JOB.output.videoUrl)
    expect(video.attributes('autoplay')).toBeUndefined()
    expect(video.attributes('loop')).toBeUndefined()
    expect(video.attributes('download')).toBeUndefined()
    expect(video.attributes('controlslist')).toBe('nodownload')
    expect(video.classes()).toContain('aspect-[9/16]')
  })

  it('renders the normative metadata for the fast preset', async () => {
    const wrapper = await mountResult({}, 0, 2)

    expect(normalize(wrapper.get('[data-testid="composer-result-model"]').text())).toBe(
      'MiniMax Hailuo 02',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-duration"]').text())).toBe('0:06')
    expect(normalize(wrapper.get('[data-testid="composer-result-format"]').text())).toBe('9:16')
    expect(normalize(wrapper.get('[data-testid="composer-result-reference"]').text())).toBe(
      'Sin referencia',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-attempt"]').text())).toBe(
      'Intento 2',
    )
  })

  it('renders the quality model, quality duration and one-image reference', async () => {
    const quality: SucceededJob = {
      ...JOB,
      preset: 'quality',
      modelId: 'kling-2.5-turbo-pro',
      durationSeconds: 10,
      output: {
        ...JOB.output,
        durationSeconds: 10,
        modelId: 'kling-2.5-turbo-pro',
      },
    }
    const wrapper = await mountResult(quality, 1, 3)

    expect(normalize(wrapper.get('[data-testid="composer-result-model"]').text())).toBe(
      'Kling 2.5 Turbo Pro',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-duration"]').text())).toBe('0:10')
    expect(normalize(wrapper.get('[data-testid="composer-result-reference"]').text())).toBe(
      '1 imagen',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-attempt"]').text())).toBe(
      'Intento 3',
    )
  })

  it('renders the exact AI and temporary-link note', async () => {
    const wrapper = await mountResult()

    expect(normalize(wrapper.get('[data-testid="composer-result-note"]').text())).toBe(
      'Generado con IA. Puede contener errores. No se ha publicado en el feed. El enlace del vídeo es temporal.',
    )
  })

  it('renders Regenerar and Editar idea as non-submit buttons that emit', async () => {
    const wrapper = await mountResult()
    const regenerate = wrapper.get('[data-testid="composer-regenerate"]')
    const edit = wrapper.get('[data-testid="composer-edit"]')

    expect(regenerate.attributes('type')).toBe('button')
    expect(edit.attributes('type')).toBe('button')
    expect(normalize(regenerate.text())).toBe('Regenerar')
    expect(normalize(edit.text())).toBe('Editar idea')

    await regenerate.trigger('click')
    await edit.trigger('click')

    expect(wrapper.emitted('regenerate')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('shows a recoverable message when the video fails to load', async () => {
    const wrapper = await mountResult()

    await wrapper.get('[data-testid="composer-video"]').trigger('error')

    const alert = wrapper.get('[role="alert"]')
    expect(normalize(alert.text())).toBe(
      'No se pudo cargar el vídeo. Puede que el enlace haya caducado.',
    )
    expect(wrapper.findAll('[data-testid="composer-regenerate"]')).toHaveLength(1)
  })

  it('is terminal: no publish, download, share, feed actions or player chrome', async () => {
    const wrapper = await mountResult()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.findAll('iframe')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="short-like"], [data-testid="short-save"], [data-testid="short-share"]')).toHaveLength(0)
    expect(text).not.toMatch(/\b(Publicar|Descargar|Compartir)\b/)
    expect(text).not.toMatch(/\b(Me gusta|Guardar|likes|creador|handle)\b/i)
    expect(wrapper.findAll('button')).toHaveLength(2)
  })
})
