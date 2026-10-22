import { describe, expect, it } from 'vitest'
import { detectSimilarShotPrompts } from '../../../server/story/shot-variety'
import { validateShotList } from '../../../server/story/shot-plan-validator'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'

describe('textual shot variety advisory', () => {
  it('flags adjacent prompts with near-identical vocabulary', () => {
    const advisories = detectSimilarShotPrompts([
      { order: 1, visualPrompt: 'Mara mira el postre azul sobre la mesa de la cocina.' },
      { order: 2, visualPrompt: 'Mara mira el postre azul sobre la mesa de la cocina.' },
      { order: 3, visualPrompt: 'Iker abre la puerta del portal con gesto sorprendido.' },
    ])

    expect(advisories).toEqual([
      {
        previousShotOrder: 1,
        shotOrder: 2,
        distance: 0,
        similar: true,
      },
    ])
  })

  it('exposes advisories without blocking a valid plan', () => {
    const fixture = makeReelNarrative('standard', 30, false)
    const shotList = makeReelShotList(fixture.narrative, fixture.plan)
    const firstShot = shotList.scenes[0]?.shots[0]
    const secondShot = shotList.scenes[0]?.shots[1]

    if (!firstShot || !secondShot) throw new Error('fixture incompleta')

    secondShot.visualPrompt = firstShot.visualPrompt
    const validation = validateShotList(shotList, {
      durationPlan: fixture.plan,
      narrative: fixture.narrative,
    })

    expect(validation.ok).toBe(true)
    if (validation.ok) {
      expect(validation.advisories.length).toBeGreaterThan(0)
      expect(validation.advisories[0]).toMatchObject({
        previousShotOrder: 1,
        shotOrder: 2,
        similar: true,
      })
    }
  })
})
