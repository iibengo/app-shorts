import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryQCReview from '~/components/story/StoryQCReview.vue'
import type {
  Story,
  StoryQC,
  StoryQCIssue,
  StoryQCSceneResult,
  StoryQCObserved,
} from '~/models/story'
import { makeSceneDto, makeStoryDto } from '../helpers/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const OBSERVED: StoryQCObserved = {
  characters: ['clara'],
  wardrobeMismatch: [],
  unknownCharacters: false,
  props: ['merengue'],
  unknownProps: false,
  locationMatches: true,
  weatherMatches: true,
  timeOfDayMatches: true,
  continuityMatches: true,
  textOrWatermark: false,
  artifacts: false,
}

function blockingIssue(order: number, code: StoryQCIssue['code'] = 'wrong-prop'): StoryQCIssue {
  return {
    code,
    severity: 'blocking',
    sceneId: `scene-dto-${order}`,
    order,
    frame: 'middle',
  }
}

function qcResult(order: number, issues: readonly StoryQCIssue[] = []): StoryQCSceneResult {
  return {
    sceneId: `scene-dto-${order}`,
    order,
    framesUrl: `https://v3.fal.media/files/test/story-qc-${order}.jpg`,
    technical: 'pass',
    observed: OBSERVED,
    confidence: 0.62,
    issues,
  }
}

function qc(overrides: Partial<StoryQC> = {}): StoryQC {
  const scenes = [1, 2, 3, 4, 5].map((order) => qcResult(order))
  scenes[0] = qcResult(1, [blockingIssue(1)])

  return {
    status: 'FAILED',
    errorCode: null,
    evaluator: 'vision',
    checkedAt: '2026-10-21T18:20:00.000Z',
    confidence: 0.62,
    scenes,
    issues: [blockingIssue(1)],
    override: null,
    ...overrides,
  }
}

function waitingStory(overrides: Partial<Story> = {}): Story {
  return makeStoryDto({
    status: 'WAITING_QC',
    pollAfterMs: 0,
    qc: qc(),
    scenes: Array.from({ length: 5 }, (_value, index) =>
      makeSceneDto({
        id: `scene-dto-${index + 1}`,
        order: index + 1,
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
        videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      }),
    ),
    ...overrides,
  })
}

async function mountReview(story = waitingStory()) {
  return mountSuspended(StoryQCReview, {
    attachTo: document.body,
    props: { story },
  })
}

