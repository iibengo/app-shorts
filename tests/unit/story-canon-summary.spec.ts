import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryCanonSummary from '~/components/story/StoryCanonSummary.vue'
import type { StoryBible, StoryPlan } from '~/models/story'
import creative from '../fixtures/story/plan-creative-scene-changes.json'

const BIBLE = (creative as StoryPlan).storyBible as StoryBible
const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountSummary(bible = BIBLE) {
  return mountSuspended(StoryCanonSummary, {
    attachTo: document.body,
    props: { bible },
  })
}

describe('StoryCanonSummary', () => {
  it('renders the seven canon rows with exact labels', async () => {
    const wrapper = await mountSummary()

    expect(normalize(wrapper.get('summary').text())).toBe('Canon de la historia')
    for (const testId of [
      'story-canon-style',
      'story-canon-tone',
      'story-canon-theme',
      'story-canon-characters',
      'story-canon-locations',
      'story-canon-props',
      'story-canon-forbidden',
    ]) {
      expect(wrapper.find(`[data-testid="${testId}"]`).exists(), testId).toBe(true)
    }

    const text = normalize(wrapper.text())
    for (const label of ['Estilo visual', 'Tono', 'Tema', 'Personajes', 'Localizaciones', 'Objetos', 'No debe aparecer']) {
      expect(text).toContain(label)
    }
    expect(wrapper.get('[data-testid="story-canon-tone"]').text()).toContain('Humor')
  })

  it('marks invented entities textually and exposes data-source', async () => {
    const wrapper = await mountSummary()
    const inventedCharacter = wrapper.get('[data-testid="story-invented-character"]')
    const inventedLocation = wrapper.get('[data-testid="story-invented-location"]')
    const inventedProp = wrapper.get('[data-testid="story-invented-prop"]')

    expect(normalize(inventedCharacter.text())).toBe('Personaje inventado')
    expect(normalize(inventedLocation.text())).toBe('Localización inventada')
    expect(normalize(inventedProp.text())).toBe('Objeto inventado')
    expect(wrapper.get('[data-testid="story-canon-character"][data-source="invented"]').exists())
      .toBe(true)
    expect(wrapper.get('[data-testid="story-canon-location"][data-source="invented"]').exists())
      .toBe(true)
    expect(wrapper.get('[data-testid="story-canon-prop"][data-source="invented"]').exists())
      .toBe(true)
  })

  it('is closed by default and uses a focusable native summary', async () => {
    const wrapper = await mountSummary()

    expect(wrapper.get('[data-testid="story-canon"]').attributes('open')).toBeUndefined()
    expect(wrapper.get('summary').element.tagName).toBe('SUMMARY')
    expect(wrapper.get('summary').classes()).toContain('focus-visible:ring-2')
  })
})
