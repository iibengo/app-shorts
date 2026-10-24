// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  slugCanonId,
  validateBeats,
  validateCanon,
  validateNarrativeDraft,
} from '../../../server/story/canon-validator'
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

describe('canon-validator: independent canon and beats', () => {
  it('validates the canon before validating beats against it', () => {
    const { beats: _beats, ...canonValue } = narrativeCreative
    const canon = validateCanon(canonValue, { mode: 'creative' })

    expect(canon.ok, canon.ok ? '' : canon.reason).toBe(true)
    if (!canon.ok) return

    const beats = validateBeats({ beats: narrativeCreative.beats }, {
      sceneCount: 5,
      canon: canon.canon,
    })

    expect(beats.ok, beats.ok ? '' : beats.reason).toBe(true)
  })

  it('rejects beats against a canon that does not contain their locations', () => {
    const canon = validateCanon({
      title: narrativeCreative.title,
      logline: narrativeCreative.logline,
      tone: narrativeCreative.tone,
      storyBible: {
        ...narrativeCreative.storyBible,
        locations: [narrativeCreative.storyBible.locations[0]!],
      },
    }, { mode: 'creative' })

    expect(canon.ok).toBe(true)
    if (!canon.ok) return

    const beats = validateBeats({ beats: narrativeCreative.beats }, {
      sceneCount: 5,
      canon: canon.canon,
    })

    expect(beats.ok).toBe(false)
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
  it('drops forbidden entries that contradict the canon instead of failing', () => {
    const value = clone(narrativeCreative)
    value.storyBible.forbidden.push('Clara')

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.draft.storyBible.forbidden).not.toContain('Clara')
    expect(result.draft.storyBible.forbidden.length).toBe(value.storyBible.forbidden.length - 1)
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
  ])('tolerates forbidden context matches and lets composeNegative filter them: %s', (term) => {
    const value = clone(narrativeCreative)
    value.storyBible = {
      ...value.storyBible,
      forbidden: [...value.storyBible.forbidden.slice(0, 9), term],
    }

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
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
    value.beats[1]!.action = 'Clara cruza la calle bajo la lluvia nocturna con el merengue: '
      + 'lo esconde bajo la chaqueta, mira si alguien la sigue y sigue caminando hasta la esquina sin girarse.'

    const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })
})

describe('canon-validator: id normalization', () => {
  function canonDraft() {
    const source = clone(narrativeCreative) as unknown as Record<string, unknown>

    return {
      title: source.title,
      logline: source.logline,
      tone: source.tone,
      storyBible: clone(source.storyBible),
    } as {
      title: unknown
      logline: unknown
      tone: unknown
      storyBible: {
        leadCharacterId: string
        signaturePropId: string | null
        characters: { id: string }[]
        locations: { id: string }[]
        props: { id: string }[]
      }
    }
  }

  it('slugs entity ids instead of rejecting them and keeps references valid', () => {
    const draft = canonDraft()
    draft.storyBible.characters[0]!.id = 'Clara la Repostera'
    draft.storyBible.leadCharacterId = 'Clara la Repostera'
    if (draft.storyBible.props[0]) {
      draft.storyBible.props[0].id = 'Calabaza de Halloween'
      draft.storyBible.signaturePropId = 'Calabaza de Halloween'
    }

    const result = validateCanon(draft, { mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.canon.storyBible.characters[0]?.id).toBe('clara-la-repostera')
    expect(result.canon.storyBible.leadCharacterId).toBe('clara-la-repostera')
    if (draft.storyBible.props[0]) {
      expect(result.canon.storyBible.props[0]?.id).toBe('calabaza-de-halloween')
    }
  })

  it('strips accents and leading digits', () => {
    expect(slugCanonId('Calabaza de Halloween')).toBe('calabaza-de-halloween')
    expect(slugCanonId('ñandú veloz')).toBe('nandu-veloz')
    expect(slugCanonId('3 gatos')).toBe('e-3-gatos')
  })

  it('fails a canon whose entities collide after slugging', () => {
    const draft = canonDraft()
    if (draft.storyBible.props.length >= 2) {
      draft.storyBible.props[0]!.id = 'Calabaza'
      draft.storyBible.props[1]!.id = 'calabaza'
    }

    const result = validateCanon(draft, { mode: 'creative' })

    expect(result.ok).toBe(false)
  })
})
