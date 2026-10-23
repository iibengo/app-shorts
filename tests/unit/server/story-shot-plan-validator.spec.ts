// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateShotList } from '../../../server/story/shot-plan-validator'
import { isShotDurationAllowed } from '../../../server/story/shot-duration-rule'
import { allocateShotsPerScene } from '../../../server/story/reel-shot-prompt'
import { hasSignificantNarrationCopy } from '../../../server/story/prompt-guard'
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

  it('accepts consecutive repeated framing: variety is an advisory, not a gate', () => {
    const value = shotList()
    value.scenes[0]!.shots[1]!.framing = 'medium'
    const result = validateShotList(value, { durationPlan, narrative })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
  })
})

describe('shot plan validator: profile normalization', () => {
  const smallPlan: DurationPlan = {
    ...durationPlan,
    costMode: 'budget',
    targetDurationSeconds: 15,
    maxDurationSeconds: 15,
    sceneCount: { min: 2, max: 3 },
    shotCount: { min: 4, max: 5 },
    capUsd: 2.5,
    qualityAllowed: false,
    slowThresholdMs: 378_000,
  }

  it('trims the excess shots instead of failing', () => {
    const draft = shotList()
    for (const scene of draft.scenes) {
      scene.shots = scene.shots.slice(0, 2).map((shot) => ({ ...shot, durationSeconds: 2 as never }))
    }

    const result = validateShotList(draft, { durationPlan: smallPlan, narrative, preset: 'fast' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    const shots = result.plan.scenes.reduce((total, scene) => total + scene.shots.length, 0)
    expect(shots).toBe(5)
    expect(result.plan.plannedDurationSeconds).toBeGreaterThanOrEqual(12)
    expect(result.plan.plannedDurationSeconds).toBeLessThanOrEqual(15)
  })

  it('stretches a short plan into the profile window', () => {
    const draft = shotList()
    for (const scene of draft.scenes) {
      for (const shot of scene.shots) {
        shot.durationSeconds = 2
      }
    }

    const result = validateShotList(draft, { durationPlan, narrative, preset: 'fast' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plan.plannedDurationSeconds).toBeGreaterThanOrEqual(29)
    expect(result.plan.plannedDurationSeconds).toBeLessThanOrEqual(30)
  })

  it('still fails when the plan cannot reach the profile window', () => {
    const draft = shotList()
    for (const scene of draft.scenes.slice(1)) {
      scene.shots = []
    }

    const result = validateShotList(draft, { durationPlan, narrative, preset: 'fast' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/planos fuera del perfil|duración planificada/)
  })
})

describe('shot allocation per scene', () => {
  it('splits the profile maximum across scenes with 1-4 shots each', () => {
    const cases: readonly (readonly [DurationPlan, number])[] = [
      [durationPlan, 3],
      [durationPlan, 5],
      [{ ...durationPlan, shotCount: { min: 4, max: 5 } }, 3],
      [{ ...durationPlan, shotCount: { min: 14, max: 16 } }, 6],
      [{ ...durationPlan, shotCount: { min: 26, max: 30 } }, 10],
    ]

    for (const [plan, scenes] of cases) {
      const allocation = allocateShotsPerScene(plan, scenes)

      expect(allocation).toHaveLength(scenes)
      expect(allocation.reduce((total, count) => total + count, 0)).toBe(plan.shotCount.max)
      expect(allocation.every((count) => count >= 1 && count <= 4)).toBe(true)
    }
  })
})

describe('shot plan normalization: narration copy', () => {
  it('rebuilds a visualPrompt that copies the narration instead of failing', () => {
    const draft = shotList()
    const narration = narrative.scenes[0]!.narration
    draft.scenes[0]!.shots[0]!.visualPrompt = `${narration} en primer plano`

    const result = validateShotList(draft, { durationPlan, narrative, preset: 'fast' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    const shot = result.plan.scenes[0]!.shots[0]!
    expect(hasSignificantNarrationCopy(shot.visualPrompt, narration)).toBe(false)
    expect(shot.visualPrompt).toContain(shot.subject)
  })
})

describe('shot plan normalization: text lengths', () => {
  it('clamps a verbose action and completes a short one instead of failing', () => {
    const draft = shotList()
    draft.scenes[0]!.shots[0]!.action = 'palabra '.repeat(60).trim()
    draft.scenes[0]!.shots[1]!.action = 'Corta'

    const result = validateShotList(draft, { durationPlan, narrative, preset: 'fast' })

    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plan.scenes[0]!.shots[0]!.action.length).toBeLessThanOrEqual(200)
    expect(result.plan.scenes[0]!.shots[1]!.action.length).toBeGreaterThanOrEqual(20)
  })
})
