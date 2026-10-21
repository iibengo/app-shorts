// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  validateContinuityBeats,
  validateStoryBible,
} from '../../../server/story/bible-validator'
import { validateDirectorPlan } from '../../../server/story/plan-validator'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'

const BIBLE = plan5.storyBible

function cloneBible(overrides: Record<string, unknown> = {}) {
  return { ...structuredClone(BIBLE), ...overrides }
}

function clonePlan(overrides: Record<string, unknown> = {}) {
  return { ...structuredClone(plan5), ...overrides }
}

describe('bible-validator: valid bible', () => {
  it('accepts the normative 5-scene fixture', () => {
    const validation = validateStoryBible(cloneBible())

    expect(validation.ok).toBe(true)

    const plan = validateDirectorPlan(clonePlan(), 5)

    expect(plan.ok, plan.ok ? '' : plan.reason).toBe(true)
  })

  it('normalizes NFC and trims bible text', () => {
    const validation = validateStoryBible(cloneBible({
      style: `  Cafe\u0301 con luz cálida y suficiente  `,
    }))

    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.bible.style).toBe('Café con luz cálida y suficiente')
  })
})

describe('bible-validator: bible invariants', () => {
  it.each([
    ['duplicate character id', cloneBible({
      characters: [
        ...BIBLE.characters,
        { ...BIBLE.characters[0], name: 'Otra' },
      ],
    })],
    ['unknown lead', cloneBible({ leadCharacterId: 'nadie' })],
    ['unknown signature prop', cloneBible({ signaturePropId: 'nada' })],
    ['zero characters', cloneBible({ characters: [] })],
    ['four characters', cloneBible({
      characters: Array.from({ length: 4 }, (_value, index) => ({
        ...BIBLE.characters[0],
        id: `character-${index}`,
      })),
    })],
    ['zero props', cloneBible({ props: [] })],
    ['four props', cloneBible({
      props: Array.from({ length: 4 }, (_value, index) => ({
        ...BIBLE.props[0],
        id: `prop-${index}`,
      })),
    })],
    ['empty forbidden', cloneBible({ forbidden: [] })],
    ['eleven forbidden', cloneBible({
      forbidden: Array.from({ length: 11 }, (_value, index) => `extra ${index}`),
    })],
    ['forbidden contradicts a character name', cloneBible({
      forbidden: [...BIBLE.forbidden, 'Clara'],
    })],
    ['forbidden contradicts a prop name', cloneBible({
      forbidden: [...BIBLE.forbidden, 'Merengue'],
    })],
    ['forbidden contradicts the time of day', cloneBible({
      forbidden: [...BIBLE.forbidden, 'Mañana'],
    })],
    ['forbidden contradicts the weather', cloneBible({
      forbidden: [...BIBLE.forbidden, 'Despejado'],
    })],
    ['url in the bible', cloneBible({ style: 'Estilo con https://evil.example' })],
    ['html in the bible', cloneBible({ style: 'Estilo con <script>alert</script>' })],
    ['short style', cloneBible({ style: 'corto' })],
    ['empty location description', cloneBible({
      location: { name: 'Parque', description: 'corto' },
    })],
  ])('rejects %s', (_label, value) => {
    expect(validateStoryBible(value).ok).toBe(false)
  })

  it('never includes plan content in a rejection reason', () => {
    const validation = validateStoryBible(cloneBible({
      style: 'Estilo con https://evil.example/secreto',
    }))

    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.reason).not.toContain('evil')
    expect(validation.reason).not.toContain('secreto')
  })
})

describe('bible-validator: continuity beats', () => {
  it.each([
    ['beat without the lead', plan5.beats.map((beat, index) =>
      index === 3 ? { ...beat, characters: [] } : beat)],
    ['beat with an unknown character', plan5.beats.map((beat, index) =>
      index === 3 ? { ...beat, characters: ['nadie'] } : beat)],
    ['beat without the signature prop', plan5.beats.map((beat, index) =>
      index === 3 ? { ...beat, props: [] } : beat)],
    ['first beat with continuity', plan5.beats.map((beat, index) =>
      index === 0 ? { ...beat, continuityFromPrevious: 'Continúa algo anterior.' } : beat)],
    ['non-cut transition', plan5.beats.map((beat, index) =>
      index === 2 ? { ...beat, transition: 'crossfade' } : beat)],
    ['wrong first role', plan5.beats.map((beat, index) =>
      index === 0 ? { ...beat, sceneRole: 'development' } : beat)],
    ['wrong last role', plan5.beats.map((beat, index) =>
      index === 4 ? { ...beat, sceneRole: 'climax' } : beat)],
    ['resolution on an intermediate beat', plan5.beats.map((beat, index) =>
      index === 1 ? { ...beat, sceneRole: 'resolution' } : beat)],
    ['establishing on an intermediate beat', plan5.beats.map((beat, index) =>
      index === 2 ? { ...beat, sceneRole: 'establishing' } : beat)],
    ['no climax', plan5.beats.map((beat) =>
      beat.sceneRole === 'climax' ? { ...beat, sceneRole: 'development' } : beat)],
    ['climax on the first beat', plan5.beats.map((beat, index) =>
      index === 0 ? { ...beat, sceneRole: 'climax' } : beat)],
    ['unknown camera', plan5.beats.map((beat, index) =>
      index === 2 ? { ...beat, camera: 'drone' } : beat)],
    ['url in a beat', plan5.beats.map((beat, index) =>
      index === 2 ? { ...beat, visualPrompt: `${beat.visualPrompt} https://evil.example` } : beat)],
  ])('rejects %s', (_label, beats) => {
    const plan = validateDirectorPlan(clonePlan({ beats }), 5)

    expect(plan.ok).toBe(false)
  })

  it('rejects a bible character that never appears', () => {
    const bible = cloneBible({
      characters: [
        ...BIBLE.characters,
        {
          id: 'ana',
          name: 'Ana',
          description: 'Amiga de Clara con abrigo verde y bufanda gris.',
          wardrobe: 'Abrigo verde y bufanda gris.',
        },
      ],
    })
    const validation = validateStoryBible(bible)

    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const beats = validateContinuityBeats(plan5.beats, 5, validation.bible)

    expect(beats.ok).toBe(false)
    if (beats.ok) return
    expect(beats.reason).toBe('beats: personaje de la biblia sin escena')
  })

  it('rejects a plan that requires a legacy bible in creation mode', () => {
    const legacy = { title: plan5.title, logline: plan5.logline, beats: [] }

    expect(validateDirectorPlan(legacy, 5).ok).toBe(false)
    expect(validateDirectorPlan(legacy, 5, { allowLegacyBible: true }).ok).toBe(false)
  })

  it('accepts a persisted legacy plan in read mode', () => {
    const legacy = {
      title: plan5.title,
      logline: plan5.logline,
      beats: plan5.beats.map((beat) => ({
        order: beat.order,
        visualPrompt: beat.visualPrompt,
        narration: beat.narration,
      })),
    }
    const plan = validateDirectorPlan(legacy, 5, { allowLegacyBible: true })

    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.plan.storyBible).toBeNull()
    expect(plan.plan.beats).toHaveLength(5)
  })
})
