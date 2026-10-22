// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BEATS_MAX_TOKENS,
  BEATS_REPAIR_MAX_TOKENS,
  BEATS_TIMEOUT_MS,
  CANON_MAX_TOKENS,
  CANON_REPAIR_MAX_TOKENS,
  CANON_TIMEOUT_MS,
} from '../../../server/story/narrative-director'
import {
  VISUAL_MAX_TOKENS_LIMIT,
  VISUAL_TIMEOUT_MS,
  visualMaxTokens,
  visualRepairMaxTokens,
} from '../../../server/story/visual-director'
import { DIRECTOR_TOTAL_TIMEOUT_MS } from '../../../server/story/director'

describe('director output budgets', () => {
  it('uses the canon and beats budgets', () => {
    expect(CANON_MAX_TOKENS).toBe(8_000)
    expect(CANON_REPAIR_MAX_TOKENS).toBe(8_000)
    expect(BEATS_MAX_TOKENS).toBe(8_000)
    expect(BEATS_REPAIR_MAX_TOKENS).toBe(8_000)
  })

  it('uses the enlarged pipeline timeouts', () => {
    expect(CANON_TIMEOUT_MS).toBe(60_000)
    expect(BEATS_TIMEOUT_MS).toBe(60_000)
    expect(VISUAL_TIMEOUT_MS).toBe(40_000)
    expect(DIRECTOR_TOTAL_TIMEOUT_MS).toBe(180_000)
  })

  it('uses the visual budgets per scene', () => {
    expect(visualMaxTokens(4)).toBe(2_400)
    expect(visualMaxTokens(5)).toBe(2_800)
    expect(visualMaxTokens(6)).toBe(3_200)
    expect(visualRepairMaxTokens(3_200)).toBe(3_500)
    expect(visualRepairMaxTokens(4_000)).toBe(VISUAL_MAX_TOKENS_LIMIT)
  })
})
