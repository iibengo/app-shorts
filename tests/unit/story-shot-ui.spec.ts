import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryShotCard from '~/components/story/StoryShotCard.vue'
import StoryShotProgress from '~/components/story/StoryShotProgress.vue'
import StoryShotQC from '~/components/story/StoryShotQC.vue'
import StoryShotResult from '~/components/story/StoryShotResult.vue'
import StoryShotReview from '~/components/story/StoryShotReview.vue'
import {
  makeReelScene,
  makeReelStoryDto,
  makeShotDto,
  makeShotQc,
} from '../helpers/story-reel-dto'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('StoryShotCard 008', () => {
  it('shows the shot fields, edits the prompt and emits regeneration', async () => {
    const shot = makeShotDto({
      order: 1,
      framing: 'close-up',
      camera: 'close-up',
      subject: 'Mara',
      keyframeAttempts: 1,
      videoAttempts: 0,
    })
    const scene = makeReelScene(1, [shot])
    const wrapper = await mountSuspended(StoryShotCard, {
      props: { shot, total: 3, scene },
    })

    expect(wrapper.get('[data-testid="story-shot-framing"]').text()).toContain('Primer plano')
    expect(wrapper.get('[data-testid="story-shot-characters"]').text()).toContain('mara')
    expect(wrapper.get('[data-testid="story-shot-props"]').text()).toContain('postre')
    expect(wrapper.get('[data-testid="story-shot-attempt"]').text()).toContain('Intentos de imagen: 1')

    await wrapper.get('[data-testid="story-shot-prompt"]').setValue(
      'Un plano nuevo con Mara y el postre azul sobre la mesa.',
    )
    await wrapper.get('[data-testid="story-shot-regenerate"]').trigger('click')

    expect(wrapper.emitted('regenerate')?.[0]).toEqual([
      'Un plano nuevo con Mara y el postre azul sobre la mesa.',
      3,
    ])
  })

  it('renders shot errors with role alert', async () => {
    const shot = makeShotDto({
      order: 1,
      status: 'VIDEO_FAILED',
      error: {
        code: 'provider-error',
        message: 'No se pudo generar el vídeo.',
        retryable: true,
      },
    })
    const wrapper = await mountSuspended(StoryShotCard, {
      props: { shot, total: 1, scene: makeReelScene(1, [shot]) },
    })

    expect(wrapper.get('[data-testid="story-shot-error"]').attributes('role')).toBe('alert')
  })
})

