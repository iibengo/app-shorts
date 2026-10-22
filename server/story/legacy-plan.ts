import type {
  StoryBeat,
  StoryBible,
  StoryCameraShot,
  StoryCharacter,
  StoryLocation,
  StoryMode,
  StoryPlan,
  StoryProp,
  StorySceneRole,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryWeather,
  StoryTone,
} from '~/models/story'
import { storyTimeOfDayLabel, storyWeatherLabel } from './story-prompt-composer'
import { STORY_TIME_OF_DAYS, STORY_WEATHERS } from './story-mode'

export interface LegacyPlanContext {
  readonly sceneCount: number
  readonly premise: string
  readonly logline: string | null
  readonly mode: StoryMode
}

const LEGACY_LOCATION_ID = 'legacy-location'
const LEGACY_THEME_FALLBACK = 'Historia heredada'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.normalize('NFC').trim() : fallback
}

function compact(value: string, max: number): string {
  if (value.length <= max) return value

  const slice = value.slice(0, max)
  const space = slice.lastIndexOf(' ')

  return (space > 0 ? slice.slice(0, space) : slice).trim()
}

function themeFrom(context: LegacyPlanContext): string {
  const logline = text(context.logline)

  if (logline.length >= 10 && logline.length <= 160) return logline

  const premise = compact(text(context.premise), 160)

  return premise.length >= 10 ? premise : LEGACY_THEME_FALLBACK
}

function toneOf(_value: unknown): StoryTone {
  return 'neutral'
}

function storyFunctionFor(role: StorySceneRole): StoryStoryFunction {
  switch (role) {
    case 'establishing': return 'hook'
    case 'development': return 'complication'
    case 'escalation': return 'escalation'
    case 'climax': return 'twist'
    case 'resolution': return 'payoff'
  }
}

function isRole(value: unknown): value is StorySceneRole {
  return value === 'establishing'
    || value === 'development'
    || value === 'escalation'
    || value === 'climax'
    || value === 'resolution'
}

function isCamera(value: unknown): value is StoryCameraShot {
  return value === 'wide'
    || value === 'medium'
    || value === 'close-up'
    || value === 'low-angle'
    || value === 'high-angle'
    || value === 'tracking'
    || value === 'over-the-shoulder'
    || value === 'detail'
}

function normalizeTerm(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/-/g, ' ')
}

function forbiddenConflicts(
  item: string,
  terms: readonly string[],
): boolean {
  const normalized = normalizeTerm(item)

  return terms.some((term) => {
    const candidate = normalizeTerm(term)

    return normalized === candidate
      || (normalized.length >= 3 && candidate.length >= 3
        && (normalized.includes(candidate) || candidate.includes(normalized)))
  })
}

