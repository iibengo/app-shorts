import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryStylePicker from '~/components/story/StoryStylePicker.vue'
import { STORY_VISUAL_STYLE_OPTIONS } from '~/data/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

describe('StoryStylePicker', () => {
  it('renders a labelled radiogroup with every style', async () => {
    const wrapper = await mountSuspended(StoryStylePicker, {
      attachTo: document.body,
      props: { visualStyle: 'cartoon3d' },
    })
    const fieldset = wrapper.get('fieldset')
    const group = wrapper.get('[data-testid="story-style-group"]')

    expect(normalize(fieldset.get('legend').text())).toBe('Estilo visual')
    expect(group.attributes('role')).toBe('radiogroup')
    expect(group.attributes('aria-labelledby')).toBe('story-style-legend')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(STORY_VISUAL_STYLE_OPTIONS.length)

    for (const option of STORY_VISUAL_STYLE_OPTIONS) {
      expect(wrapper.get(`[data-testid="story-style-${option.visualStyle}"]`).attributes('value'))
        .toBe(option.visualStyle)
      expect(normalize(wrapper.text())).toContain(option.label)
    }
  })

  it('marks cartoon3d as the default selection', async () => {
    const wrapper = await mountSuspended(StoryStylePicker, {
      attachTo: document.body,
      props: { visualStyle: 'cartoon3d' },
    })

    expect(wrapper.get('[data-testid="story-style-cartoon3d"]').attributes('checked')).toBeDefined()
    expect(wrapper.get('[data-testid="story-style-papercraft"]').attributes('checked')).toBeUndefined()
  })

  it('emits the selected style', async () => {
    const wrapper = await mountSuspended(StoryStylePicker, {
      attachTo: document.body,
      props: { visualStyle: 'cartoon3d' },
    })
    const input = wrapper.get('[data-testid="story-style-papercraft"]')

    await input.setValue(true)

    expect(wrapper.emitted('update:visualStyle')?.[0]).toEqual(['papercraft'])
  })
})
