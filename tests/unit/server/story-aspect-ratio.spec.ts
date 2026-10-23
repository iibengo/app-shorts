// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ASPECT_TOLERANCE,
  VERTICAL_ASPECT,
  isVerticalAspect,
} from '../../../server/story/aspect-ratio'

describe('vertical aspect gate', () => {
  it('accepts the vertical sizes the pipeline requests', () => {
    expect(isVerticalAspect(1152, 2048)).toBe(true)
    expect(isVerticalAspect(720, 1280)).toBe(true)
    // 768x1422 is 4 % off: the real provider output we saw in the probe.
    expect(isVerticalAspect(768, 1422)).toBe(false)
  })

  it('rejects a landscape or square frame from a provider', () => {
    expect(isVerticalAspect(1152, 1536)).toBe(false)
    expect(isVerticalAspect(768, 1024)).toBe(false)
    expect(isVerticalAspect(1024, 1024)).toBe(false)
  })

  it('rejects unknown sizes', () => {
    expect(isVerticalAspect(null, 2048)).toBe(false)
    expect(isVerticalAspect(1152, null)).toBe(false)
    expect(isVerticalAspect(0, 0)).toBe(false)
  })

  it('uses the documented tolerance', () => {
    expect(ASPECT_TOLERANCE).toBe(0.03)
    expect(VERTICAL_ASPECT).toBeCloseTo(0.5625, 4)
  })
})
