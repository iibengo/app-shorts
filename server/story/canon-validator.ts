import type {
  NarrativeBeat,
  NarrativeDraft,
} from './director-types'
import type {
  StoryBible,
  StoryCharacter,
  StoryEntitySource,
  StoryLocation,
  StoryMode,
  StoryNarrativeTone,
  StoryProp,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryWeather,
} from '~/models/story'
import {
  STORY_CAMERAS,
  STORY_SCENE_ROLES,
  STORY_STORY_FUNCTIONS,
  STORY_TIME_OF_DAYS,
  STORY_WEATHERS,
  isNarrativeTone,
  maxInventedCharacters,
} from './story-mode'
import {
  composeGlobalBlock,
  STORY_GLOBAL_BLOCK_MAX_LENGTH,
  storyTimeOfDayLabel,
  storyWeatherLabel,
} from './story-prompt-composer'

export const CANON_KEYS = [
  'style',
  'tone',
  'theme',
  'leadCharacterId',
  'signaturePropId',
  'characters',
  'locations',
  'props',
  'forbidden',
  'continuityRules',
] as const

export const CANON_CHARACTER_KEYS = ['id', 'name', 'description', 'wardrobe', 'source'] as const
export const CANON_LOCATION_KEYS = ['id', 'name', 'description', 'source'] as const
export const CANON_PROP_KEYS = ['id', 'name', 'description', 'source'] as const

export const NARRATIVE_BEAT_KEYS = [
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
] as const

export const DRAFT_KEYS = ['title', 'logline', 'tone', 'storyBible', 'beats'] as const

export const CANON_ID_PATTERN = /^[a-z][a-z0-9-]{1,23}$/
export const CANON_MAX_STYLE_LENGTH = 160
export const CANON_MIN_STYLE_LENGTH = 10
export const CANON_MAX_THEME_LENGTH = 160
export const CANON_MIN_THEME_LENGTH = 10
export const CANON_MAX_NAME_LENGTH = 40
export const CANON_MIN_CHARACTER_DESCRIPTION = 20
export const CANON_MAX_CHARACTER_DESCRIPTION = 160
export const CANON_MIN_WARDROBE = 10
export const CANON_MAX_WARDROBE = 120
export const CANON_MIN_LOCATION_DESCRIPTION = 10
export const CANON_MAX_LOCATION_DESCRIPTION = 160
export const CANON_MIN_PROP_DESCRIPTION = 10
export const CANON_MAX_PROP_DESCRIPTION = 120
export const CANON_MAX_FORBIDDEN = 10
export const CANON_MIN_FORBIDDEN = 2
export const CANON_MAX_FORBIDDEN_LENGTH = 50
export const CANON_MAX_RULES = 5
export const CANON_MIN_RULE = 4
export const CANON_MAX_RULE = 140
export const BEAT_MIN_ACTION = 20
export const BEAT_MAX_ACTION = 600
export const BEAT_MIN_NARRATION = 10
export const BEAT_MAX_NARRATION = 280
export const BEAT_MIN_VISUAL_PROMPT = 20
export const BEAT_MAX_VISUAL_PROMPT = 600
export const BEAT_MIN_GAG = 4
export const BEAT_MAX_GAG = 120
export const BEAT_MIN_CONTINUITY = 20
export const BEAT_MAX_CONTINUITY = 200

export type CanonValidation =
  | { readonly ok: true; readonly draft: NarrativeDraft }
  | { readonly ok: false; readonly reason: string }

