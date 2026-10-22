// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { deriveSceneStatus, plannedDurationSeconds } from '../../../server/story/scene-status'

const shot = (status: Parameters<typeof deriveSceneStatus>[0][number]['status'], durationSeconds = 3) => ({ status, durationSeconds })

describe('scene status', () => {
  it('aggregates keyframe and video states', () => {
    expect(deriveSceneStatus([shot('PENDING'), shot('PENDING')])).toBe('PENDING')
    expect(deriveSceneStatus([shot('KEYFRAME_READY'), shot('KEYFRAME_READY')])).toBe('KEYFRAME_READY')
    expect(deriveSceneStatus([shot('VIDEO_READY'), shot('VIDEO_READY')])).toBe('VIDEO_READY')
    expect(deriveSceneStatus([shot('VIDEO_FAILED'), shot('VIDEO_READY')])).toBe('VIDEO_FAILED')
  })

  it('sums planned duration', () => {
    expect(plannedDurationSeconds([shot('KEYFRAME_READY', 2), shot('KEYFRAME_READY', 5)])).toBe(7)
  })
})
