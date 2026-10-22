// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  STORY_COST_PROFILES,
  allowedDurations,
  costProfile,
  durationPlanFor,
  isValidProfile,
  profileAttemptsReset,
  profileCapUsd,
  profileRhythm,
  profileShotBudget,
  profileSlowThresholdMs,
} from '../../../server/story/cost-profiles'
import { STORY_COST_PROFILES as UI_COST_PROFILES } from '~/data/story'

describe('story cost profiles', () => {
  it('exposes the normative combinations', () => {
    expect(STORY_COST_PROFILES).toHaveLength(7)
    expect(allowedDurations('budget')).toEqual([15, 90])
    expect(allowedDurations('standard')).toEqual([15, 30, 45, 60])
    expect(allowedDurations('production')).toEqual([90])
    expect(isValidProfile('standard', 90)).toBe(false)
    expect(isValidProfile('production', 30)).toBe(false)
  })

  it('resolves caps, rhythm and attempts policy', () => {
    const budget = costProfile('budget', 15)!
    const budget90 = costProfile('budget', 90)!
    const production = costProfile('production', 90)!

    expect(profileCapUsd(budget)).toBe(2.5)
    expect(profileCapUsd(production)).toBe(15)
    expect(profileRhythm(budget90)).toBe('slow')
    expect(profileAttemptsReset(budget)).toBe(false)
    expect(profileAttemptsReset(production)).toBe(true)
    expect(profileSlowThresholdMs(production)).toBe(1_878_000)
  })

  it('resolves shot budgets including reference constraints', () => {
    const budget = costProfile('budget', 15)!
    const budget90 = costProfile('budget', 90)!

    expect(profileShotBudget(budget, false)).toEqual({ min: 4, max: 5, exact: null })
    expect(profileShotBudget(budget, true)).toEqual({ min: 4, max: 4, exact: 4 })
    expect(profileShotBudget(budget90, true)).toEqual({ min: 15, max: 15, exact: 15 })
    expect(durationPlanFor('standard', 30, 'tiktok', false).shotCount).toEqual({ min: 9, max: 12 })
  })

  it('keeps the UI profile table in parity with the server authority', () => {
    expect(UI_COST_PROFILES).toHaveLength(STORY_COST_PROFILES.length)

    for (const server of STORY_COST_PROFILES) {
      const ui = UI_COST_PROFILES.find((profile) =>
        profile.costMode === server.costMode
        && profile.durationSeconds === server.durationSeconds)

      expect(ui, `${server.costMode} ${server.durationSeconds}`).toBeDefined()
      expect(ui).toMatchObject({
        plannedMin: server.plannedMin,
        plannedMax: server.plannedMax,
        sceneMin: server.sceneMin,
        sceneMax: server.sceneMax,
        shotMin: server.shotMin,
        shotMax: server.shotMax,
        exactShotCount: server.exactShotCount,
        shotDurationMin: server.shotDurationMin,
        shotDurationMax: server.shotDurationMax,
        preset: server.preset,
        rhythm: server.rhythm,
        capUsd: server.capUsd,
        maxVideoAttempts: server.maxVideoAttempts,
        attemptsReset: server.attemptsReset,
        qualityAllowed: server.qualityAllowed,
        timeMinMinutes: server.timeMinMinutes,
        timeMaxMinutes: server.timeMaxMinutes,
        slowThresholdMs: server.slowThresholdMs,
      })
    }
  })
})