const MARKUP = /[<>`]/
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const URL = /(?:https?:\/\/|www\.)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(value: string): string {
  return value.normalize('NFC').trim()
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function hasAllKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

function invalidText(value: string): boolean {
  return MARKUP.test(value) || MARKDOWN_BLOCK.test(value) || CONTROL.test(value) || URL.test(value)
}

function validateText(
  value: unknown,
  min: number,
  max: number,
  field: string,
): string | null {
  if (typeof value !== 'string') return `${field}: tipo inválido`

  const text = normalize(value)

  if (text.length < min || text.length > max) {
    return `${field}: longitud fuera de rango`
  }

  if (invalidText(text)) return `${field}: contiene marcas no permitidas`

  return null
}

function validateId(value: unknown, field: string): string | null {
  if (typeof value !== 'string' || !CANON_ID_PATTERN.test(value)) {
    return `${field}: id inválido`
  }

  return null
}

function isSource(value: unknown): value is StoryEntitySource {
  return value === 'premise' || value === 'invented'
}

function validateEntityList(
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

function validateCharacter(
  value: unknown,
  index: number,
  seen: Set<string>,
): string | null {
  const field = `storyBible.characters[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, CANON_CHARACTER_KEYS)
    || !hasAllKeys(value, CANON_CHARACTER_KEYS)
  ) {
    return `${field}: forma inválida`
  }

  const idError = validateId(value.id, `${field}.id`)

  if (idError) return idError

  const id = value.id as string

  if (seen.has(id)) return `${field}.id: duplicado`
  seen.add(id)

  if (!isSource(value.source)) return `${field}.source: valor inválido`

  return validateText(value.name, 1, CANON_MAX_NAME_LENGTH, `${field}.name`)
    ?? validateText(
      value.description,
      CANON_MIN_CHARACTER_DESCRIPTION,
      CANON_MAX_CHARACTER_DESCRIPTION,
      `${field}.description`,
    )
    ?? validateText(
      value.wardrobe,
      CANON_MIN_WARDROBE,
      CANON_MAX_WARDROBE,
      `${field}.wardrobe`,
    )
}

function validateLocation(
  value: unknown,
  index: number,
  seen: Set<string>,
): string | null {
  const field = `storyBible.locations[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, CANON_LOCATION_KEYS)
    || !hasAllKeys(value, CANON_LOCATION_KEYS)
  ) {
    return `${field}: forma inválida`
  }

  const idError = validateId(value.id, `${field}.id`)

  if (idError) return idError

  const id = value.id as string

  if (seen.has(id)) return `${field}.id: duplicado`
  seen.add(id)

  if (!isSource(value.source)) return `${field}.source: valor inválido`

  return validateText(value.name, 1, CANON_MAX_NAME_LENGTH, `${field}.name`)
    ?? validateText(
      value.description,
      CANON_MIN_LOCATION_DESCRIPTION,
      CANON_MAX_LOCATION_DESCRIPTION,
      `${field}.description`,
    )
}

function validateProp(
  value: unknown,
  index: number,
  seen: Set<string>,
): string | null {
  const field = `storyBible.props[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, CANON_PROP_KEYS)
    || !hasAllKeys(value, CANON_PROP_KEYS)
  ) {
    return `${field}: forma inválida`
  }

  const idError = validateId(value.id, `${field}.id`)

  if (idError) return idError

  const id = value.id as string

  if (seen.has(id)) return `${field}.id: duplicado`
  seen.add(id)

  if (!isSource(value.source)) return `${field}.source: valor inválido`

  return validateText(value.name, 1, CANON_MAX_NAME_LENGTH, `${field}.name`)
    ?? validateText(
      value.description,
      CANON_MIN_PROP_DESCRIPTION,
      CANON_MAX_PROP_DESCRIPTION,
      `${field}.description`,
    )
}

function normalizeTerm(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/-/g, ' ')
}

function containsCanonTerm(forbidden: string, terms: readonly string[]): boolean {
  const item = normalizeTerm(forbidden)

  return terms.some((term) => {
    const normalized = normalizeTerm(term)

    return item === normalized
      || (item.length >= 3 && normalized.length >= 3
        && (item.includes(normalized) || normalized.includes(item)))
  })
}

