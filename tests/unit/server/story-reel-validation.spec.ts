import { describe, expect, it } from 'vitest'
import { validateReelCreateRequest } from '../../../server/story/reel-validation'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    premise: PREMISE,
    mode: 'faithful',
    preset: 'fast',
    ...overrides,
  }
}

function codeOf(call: () => unknown): string | undefined {
  try {
    call()
    return undefined
  } catch (error) {
    return (error as { readonly code?: string }).code
  }
}

describe('validateReelCreateRequest', () => {
  it('applies the 008 defaults', () => {
    const result = validateReelCreateRequest(request(), NOW)

    expect(result.request).toMatchObject({
      premise: PREMISE,
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      preset: 'fast',
      mode: 'faithful',
      referenceUrl: null,
      referenceExpiresAt: null,
    })
    expect(result.durationPlan).toMatchObject({
      costMode: 'standard',
      targetDurationSeconds: 30,
      sceneCount: { min: 3, max: 5 },
      shotCount: { min: 9, max: 12 },
    })
  })

  it('ignores sceneCount in the 008 parser', () => {
    const result = validateReelCreateRequest(request({ sceneCount: 99 }), NOW)

    expect(result.request.platform).toBe('tiktok')
    expect(result.request.costMode).toBe('standard')
    expect(result.request.targetDurationSeconds).toBe(30)
  })

  it('accepts every normative profile', () => {
    const profiles = [
      ['budget', 15],
      ['standard', 15],
      ['standard', 30],
      ['standard', 45],
      ['standard', 60],
      ['budget', 90],
      ['production', 90],
    ] as const

    for (const [costMode, duration] of profiles) {
      const result = validateReelCreateRequest(request({
        platform: 'reels',
        costMode,
        targetDurationSeconds: duration,
        maxDurationSeconds: duration,
      }), NOW)

      expect(result.request.costMode).toBe(costMode)
      expect(result.request.targetDurationSeconds).toBe(duration)
      expect(result.request.maxDurationSeconds).toBe(duration)
      expect(result.durationPlan.capUsd).toBeGreaterThan(0)
    }
  })

  it('rejects an unknown duration', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      costMode: 'standard',
      targetDurationSeconds: 20,
    }), NOW))).toBe('invalid-duration')
  })

  it('rejects a profile combination that does not exist', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      costMode: 'standard',
      targetDurationSeconds: 90,
    }), NOW))).toBe('invalid-cost-mode')
  })

  it('rejects quality in Presupuesto', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      preset: 'quality',
    }), NOW))).toBe('invalid-cost-mode')
  })

  it('rejects a max duration that differs from the target', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 45,
    }), NOW))).toBe('invalid-duration')
  })

  it('rejects unknown platforms and cost modes', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      platform: 'youtube',
    }), NOW))).toBe('invalid-platform')
    expect(codeOf(() => validateReelCreateRequest(request({
      costMode: 'turbo',
    }), NOW))).toBe('invalid-cost-mode')
  })

  it('rejects unknown fields', () => {
    expect(codeOf(() => validateReelCreateRequest(request({
      quality: 'ultra',
    }), NOW))).toBe('invalid-request')
  })
})
