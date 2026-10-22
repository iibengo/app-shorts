import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryToneBadge from '~/components/story/StoryToneBadge.vue'
import type { StoryTone } from '~/models/story'

const LABELS: Readonly<Record<StoryTone, string>> = {
  humor: 'Humor',
  aventura: 'Aventura',
  absurdo: 'Absurdo',
  heartwarming: 'Emotivo',
  dramatic: 'Dramático',
  neutral: 'Neutro',
}

describe('StoryToneBadge', () => {
  it.each(Object.entries(LABELS) as [StoryTone, string][])(
    'renders the %s tone as text',
    async (tone, label) => {
      const wrapper = await mountSuspended(StoryToneBadge, {
        props: { tone },
      })
      const badge = wrapper.get('[data-testid="story-tone-badge"]')

      expect(badge.element.tagName).toBe('P')
      expect(badge.attributes('data-tone')).toBe(tone)
      expect(badge.text()).toBe(`Tono: ${label}`)
    },
  )

  it('never relies on color alone', async () => {
    const wrapper = await mountSuspended(StoryToneBadge, {
      props: { tone: 'humor' },
    })

    expect(wrapper.get('[data-testid="story-tone-badge"]').text()).toContain('Humor')
  })
})