function validateBeat(
  value: unknown,
  index: number,
  total: number,
  bible: StoryBible,
): { readonly beat?: NarrativeBeat; readonly reason?: string } {
  const field = `beats[${index}]`

  if (
    !isRecord(value)
    || !hasOnlyKeys(value, NARRATIVE_BEAT_KEYS)
    || !hasAllKeys(value, NARRATIVE_BEAT_KEYS)
  ) {
    return { reason: `${field}: forma inválida` }
  }

  if (value.order !== index + 1) return { reason: `${field}.order: debe ser ${index + 1}` }

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

  const characterIds = new Set(bible.characters.map((character) => character.id))
  const propIds = new Set(bible.props.map((prop) => prop.id))

  if (!Array.isArray(value.characters) || value.characters.length < 1 || value.characters.length > 3) {
    return { reason: `${field}.characters: número de elementos fuera de rango` }
  }

  const seenCharacters = new Set<string>()

  for (const id of value.characters) {
    if (typeof id !== 'string' || !characterIds.has(id)) {
      return { reason: `${field}.characters: id inexistente` }
    }
    if (seenCharacters.has(id)) return { reason: `${field}.characters: id duplicado` }
    seenCharacters.add(id)
  }

  if (!Array.isArray(value.props) || value.props.length > 3) {
    return { reason: `${field}.props: número de elementos fuera de rango` }
  }

  const seenProps = new Set<string>()

  for (const id of value.props) {
    if (typeof id !== 'string' || !propIds.has(id)) {
      return { reason: `${field}.props: id inexistente` }
    }
    if (seenProps.has(id)) return { reason: `${field}.props: id duplicado` }
    seenProps.add(id)
  }

  const actionError = validateText(value.action, BEAT_MIN_ACTION, BEAT_MAX_ACTION, `${field}.action`)

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

  if (index === 0 && value.sceneRole !== 'establishing') {
    return { reason: `${field}.sceneRole: la primera escena debe ser establishing` }
  }

  if (index === total - 1 && value.sceneRole !== 'resolution') {
    return { reason: `${field}.sceneRole: la última escena debe ser resolution` }
  }

  if (
    index > 0
    && index < total - 1
    && (value.sceneRole === 'establishing' || value.sceneRole === 'resolution')
  ) {
    return { reason: `${field}.sceneRole: rol no permitido en una escena intermedia` }
  }

  if (index === 0 && value.storyFunction !== 'hook') {
    return { reason: `${field}.storyFunction: la primera escena debe ser hook` }
  }

  if (index === total - 1 && value.storyFunction !== 'payoff') {
    return { reason: `${field}.storyFunction: la última escena debe ser payoff` }
  }

  if (value.storyFunction === 'twist' && value.sceneRole !== 'climax') {
    return { reason: `${field}.storyFunction: twist debe coincidir con climax` }
  }

  if (index !== 0 && value.storyFunction === 'hook') {
    return { reason: `${field}.storyFunction: hook solo puede ser el primer beat` }
  }

  if (index !== total - 1 && value.storyFunction === 'payoff') {
    return { reason: `${field}.storyFunction: payoff solo puede ser el último beat` }
  }

  return {
    beat: {
      order: index + 1,
      sceneRole: value.sceneRole as NarrativeBeat['sceneRole'],
      locationId: value.locationId as string,
      timeOfDay: value.timeOfDay as StoryTimeOfDay,
      weather: value.weather as StoryWeather,
      characters: [...(value.characters as string[])],
      props: [...(value.props as string[])],
      action: normalize(value.action as string),
      narration: normalize(value.narration as string).replace(/\s*\n+\s*/g, ' '),
      storyFunction: value.storyFunction as StoryStoryFunction,
      gag: value.gag === null ? null : normalize(value.gag as string),
    },
  }
}

