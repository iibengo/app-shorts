import type {
  StoryBible,
  StoryCameraShot,
  StoryCharacter,
  StoryProp,
  StorySceneRole,
  StoryTimeOfDay,
  StoryTransition,
  StoryWeather,
} from '~/models/story'
import {
  STORY_GLOBAL_BLOCK_MAX_LENGTH,
  STORY_PROMPT_MAX_LENGTH,
  composeGlobalBlock,
  storyPromptComposer,
  storySceneRoleLabel,
  storyTimeOfDayLabel,
  storyWeatherLabel,
} from './story-prompt-composer'

export const BIBLE_MIN_STYLE_LENGTH = 10
export const BIBLE_MAX_STYLE_LENGTH = 160
export const BIBLE_LOCATION_NAME_MAX_LENGTH = 60
export const BIBLE_LOCATION_DESCRIPTION_MIN_LENGTH = 10
export const BIBLE_LOCATION_DESCRIPTION_MAX_LENGTH = 160
export const BIBLE_MAX_CHARACTERS = 3
export const BIBLE_MIN_CHARACTER_DESCRIPTION_LENGTH = 20
export const BIBLE_MAX_CHARACTER_DESCRIPTION_LENGTH = 160
export const BIBLE_MIN_WARDROBE_LENGTH = 10
export const BIBLE_MAX_WARDROBE_LENGTH = 120
export const BIBLE_MAX_PROPS = 3
export const BIBLE_MIN_PROP_DESCRIPTION_LENGTH = 10
export const BIBLE_MAX_PROP_DESCRIPTION_LENGTH = 120
export const BIBLE_MIN_FORBIDDEN_LENGTH = 2
export const BIBLE_MAX_FORBIDDEN_LENGTH = 50
export const BIBLE_MAX_FORBIDDEN_ITEMS = 10
export const BIBLE_MIN_CONTINUITY_RULE_LENGTH = 4
export const BIBLE_MAX_CONTINUITY_RULE_LENGTH = 140
export const BIBLE_MAX_CONTINUITY_RULES = 5
export const BIBLE_NAME_MAX_LENGTH = 40

export const BIBLE_ID_PATTERN = /^[a-z][a-z0-9-]{1,23}$/
export const BEAT_MIN_CONTINUITY_LENGTH = 20
export const BEAT_MAX_CONTINUITY_LENGTH = 200

export const BIBLE_KEYS = [
  'style',
  'location',
  'timeOfDay',
  'weather',
  'leadCharacterId',
  'signaturePropId',
  'characters',
  'props',
  'forbidden',
  'continuityRules',
] as const

export const BIBLE_CHARACTER_KEYS = ['id', 'name', 'description', 'wardrobe'] as const
export const BIBLE_PROP_KEYS = ['id', 'name', 'description'] as const
export const BIBLE_LOCATION_KEYS = ['name', 'description'] as const

export const BEAT_KEYS = [
  'order',
  'sceneRole',
  'visualPrompt',
  'narration',
  'characters',
  'props',
  'camera',
  'continuityFromPrevious',
  'transition',
] as const

const TIME_OF_DAY_VALUES: readonly StoryTimeOfDay[] = [
  'dawn',
  'morning',
  'noon',
  'afternoon',
  'golden-hour',
  'dusk',
  'night',
]

const WEATHER_VALUES: readonly StoryWeather[] = [
  'clear',
  'cloudy',
  'overcast',
  'light-rain',
  'rain',
  'storm',
  'snow',
  'fog',
  'windy',
]

const CAMERA_VALUES: readonly StoryCameraShot[] = [
  'wide',
  'medium',
  'close-up',
  'low-angle',
  'high-angle',
  'tracking',
  'over-the-shoulder',
  'detail',
]

const SCENE_ROLE_VALUES: readonly StorySceneRole[] = [
  'establishing',
  'development',
  'escalation',
  'climax',
  'resolution',
]

const TRANSITION_VALUES: readonly StoryTransition[] = ['cut']

const MARKUP_CHARACTERS = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const URL_PATTERN = /(?:https?:\/\/|www\.)/i

export type BibleValidation =
  | { readonly ok: true; readonly bible: StoryBible }
  | { readonly ok: false; readonly reason: string }

