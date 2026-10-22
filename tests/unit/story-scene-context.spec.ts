import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StorySceneCard from '~/components/story/StorySceneCard.vue'
import type { StoryPlan } from '~/models/story'
import { makeSceneDto } from '../helpers/story'
import creative from '../fixtures/story/plan-creative-scene-changes.json'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountContext(options: {
  readonly withBible?: boolean
  readonly withPrevious?: boolean
} = {}) {
  const plan = creative as StoryPlan
  const beat = plan.beats[2]!

  return mountSuspended(StorySceneCard, {
    attachTo: document.body,
    props: {
      scene: makeSceneDto({ order: 3, status: 'KEYFRAME_READY', keyframeAttempts: 1 }),
      total: 5,
      disabled: false,
      bible: options.withBible === false ? null : plan.storyBible,
      beat,
      previousBeat: options.withPrevious === false ? null : plan.beats[1]!,
    },
  })
}

describe('StorySceneCard per-scene context', () => {
  it('renders location, time, weather, characters, props, camera and continuity', async () => {
    const wrapper = await mountContext()

    expect(normalize(wrapper.get('[data-testid="story-scene-location"]').text())).toContain('Calle')
    expect(normalize(wrapper.get('[data-testid="story-scene-time"]').text())).toContain('Hora')
    expect(normalize(wrapper.get('[data-testid="story-scene-weather"]').text())).toContain('Clima')
    expect(normalize(wrapper.get('[data-testid="story-scene-characters"]').text())).toContain('Clara')
    expect(normalize(wrapper.get('[data-testid="story-scene-props"]').text())).toContain('Merengue')
    expect(normalize(wrapper.get('[data-testid="story-scene-camera"]').text())).toContain('Cámara')
    expect(normalize(wrapper.get('[data-testid="story-scene-continuity"]').text())).toContain('Continuidad')
    expect(normalize(wrapper.get('[data-testid="story-scene-location-change"]').text())).toBe('Cambio de escena')
  })

  it('does not render context rows without a canon', async () => {
    const wrapper = await mountContext({ withBible: false })

    expect(wrapper.find('[data-testid="story-scene-context"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="story-scene-location-change"]').exists()).toBe(false)
  })

  it('does not show a scene change when the location is unchanged', async () => {
    const plan = creative as StoryPlan
    const wrapper = await mountSuspended(StorySceneCard, {
      attachTo: document.body,
      props: {
        scene: makeSceneDto({ order: 4, status: 'KEYFRAME_READY', keyframeAttempts: 1 }),
        total: 5,
        disabled: false,
        bible: plan.storyBible,
        beat: plan.beats[3]!,
        previousBeat: plan.beats[2]!,
      },
    })

    expect(wrapper.find('[data-testid="story-scene-location-change"]').exists()).toBe(false)
  })
})