export function validateNarrativeDraft(
  value: unknown,
  options: { readonly sceneCount: number; readonly mode: StoryMode },
): CanonValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, DRAFT_KEYS) || !hasAllKeys(value, DRAFT_KEYS)) {
    return { ok: false, reason: 'plan: forma inválida' }
  }

  const titleError = validateText(value.title, 1, 80, 'title')
  if (titleError) return { ok: false, reason: titleError }

  const loglineError = validateText(value.logline, 1, 200, 'logline')
  if (loglineError) return { ok: false, reason: loglineError }

  if (!isNarrativeTone(value.tone)) {
    return { ok: false, reason: 'tone: valor inválido' }
  }

  if (
    !isRecord(value.storyBible)
    || !hasOnlyKeys(value.storyBible, CANON_KEYS)
    || !hasAllKeys(value.storyBible, CANON_KEYS)
  ) {
    return { ok: false, reason: 'storyBible: forma inválida' }
  }

  const bible = value.storyBible
  const styleError = validateText(
    bible.style,
    CANON_MIN_STYLE_LENGTH,
    CANON_MAX_STYLE_LENGTH,
    'storyBible.style',
  )
  if (styleError) return { ok: false, reason: styleError }

  const themeError = validateText(
    bible.theme,
    CANON_MIN_THEME_LENGTH,
    CANON_MAX_THEME_LENGTH,
    'storyBible.theme',
  )
  if (themeError) return { ok: false, reason: themeError }

  if (!isNarrativeTone(bible.tone) || bible.tone !== value.tone) {
    return { ok: false, reason: 'storyBible.tone: debe coincidir con tone' }
  }

  const charactersError = validateEntityList(bible.characters, 1, 3, 'storyBible.characters')
  if (charactersError) return { ok: false, reason: charactersError }

  const characterIds = new Set<string>()
  for (let index = 0; index < (bible.characters as unknown[]).length; index += 1) {
    const error = validateCharacter((bible.characters as unknown[])[index], index, characterIds)
    if (error) return { ok: false, reason: error }
  }

  const locationsError = validateEntityList(bible.locations, 1, 3, 'storyBible.locations')
  if (locationsError) return { ok: false, reason: locationsError }

  const locationIds = new Set<string>()
  for (let index = 0; index < (bible.locations as unknown[]).length; index += 1) {
    const error = validateLocation((bible.locations as unknown[])[index], index, locationIds)
    if (error) return { ok: false, reason: error }
  }

  const propsError = validateEntityList(bible.props, 1, 5, 'storyBible.props')
  if (propsError) return { ok: false, reason: propsError }

  const propIds = new Set<string>()
  for (let index = 0; index < (bible.props as unknown[]).length; index += 1) {
    const error = validateProp((bible.props as unknown[])[index], index, propIds)
    if (error) return { ok: false, reason: error }
  }

  const characters = (bible.characters as Record<string, unknown>[]).map((character) => ({
    id: character.id as string,
    name: normalize(character.name as string),
    description: normalize(character.description as string),
    wardrobe: normalize(character.wardrobe as string),
    source: character.source as StoryEntitySource,
  })) satisfies StoryCharacter[]

  const locations = (bible.locations as Record<string, unknown>[]).map((location) => ({
    id: location.id as string,
    name: normalize(location.name as string),
    description: normalize(location.description as string),
    source: location.source as StoryEntitySource,
  })) satisfies StoryLocation[]

  const props = (bible.props as Record<string, unknown>[]).map((prop) => ({
    id: prop.id as string,
    name: normalize(prop.name as string),
    description: normalize(prop.description as string),
    source: prop.source as StoryEntitySource,
  })) satisfies StoryProp[]

  const lead = characters.find((character) => character.id === bible.leadCharacterId)
  if (!lead || lead.source !== 'premise') {
    return { ok: false, reason: 'storyBible.leadCharacterId: debe ser un personaje premise' }
  }

  if (
    bible.signaturePropId === null
    || typeof bible.signaturePropId !== 'string'
    || !props.some((prop) => prop.id === bible.signaturePropId && prop.source === 'premise')
  ) {
    return { ok: false, reason: 'storyBible.signaturePropId: debe ser un prop premise' }
  }

  if (options.mode === 'faithful') {
    if ([...characters, ...locations, ...props].some((entity) => entity.source !== 'premise')) {
      return { ok: false, reason: 'canon: faithful no admite elementos inventados' }
    }
  } else {
    const inventedCharacters = characters.filter((character) => character.source === 'invented')
    if (inventedCharacters.length > maxInventedCharacters(options.mode)) {
      return { ok: false, reason: 'storyBible.characters: demasiados inventados' }
    }
  }

  if (!Array.isArray(value.beats) || value.beats.length !== options.sceneCount) {
    return { ok: false, reason: `beats: se esperaban exactamente ${options.sceneCount}` }
  }

  const provisionalBible: StoryBible = {
    style: normalize(bible.style as string),
    tone: bible.tone as StoryNarrativeTone,
    theme: normalize(bible.theme as string),
    leadCharacterId: bible.leadCharacterId as string,
    signaturePropId: bible.signaturePropId as string,
    characters,
    locations,
    props,
    forbidden: [],
    continuityRules: [],
  }
  const beats: NarrativeBeat[] = []

  for (let index = 0; index < value.beats.length; index += 1) {
    const result = validateBeat(value.beats[index], index, options.sceneCount, provisionalBible)
    if (result.reason) return { ok: false, reason: result.reason }
    beats.push(result.beat!)
  }

  const usedCharacters = new Set(beats.flatMap((beat) => beat.characters))
  const usedLocations = new Set(beats.map((beat) => beat.locationId))
  const usedProps = new Set(beats.flatMap((beat) => beat.props))

  for (const character of characters) {
    if (!usedCharacters.has(character.id)) {
      return { ok: false, reason: 'storyBible.characters: personaje sin escena' }
    }
  }
  for (const location of locations) {
    if (!usedLocations.has(location.id)) {
      return { ok: false, reason: 'storyBible.locations: localización sin escena' }
    }
  }
  for (const prop of props) {
    if (!usedProps.has(prop.id)) {
      return { ok: false, reason: 'storyBible.props: prop sin escena' }
    }
  }

  const declaredCharacters = (bible.forbidden as unknown[] | undefined) ?? []
  if (!Array.isArray(declaredCharacters)) {
    return { ok: false, reason: 'storyBible.forbidden: tipo inválido' }
  }
  if (declaredCharacters.length < 1 || declaredCharacters.length > CANON_MAX_FORBIDDEN) {
    return { ok: false, reason: 'storyBible.forbidden: número de elementos fuera de rango' }
  }

  const usedTimes = new Set(beats.map((beat) => beat.timeOfDay))
  const usedWeathers = new Set(beats.map((beat) => beat.weather))
  const canonTerms = [
    ...characters.flatMap((character) => [character.id, character.name]),
    ...locations.flatMap((location) => [location.id, location.name]),
    ...props.flatMap((prop) => [prop.id, prop.name]),
    ...usedTimes,
    ...usedWeathers,
    ...[...usedTimes].map((value) => storyTimeOfDayLabel(value)),
    ...[...usedWeathers].map((value) => storyWeatherLabel(value)),
  ]
  const forbidden: string[] = []
  const seenForbidden = new Set<string>()

  for (let index = 0; index < declaredCharacters.length; index += 1) {
    const item = declaredCharacters[index]

    if (typeof item !== 'string') {
      return { ok: false, reason: `storyBible.forbidden[${index}]: tipo inválido` }
    }

    const text = normalize(item)
    const key = normalizeTerm(text)

    if (text.length < CANON_MIN_FORBIDDEN || text.length > CANON_MAX_FORBIDDEN_LENGTH) {
      return { ok: false, reason: `storyBible.forbidden[${index}]: longitud fuera de rango` }
    }
    if (invalidText(text)) {
      return { ok: false, reason: `storyBible.forbidden[${index}]: contiene marcas no permitidas` }
    }
    if (seenForbidden.has(key)) {
      return { ok: false, reason: 'storyBible.forbidden: duplicado' }
    }
    if (containsCanonTerm(text, canonTerms)) {
      return { ok: false, reason: 'storyBible.forbidden: contradice el canon' }
    }

    seenForbidden.add(key)
    forbidden.push(text)
  }

  const rulesValue = bible.continuityRules

  if (!Array.isArray(rulesValue) || rulesValue.length < 1 || rulesValue.length > CANON_MAX_RULES) {
    return { ok: false, reason: 'storyBible.continuityRules: número de elementos fuera de rango' }
  }

  const continuityRules: string[] = []

  for (let index = 0; index < rulesValue.length; index += 1) {
    const error = validateText(
      rulesValue[index],
      CANON_MIN_RULE,
      CANON_MAX_RULE,
      `storyBible.continuityRules[${index}]`,
    )
    if (error) return { ok: false, reason: error }
    continuityRules.push(normalize(rulesValue[index] as string))
  }

  const storyBible: StoryBible = {
    ...provisionalBible,
    forbidden,
    continuityRules,
  }

  const climaxCount = beats.filter((beat) => beat.sceneRole === 'climax').length
  if (climaxCount !== 1) return { ok: false, reason: 'beats: debe haber exactamente un climax' }

  const twistCount = beats.filter((beat) => beat.storyFunction === 'twist').length
  if (twistCount !== 1) return { ok: false, reason: 'beats: debe haber exactamente un twist' }

  if (options.sceneCount >= 5) {
    if (!beats.some((beat) => beat.storyFunction === 'complication')) {
      return { ok: false, reason: 'beats: falta complication' }
    }
    if (!beats.some((beat) => beat.storyFunction === 'escalation')) {
      return { ok: false, reason: 'beats: falta escalation' }
    }
  }

  if (!beats.some((beat) => beat.characters.includes(storyBible.leadCharacterId))) {
    return { ok: false, reason: 'beats: el protagonista no aparece' }
  }
  if (
    storyBible.signaturePropId !== null
    && !beats.some((beat) => beat.props.includes(storyBible.signaturePropId as string))
  ) {
    return { ok: false, reason: 'beats: el prop característico no aparece' }
  }

  const globalBlock = composeGlobalBlock(storyBible)

  if (globalBlock.length > STORY_GLOBAL_BLOCK_MAX_LENGTH) {
    return { ok: false, reason: 'plan: bloque global demasiado largo' }
  }

  return {
    ok: true,
    draft: {
      title: normalize(value.title as string),
      logline: normalize(value.logline as string),
      tone: value.tone as StoryNarrativeTone,
      storyBible,
      beats,
    },
  }
}
