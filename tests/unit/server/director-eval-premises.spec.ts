// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadPremises } from '../../eval/director-harness'

describe('director eval premises', () => {
  it('ships 12 premises covering both modes and the three durations', () => {
    const { version, premises } = loadPremises()

    expect(version).toBe(1)
    expect(premises).toHaveLength(12)
    expect(premises.filter((premise) => premise.mode === 'faithful')).toHaveLength(3)
    expect(premises.filter((premise) => premise.mode === 'creative')).toHaveLength(9)
    expect(new Set(premises.map((premise) => premise.durationSeconds)))
      .toEqual(new Set([15, 30, 45]))
    expect(premises.filter((premise) => premise.costMode === 'budget').length).toBeGreaterThan(0)
    expect(premises.filter((premise) => premise.costMode === 'standard').length).toBeGreaterThan(0)
  })

  it('never uses a reference image because the eval does not touch Fal', () => {
    const { premises } = loadPremises()

    expect(premises.every((premise) => premise.hasReference === false)).toBe(true)
    expect(premises.every((premise) => premise.premise.length >= 10)).toBe(true)
  })
})