describe('StoryShotReview 008', () => {
  it('marks synthetic legacy shots and does not allow regenerating them', async () => {
    const legacyShot = makeShotDto({
      id: 'legacy-scene-dto-1',
      order: 1,
      subject: 'Plano heredado',
    })
    const story = makeReelStoryDto({ scenes: [makeReelScene(1, [legacyShot])] })
    const wrapper = await mountSuspended(StoryShotReview, {
      props: { story },
    })

    expect(wrapper.get('[data-testid="story-shot-legacy"]').text()).toBe('Plano heredado')
    expect(wrapper.get('[data-testid="story-shot-legacy-note"]').text())
      .toContain('Plano heredado')
    expect(wrapper.get('[data-testid="story-shot-prompt"]').attributes('disabled'))
      .toBeDefined()
    expect(wrapper.get('[data-testid="story-shot-regenerate"]').attributes('disabled'))
      .toBeDefined()
    expect(wrapper.get('[data-testid="story-shot-approve"]').attributes('disabled'))
      .toBeDefined()
  })

  it('renders scenes and shots with total and approval', async () => {
    const scene1 = makeReelScene(1, [
      makeShotDto({ order: 1, sceneId: 'scene-dto-1' }),
      makeShotDto({ order: 2, sceneId: 'scene-dto-1', indexInScene: 2, durationSeconds: 4 }),
    ])
    const scene2 = makeReelScene(2, [
      makeShotDto({ order: 3, sceneId: 'scene-dto-2', sceneOrder: 2 }),
    ])
    const story = makeReelStoryDto({ scenes: [scene1, scene2] })
    const wrapper = await mountSuspended(StoryShotReview, {
      attachTo: document.body,
      props: { story },
    })

    expect(wrapper.findAll('[data-testid="story-shot-card"]')).toHaveLength(3)
    expect(normalize(wrapper.get('[data-testid="story-shot-review-total"]').text()))
      .toContain('10 s · 3 planos')
    expect(wrapper.get('[data-testid="story-shot-approve"]').attributes('disabled')).toBeUndefined()
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="story-shot-review-heading"]').element,
    )

    await wrapper.get('[data-testid="story-shot-approve"]').trigger('click')
    await wrapper.get('[data-testid="story-shot-cancel"]').trigger('click')
    expect(wrapper.emitted('approve')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

describe('StoryShotProgress 008', () => {
  it('shows real shot states and retry actions without fake percentages', async () => {
    const scene = makeReelScene(1, [
      makeShotDto({ order: 1, status: 'VIDEO_READY', videoUrl: 'https://v3.fal.media/files/test/1.mp4' }),
      makeShotDto({ order: 2, status: 'VIDEO_FAILED', videoAttempts: 1, error: null }),
    ])
    const story = makeReelStoryDto({
      status: 'GENERATING_VIDEOS',
      scenes: [scene],
      plannedDurationSeconds: 6,
    })
    const wrapper = await mountSuspended(StoryShotProgress, {
      attachTo: document.body,
      props: { story, phase: 'videos', elapsedSeconds: 120, isSlow: false },
    })

    expect(wrapper.get('[data-testid="story-shot-progress-total"]').text())
      .toContain('1 de 2 vídeos listos')
    expect(wrapper.findAll('[data-testid="story-shot-progress-row"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="story-shot-retry"]').exists()).toBe(true)

    await wrapper.get('[data-testid="story-shot-retry"]').trigger('click')
    expect(wrapper.emitted('retryShot')?.[0]).toEqual(['shot-dto-2'])
  })
})

describe('StoryShotQC 008', () => {
  it('shows shot-attributed QC and allows recover at two attempts in standard', async () => {
    const shot = makeShotDto({
      order: 1,
      status: 'VIDEO_READY',
      keyframeAttempts: 2,
      videoUrl: 'https://v3.fal.media/files/test/video.mp4',
    })
    const scene = makeReelScene(1, [shot])
    const qc = makeShotQc({
      shots: [{
        shotId: shot.id,
        sceneId: scene.id,
        sceneOrder: 1,
        shotOrder: 1,
        indexInScene: 1,
        framesUrl: 'https://v3.fal.media/files/test/qc.jpg',
        technical: 'pass',
        observed: {
          characters: ['mara'],
          wardrobeMismatch: [],
          unknownCharacters: false,
          props: ['postre'],
          unknownProps: false,
          locationMatches: true,
          weatherMatches: true,
          timeOfDayMatches: true,
          continuityMatches: true,
          textOrWatermark: false,
          artifacts: false,
        },
        confidence: 0.8,
        issues: [{
          code: 'wrong-prop',
          severity: 'blocking',
          sceneId: scene.id,
          order: 1,
          shotId: shot.id,
          shotOrder: 1,
          frame: 'middle',
        }],
      }],
      issues: [{
        code: 'wrong-prop',
        severity: 'blocking',
        sceneId: scene.id,
        order: 1,
        shotId: shot.id,
        shotOrder: 1,
        frame: 'middle',
      }],
    })
    const story = makeReelStoryDto({ status: 'WAITING_QC', scenes: [scene], qc })
    const wrapper = await mountSuspended(StoryShotQC, {
      attachTo: document.body,
      props: { story },
    })

    expect(wrapper.findAll('[data-testid="story-shot-qc-row"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="story-shot-qc-issue"]').attributes('data-severity'))
      .toBe('blocking')
    expect(wrapper.get('[data-testid="story-shot-qc-recover"]').exists()).toBe(true)

    await wrapper.get('[data-testid="story-shot-qc-recover"]').trigger('click')
    await wrapper.get('[data-testid="story-shot-qc-retry"]').trigger('click')
    await wrapper.get('[data-testid="story-shot-qc-cancel"]').trigger('click')

    expect(wrapper.emitted('recoverShot')?.[0]).toEqual([shot.id])
    expect(wrapper.emitted('retryQc')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not offer Volver a revisar when the failure is not revalidatable', async () => {
    const shot = makeShotDto({
      order: 1,
      status: 'VIDEO_FAILED',
      videoError: 'provider-error',
      videoUrl: null,
    })
    const story = makeReelStoryDto({
      status: 'WAITING_QC',
      scenes: [makeReelScene(1, [shot])],
      qc: makeShotQc({ shots: [] }),
    })
    const wrapper = await mountSuspended(StoryShotQC, { props: { story } })

    expect(wrapper.find('[data-testid="story-shot-qc-retry"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="story-shot-qc-start-over"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="story-shot-qc-cancel"]').exists()).toBe(true)
  })

  it('enables manual approval only after confirmation and all videos ready', async () => {
    const shot = makeShotDto({
      order: 1,
      status: 'VIDEO_READY',
      videoUrl: 'https://v3.fal.media/files/test/video.mp4',
    })
    const scene = makeReelScene(1, [shot])
    const story = makeReelStoryDto({
      status: 'WAITING_QC',
      scenes: [scene],
      qc: makeShotQc({ shots: [] }),
    })
    const wrapper = await mountSuspended(StoryShotQC, {
      props: { story },
    })

    expect(wrapper.find('[data-testid="story-shot-qc-approve"]').exists()).toBe(false)
    await wrapper.get('[data-testid="story-shot-qc-confirm"]').setValue(true)
    expect(wrapper.get('[data-testid="story-shot-qc-approve"]').exists()).toBe(true)
  })
})

describe('StoryShotResult 008', () => {
  it('renders the MP4, duration, shot count, mode and restart', async () => {
    const scene = makeReelScene(1, [
      makeShotDto({ order: 1 }),
      makeShotDto({ order: 2, durationSeconds: 4 }),
    ])
    const story = makeReelStoryDto({
      status: 'READY',
      scenes: [scene],
      finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4',
      finalDurationSeconds: 7,
      costMode: 'production',
    })
    const wrapper = await mountSuspended(StoryShotResult, {
      attachTo: document.body,
      props: { story },
    })

    expect(wrapper.get('[data-testid="story-shot-final-video"]').attributes('src'))
      .toBe('https://v3.fal.media/files/test/final.mp4')
    expect(normalize(wrapper.get('[data-testid="story-shot-result-shots"]').text())).toBe('2')
    expect(normalize(wrapper.get('[data-testid="story-shot-result-duration"]').text())).toBe('7 s')
    expect(normalize(wrapper.get('[data-testid="story-shot-result-cost"]').text())).toBe('Producción')

    await wrapper.get('[data-testid="story-shot-restart"]').trigger('click')
    expect(wrapper.emitted('restart')).toHaveLength(1)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="story-shot-result-heading"]').element,
    )
  })
})
