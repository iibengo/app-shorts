// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateNarrativeDraft } from '../../../server/story/canon-validator'
import { validateReelScenes } from '../../../server/story/reel-narrative-validator'
import type { NarrativeDraft } from '../../../server/story/director-types'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'

const BASE = narrative as NarrativeDraft

function clone(): NarrativeDraft {
  return structuredClone(BASE)
}

function reject(value: unknown, reason?: string): void {
  const result = validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' })

  expect(result.ok).toBe(false)
  if (result.ok) return
  if (reason) expect(result.reason).toContain(reason)
}

describe('canon beat structure', () => {
  it('accepts the baseline narrative', () => {
    const result = validateNarrativeDraft(BASE, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })

  it('rejects four locations', () => {
    const value = clone()
    value.storyBible.locations.push({
      id: 'extra',
      name: 'Extra',
      description: 'Una localización extra que no debería caber.',
      source: 'premise',
    })

    reject(value, 'storyBible.locations')
  })

  it('rejects six props', () => {
    const value = clone()
    value.storyBible.props.push(
      { id: 'p4', name: 'P4', description: 'Objeto extra cuatro de prueba.', source: 'premise' },
      { id: 'p5', name: 'P5', description: 'Objeto extra cinco de prueba.', source: 'premise' },
      { id: 'p6', name: 'P6', description: 'Objeto extra seis de prueba.', source: 'premise' },
    )

    reject(value, 'storyBible.props')
  })

  it.each([[], Array.from({ length: 11 }, (_value, index) => `Prohibido ${index}`)])(
    'rejects a forbidden list with an invalid size',
    (forbidden) => {
      const value = clone()
      value.storyBible = { ...value.storyBible, forbidden }
      reject(value, 'storyBible.forbidden')
    },
  )

  it.each([3, 121])('rejects a gag of %i characters', (length) => {
    const value = clone()
    value.beats[0] = { ...value.beats[0]!, gag: 'x'.repeat(length) }
    reject(value, 'beats[0].gag')
  })

  it('rejects a scene that only describes a picture', () => {
    // E1 (2026-10-25): the delivered story did not read because every beat was
    // a visual, not a stake. A scene with no stake is now invalid.
    const value = clone()
    value.beats[1] = { ...value.beats[1]!, stake: 'Mira.' }

    reject(value, 'beats[1].stake')
  })

  it('rejects a scene whose stake is too long to be a sentence', () => {
    const value = clone()
    value.beats[1] = { ...value.beats[1]!, stake: 'x'.repeat(121) }

    reject(value, 'beats[1].stake')
  })

  it('rejects two twists', () => {
    const value = clone()
    value.beats[1] = {
      ...value.beats[1]!,
      sceneRole: 'climax',
      storyFunction: 'twist',
    }
    reject(value)
  })

  it('rejects no twist', () => {
    const value = clone()
    value.beats[3] = { ...value.beats[3]!, storyFunction: 'escalation' }
    reject(value, 'twist')
  })

  it('rejects a hook outside the first beat', () => {
    const value = clone()
    value.beats[1] = { ...value.beats[1]!, storyFunction: 'hook' }
    reject(value, 'hook')
  })

  it('rejects a payoff outside the last beat', () => {
    const value = clone()
    value.beats[1] = { ...value.beats[1]!, storyFunction: 'payoff' }
    reject(value, 'payoff')
  })

  it('rejects five beats without a complication', () => {
    const value = clone()
    value.beats[1] = { ...value.beats[1]!, storyFunction: 'escalation' }
    reject(value, 'complication')
  })

  it('rejects five beats without an escalation', () => {
    const value = clone()
    value.beats[2] = { ...value.beats[2]!, storyFunction: 'complication' }
    reject(value, 'escalation')
  })

  it.each([
    'Obrador de Clara',
    'mañana',
    'despejado',
  ])('tolerates forbidden terms that collide with canon context: %s', (term) => {
    const value = clone()
    value.storyBible = {
      ...value.storyBible,
      forbidden: [...value.storyBible.forbidden.slice(0, 9), term],
    }

    expect(validateNarrativeDraft(value, { sceneCount: 5, mode: 'creative' }).ok).toBe(true)
  })

  it('rejects a global block over 2600 characters', () => {
    const value = clone()
    const text = (length: number, char: string): string => char.repeat(length)

    value.storyBible = {
      ...value.storyBible,
      style: text(160, 's'),
      theme: text(160, 't'),
      characters: value.storyBible.characters.map((character) => ({
        ...character,
        description: text(160, 'c'),
        wardrobe: text(120, 'w'),
      })),
      locations: value.storyBible.locations.map((location) => ({
        ...location,
        description: text(160, 'l'),
      })),
      props: value.storyBible.props.map((prop) => ({
        ...prop,
        description: text(120, 'p'),
      })),
      forbidden: Array.from({ length: 10 }, (_value, index) =>
        `Prohibido ${index} ${text(35, 'f')}`.slice(0, 50)),
      continuityRules: Array.from({ length: 5 }, (_value, index) =>
        `Regla ${index} ${text(120, 'r')}`.slice(0, 140)),
    }

    reject(value, 'bloque global demasiado largo')
  })
})

describe('E1 · the stake reaches the product', () => {
  // On 2026-10-25 the stake was validated and then dropped on the way to the
  // scene, the beat and the video prompt. The unit test passed because it built
  // the beat by hand; the pipeline never carried it. These walk the real path.
  it('keeps the stake when scenes are validated', () => {
    const source = BASE as unknown as Record<string, unknown>
    const beats = (source.beats as readonly Record<string, unknown>[]).map((beat) => ({
      ...beat,
      continuityFromPrevious: beat.order === 1
        ? null
        : 'Continúa desde la escena anterior con el mismo conflicto.',
    }))
    const canon = BASE as unknown as { storyBible: unknown }
    const result = validateReelScenes({ scenes: beats }, {
      canon,
      durationPlan: {
        costMode: 'standard',
        platform: 'tiktok',
        targetDurationSeconds: 30,
        maxDurationSeconds: 30,
        rhythm: 'tiktok',
        sceneCount: { min: 5, max: 5 },
        shotCount: { min: 9, max: 12 },
        shotsPerSceneMax: 4,
        exactShotCount: null,
        capUsd: 7,
        maxVideoAttempts: 2,
        attemptsReset: true,
        qualityAllowed: true,
        slowThresholdMs: 750_000,
      },
    })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)

    if (!result.ok) return
    expect(result.scenes[0]?.stake).toBe(BASE.beats[0]?.stake)
  })
})