describe('StoryQCReview', () => {
  it('renders the heading, focus and the verdict with role status', async () => {
    const wrapper = await mountReview()
    const heading = wrapper.get('[data-testid="story-qc-heading"]')
    const verdict = wrapper.get('[data-testid="story-qc-verdict"]')

    expect(heading.element.tagName).toBe('H2')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(normalize(verdict.text())).toBe('Hemos encontrado 1 problema de continuidad.')
    expect(verdict.attributes('role')).toBe('status')
    expect(verdict.attributes('aria-live')).toBe('polite')
    expect(verdict.attributes('aria-atomic')).toBe('true')
  })

  it('renders a strip with a descriptive alt per scene', async () => {
    const wrapper = await mountReview()
    const frames = wrapper.findAll('[data-testid="story-qc-frames"]')

    expect(frames).toHaveLength(5)
    expect(frames[1]?.attributes('alt')).toBe(
      'Fotogramas de la escena 2: inicio, medio y final',
    )
  })

  it('renders missing frames without breaking the layout', async () => {
    const value = qc()
    value.scenes[1] = { ...value.scenes[1]!, framesUrl: null }
    const wrapper = await mountReview(waitingStory({ qc: value }))

    expect(wrapper.findAll('[data-testid="story-qc-frames-missing"]')).toHaveLength(1)
    expect(normalize(wrapper.text())).toContain('Fotogramas no disponibles.')
  })

  it('renders issues as a list with severity, code and copy', async () => {
    const value = qc()
    value.scenes[0] = qcResult(1, [
      blockingIssue(1, 'wrong-prop'),
      {
        code: 'visual-artifact',
        severity: 'warning',
        sceneId: 'scene-dto-1',
        order: 1,
        frame: 'middle',
      },
    ])
    value.issues = [...value.scenes[0]!.issues]
    const wrapper = await mountReview(waitingStory({ qc: value }))
    const issues = wrapper.findAll('[data-testid="story-qc-issue"]')

    expect(issues).toHaveLength(2)
    expect(issues[0]?.attributes('data-code')).toBe('wrong-prop')
    expect(issues[0]?.attributes('data-severity')).toBe('blocking')
    expect(normalize(issues[0]?.text())).toContain('Problema')
    expect(normalize(issues[1]?.text())).toContain('Aviso')
  })

  it('shows the honest manual review notice for UNAVAILABLE', async () => {
    const wrapper = await mountReview(waitingStory({
      qc: qc({ status: 'UNAVAILABLE', evaluator: 'none', errorCode: 'qc-not-configured', issues: [], scenes: qc().scenes.map((scene) => ({ ...scene, issues: [] })) }),
    }))

    expect(wrapper.find('[data-testid="story-qc-unavailable"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="story-qc-unavailable"]').text())).toBe(
      'La revisión automática no está disponible. Revisa las escenas antes de continuar.',
    )
    expect(normalize(wrapper.get('[data-testid="story-qc-verdict"]').text())).toBe(
      'La revisión automática no está disponible.',
    )
  })

  it('does not claim success when confidence is low', async () => {
    const value = qc({ status: 'NEEDS_REVIEW', issues: [] })
    value.scenes = value.scenes.map((scene) => ({ ...scene, issues: [] }))
    const wrapper = await mountReview(waitingStory({ qc: value }))

    expect(normalize(wrapper.get('[data-testid="story-qc-verdict"]').text())).toBe(
      'No hemos podido confirmar la continuidad con suficiente confianza.',
    )
  })

  it('requires the explicit checkbox before enabling the override', async () => {
    const wrapper = await mountReview()
    const button = wrapper.get('[data-testid="story-qc-override"]')
    const checkbox = wrapper.get('[data-testid="story-qc-override-confirm"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(normalize(wrapper.text())).toContain(
      'Al aprobar de todos modos, la historia puede mantener los problemas detectados.',
    )
    expect(normalize(wrapper.text())).toContain(
      'Entiendo que el vídeo puede tener errores de continuidad.',
    )

    await checkbox.setValue(true)

    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.emitted('approve')).toHaveLength(1)
  })

  it('never offers the override with a technically broken clip but allows retry with its video', async () => {
    const story = waitingStory()
    story.scenes[2] = { ...story.scenes[2]!, status: 'VIDEO_FAILED' }
    const wrapper = await mountReview(story)
    const checkbox = wrapper.get('[data-testid="story-qc-override-confirm"]')

    await checkbox.setValue(true)

    expect(wrapper.get('[data-testid="story-qc-override"]').attributes('disabled'))
      .toBeDefined()
    expect(wrapper.find('[data-testid="story-qc-recover-video"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="story-qc-retry"]').attributes('disabled'))
      .toBeUndefined()
    expect(wrapper.find('[data-testid="story-qc-retry-blocked"]').exists()).toBe(false)
  })

  it('blocks retry only when a scene has no video', async () => {
    const story = waitingStory()
    story.scenes[2] = {
      ...story.scenes[2]!,
      status: 'VIDEO_FAILED',
      videoUrl: null,
    }
    const wrapper = await mountReview(story)

    expect(wrapper.get('[data-testid="story-qc-retry"]').attributes('disabled'))
      .toBeDefined()
    expect(normalize(wrapper.get('[data-testid="story-qc-retry-blocked"]').text())).toBe(
      'No se puede volver a revisar mientras una escena tenga el vídeo roto.',
    )
  })

  it('explains exhausted retries instead of showing a dead button', async () => {
    const story = waitingStory()
    story.scenes[0] = { ...story.scenes[0]!, keyframeAttempts: 2 }
    const wrapper = await mountReview(story)
    const firstCard = wrapper.findAll('[data-testid="story-qc-scene"]')[0]!

    expect(normalize(firstCard.text())).toContain('No quedan reintentos para esta escena.')
    expect(firstCard.find('[data-testid="story-qc-recover"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="story-qc-retry"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="story-qc-start-over"]').exists()).toBe(true)
  })

  it('emits recover, retry QC and cancel', async () => {
    const wrapper = await mountReview()

    await wrapper.get('[data-testid="story-qc-recover"]').trigger('click')
    await wrapper.get('[data-testid="story-qc-retry"]').trigger('click')
    await wrapper.get('[data-testid="story-qc-cancel"]').trigger('click')

    expect(wrapper.emitted('recover')?.[0]).toEqual(['scene-dto-1'])
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('emits retry video for a broken scene and start over when retries are exhausted', async () => {
    const story = waitingStory()
    story.scenes[3] = { ...story.scenes[3]!, status: 'VIDEO_FAILED', videoAttempts: 1 }
    story.scenes[4] = { ...story.scenes[4]!, videoAttempts: 2 }
    const wrapper = await mountReview(story)

    const cards = wrapper.findAll('[data-testid="story-qc-scene"]')

    expect(cards[3]?.find('[data-testid="story-qc-recover-video"]').exists()).toBe(true)
    expect(cards[4]?.find('[data-testid="story-qc-recover-video"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="story-qc-start-over"]').exists()).toBe(false)

    await cards[3]!.find('[data-testid="story-qc-recover-video"]').trigger('click')
    expect(wrapper.emitted('retryVideo')?.[0]).toEqual(['scene-dto-4'])

    story.scenes[4] = { ...story.scenes[4]!, status: 'VIDEO_FAILED', videoAttempts: 2 }
    const exhausted = await mountReview(story)

    expect(exhausted.find('[data-testid="story-qc-start-over"]').exists()).toBe(true)
  })
})
