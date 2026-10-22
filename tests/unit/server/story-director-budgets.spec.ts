// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NARRATIVE_MAX_TOKENS_LIMIT,
  narrativeMaxTokens,
  narrativeRepairMaxTokens,
} from '../../../server/story/narrative-director'
import {
  VISUAL_MAX_TOKENS_LIMIT,
  visualMaxTokens,
  visualRepairMaxTokens,
} from '../../../server/story/visual-director'

describe('director output budgets', () => {
  it('uses the narrative budgets per scene', () => {
    expect(narrativeMaxTokens(4)).toBe(6_000)
    expect(narrativeMaxTokens(5)).toBe(7_000)
    expect(narrativeMaxTokens(6)).toBe(7_800)
    expect(narrativeRepairMaxTokens(6_000)).toBe(6_400)
    expect(narrativeRepairMaxTokens(7_800)).toBe(NARRATIVE_MAX_TOKENS_LIMIT)
  })

  it('uses the visual budgets per scene', () => {
    expect(visualMaxTokens(4)).toBe(2_400)
    expect(visualMaxTokens(5)).toBe(2_800)
    expect(visualMaxTokens(6)).toBe(3_200)
    expect(visualRepairMaxTokens(3_200)).toBe(3_500)
    expect(visualRepairMaxTokens(4_000)).toBe(VISUAL_MAX_TOKENS_LIMIT)
  })
})
