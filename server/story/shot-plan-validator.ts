import type {
  StoryCameraShot,
  StoryNarrativeScene,
  StoryPreset,
  StoryShotDurationSeconds,
  StoryShotFraming,
} from '~/models/story'
import type {
  AssembledShot,
  DurationPlan,
  NarrativeDraft,
  ShotDraft,
  ShotListDraft,
  ShotPlan,
} from './director-types'
import { isValidPlannedDuration, plannedDuration, trimToMaxDuration } from './duration-plan'
import type { SimilarShotAdvisory } from './shot-variety'
import { detectSimilarShotPrompts } from './shot-variety'
import { isShotDurationAllowed } from './shot-duration-rule'

export const SHOT_KEYS = [
  'indexInScene',
  'durationSeconds',
  'camera',
  'framing',
  'subject',
  'action',
  'visualPrompt',
  'transition',
  'locationId',
] as const
export const SHOT_SCENE_KEYS = ['order', 'shots'] as const
export const SHOT_LIST_KEYS = ['scenes'] as const

export const SHOT_FRAMINGS: readonly StoryShotFraming[] = [
  'establishing',
  'wide',
  'medium',
  'close-up',
  'extreme-close-up',
  'detail',
  'reaction',
  'over-the-shoulder',
  'two-shot',
  'insert',
]
export const SHOT_CAMERAS: readonly StoryCameraShot[] = [
  'wide',
  'medium',
  'close-up',
  'low-angle',
  'high-angle',
  'tracking',
  'over-the-shoulder',
  'detail',
]
export const SHOT_DURATIONS: readonly StoryShotDurationSeconds[] = [2, 3, 4, 5, 6]

export type ShotListValidation =
  | {
      readonly ok: true
      readonly draft: ShotListDraft
      readonly plan: ShotPlan
      readonly advisories: readonly SimilarShotAdvisory[]
    }
  | { readonly ok: false; readonly reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => key in value)
}

