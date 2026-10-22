// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateNarrativeDraft } from '../../../server/story/canon-validator'
import narrativeCreative from '../../fixtures/deepseek/narrative-creative-3-locations.json'
import narrative4 from '../../fixtures/deepseek/narrative-4-scenes.json'
import narrativeInvented from '../../fixtures/deepseek/narrative-faithful-invented.json'

function clone<T>(value: T): T {
  return structuredClone(value)
}

describe('canon-validator: valid canon', () => {
  it('accepts a creative canon with invented secondary entities', () => {
    const result = validateNarrativeDraft(narrativeCreative, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)

    if (!result.ok) return
    expect(result.draft.storyBible.locations).toHaveLength(3)
    expect(result.draft.storyBible.characters.some((character) => character.source === 'invented'))
      .toBe(true)
  })

  it('accepts a 4-scene faithful narrative', () => {
    const result = validateNarrativeDraft(narrative4, { sceneCount: 4, mode: 'faithful' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })
})

describe('canon-validator: mode rules', () => {
  it('rejects invented canon in faithful mode', () => {
    const result = validateNarrativeDraft(narrativeInvented, { sceneCount: 5, mode: 'faithful' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('canon: faithful no admite elementos inventados')
  })

  it('rejects three invented characters in creative mode', () => {
    const value = clone(narrativeCreative)

    value.storyBible.characters.push(
      {
        id: 'ana',
        name: 'Ana',
        description: 'Amiga de Clara con abrigo verde y bufanda gris.',
        wardrobe: 'Abrigo verde y bufanda gris.',
        source: 'invented',
      },
      {
        id: 'leo',
        name: 'Leo',
        description: 'Vecino de Clara con gafas redondas y sombrero.',
        wardrobe: 'Sombrero marrón y gafas redondas.',
        source: 'invented',
      },
    )

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
  })

  it('requires the signature prop to be premise', () => {
    const value = clone(narrativeCreative)
    value.storyBible.props[0]!.source = 'invented'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('signaturePropId')
  })
})

describe('canon-validator: canon invariants', () => {
  it('rejects forbidden entries that contradict the canon', () => {
    const value = clone(narrativeCreative)
    value.storyBible.forbidden.push('Clara')

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('storyBible.forbidden: contradice el canon')
  })

  it('rejects an empty forbidden list', () => {
    const value = clone(narrativeCreative)
    value.storyBible = { ...value.storyBible, forbidden: [] }

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('storyBible.forbidden')
  })

  it('rejects a forbidden list with eleven elements', () => {
    const value = clone(narrativeCreative)
    value.storyBible = {
      ...value.storyBible,
      forbidden: Array.from({ length: 11 }, (_value, index) => `Prohibido ${index + 1}`),
    }

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('storyBible.forbidden')
  })

  it.each([
    'Obrador de Clara',
    'mañana',
    'despejado',
    'Obrador de Clara ampliado',
  ])('rejects forbidden context matches: %s', (term) => {
    const value = clone(narrativeCreative)
    value.storyBible = {
      ...value.storyBible,
      forbidden: [...value.storyBible.forbidden.slice(0, 9), term],
    }

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('storyBible.forbidden: contradice el canon')
  })

  it('rejects canon entities that never appear in a beat', () => {
    const value = clone(narrativeCreative)
    value.storyBible.props.push({
      id: 'delantal-extra',
      name: 'Delantal extra',
      description: 'Delantal verde que nunca se usa en la historia.',
      source: 'premise',
    })

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
  })

  it('rejects a tone mismatch between plan and canon', () => {
    const value = clone(narrativeCreative)
    value.storyBible.tone = 'dramatic'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
  })
})

describe('canon-validator: narrative structure', () => {
  it('rejects a twist outside the climax beat', () => {
    const value = clone(narrativeCreative)
    value.beats[1]!.storyFunction = 'twist'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('twist')
  })

  it('rejects a missing payoff', () => {
    const value = clone(narrativeCreative)
    value.beats[4]!.storyFunction = 'complication'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
  })

  it('rejects an unknown location in a beat', () => {
    const value = clone(narrativeCreative)
    value.beats[2]!.locationId = 'missing'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('locationId')
  })

  it('allows different time and weather per beat', () => {
    const value = clone(narrativeCreative)
    value.beats[1]!.timeOfDay = 'night'
    value.beats[1]!.weather = 'rain'
    value.beats[1]!.action = 'Clara cruza la calle bajo la lluvia nocturna con el merengue.'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })
})
