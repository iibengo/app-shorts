// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeLegacyPlan } from '../../../server/story/legacy-plan'
import legacy from '../../fixtures/story/plan-006-legacy.json'

describe('legacy plan normalization', () => {
  it('normalizes a 006 plan to the 007 canon without a model call', () => {
    const plan = normalizeLegacyPlan(legacy, {
      sceneCount: 5,
      premise: 'Una repostera descubre que sus postres anticipan el futuro.',
      logline: legacy.logline,
      mode: 'faithful',
    })

    expect(plan).not.toBeNull()
    if (!plan) return

    expect(plan.tone).toBe('neutral')
    expect(plan.storyBible?.tone).toBe('neutral')
    expect(plan.storyBible?.locations).toHaveLength(1)
    expect(plan.storyBible?.locations[0]?.id).toBe('legacy-location')
    expect(plan.storyBible?.locations[0]?.source).toBe('premise')
    expect(plan.storyBible?.characters.every((character) => character.source === 'premise'))
      .toBe(true)
    expect(plan.storyBible?.props.every((prop) => prop.source === 'premise')).toBe(true)
    expect(plan.beats.every((beat) => beat.locationId === 'legacy-location')).toBe(true)
    expect(plan.beats.every((beat) => beat.action === beat.visualPrompt)).toBe(true)
    expect(plan.beats.every((beat) => beat.gag === null)).toBe(true)
    expect(plan.beats.map((beat) => beat.storyFunction)).toEqual([
      'hook',
      'complication',
      'escalation',
      'twist',
      'payoff',
    ])
  })

  it('falls back to safe time and weather for invalid legacy values', () => {
    const value = structuredClone(legacy)
    value.storyBible.timeOfDay = 'midnight'
    value.storyBible.weather = 'lava'

    const plan = normalizeLegacyPlan(value, {
      sceneCount: 5,
      premise: 'Una premisa legacy suficientemente larga.',
      logline: legacy.logline,
      mode: 'faithful',
    })

    expect(plan?.beats.every((beat) => beat.timeOfDay === 'morning')).toBe(true)
    expect(plan?.beats.every((beat) => beat.weather === 'clear')).toBe(true)
  })

  it('returns null for a plan without a bible', () => {
    expect(normalizeLegacyPlan({
      title: 'Legacy',
      logline: 'Sin biblia',
      storyBible: null,
      beats: [],
    }, {
      sceneCount: 0,
      premise: 'Premisa',
      logline: 'Logline',
      mode: 'faithful',
    })).toBeNull()
  })

  it('filters forbidden entries that collide with synthetic canon', () => {
    const value = structuredClone(legacy)
    value.storyBible.forbidden.push('Obrador de Clara')

    const plan = normalizeLegacyPlan(value, {
      sceneCount: 5,
      premise: 'Premisa suficientemente larga.',
      logline: legacy.logline,
      mode: 'faithful',
    })

    expect(plan?.storyBible?.forbidden).not.toContain('Obrador de Clara')
  })
})
