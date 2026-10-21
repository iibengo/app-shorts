import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryVideoProgress from '~/components/story/StoryVideoProgress.vue'
import { makeSceneDto, makeStoryDto } from '../helpers/story'
import type { SceneStatus } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

function storyWith(statuses: readonly SceneStatus[]) {
  return makeStoryDto({
    status: 'GENERATING_VIDEOS',
    sceneCount: statuses.length as 4 | 5 | 6,
    scenes: statuses.map((status, index) =>
      makeSceneDto({
        order: index + 1,
        status,
        videoAttempts: status === 'VIDEO_FAILED' ? 1 : status === 'VIDEO_READY' ? 1 : 0,
        videoUrl: status === 'VIDEO_READY'
          ? 'https://v3.fal.media/files/test/clip.mp4'
          : null,
      }),
    ),
  })
}

async function mountProgress(options: {
  statuses?: readonly SceneStatus[]
  elapsedSeconds?: number
  isSlow?: boolean
} = {}) {
  return mountSuspended(StoryVideoProgress, {
    attachTo: document.body,
    props: {
      story: storyWith(options.statuses ?? [
        'VIDEO_READY',
        'VIDEO_RUNNING',
        'VIDEO_QUEUED',
        'VIDEO_FAILED',
        'KEYFRAME_READY',
      ]),
      elapsedSeconds: options.elapsedSeconds ?? 7,
      isSlow: options.isSlow ?? false,
    },
  })
}

describe('StoryVideoProgress', () => {
  it('renders the videos heading with focus management and the real note', async () => {
    const wrapper = await mountProgress()
    const heading = wrapper.get('[data-testid="story-videos-heading"]')

    expect(normalize(heading.text())).toBe('Generando los vídeos')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(normalize(wrapper.text())).toContain(
      'Los vídeos se generan de dos en dos. Puede tardar varios minutos.',
    )
    expect(wrapper.get('[data-testid="story-videos"]').attributes('aria-busy')).toBe('true')
  })

  it('renders the real per-scene statuses without percentages or ETA', async () => {
    const wrapper = await mountProgress()
    const rows = wrapper.findAll('[data-testid="story-video-scene"]')

    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.attributes('data-scene-status'))).toEqual([
      'VIDEO_READY',
      'VIDEO_RUNNING',
      'VIDEO_QUEUED',
      'VIDEO_FAILED',
      'KEYFRAME_READY',
    ])

    const text = normalize(wrapper.text())

    expect(text).toContain('Escena 1 de 5')
    expect(text).toContain('Vídeo listo')
    expect(text).toContain('Generando vídeo')
    expect(text).toContain('En cola')
    expect(text).toContain('Vídeo fallido')
    expect(text).toContain('Pendiente')
    expect(text).not.toMatch(/\d+\s?%/)
    expect(text).not.toMatch(/ETA|faltan \d/i)
  })

  it('renders the done counter and elapsed time', async () => {
    const wrapper = await mountProgress({ elapsedSeconds: 62 })

    expect(normalize(wrapper.get('[data-testid="story-video-progress"]').text())).toBe(
      '1 de 5 vídeos listos',
    )
    expect(normalize(wrapper.get('[data-testid="story-elapsed"]').text())).toBe(
      'Tiempo transcurrido: 1:02',
    )
  })

  it('shows the slow notice only when requested', async () => {
    const normal = await mountProgress({ isSlow: false })

    expect(normal.find('[data-testid="story-slow"]').exists()).toBe(false)

    const slow = await mountProgress({ isSlow: true })

    expect(normalize(slow.get('[data-testid="story-slow"]').text())).toBe(
      'Está tardando más de lo habitual. Puedes seguir esperando o cancelar.',
    )
  })

  it('offers retry only for a failed scene with attempts left', async () => {
    const wrapper = await mountProgress({
      statuses: ['VIDEO_FAILED', 'VIDEO_READY', 'VIDEO_QUEUED'],
    })
    const retry = wrapper.findAll('[data-testid="story-video-retry"]')

    expect(retry).toHaveLength(1)
    expect(normalize(retry[0]!.text())).toBe('Reintentar escena')

    await retry[0]!.trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('retry')?.[0]?.[0]).toBe(wrapper.props('story').scenes[0]?.id)
  })

  it('does not offer retry when the scene used both attempts', async () => {
    const story = storyWith(['VIDEO_FAILED'])
    const scenes = story.scenes.map((scene) => ({ ...scene, videoAttempts: 2 }))
    const wrapper = await mountSuspended(StoryVideoProgress, {
      attachTo: document.body,
      props: { story: { ...story, scenes }, elapsedSeconds: 7, isSlow: false },
    })

    expect(wrapper.find('[data-testid="story-video-retry"]').exists()).toBe(false)
  })

  it('emits cancel from the cancel button', async () => {
    const wrapper = await mountProgress()

    expect(normalize(wrapper.get('[data-testid="story-cancel"]').text())).toBe(
      'Cancelar historia',
    )

    await wrapper.get('[data-testid="story-cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('keeps 44px targets on retry and cancel', async () => {
    const wrapper = await mountProgress({
      statuses: ['VIDEO_FAILED', 'VIDEO_READY', 'VIDEO_QUEUED'],
    })

    expect(wrapper.get('[data-testid="story-video-retry"]').classes()).toContain('min-h-11')
    expect(wrapper.get('[data-testid="story-cancel"]').classes()).toContain('min-h-11')
  })
})
