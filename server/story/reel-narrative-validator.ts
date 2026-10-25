import type {
  StoryBible,
  StoryNarrativeScene,
  StorySceneRole,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryWeather,
} from '~/models/story'
import type { CanonDraft, DurationPlan, NarrativeDraft } from './director-types'
import {
  BEAT_MAX_GAG,
  BEAT_MAX_NARRATION,
  BEAT_MIN_GAG,
  BEAT_MIN_NARRATION,
  validateCanon,
} from './canon-validator'
import {
  STORY_SCENE_ROLES,
  STORY_STORY_FUNCTIONS,
  STORY_TIME_OF_DAYS,
  STORY_WEATHERS,
} from './story-mode'
import { validateNarrativeStructure } from './shot-plan-validator'

export const REEL_SCENES_KEYS = ['scenes'] as const
export const REEL_SCENE_KEYS = [
  'order',
  'sceneRole',
  'locationId',
  'timeOfDay',
  'weather',
  'characters',
  'props',
  'action',
  'narration',
  'storyFunction',
  'gag',
  'continuityFromPrevious',
] as const
/**
 * E1: `stake` is optional so a script written before E1 still validates, and a
 * model that omits it degrades to a prompt without the line instead of failing.
 */
export const REEL_SCENE_OPTIONAL_STAKE = ['stake'] as const
/** 014: the line the narrator says. Optional so a pre-014 script still works. */
export const REEL_SCENE_OPTIONAL_SPOKEN = ['spokenLine'] as const
export const REEL_SCENE_OPTIONAL_KEYS = [
  'durationHintSeconds',
  ...REEL_SCENE_OPTIONAL_STAKE,
  ...REEL_SCENE_OPTIONAL_SPOKEN,
] as const

export const REEL_SCENE_MIN_ACTION = 20
export const REEL_SCENE_MAX_ACTION = 400
export const REEL_SCENE_MIN_CONTINUITY = 20
export const REEL_SCENE_MAX_CONTINUITY = 200
export const REEL_SCENE_MIN_DURATION_HINT = 2
export const REEL_SCENE_MAX_DURATION_HINT = 18

export type ReelScenesValidation =
  | { readonly ok: true; readonly scenes: readonly StoryNarrativeScene[] }
  | { readonly ok: false; readonly reason: string }

export type ReelNarrativeValidation =
  | { readonly ok: true; readonly draft: NarrativeDraft }
  | { readonly ok: false; readonly reason: string }

const MARKUP = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const URL = /(?:https?:\/\/|www\.)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function hasAllKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

function invalidText(value: string): boolean {
  return MARKUP.test(value)
    || MARKDOWN_BLOCK.test(value)
    || CONTROL.test(value)
    || URL.test(value)
}

function normalize(value: string): string {
  return value.normalize('NFC').trim()
}

function validateText(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string | null {
  if (typeof value !== 'string') return `${field}: tipo inválido`

  const text = normalize(value)

  if (text.length < min || text.length > max) return `${field}: longitud fuera de rango`
  if (invalidText(text)) return `${field}: contiene marcas no permitidas`

  return null
}

function normalizeTerm(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/-/g, ' ')
}

function containsTerm(text: string, term: string): boolean {
  const normalized = normalizeTerm(text)
  const candidate = normalizeTerm(term)

  return normalized === candidate
    || (normalized.length >= 3 && candidate.length >= 3
      && (normalized.includes(candidate) || candidate.includes(normalized)))
}

function idList(
  value: unknown,
  max: number,
  field: string,
  known: ReadonlySet<string>,
  min = 1,
): string | readonly string[] {
  if (!Array.isArray(value)) return `${field}: tipo inválido`
  if (value.length < min || value.length > max) return `${field}: número de elementos fuera de rango`

  const ids: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string' || !known.has(item)) return `${field}: id inexistente`
    if (seen.has(item)) return `${field}: id duplicado`
    seen.add(item)
    ids.push(item)
  }

  return ids
}