export type BeatValidation =
  | { readonly ok: true; readonly beats: readonly import('~/models/story').StoryBeat[] }
  | { readonly ok: false; readonly reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeBibleText(value: string): string {
  return value.normalize('NFC').trim()
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function hasAllKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  return required.every((key) => key in value)
}

function containsForbiddenText(value: string): boolean {
  return (
    MARKUP_CHARACTERS.test(value)
    || MARKDOWN_BLOCK.test(value)
    || CONTROL_CHARACTERS.test(value)
    || URL_PATTERN.test(value)
  )
}

function validateText(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string | null {
  if (typeof value !== 'string') {
    return `${field}: tipo inválido`
  }

  const normalized = normalizeBibleText(value)

  if (normalized.length < min || normalized.length > max) {
    return `${field}: longitud fuera de rango`
  }

  if (containsForbiddenText(normalized)) {
    return `${field}: contiene marcas no permitidas`
  }

  return null
}

function validateId(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || !BIBLE_ID_PATTERN.test(value)) {
    return `${field}: id inválido`
  }

  return null
}

function normalizedTerm(value: string): readonly string[] {
  const base = value.normalize('NFC').trim().toLowerCase()
  const spaced = base.replace(/-/g, ' ')

  return base === spaced ? [base] : [base, spaced]
}

function validateForbiddenContradictions(
  forbidden: readonly string[],
  bible: {
    readonly characters: readonly { readonly id: string; readonly name: string }[]
    readonly props: readonly { readonly id: string; readonly name: string }[]
    readonly timeOfDay: string
    readonly weather: string
  },
): string | null {
  const characterTerms = bible.characters.flatMap((character) => [
    ...normalizedTerm(character.id),
    ...normalizedTerm(character.name),
  ])
  const propTerms = bible.props.flatMap((prop) => [
    ...normalizedTerm(prop.id),
    ...normalizedTerm(prop.name),
  ])
  const contextTerms = [
    ...normalizedTerm(bible.timeOfDay),
    ...normalizedTerm(storyTimeOfDayLabel(bible.timeOfDay as StoryTimeOfDay)),
    ...normalizedTerm(bible.weather),
    ...normalizedTerm(storyWeatherLabel(bible.weather as StoryWeather)),
  ]

  for (const item of forbidden) {
    const terms = normalizedTerm(item)

    for (const term of terms) {
      for (const other of [...characterTerms, ...propTerms, ...contextTerms]) {
        if (term === other) return 'forbidden: contradice la biblia'
        if (
          term.length >= 3
          && other.length >= 3
          && (term.includes(other) || other.includes(term))
        ) {
          return 'forbidden: contradice la biblia'
        }
      }
    }
  }

  return null
}

function validateCharacter(
  value: unknown,
  index: number,
  seen: Set<string>,
): string | null {
  const field = `characters[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, BIBLE_CHARACTER_KEYS)
    || !hasAllKeys(value, BIBLE_CHARACTER_KEYS)
  ) {
    return `${field}: forma inválida`
  }

  const idError = validateId(value.id, `${field}.id`)

  if (idError) return idError

  const id = value.id as string

  if (seen.has(id)) return `${field}: id duplicado`

  seen.add(id)

  return validateText(value.name, 1, BIBLE_NAME_MAX_LENGTH, `${field}.name`)
    ?? validateText(
      value.description,
      BIBLE_MIN_CHARACTER_DESCRIPTION_LENGTH,
      BIBLE_MAX_CHARACTER_DESCRIPTION_LENGTH,
      `${field}.description`,
    )
    ?? validateText(
      value.wardrobe,
      BIBLE_MIN_WARDROBE_LENGTH,
      BIBLE_MAX_WARDROBE_LENGTH,
      `${field}.wardrobe`,
    )
}

function validateProp(
  value: unknown,
  index: number,
  seen: Set<string>,
): string | null {
  const field = `props[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, BIBLE_PROP_KEYS)
    || !hasAllKeys(value, BIBLE_PROP_KEYS)
  ) {
    return `${field}: forma inválida`
  }

  const idError = validateId(value.id, `${field}.id`)

  if (idError) return idError

  const id = value.id as string

  if (seen.has(id)) return `${field}: id duplicado`

  seen.add(id)

  return validateText(value.name, 1, BIBLE_NAME_MAX_LENGTH, `${field}.name`)
    ?? validateText(
      value.description,
      BIBLE_MIN_PROP_DESCRIPTION_LENGTH,
      BIBLE_MAX_PROP_DESCRIPTION_LENGTH,
      `${field}.description`,
    )
}

function validateBibleList(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return `${field}: número de elementos fuera de rango`
  }

  return null
}