export function normalizeLegacyPlan(
  value: unknown,
  context: LegacyPlanContext,
): StoryPlan | null {
  if (!isRecord(value)) return null

  const oldBible = value.storyBible

  if (!isRecord(oldBible) || !isRecord(oldBible.location)) return null
  if (!Array.isArray(value.beats) || value.beats.length !== context.sceneCount) return null

  const oldLocation = oldBible.location
  const locationName = compact(text(oldLocation.name, 'Localización heredada'), 40)
  const location: StoryLocation = {
    id: LEGACY_LOCATION_ID,
    name: locationName.length > 0 ? locationName : 'Localización heredada',
    description: text(oldLocation.description, 'Localización heredada de la historia original.'),
    source: 'premise',
  }
  const rawTimeOfDay = text(oldBible.timeOfDay, 'morning')
  const rawWeather = text(oldBible.weather, 'clear')
  const timeOfDay: StoryTimeOfDay = (STORY_TIME_OF_DAYS as readonly string[])
    .includes(rawTimeOfDay)
    ? rawTimeOfDay as StoryTimeOfDay
    : 'morning'
  const weather: StoryWeather = (STORY_WEATHERS as readonly string[])
    .includes(rawWeather)
    ? rawWeather as StoryWeather
    : 'clear'

  if (!Array.isArray(oldBible.characters) || oldBible.characters.length === 0) return null
  if (!Array.isArray(oldBible.props)) return null

  const characters: StoryCharacter[] = []
  for (const [index, entry] of oldBible.characters.entries()) {
    if (!isRecord(entry)) return null
    const id = text(entry.id, `character-${index + 1}`)
    characters.push({
      id,
      name: text(entry.name, 'Personaje'),
      description: text(entry.description, 'Personaje heredado de la historia original.'),
      wardrobe: text(entry.wardrobe, 'Vestuario heredado.'),
      source: 'premise',
    })
  }

  const props: StoryProp[] = []
  for (const [index, entry] of oldBible.props.entries()) {
    if (!isRecord(entry)) return null
    const id = text(entry.id, `prop-${index + 1}`)
    props.push({
      id,
      name: text(entry.name, 'Objeto'),
      description: text(entry.description, 'Objeto heredado de la historia original.'),
      source: 'premise',
    })
  }

  if (props.length === 0) return null

  const leadCharacterId = characters.some((character) => character.id === oldBible.leadCharacterId)
    ? text(oldBible.leadCharacterId)
    : characters[0]!.id
  const signaturePropId = typeof oldBible.signaturePropId === 'string'
    && props.some((prop) => prop.id === oldBible.signaturePropId)
    ? oldBible.signaturePropId
    : null

  const usedTimes = [timeOfDay]
  const usedWeathers = [weather]
  const terms = [
    location.id,
    location.name,
    ...characters.flatMap((character) => [character.id, character.name]),
    ...props.flatMap((prop) => [prop.id, prop.name]),
    ...usedTimes,
    ...usedWeathers,
    ...usedTimes.map((value) => {
      const labels = STORY_TIME_OF_DAYS as readonly string[]

      return labels.includes(value) ? storyTimeOfDayLabel(value as StoryTimeOfDay) : value
    }),
    ...usedWeathers.map((value) => {
      const labels = STORY_WEATHERS as readonly string[]

      return labels.includes(value) ? storyWeatherLabel(value as StoryWeather) : value
    }),
  ].filter((term): term is string => typeof term === 'string')
  const rawForbidden = Array.isArray(oldBible.forbidden)
    ? oldBible.forbidden.filter((item): item is string => typeof item === 'string')
    : []
  const forbidden = rawForbidden
    .map((item) => text(item))
    .filter((item) => item.length >= 2 && item.length <= 50)
    .filter((item) => !forbiddenConflicts(item, terms))
    .slice(0, 10)

  if (forbidden.length === 0) return null

  const continuityRules = Array.isArray(oldBible.continuityRules)
    ? oldBible.continuityRules
      .filter((item): item is string => typeof item === 'string')
      .map((item) => text(item))
      .filter((item) => item.length >= 4 && item.length <= 140)
      .slice(0, 5)
    : []

  const beats: StoryBeat[] = []

  for (const [index, entry] of value.beats.entries()) {
    if (!isRecord(entry)) return null

    const role = isRole(entry.sceneRole) ? entry.sceneRole : (
      index === 0 ? 'establishing' : index === context.sceneCount - 1 ? 'resolution' : 'development'
    )
    const oldCharacters = Array.isArray(entry.characters)
      ? entry.characters.filter((id): id is string =>
        typeof id === 'string' && characters.some((character) => character.id === id))
      : []
    const oldProps = Array.isArray(entry.props)
      ? entry.props.filter((id): id is string =>
        typeof id === 'string' && props.some((prop) => prop.id === id))
      : []
    const visualPrompt = text(entry.visualPrompt, text(entry.action, 'Escena heredada de la historia.'))

    beats.push({
      order: index + 1,
      sceneRole: role,
      locationId: LEGACY_LOCATION_ID,
      timeOfDay,
      weather,
      characters: oldCharacters.length > 0 ? oldCharacters : [leadCharacterId],
      props: oldProps,
      action: visualPrompt,
      narration: text(entry.narration, 'Narración heredada de la historia.'),
      storyFunction: storyFunctionFor(role),
      gag: null,
      visualPrompt,
      camera: isCamera(entry.camera) ? entry.camera : 'wide',
      continuityFromPrevious: index === 0
        ? null
        : text(entry.continuityFromPrevious, 'Continúa la escena anterior.'),
      transition: 'cut',
    })
  }

  const storyBible: StoryBible = {
    style: text(oldBible.style, 'animación 3D cartoon, colores saturados, sin grano'),
    tone: toneOf(oldBible.tone),
    theme: themeFrom(context),
    leadCharacterId,
    signaturePropId,
    characters,
    locations: [location],
    props,
    forbidden,
    continuityRules: continuityRules.length > 0
      ? continuityRules
      : ['Mantén la identidad y el vestuario de los personajes.'],
  }

  return {
    title: text(value.title, 'Historia heredada'),
    logline: text(value.logline, context.logline ?? 'Historia heredada'),
    tone: 'neutral',
    storyBible,
    beats,
  }
}
