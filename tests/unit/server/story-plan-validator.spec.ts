// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateStoryPlan } from '../../../server/story/plan-validator'
import { longGlobalPlan, longVideoPlan } from '../../helpers/story'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import creative from '../../fixtures/story/plan-creative-scene-changes.json'
import legacy from '../../fixtures/story/plan-006-legacy.json'

describe('story plan validator', () => {
  it('accepts a faithful plan with the new canon', () => {
    const result = validateStoryPlan(plan5, { sceneCount: 5, mode: 'faithful' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plan.storyBible?.locations.length).toBe(1)
    expect(result.plan.beats).toHaveLength(5)
  })

  it('accepts a creative plan with scene changes', () => {
    const result = validateStoryPlan(creative, { sceneCount: 5, mode: 'creative' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })

  it('rejects a creative plan in faithful mode when it has invented canon', () => {
    const result = validateStoryPlan(creative, { sceneCount: 5, mode: 'faithful' })

    expect(result.ok).toBe(false)
  })

  it('normalizes a persisted 006 plan in legacy read mode', () => {
    const result = validateStoryPlan(legacy, {
      sceneCount: 5,
      mode: 'faithful',
      allowLegacy: true,
      premise: 'Una repostera descubre que sus postres anticipan el futuro.',
      logline: legacy.logline,
    })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plan.tone).toBe('neutral')
    expect(result.plan.storyBible).not.toBeNull()
    expect(result.plan.beats[0]?.locationId).toBe('legacy-location')
  })

  it('rejects a plan with the wrong number of beats', () => {
    const result = validateStoryPlan({ ...plan5, beats: plan5.beats.slice(0, 4) }, {
      sceneCount: 5,
      mode: 'faithful',
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a storyboard with extra narrative fields', () => {
    const value = structuredClone(plan5)
    value.beats[0] = { ...value.beats[0], extra: true } as never

    expect(validateStoryPlan(value, { sceneCount: 5, mode: 'faithful' }).ok).toBe(false)
  })

  it('bounds the keyframe prompt so only the video limit rejects an oversized canon', () => {
    const validation = validateStoryPlan(longGlobalPlan(), { sceneCount: 5, mode: 'faithful' })

    expect(validation.ok).toBe(false)
    if (validation.ok) return
    expect(validation.reason).toContain('prompt de vídeo demasiado largo')
    expect(validation.reason).not.toContain('prompt final demasiado largo')
  })

  it.each<[string, ReturnType<typeof longVideoPlan>, string]>([
    ['video', longVideoPlan(), 'prompt de vídeo demasiado largo'],
  ])('rejects a plan that composes an oversized %s prompt', (_label, plan, reason) => {
    const result = validateStoryPlan(plan, { sceneCount: 5, mode: 'faithful' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain(reason)
  })

  it('rejects a plan with an invented source in faithful mode', () => {
    const result = validateStoryPlan(creative, { sceneCount: 5, mode: 'faithful' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('canon: faithful no admite elementos inventados')
  })
})