function validateScene(
  value: unknown,
  index: number,
  bible: StoryBible,
): { readonly scene?: StoryNarrativeScene; readonly reason?: string } {
  const field = `scenes[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, [...REEL_SCENE_KEYS, ...REEL_SCENE_OPTIONAL_KEYS])
    || !hasAllKeys(value, REEL_SCENE_KEYS)
  ) {
    return { reason: `${field}: forma inválida` }
  }

  if (value.order !== index + 1) {
    return { reason: `${field}.order: debe ser ${index + 1}` }
  }

  if (
    typeof value.sceneRole !== 'string'
    || !(STORY_SCENE_ROLES as readonly string[]).includes(value.sceneRole)
  ) {
    return { reason: `${field}.sceneRole: valor inválido` }
  }

  if (
    typeof value.storyFunction !== 'string'
    || !(STORY_STORY_FUNCTIONS as readonly string[]).includes(value.storyFunction)
  ) {
    return { reason: `${field}.storyFunction: valor inválido` }
  }

  if (
    typeof value.timeOfDay !== 'string'
    || !(STORY_TIME_OF_DAYS as readonly string[]).includes(value.timeOfDay)
  ) {
    return { reason: `${field}.timeOfDay: valor inválido` }
  }

  if (
    typeof value.weather !== 'string'
    || !(STORY_WEATHERS as readonly string[]).includes(value.weather)
  ) {
    return { reason: `${field}.weather: valor inválido` }
  }

  if (
    typeof value.locationId !== 'string'
    || !bible.locations.some((location) => location.id === value.locationId)
  ) {
    return { reason: `${field}.locationId: localización inexistente` }
  }

  const characterIds = idList(
    value.characters,
    3,
    `${field}.characters`,
    new Set(bible.characters.map((character) => character.id)),
  )
  if (typeof characterIds === 'string') return { reason: characterIds }

  const propIds = idList(
    value.props,
    3,
    `${field}.props`,
    new Set(bible.props.map((prop) => prop.id)),
    0,
  )
  if (typeof propIds === 'string') return { reason: propIds }

  const actionError = validateText(
    value.action,
    REEL_SCENE_MIN_ACTION,
    REEL_SCENE_MAX_ACTION,
    `${field}.action`,
  )
  if (actionError) return { reason: actionError }

  const narrationError = validateText(
    value.narration,
    BEAT_MIN_NARRATION,
    BEAT_MAX_NARRATION,
    `${field}.narration`,
  )
  if (narrationError) return { reason: narrationError }

  if (value.gag !== null) {
    const gagError = validateText(value.gag, BEAT_MIN_GAG, BEAT_MAX_GAG, `${field}.gag`)
    if (gagError) return { reason: gagError }
  }

  if (index === 0) {
    if (value.continuityFromPrevious !== null) {
      return { reason: `${field}.continuityFromPrevious: debe ser null` }
    }
  } else {
    const continuityError = validateText(
      value.continuityFromPrevious,
      REEL_SCENE_MIN_CONTINUITY,
      REEL_SCENE_MAX_CONTINUITY,
      `${field}.continuityFromPrevious`,
    )
    if (continuityError) return { reason: continuityError }
  }

  let durationHintSeconds: number | undefined

  if (value.durationHintSeconds !== undefined) {
    if (
      typeof value.durationHintSeconds !== 'number'
      || !Number.isInteger(value.durationHintSeconds)
      || value.durationHintSeconds < REEL_SCENE_MIN_DURATION_HINT
      || value.durationHintSeconds > REEL_SCENE_MAX_DURATION_HINT
    ) {
      return { reason: `${field}.durationHintSeconds: valor inválido` }
    }

    durationHintSeconds = value.durationHintSeconds
  }

  return {
    scene: {
      order: index + 1,
      sceneRole: value.sceneRole as StorySceneRole,
      locationId: value.locationId,
      timeOfDay: value.timeOfDay as StoryTimeOfDay,
      weather: value.weather as StoryWeather,
      characters: [...characterIds],
      props: [...propIds],
      action: normalize(value.action as string),
      narration: normalize(value.narration as string).replace(/\s*\n+\s*/g, ' '),
      ...(typeof value.spokenLine === 'string'
        ? { spokenLine: normalize(value.spokenLine).replace(/\s*\n+\s*/g, ' ') }
        : {}),
      storyFunction: value.storyFunction as StoryStoryFunction,
      gag: value.gag === null ? null : normalize(value.gag as string),
      // E1: the stake died here. It was validated but never copied into the
      // scene, so the video prompt never carried it.
      ...(typeof value.stake === 'string' ? { stake: normalize(value.stake) } : {}),
      continuityFromPrevious: index === 0
        ? null
        : normalize(value.continuityFromPrevious as string),
      ...(durationHintSeconds === undefined ? {} : { durationHintSeconds }),
    },
  }
}

function validateStructure(
  scenes: readonly StoryNarrativeScene[],
  canon: CanonDraft,
  durationPlan: DurationPlan,
): string | null {
  if (
    scenes.length < durationPlan.sceneCount.min
    || scenes.length > durationPlan.sceneCount.max
  ) {
    return `scenes: se esperaban ${durationPlan.sceneCount.min}–${durationPlan.sceneCount.max}`
  }

  if (scenes.length === 0) return 'scenes: faltan escenas'

  if (scenes[0]!.sceneRole !== 'establishing') {
    return 'scenes[0].sceneRole: debe ser establishing'
  }

  if (scenes[scenes.length - 1]!.sceneRole !== 'resolution') {
    return 'scenes: la última escena debe ser resolution'
  }

  const climaxes = scenes.filter((scene) => scene.sceneRole === 'climax')
  const expectedClimaxes = scenes.length === 2 ? 0 : 1

  if (climaxes.length !== expectedClimaxes) {
    return scenes.length === 2
      ? 'scenes: con N=2 no hay escena climax'
      : 'scenes: debe haber exactamente un climax'
  }

  for (let index = 1; index < scenes.length - 1; index += 1) {
    const role = scenes[index]!.sceneRole

    if (role === 'establishing' || role === 'resolution') {
      return `scenes[${index}].sceneRole: rol no permitido en una escena intermedia`
    }
  }

  if (scenes.length === 3) {
    if (scenes[1]!.storyFunction !== 'twist') {
      return 'scenes: con N=3 el giro debe ocupar la escena central'
    }
  }

  if (scenes.length >= 3) {
    const twistScene = scenes.find((scene) => scene.storyFunction === 'twist')

    if (!twistScene || twistScene.sceneRole !== 'climax') {
      return 'scenes: twist debe coincidir con climax'
    }
  }

  return validateNarrativeStructure({
    ...canon,
    scenes,
  })
}

function validateCanonUsage(
  scenes: readonly StoryNarrativeScene[],
  bible: StoryBible,
): string | null {
  const usedCharacters = new Set(scenes.flatMap((scene) => scene.characters))
  const usedLocations = new Set(scenes.map((scene) => scene.locationId))
  const usedProps = new Set(scenes.flatMap((scene) => scene.props))

  for (const character of bible.characters) {
    if (!usedCharacters.has(character.id)) {
      return 'storyBible.characters: personaje sin escena'
    }
  }
  for (const location of bible.locations) {
    if (!usedLocations.has(location.id)) {
      return 'storyBible.locations: localización sin escena'
    }
  }
  for (const prop of bible.props) {
    if (!usedProps.has(prop.id)) {
      return 'storyBible.props: prop sin escena'
    }
  }

  if (!usedCharacters.has(bible.leadCharacterId)) {
    return 'scenes: el protagonista no aparece'
  }

  if (bible.signaturePropId !== null && !usedProps.has(bible.signaturePropId)) {
    return 'scenes: el prop característico no aparece'
  }

  const texts = scenes.flatMap((scene) => [
    scene.action,
    scene.narration,
    ...(scene.gag === null ? [] : [scene.gag]),
    scene.timeOfDay,
    scene.weather,
  ])

  for (const forbidden of bible.forbidden) {
    if (texts.some((text) => containsTerm(text, forbidden))) {
      return `scenes: contradice forbidden (${forbidden})`
    }
  }

  return null
}

/**
 * Scene roles are derivable from the story function and the position, so they
 * are assigned in code instead of being validated as model output.
 */
function normalizeSceneRoles(
  scenes: readonly StoryNarrativeScene[],
): readonly StoryNarrativeScene[] {
  const last = scenes.length - 1

  return scenes.map((scene, index) => {
    if (index === 0) return { ...scene, sceneRole: 'establishing' as const }
    if (index === last) return { ...scene, sceneRole: 'resolution' as const }

    const role = scene.storyFunction === 'twist'
      ? 'climax'
      : scene.storyFunction === 'escalation'
        ? 'escalation'
        : 'development'

    return { ...scene, sceneRole: role as const }
  })
}

export function validateReelScenes(
  value: unknown,
  options: {
    readonly canon: CanonDraft
    readonly durationPlan: DurationPlan
  },
): ReelScenesValidation {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, REEL_SCENES_KEYS)
    || !hasAllKeys(value, REEL_SCENES_KEYS)
  ) {
    return { ok: false, reason: 'scenes: forma inválida' }
  }

  if (!Array.isArray(value.scenes)) {
    return { ok: false, reason: 'scenes: tipo inválido' }
  }

  const scenes: StoryNarrativeScene[] = []

  for (let index = 0; index < value.scenes.length; index += 1) {
    const result = validateScene(value.scenes[index], index, options.canon.storyBible)

    if (result.reason) return { ok: false, reason: result.reason }
    scenes.push(result.scene!)
  }

  const normalized = normalizeSceneRoles(scenes)
  const structureError = validateStructure(normalized, options.canon, options.durationPlan)
  if (structureError) return { ok: false, reason: structureError }

  const usageError = validateCanonUsage(normalized, options.canon.storyBible)
  if (usageError) return { ok: false, reason: usageError }

  return { ok: true, scenes: normalized }
}

export function validateReelNarrativeDraft(
  value: unknown,
  options: {
    readonly mode: Parameters<typeof validateCanon>[1]['mode']
    readonly durationPlan: DurationPlan
  },
): ReelNarrativeValidation {
  if (!isRecord(value)) return { ok: false, reason: 'plan: forma inválida' }

  const canon = validateCanon({
    title: value.title,
    logline: value.logline,
    tone: value.tone,
    storyBible: value.storyBible,
  }, { mode: options.mode })

  if (!canon.ok) return canon

  const scenes = validateReelScenes(
    { scenes: value.scenes },
    { canon: canon.canon, durationPlan: options.durationPlan },
  )

  if (!scenes.ok) return scenes

  return {
    ok: true,
    draft: {
      ...canon.canon,
      scenes: scenes.scenes,
    },
  }
}
