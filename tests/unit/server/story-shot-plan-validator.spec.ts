// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateShotList } from '../../../server/story/shot-plan-validator'
import { isShotDurationAllowed } from '../../../server/story/shot-duration-rule'
import type { DurationPlan, NarrativeDraft, ShotListDraft } from '../../../server/story/director-types'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'

const narrative: NarrativeDraft = {
  title: plan5.title,
  logline: plan5.logline,
  tone: 'humor',
  storyBible: plan5.storyBible as NarrativeDraft['storyBible'],
  scenes: [
    { order: 1, sceneRole: 'establishing', locationId: 'obrador', timeOfDay: 'morning', weather: 'clear', characters: ['clara', 'milo'], props: ['merengue'], action: 'Clara abre el obrador y mira el merengue.', narration: 'Clara empieza su día.', storyFunction: 'hook', gag: null, continuityFromPrevious: null },
    { order: 2, sceneRole: 'climax', locationId: 'obrador', timeOfDay: 'morning', weather: 'clear', characters: ['clara', 'milo'], props: ['merengue'], action: 'Clara intenta repetir la figura imposible del merengue.', narration: 'El azúcar se mueve.', storyFunction: 'twist', gag: 'El merengue saluda.', continuityFromPrevious: 'Clara conserva el bol.' },
    { order: 3, sceneRole: 'resolution', locationId: 'obrador', timeOfDay: 'morning', weather: 'clear', characters: ['clara', 'milo'], props: ['merengue'], action: 'Clara decide no preguntar más al merengue.', narration: 'Clara cierra el obrador.', storyFunction: 'payoff', gag: null, continuityFromPrevious: 'Clara conserva el bol.' },
  ],
}

const durationPlan: DurationPlan = {
  costMode: 'standard',
  platform: 'tiktok',
  targetDurationSeconds: 30,
  maxDurationSeconds: 30,
  rhythm: 'tiktok',
  sceneCount: { min: 3, max: 5 },
  shotCount: { min: 9, max: 12 },
  shotsPerSceneMax: 4,
  exactShotCount: null,
  capUsd: 7,
  maxVideoAttempts: 2,
  attemptsReset: true,
  qualityAllowed: true,
  slowThresholdMs: 750_000,
}

function shotList(): ShotListDraft {
  return {
    scenes: [
      { order: 1, shots: [
        { indexInScene: 1, durationSeconds: 3, camera: 'medium', framing: 'medium', subject: 'Clara', action: 'Clara abre el obrador y mira el merengue.', visualPrompt: 'Plano medio de Clara en el obrador.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 2, durationSeconds: 3, camera: 'detail', framing: 'detail', subject: 'Merengue', action: 'El merengue forma una figura imposible.', visualPrompt: 'Detalle del merengue en el bol.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 3, durationSeconds: 4, camera: 'close-up', framing: 'close-up', subject: 'Clara', action: 'Clara reacciona a la figura del merengue.', visualPrompt: 'Primer plano de Clara sorprendida.', transition: 'cut', locationId: 'obrador' },
      ] },
      { order: 2, shots: [
        { indexInScene: 1, durationSeconds: 3, camera: 'wide', framing: 'wide', subject: 'Obrador', action: 'Clara cruza el obrador con el bol.', visualPrompt: 'Plano general del obrador con Clara.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 2, durationSeconds: 3, camera: 'detail', framing: 'insert', subject: 'Merengue', action: 'El merengue cambia de forma otra vez.', visualPrompt: 'Insert del merengue cambiando.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 3, durationSeconds: 3, camera: 'medium', framing: 'reaction', subject: 'Clara', action: 'Clara se ríe de la figura del merengue.', visualPrompt: 'Reacción de Clara ante el merengue.', transition: 'cut', locationId: 'obrador' },
      ] },
      { order: 3, shots: [
        { indexInScene: 1, durationSeconds: 3, camera: 'wide', framing: 'establishing', subject: 'Obrador', action: 'Clara apaga el horno y guarda el bol.', visualPrompt: 'Plano general del obrador al final.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 2, durationSeconds: 4, camera: 'close-up', framing: 'detail', subject: 'Clara', action: 'Clara sonríe y cierra los ojos un instante.', visualPrompt: 'Primerísimo plano del rostro de Clara.', transition: 'cut', locationId: 'obrador' },
        { indexInScene: 3, durationSeconds: 4, camera: 'detail', framing: 'over-the-shoulder', subject: 'Clara', action: 'Clara deja el merengue sobre la mesa.', visualPrompt: 'Plano sobre el hombro de Clara con el merengue.', transition: 'cut', locationId: 'obrador' },
      ] },
    ],
  }
}

describe('shot plan validator', () => {
  it('accepts a structurally valid 30 s plan', () => {
    const result = validateShotList(shotList(), { durationPlan, narrative })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plan.plannedDurationSeconds).toBe(30)
    expect(result.plan.scenes.flatMap((scene) => scene.shots)).toHaveLength(9)
  })

  it('rejects a 6 s shot in quality while keeping the profile sum', () => {
    const value = shotList()
    value.scenes[0]!.shots[0]!.durationSeconds = 6
    value.scenes[2]!.shots[1]!.durationSeconds = 3
    value.scenes[2]!.shots[2]!.durationSeconds = 2

    const result = validateShotList(value, {
      durationPlan,
      narrative,
      preset: 'quality',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('duración no permitida')
  })

  it('trims a plan that only exceeds max duration', () => {
    const value = shotList()
    const lastScene = value.scenes[2]!
    lastScene.shots[lastScene.shots.length - 1]!.durationSeconds = 5

    const result = validateShotList(value, { durationPlan, narrative })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (result.ok) {
      expect(result.plan.plannedDurationSeconds).toBeLessThanOrEqual(30)
      expect(result.plan.plannedDurationSeconds).toBeGreaterThanOrEqual(29)
    }
  })

  it('centralizes duration by mode and preset', () => {
    const budget15 = { costMode: 'budget' as const, targetDurationSeconds: 15 as const }
    const standard15 = { costMode: 'standard' as const, targetDurationSeconds: 15 as const }
    const standard30 = { costMode: 'standard' as const, targetDurationSeconds: 30 as const }
    const budget90 = { costMode: 'budget' as const, targetDurationSeconds: 90 as const }
    const production90 = { costMode: 'production' as const, targetDurationSeconds: 90 as const }

    expect(isShotDurationAllowed(budget15, 'fast', 6)).toBe(false)
    expect(isShotDurationAllowed(standard15, 'fast', 6)).toBe(true)
    expect(isShotDurationAllowed(standard15, 'quality', 6)).toBe(false)
    expect(isShotDurationAllowed(standard30, 'fast', 6)).toBe(false)
    expect(isShotDurationAllowed(standard30, 'quality', 6)).toBe(false)
    expect(isShotDurationAllowed(budget90, 'fast', 5)).toBe(false)
    expect(isShotDurationAllowed(budget90, 'fast', 6)).toBe(true)
    expect(isShotDurationAllowed(production90, 'fast', 6)).toBe(true)
    expect(isShotDurationAllowed(production90, 'quality', 6)).toBe(false)
  })

  it('rejects consecutive repeated framing outside dialogue', () => {
    const value = shotList()
    value.scenes[0]!.shots[1]!.framing = 'medium'
    const result = validateShotList(value, { durationPlan, narrative })
    expect(result.ok).toBe(false)
  })
})