function textInvalid(value: string): boolean {
  return /[<>`]/.test(value)
    || /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/.test(value)
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)
    || /(?:https?:\/\/|www\.)/i.test(value)
}

function validateText(value: unknown, min: number, max: number): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.normalize('NFC').trim()
  return normalized.length >= min && normalized.length <= max && !textInvalid(normalized)
}

function parseShot(
  value: unknown,
  scene: StoryNarrativeScene,
  indexInScene: number,
  sceneCount: number,
): { readonly shot?: ShotDraft; readonly reason?: string } {
  const field = `scenes[${scene.order - 1}].shots[${indexInScene - 1}]`

  if (!isRecord(value) || !hasExactKeys(value, SHOT_KEYS)) {
    return { reason: `${field}: forma inválida` }
  }

  if (value.indexInScene !== indexInScene) {
    return { reason: `${field}.indexInScene: debe ser ${indexInScene}` }
  }

  if (
    typeof value.durationSeconds !== 'number'
    || !(SHOT_DURATIONS as readonly number[]).includes(value.durationSeconds)
  ) {
    return { reason: `${field}.durationSeconds: valor inválido` }
  }

  if (typeof value.camera !== 'string' || !(SHOT_CAMERAS as readonly string[]).includes(value.camera)) {
    return { reason: `${field}.camera: valor inválido` }
  }

  if (typeof value.framing !== 'string' || !(SHOT_FRAMINGS as readonly string[]).includes(value.framing)) {
    return { reason: `${field}.framing: valor inválido` }
  }

  if (!validateText(value.subject, 3, 80)) {
    return { reason: `${field}.subject: longitud fuera de rango` }
  }
  if (!validateText(value.action, 20, 200)) {
    return { reason: `${field}.action: longitud fuera de rango` }
  }
  if (!validateText(value.visualPrompt, 20, 400)) {
    return { reason: `${field}.visualPrompt: longitud fuera de rango` }
  }
  if (value.transition !== 'cut') {
    return { reason: `${field}.transition: valor inválido` }
  }
  if (typeof value.locationId !== 'string' || value.locationId.length === 0) {
    return { reason: `${field}.locationId: valor inválido` }
  }

  return {
    shot: {
      indexInScene,
      durationSeconds: value.durationSeconds as StoryShotDurationSeconds,
      camera: value.camera as StoryCameraShot,
      framing: value.framing as StoryShotFraming,
      subject: (value.subject as string).normalize('NFC').trim(),
      action: (value.action as string).normalize('NFC').trim(),
      visualPrompt: (value.visualPrompt as string).normalize('NFC').trim(),
      transition: 'cut',
      locationId: value.locationId,
    },
  }
}

function flattenShotList(draft: ShotListDraft): readonly (ShotDraft & { sceneOrder: number })[] {
  return draft.scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({ ...shot, sceneOrder: scene.order })))
}

function validateBudget(
  draft: ShotListDraft,
  durationPlan: DurationPlan,
  preset: StoryPreset | undefined,
): string | null {
  const shots = flattenShotList(draft)
  const planned = plannedDuration(shots)

  if (!isValidPlannedDuration(durationPlan, planned, shots.length)) {
    return `plan: duración planificada ${planned}s fuera del perfil`
  }

  const effectivePreset = preset ?? 'fast'

  if (shots.some((shot) =>
    !isShotDurationAllowed(durationPlan, effectivePreset, shot.durationSeconds))) {
    return `shots: duración no permitida para ${durationPlan.costMode} ${durationPlan.targetDurationSeconds}s (${effectivePreset})`
  }

  if (durationPlan.costMode === 'budget') {
    if (shots.some((shot) => shot.durationSeconds === 6)
      && durationPlan.exactShotCount !== 15) {
      return 'shots: Presupuesto 15 no admite planos de 6 s'
    }
    if (durationPlan.exactShotCount === 15
      && shots.some((shot) => shot.durationSeconds !== 6)) {
      return 'shots: Presupuesto 90 exige planos de 6 s'
    }
  }

  return null
}

function validateCoverage(
  draft: ShotListDraft,
  narrative: NarrativeDraft,
  durationPlan: DurationPlan,
): string | null {
  const allShots = flattenShotList(draft)
  const seenLocations = new Set<string>()
  let globalShotIndex = 0

  for (const scene of narrative.scenes) {
    const shotScene = draft.scenes.find((item) => item.order === scene.order)
    if (!shotScene) return `scenes[${scene.order - 1}]: falta la escena`
    if (shotScene.shots.length < 1 || shotScene.shots.length > 4) {
      return `scenes[${scene.order - 1}].shots: se esperaban 1–4 planos`
    }

    const dialogue = scene.characters.length >= 2
    const framings = new Set(shotScene.shots.map((shot) => shot.framing))
    const minFramings = !dialogue && shotScene.shots.length >= 3 ? 3 : 2

    if (framings.size < minFramings) {
      return `scenes[${scene.order - 1}].shots: faltan encuadres distintos`
    }

    if (shotScene.shots[0]?.locationId !== scene.locationId) {
      return `scenes[${scene.order - 1}].shots[0].locationId: debe coincidir con la escena`
    }

    if (new Set(shotScene.shots.map((shot) => shot.locationId)).size > 2) {
      return `scenes[${scene.order - 1}].shots: máximo 2 localizaciones por escena`
    }

    const sceneLocations = new Set<string>()

    for (let index = 0; index < shotScene.shots.length; index += 1) {
      const shot = shotScene.shots[index]!
      const previous = index > 0 ? shotScene.shots[index - 1] : null

      if (previous && previous.framing === shot.framing) {
        if (!dialogue || previous.subject === shot.subject) {
          return `scenes[${scene.order - 1}].shots[${index}].framing: repite el encuadre anterior`
        }
      }

      // R2 (enmienda 2026-10-22): a location may repeat across consecutive
      // shots when framing/camera changes or the sequence is continuous.
      // Variety is enforced by FR-527 (framing) and the coverage rules, not
      // by forcing a location change.
      if (!seenLocations.has(shot.locationId) && globalShotIndex > 0) {
        if (shot.framing !== 'establishing' && shot.framing !== 'wide') {
          return `scenes[${scene.order - 1}].shots[${index}].framing: una localización nueva debe abrir con establishing o wide`
        }
      }

      sceneLocations.add(shot.locationId)
      seenLocations.add(shot.locationId)
      globalShotIndex += 1
    }

    const signature = narrative.storyBible.signaturePropId
    if (signature !== null && scene.props.includes(signature)) {
      const hasDetail = shotScene.shots.some((shot) =>
        shot.framing === 'detail' || shot.framing === 'insert')
      if (!hasDetail) {
        return `scenes[${scene.order - 1}].shots: falta un detalle del prop característico`
      }
    }

    if (scene.gag !== null && !shotScene.shots.some((shot) => shot.framing === 'reaction')) {
      return `scenes[${scene.order - 1}].shots: falta una reacción tras el gag`
    }
  }

  if (new Set(allShots.map((shot) => shot.framing)).size < 4) {
    return 'shots: la historia necesita al menos 4 encuadres distintos'
  }

  if (durationPlan.rhythm === 'tiktok') {
    const first = allShots[0]
    if (!first) return 'shots: faltan planos'
    if (first.durationSeconds < 2 || first.durationSeconds > 3) {
      return 'shots[0].durationSeconds: el gancho debe durar 2–3 s'
    }
    if (first.framing === 'establishing') {
      return 'shots[0].framing: el gancho no puede ser establishing'
    }
    if ((allShots[0]!.durationSeconds + (allShots[1]?.durationSeconds ?? 0)) > 6) {
      return 'shots: los dos primeros planos deben sumar como máximo 6 s'
    }
    const long = allShots.filter((shot) => shot.durationSeconds >= 5).length
    const six = allShots.filter((shot) => shot.durationSeconds === 6).length
    if (long > Math.max(1, Math.floor(allShots.length * 0.25))) {
      return 'shots: demasiados planos de 5–6 s'
    }
    if (six > Math.floor(allShots.length * 0.2)) {
      return 'shots: demasiados planos de 6 s'
    }
    const average = plannedDuration(allShots) / allShots.length
    if (average > 4.5) return 'shots: la media de duración supera 4.5 s'
  }

  return null
}

export function validateNarrativeStructure(narrative: NarrativeDraft): string | null {
  const scenes = narrative.scenes

  if (scenes.length === 0) return 'scenes: faltan escenas'
  if (scenes[0]?.storyFunction !== 'hook') return 'scenes[0].storyFunction: debe ser hook'
  if (scenes[scenes.length - 1]?.storyFunction !== 'payoff') {
    return 'scenes: la última escena debe ser payoff'
  }

  if (scenes.length === 2) {
    if (scenes.some((scene) => scene.storyFunction === 'twist')) {
      return 'scenes: con 2 escenas el giro va en el payoff, no como escena propia'
    }
  } else {
    const twists = scenes.filter((scene) => scene.storyFunction === 'twist')
    if (twists.length !== 1) return 'scenes: debe haber exactamente un twist'
    const index = scenes.findIndex((scene) => scene.storyFunction === 'twist')
    if (index === 0 || index === scenes.length - 1) return 'scenes: twist fuera del tramo permitido'
    // Con N=3 el único hueco posible es el central; la regla de ratio 50–90 %
    // se aplica desde N=4. Es la lectura compatible con FR-535 y los edge cases.
    if (scenes.length >= 4) {
      const ratio = index / scenes.length
      if (ratio < 0.5 || ratio > 0.9) return 'scenes: twist fuera del tramo 50–90 %'
    }
  }

  if (scenes.length >= 5) {
    if (!scenes.some((scene) => scene.storyFunction === 'complication')) return 'scenes: falta complication'
    if (!scenes.some((scene) => scene.storyFunction === 'escalation')) return 'scenes: falta escalation'
  }

  return null
}

export function validateShotList(
  value: unknown,
  options: {
    readonly durationPlan: DurationPlan
    readonly narrative: NarrativeDraft
    readonly preset?: StoryPreset
  },
): ShotListValidation {
  if (!isRecord(value) || !hasExactKeys(value, SHOT_LIST_KEYS) || !Array.isArray(value.scenes)) {
    return { ok: false, reason: 'shots: forma inválida' }
  }

  if (value.scenes.length !== options.narrative.scenes.length) {
    return { ok: false, reason: `shots: se esperaban ${options.narrative.scenes.length} escenas` }
  }

  if (
    options.narrative.scenes.length < options.durationPlan.sceneCount.min
    || options.narrative.scenes.length > options.durationPlan.sceneCount.max
  ) {
    return { ok: false, reason: `scenes: se esperaban ${options.durationPlan.sceneCount.min}–${options.durationPlan.sceneCount.max}` }
  }

  const scenes: { order: number; shots: ShotDraft[] }[] = []

  for (let sceneIndex = 0; sceneIndex < value.scenes.length; sceneIndex += 1) {
    const sceneValue = value.scenes[sceneIndex]
    const narrativeScene = options.narrative.scenes[sceneIndex]!

    if (!isRecord(sceneValue) || !hasExactKeys(sceneValue, SHOT_SCENE_KEYS)) {
      return { ok: false, reason: `scenes[${sceneIndex}]: forma inválida` }
    }

    if (sceneValue.order !== narrativeScene.order) {
      return { ok: false, reason: `scenes[${sceneIndex}].order: debe ser ${narrativeScene.order}` }
    }

    if (!Array.isArray(sceneValue.shots)) {
      return { ok: false, reason: `scenes[${sceneIndex}].shots: tipo inválido` }
    }

    const shots: ShotDraft[] = []
    for (let shotIndex = 0; shotIndex < sceneValue.shots.length; shotIndex += 1) {
      const parsed = parseShot(sceneValue.shots[shotIndex], narrativeScene, shotIndex + 1, value.scenes.length)
      if (parsed.reason) return { ok: false, reason: parsed.reason }
      shots.push(parsed.shot!)
    }

    scenes.push({ order: narrativeScene.order, shots })
  }

  let draft: ShotListDraft = { scenes }
  const structureError = validateNarrativeStructure(options.narrative)
  if (structureError) return { ok: false, reason: structureError }

  const initialFlat = flattenShotList(draft)
  const initialPlanned = plannedDuration(initialFlat)

  if (initialPlanned > options.durationPlan.maxDurationSeconds) {
    const trimmed = trimToMaxDuration(
      initialFlat.map((shot, index) => ({ ...shot, order: index + 1 })),
      options.durationPlan.maxDurationSeconds,
    )

    if (!trimmed) {
      return { ok: false, reason: `plan: no se puede recortar a ${options.durationPlan.maxDurationSeconds}s` }
    }

    const durationByKey = new Map(
      trimmed.shots.map((shot) => [
        `${shot.sceneOrder}:${shot.indexInScene}`,
        shot.durationSeconds,
      ]),
    )
    draft = {
      scenes: draft.scenes.map((scene) => ({
        order: scene.order,
        shots: scene.shots.map((shot) => ({
          ...shot,
          durationSeconds: (durationByKey.get(
            `${scene.order}:${shot.indexInScene}`,
          ) ?? shot.durationSeconds) as StoryShotDurationSeconds,
        })),
      })),
    }
  }

  const budgetError = validateBudget(draft, options.durationPlan, options.preset)
  if (budgetError) return { ok: false, reason: budgetError }

  const coverageError = validateCoverage(draft, options.narrative, options.durationPlan)
  if (coverageError) return { ok: false, reason: coverageError }

  const flat = flattenShotList(draft)
  const plan = assembleShotPlan(options.narrative, draft, options.durationPlan, flat)
  const planned = plan.plannedDurationSeconds

  if (!isValidPlannedDuration(options.durationPlan, planned, flat.length)) {
    return { ok: false, reason: `plan: duración planificada ${planned}s fuera del perfil` }
  }

  const advisories = detectSimilarShotPrompts(
    flat.map((shot, index) => ({ ...shot, order: index + 1 })),
  )

  return { ok: true, draft, plan, advisories }
}

export function assembleShotPlan(
  narrative: NarrativeDraft,
  shotList: ShotListDraft,
  durationPlan: DurationPlan,
  flatOverride?: readonly (ShotDraft & { sceneOrder: number })[],
): ShotPlan {
  const flat = flatOverride ?? flattenShotList(shotList)
  const trimmed = trimToMaxDuration(
    flat.map((shot, index) => ({ ...shot, order: index + 1, durationSeconds: shot.durationSeconds })),
    durationPlan.maxDurationSeconds,
  )

  if (!trimmed) throw new Error('shot-duration-overflow')

  let globalOrder = 1
  const scenes = narrative.scenes.map((scene) => {
    const sceneShots = trimmed.shots
      .filter((shot) => shot.sceneOrder === scene.order)
      .map((shot) => {
        const assembled: AssembledShot = {
          sceneId: `scene-${scene.order}`,
          sceneOrder: scene.order,
          order: globalOrder,
          indexInScene: shot.indexInScene,
          durationSeconds: shot.durationSeconds as StoryShotDurationSeconds,
          camera: shot.camera,
          framing: shot.framing,
          subject: shot.subject,
          action: shot.action,
          visualPrompt: shot.visualPrompt,
          transition: 'cut',
          locationId: shot.locationId,
        }
        globalOrder += 1
        return assembled
      })

    return { order: scene.order, shots: sceneShots }
  })

  return {
    scenes,
    plannedDurationSeconds: plannedDuration(trimmed.shots),
  }
}
