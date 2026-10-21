import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryBibleSummary from '~/components/story/StoryBibleSummary.vue'
import StoryReview from '~/components/story/StoryReview.vue'
import type { StoryBible, StoryPlan } from '~/models/story'
import plan5 from '../fixtures/deepseek/deepseek-plan-5.json'
import { makeSceneDto, makeStoryDto } from '../helpers/story'

const BIBLE = plan5.storyBible as StoryBible
const PLAN = plan5 as StoryPlan

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('StoryBibleSummary', () => {
  it('renders a closed details with the seven normative rows', async () => {
    const wrapper = await mountSuspended(StoryBibleSummary, { props: { bible: BIBLE } })
    const details = wrapper.get('[data-testid="story-bible"]')

    expect(details.element.tagName).toBe('DETAILS')
    expect(details.attributes('open')).toBeUndefined()

    const summary = wrapper.get('[data-testid="story-bible-summary"]')
    expect(summary.element.tagName).toBe('SUMMARY')
    expect(normalize(summary.text())).toBe('Continuidad de la historia')

    for (const testid of [
      'story-bible-style',
      'story-bible-location',
      'story-bible-time',
      'story-bible-weather',
      'story-bible-characters',
      'story-bible-props',
      'story-bible-forbidden',
    ]) {
      expect(wrapper.find(`[data-testid="${testid}"]`).exists(), testid).toBe(true)
    }
  })

  it('shows bible names and wardrobe instead of ids', async () => {
    const wrapper = await mountSuspended(StoryBibleSummary, { props: { bible: BIBLE } })
    const text = normalize(wrapper.text())

    expect(text).toContain('Clara · Delantal de rayas azules sobre camisa blanca y pantalón oscuro.')
    expect(text).toContain('Merengue · Bol metálico con merengue brillante que dibuja figuras imposibles.')
    expect(text).toContain('Mañana')
    expect(text).toContain('Despejado')
    expect(text).toContain('No debe aparecer')
    expect(text).not.toContain('leadCharacterId')
  })

  it('is not rendered for a legacy story without a bible', async () => {
    const story = makeStoryDto({
      plan: { ...PLAN, storyBible: null },
      scenes: Array.from({ length: 5 }, (_value, index) =>
        makeSceneDto({ order: index + 1, status: 'KEYFRAME_READY', keyframeAttempts: 1 }),
      ),
    })
    const wrapper = await mountSuspended(StoryReview, { props: { story } })

    expect(wrapper.find('[data-testid="story-bible"]').exists()).toBe(false)
  })
})
