// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { reelShotSystemPrompt } from '../../../server/story/reel-shot-prompt'
import { durationPlanFor } from '../../../server/story/cost-profiles'

const PLAN = durationPlanFor('standard', 15)

describe('shot director prompt', () => {
  it('asks for framing variety in the same location', () => {
    const prompt = reelShotSystemPrompt('creative', PLAN)

    // 013: three shots of the same person in the same place read as one take.
    // The detector exists; the prompt must name the rule it enforces.
    expect(prompt).toContain('mismo framing en la misma localización')
  })

  it('requires a single focused subject when a secondary acts', () => {
    const prompt = reelShotSystemPrompt('creative', PLAN)

    expect(prompt).toContain('Si un secundario ejecuta la acción')
    for (const framing of ['close-up', 'insert', 'detail', 'reaction']) {
      expect(prompt).toContain(framing)
    }
  })

  it('stays deterministic', () => {
    expect(reelShotSystemPrompt('creative', PLAN)).toBe(reelShotSystemPrompt('creative', PLAN))
  })
})