export function validateStoryBible(value: unknown): BibleValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, BIBLE_KEYS) || !hasAllKeys(value, BIBLE_KEYS)) {
    return { ok: false, reason: 'storyBible: forma inválida' }
  }

  const styleError = validateText(
    value.style,
    BIBLE_MIN_STYLE_LENGTH,
    BIBLE_MAX_STYLE_LENGTH,
    'storyBible.style',
  )

  if (styleError) return { ok: false, reason: styleError }

  if (
    !isRecord(value.location)
    || !hasOnlyKeys(value.location, BIBLE_LOCATION_KEYS)
    || !hasAllKeys(value.location, BIBLE_LOCATION_KEYS)
  ) {
    return { ok: false, reason: 'storyBible.location: forma inválida' }
  }

  const locationError =
    validateText(
      value.location.name,
      1,
      BIBLE_LOCATION_NAME_MAX_LENGTH,
      'storyBible.location.name',
    )
    ?? validateText(
      value.location.description,
      BIBLE_LOCATION_DESCRIPTION_MIN_LENGTH,
      BIBLE_LOCATION_DESCRIPTION_MAX_LENGTH,
      'storyBible.location.description',
    )

  if (locationError) return { ok: false, reason: locationError }

  if (
    typeof value.timeOfDay !== 'string'
    || !TIME_OF_DAY_VALUES.includes(value.timeOfDay as StoryTimeOfDay)
  ) {
    return { ok: false, reason: 'storyBible.timeOfDay: valor inválido' }
  }

  if (
    typeof value.weather !== 'string'
    || !WEATHER_VALUES.includes(value.weather as StoryWeather)
  ) {
    return { ok: false, reason: 'storyBible.weather: valor inválido' }
  }

  const charactersError = validateBibleList(
    value.characters,
    1,
    BIBLE_MAX_CHARACTERS,
    'storyBible.characters',
  )

  if (charactersError) return { ok: false, reason: charactersError }

  const seenCharacters = new Set<string>()

  for (let index = 0; index < (value.characters as unknown[]).length; index += 1) {
    const error = validateCharacter(
      (value.characters as unknown[])[index],
      index,
      seenCharacters,
    )

    if (error) return { ok: false, reason: error }
  }

  const characters = (value.characters as Record<string, unknown>[]).map((character) => ({
    id: character.id as string,
    name: normalizeBibleText(character.name as string),
    description: normalizeBibleText(character.description as string),
    wardrobe: normalizeBibleText(character.wardrobe as string),
  })) satisfies StoryCharacter[]

  if (
    typeof value.leadCharacterId !== 'string'
    || !seenCharacters.has(value.leadCharacterId)
  ) {
    return { ok: false, reason: 'storyBible.leadCharacterId: personaje inexistente' }
  }

  const propsError = validateBibleList(value.props, 1, BIBLE_MAX_PROPS, 'storyBible.props')

  if (propsError) return { ok: false, reason: propsError }

  const seenProps = new Set<string>()

  for (let index = 0; index < (value.props as unknown[]).length; index += 1) {
    const error = validateProp((value.props as unknown[])[index], index, seenProps)

    if (error) return { ok: false, reason: error }
  }

  const props = (value.props as Record<string, unknown>[]).map((prop) => ({
    id: prop.id as string,
    name: normalizeBibleText(prop.name as string),
    description: normalizeBibleText(prop.description as string),
  })) satisfies StoryProp[]

  if (
    value.signaturePropId !== null
    && (
      typeof value.signaturePropId !== 'string'
      || !seenProps.has(value.signaturePropId)
    )
  ) {
    return { ok: false, reason: 'storyBible.signaturePropId: prop inexistente' }
  }

  const forbiddenError = validateBibleList(
    value.forbidden,
    1,
    BIBLE_MAX_FORBIDDEN_ITEMS,
    'storyBible.forbidden',
  )

  if (forbiddenError) return { ok: false, reason: forbiddenError }

  const forbidden: string[] = []
  const seenForbidden = new Set<string>()

  for (let index = 0; index < (value.forbidden as unknown[]).length; index += 1) {
    const item = (value.forbidden as unknown[])[index]

    if (typeof item !== 'string') {
      return { ok: false, reason: `storyBible.forbidden[${index}]: tipo inválido` }
    }

    const normalized = normalizeBibleText(item)

    if (
      normalized.length < BIBLE_MIN_FORBIDDEN_LENGTH
      || normalized.length > BIBLE_MAX_FORBIDDEN_LENGTH
    ) {
      return {
        ok: false,
        reason: `storyBible.forbidden[${index}]: longitud fuera de rango`,
      }
    }

    if (containsForbiddenText(normalized)) {
      return {
        ok: false,
        reason: `storyBible.forbidden[${index}]: contiene marcas no permitidas`,
      }
    }

    const key = normalized.toLowerCase()

    if (seenForbidden.has(key)) {
      return { ok: false, reason: 'storyBible.forbidden: duplicado' }
    }

    seenForbidden.add(key)
    forbidden.push(normalized)
  }

  const contradiction = validateForbiddenContradictions(forbidden, {
    characters,
    props,
    timeOfDay: value.timeOfDay as string,
    weather: value.weather as string,
  })

  if (contradiction) return { ok: false, reason: contradiction }

  const rulesError = validateBibleList(
    value.continuityRules,
    1,
    BIBLE_MAX_CONTINUITY_RULES,
    'storyBible.continuityRules',
  )

  if (rulesError) return { ok: false, reason: rulesError }

  const continuityRules: string[] = []

  for (let index = 0; index < (value.continuityRules as unknown[]).length; index += 1) {
    const ruleError = validateText(
      (value.continuityRules as unknown[])[index],
      BIBLE_MIN_CONTINUITY_RULE_LENGTH,
      BIBLE_MAX_CONTINUITY_RULE_LENGTH,
      `storyBible.continuityRules[${index}]`,
    )

    if (ruleError) return { ok: false, reason: ruleError }

    continuityRules.push(
      normalizeBibleText((value.continuityRules as string[])[index]!),
    )
  }

  return {
    ok: true,
    bible: {
      style: normalizeBibleText(value.style as string),
      location: {
        name: normalizeBibleText(value.location.name as string),
        description: normalizeBibleText(value.location.description as string),
      },
      timeOfDay: value.timeOfDay as StoryTimeOfDay,
      weather: value.weather as StoryWeather,
      leadCharacterId: value.leadCharacterId,
      signaturePropId: value.signaturePropId as string | null,
      characters,
      props,
      forbidden,
      continuityRules,
    },
  }
}

