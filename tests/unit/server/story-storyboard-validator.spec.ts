// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateStoryboardDraft, assembleStoryPlan } from '../../../server/story/storyboard-validator'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'
import storyboard from '../../fixtures/deepseek/storyboard-valid.json'
import invalidOrder from '../../fixtures/deepseek/storyboard-invalid-order.json'

describe('storyboard-validator', () => {
  it('accepts a valid storyboard with exactly four fields per beat', () => {
    const result = validateStoryboardDraft(storyboard, { sceneCount: 5 })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })

  it('rejects an order mismatch', () => {
    const result = validateStoryboardDraft(invalidOrder, { sceneCount: 5 })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toContain('order')
  })

  it('rejects extra narrative fields', () => {
    const value = structuredClone(storyboard)
    value.beats[0] = { ...value.beats[0], action: 'Nueva acción' }

    const result = validateStoryboardDraft(value, { sceneCount: 5 })

    expect(result.ok).toBe(false)
  })

  it('copies narrative fields byte-for-byte and only adds visual fields', () => {
    const validated = validateStoryboardDraft(storyboard, { sceneCount: 5 })

    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    const plan = assembleStoryPlan(narrative, validated.draft)

    expect(plan.storyBible).toBe(narrative.storyBible)
    for (const [index, beat] of plan.beats.entries()) {
      const source = narrative.beats[index]!
      const visual = storyboard.beats[index]!

      expect(beat.action).toBe(source.action)
      expect(beat.narration).toBe(source.narration)
      expect(beat.characters).toEqual(source.characters)
      expect(beat.props).toEqual(source.props)
      expect(beat.locationId).toBe(source.locationId)
      expect(beat.visualPrompt).toBe(visual.visualPrompt)
      expect(beat.camera).toBe(visual.camera)
    }
  })

  it('rejects a non-cut transition', () => {
    const value = structuredClone(storyboard)
    value.beats[2] = { ...value.beats[2], transition: 'crossfade' }

    expect(validateStoryboardDraft(value, { sceneCount: 5 }).ok).toBe(false)
  })
})
