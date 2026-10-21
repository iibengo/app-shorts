import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryResult from '~/components/story/StoryResult.vue'
import { makeSceneDto, makeStoryDto } from '../helpers/story'
import type { Story } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

function readyStory(overrides: Partial<Story> = {}): Story {
  return makeStoryDto({
    status: 'READY',
    preset: 'fast',
    finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4',
    finalVideoExpiresAt: '2026-10-22T18:00:00.000Z',
    completedAt: '2026-10-21T18:30:00.000Z',
    pollAfterMs: 0,
    scenes: Array.from({ length: 5 }, (_value, index) =>
      makeSceneDto({
        order: index + 1,
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
        videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
        keyframeUrl: index === 0
          ? 'https://v3.fal.media/files/test/poster.jpeg'
          : 'https://v3.fal.media/files/test/keyframe.jpeg',
      }),
    ),
    ...overrides,
  })
}

async function mountResult(value = readyStory()) {
  return mountSuspended(StoryResult, {
    attachTo: document.body,
    props: { story: value },
  })
}

describe('StoryResult', () => {
  it('renders the IA badge and the result heading with focus management', async () => {
    const wrapper = await mountResult()
    const heading = wrapper.get('[data-testid="story-result-heading"]')

    expect(normalize(wrapper.get('[data-testid="story-result-badge"]').text())).toBe('IA')
    expect(normalize(heading.text())).toBe('Tu historia')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
  })

  it('renders one video with controls, poster and playsinline but no autoplay or loop', async () => {
    const wrapper = await mountResult()
    const videos = wrapper.findAll('video')

    expect(videos).toHaveLength(1)

    const video = videos[0]!

    expect(video.attributes('controls')).toBeDefined()
    expect(video.attributes('playsinline')).toBeDefined()
    expect(video.attributes('preload')).toBe('metadata')
    expect(video.attributes('src')).toBe('https://v3.fal.media/files/test/final.mp4')
    expect(video.attributes('poster')).toBe('https://v3.fal.media/files/test/poster.jpeg')
    expect(video.attributes('autoplay')).toBeUndefined()
    expect(video.attributes('loop')).toBeUndefined()
    expect(video.attributes('download')).toBeUndefined()
    expect(video.attributes('controlslist')).toBe('nodownload')
    expect(video.classes()).toContain('aspect-[9/16]')
    expect(video.classes()).toContain('max-w-[20rem]')
  })

  it('omits the poster when the first keyframe is not allowlisted', async () => {
    const scenes = readyStory().scenes.map((scene, index) =>
      index === 0 ? { ...scene, keyframeUrl: 'https://evil.example/poster.jpeg' } : scene,
    )
    const wrapper = await mountResult(readyStory({ scenes }))

    expect(wrapper.get('video').attributes('poster')).toBeUndefined()
  })

  it('renders the five metadata rows', async () => {
    const wrapper = await mountResult()
    const text = normalize(wrapper.text())

    expect(normalize(wrapper.get('[data-testid="story-result-scenes"]').text())).toBe('5 escenas')
    expect(normalize(wrapper.get('[data-testid="story-result-duration"]').text())).toBe('0:30')
    expect(normalize(wrapper.get('[data-testid="story-result-format"]').text())).toBe('9:16')
    expect(normalize(wrapper.get('[data-testid="story-result-style"]').text())).toBe('Rápido')
    expect(normalize(wrapper.get('[data-testid="story-result-reference"]').text())).toBe(
      'Sin referencia',
    )
    expect(text).toContain('Escenas')
    expect(text).toContain('Duración')
    expect(text).toContain('Formato')
    expect(text).toContain('Estilo')
    expect(text).toContain('Referencia')
    expect(text).toContain('0:30')
  })

  it('renders the quality style and the reference count', async () => {
    const wrapper = await mountResult(readyStory({
      preset: 'quality',
      modelId: 'kling-2.5-turbo-pro',
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
    }))

    expect(normalize(wrapper.get('[data-testid="story-result-style"]').text())).toBe('Calidad')
    expect(normalize(wrapper.get('[data-testid="story-result-reference"]').text())).toBe(
      '1 imagen',
    )
  })

  it('renders the AI and expiry note', async () => {
    const wrapper = await mountResult()

    expect(normalize(wrapper.get('[data-testid="story-result-note"]').text())).toBe(
      'Generado con IA. Puede contener errores. No se ha publicado. El enlace del vídeo caduca en 24 horas.',
    )
  })

  it('offers only the restart action and no download, share or publish controls', async () => {
    const wrapper = await mountResult()
    const text = normalize(wrapper.text())
    const buttons = wrapper.findAll('button')

    expect(buttons).toHaveLength(1)
    expect(normalize(buttons[0]!.text())).toBe('Empezar otra historia')
    expect(text).not.toMatch(/Descargar|Compartir|Publicar/)
    expect(wrapper.html()).not.toMatch(/\bdownload\b|navigator\.share|publish/)
  })

  it('emits restart from the restart button', async () => {
    const wrapper = await mountResult()

    await wrapper.get('[data-testid="story-restart"]').trigger('click')

    expect(wrapper.emitted('restart')).toHaveLength(1)
  })
})