function validateIdList(
  value: unknown,
  max: number,
  field: string,
  known: ReadonlySet<string>,
  required: string | null,
  requiredLabel: string,
): string | null {
  if (!Array.isArray(value)) return `${field}: tipo inválido`
  if (value.length > max) return `${field}: demasiados elementos`
  if (required !== null && !value.includes(required)) {
    return `${field}: falta ${requiredLabel}`
  }

  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string' || !known.has(item)) {
      return `${field}: id inexistente`
    }

    if (seen.has(item)) return `${field}: id duplicado`

    seen.add(item)
  }

  return null
}

function validateBeatShape(
  value: unknown,
  index: number,
  bible: StoryBible,
  total: number,
): { readonly beat?: import('~/models/story').StoryBeat; readonly reason?: string } {
  const field = `beats[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, BEAT_KEYS)
    || !hasAllKeys(value, BEAT_KEYS)
  ) {
    return { reason: `${field}: forma inválida` }
  }

  if (value.order !== index + 1) {
    return { reason: `${field}: order debe ser ${index + 1}` }
  }

  if (
    typeof value.sceneRole !== 'string'
    || !SCENE_ROLE_VALUES.includes(value.sceneRole as StorySceneRole)
  ) {
    return { reason: `${field}.sceneRole: valor inválido` }
  }

  if (
    typeof value.camera !== 'string'
    || !CAMERA_VALUES.includes(value.camera as StoryCameraShot)
  ) {
    return { reason: `${field}.camera: valor inválido` }
  }

  if (
    typeof value.transition !== 'string'
    || !TRANSITION_VALUES.includes(value.transition as StoryTransition)
  ) {
    return { reason: `${field}.transition: valor inválido` }
  }

  const visualPromptError = validateText(
    value.visualPrompt,
    20,
    600,
    `${field}.visualPrompt`,
  )

  if (visualPromptError) return { reason: visualPromptError }

  if (typeof value.narration !== 'string') {
    return { reason: `${field}.narration: tipo inválido` }
  }

  const narration = normalizeBibleText(value.narration).replace(/\s*\n+\s*/g, ' ')

  if (narration.length < 10 || narration.length > 280) {
    return { reason: `${field}.narration: longitud fuera de rango` }
  }

  if (containsForbiddenText(narration)) {
    return { reason: `${field}.narration: contiene marcas no permitidas` }
  }

  const characterIds = new Set(bible.characters.map((character) => character.id))
  const propIds = new Set(bible.props.map((prop) => prop.id))
  const charactersError = validateIdList(
    value.characters,
    3,
    `${field}.characters`,
    characterIds,
    bible.leadCharacterId,
    'el protagonista',
  )

  if (charactersError) return { reason: charactersError }

  if ((value.characters as unknown[]).length === 0) {
    return { reason: `${field}.characters: falta el protagonista` }
  }

  const propsError = validateIdList(
    value.props,
    3,
    `${field}.props`,
    propIds,
    bible.signaturePropId,
    'el prop característico',
  )

  if (propsError) return { reason: propsError }

  const continuity = value.continuityFromPrevious

  if (index === 0) {
    if (continuity !== null) {
      return { reason: `${field}.continuityFromPrevious: debe ser null` }
    }
  } else if (typeof continuity !== 'string') {
    return { reason: `${field}.continuityFromPrevious: tipo inválido` }
  } else {
    const normalized = normalizeBibleText(continuity)

    if (
      normalized.length < BEAT_MIN_CONTINUITY_LENGTH
      || normalized.length > BEAT_MAX_CONTINUITY_LENGTH
    ) {
      return {
        reason: `${field}.continuityFromPrevious: longitud fuera de rango`,
      }
    }

    if (containsForbiddenText(normalized)) {
      return {
        reason: `${field}.continuityFromPrevious: contiene marcas no permitidas`,
      }
    }
  }

  if (index === 0 && value.sceneRole !== 'establishing' && total >= 4) {
    return { reason: `${field}.sceneRole: la primera escena debe ser establishing` }
  }

  if (index === total - 1 && value.sceneRole !== 'resolution' && total >= 4) {
    return { reason: `${field}.sceneRole: la última escena debe ser resolution` }
  }

  if (
    total >= 4
    && index > 0
    && index < total - 1
    && (value.sceneRole === 'establishing' || value.sceneRole === 'resolution')
  ) {
    return {
      reason: `${field}.sceneRole: las escenas intermedias no pueden ser establishing ni resolution`,
    }
  }

  return {
    beat: {
      order: index + 1,
      sceneRole: value.sceneRole as StorySceneRole,
      visualPrompt: normalizeBibleText(value.visualPrompt as string),
      narration,
      characters: [...(value.characters as string[])],
      props: [...(value.props as string[])],
      camera: value.camera as StoryCameraShot,
      continuityFromPrevious:
        index === 0 ? null : normalizeBibleText(value.continuityFromPrevious as string),
      transition: 'cut',
    },
  }
}

export function validateContinuityBeats(
  value: unknown,
  sceneCount: number,
  bible: StoryBible,
): BeatValidation {
  if (!Array.isArray(value) || value.length !== sceneCount) {
    return { ok: false, reason: `beats: se esperaban exactamente ${sceneCount}` }
  }

  const beats: import('~/models/story').StoryBeat[] = []
  const seenCharacters = new Set<string>()

  for (let index = 0; index < value.length; index += 1) {
    const result = validateBeatShape(value[index], index, bible, sceneCount)

    if (result.reason) return { ok: false, reason: result.reason }

    const beat = result.beat!

    beats.push(beat)

    for (const id of beat.characters) seenCharacters.add(id)
  }

  for (const character of bible.characters) {
    if (!seenCharacters.has(character.id)) {
      return { ok: false, reason: 'beats: personaje de la biblia sin escena' }
    }
  }

  const climaxIndexes = beats
    .map((beat, index) => (beat.sceneRole === 'climax' ? index : -1))
    .filter((index) => index >= 0)

  if (sceneCount >= 4) {
    if (climaxIndexes.length !== 1) {
      return { ok: false, reason: 'beats: debe haber exactamente un climax' }
    }

    const climaxIndex = climaxIndexes[0]!

    if (climaxIndex === 0 || climaxIndex === sceneCount - 1) {
      return {
        ok: false,
        reason: 'beats: el climax debe estar entre la primera y la última escena',
      }
    }
  }

  const globalBlock = composeGlobalBlock(bible)

  if (globalBlock.length > STORY_GLOBAL_BLOCK_MAX_LENGTH) {
    return { ok: false, reason: 'plan: bloque global demasiado largo' }
  }

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index]!
    const keyframe = storyPromptComposer.composeKeyframe({
      bible,
      beat,
      hasReference: false,
    })
    const video = storyPromptComposer.composeVideo({ bible, beat, preset: 'fast' })

    if (
      keyframe.prompt.length > STORY_PROMPT_MAX_LENGTH
      || video.prompt.length > STORY_PROMPT_MAX_LENGTH
    ) {
      return {
        ok: false,
        reason: `beats[${index}]: prompt final demasiado largo`,
      }
    }
  }

  return { ok: true, beats }
}

/** Exposed for diagnostics and tests without leaking plan content. */
export function bibleRoleLabel(value: StorySceneRole): string {
  return storySceneRoleLabel(value)
}
