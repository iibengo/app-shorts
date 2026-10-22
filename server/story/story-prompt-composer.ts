import type {
  StoryBeat,
  StoryBible,
  StoryCameraShot,
  StoryCharacter,
  StoryLocation,
  StoryPlan,
  StoryPreset,
  StoryProp,
  StorySceneRole,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryTone,
  StoryWeather,
} from '~/models/story'
import { StoryError } from './errors'

export interface KeyframePromptInput {
  readonly bible: StoryBible | null
  readonly beat: StoryBeat
  readonly hasReference: boolean
  /** 008 passes 4.000 to bound the final keyframe prompt deterministically. */
  readonly maxLength?: number
}

export interface VideoPromptInput {
  readonly bible: StoryBible | null
  readonly beat: StoryBeat
  readonly preset: StoryPreset
}

export interface ComposedKeyframePrompt {
  readonly prompt: string
}

export interface ComposedVideoPrompt {
  readonly prompt: string
  readonly negativePrompt: string
}

export interface StoryPromptComposer {
  composeGlobalBlock(bible: StoryBible): string
  composeNegative(bible: StoryBible, beat: StoryBeat): string
  composeKeyframe(input: KeyframePromptInput): ComposedKeyframePrompt
  composeVideo(input: VideoPromptInput): ComposedVideoPrompt
}

export const STORY_PROMPT_MAX_LENGTH = 4_000
export const STORY_VIDEO_PROMPT_MAX_LENGTH = 2_000
export const STORY_GLOBAL_BLOCK_MAX_LENGTH = 2_600

/** Constant negative prompt of 004. It is normative and must not change. */
export const KLING_LEGACY_NEGATIVE_PROMPT =
  'blur, distortion, flicker, text, watermark, logo, low quality, deformed hands'

export const KEYFRAME_STAGE_BLOCK =
  'Fotograma estático vertical 9:16, un solo instante, sin movimiento, sin texto, sin subtítulos, sin logotipo, sin marca de agua.'

export const VIDEO_STAGE_BLOCK =
  'Animate this keyframe only. Preserve character identity, exact clothing, the signature prop, the background, the location, the weather and the time of day described for this scene. '
  + 'Do not add characters. Do not change the location, the action or the props. Do not cut away. Vertical 9:16, smooth natural motion, no text, no subtitles, no watermark, no logo.'

const BASE_NEGATIVE: readonly string[] = [
  'extra characters',
  'characters not in the story canon',
  'props not in the story canon',
  'different props than described',
  'different location than described',
  'different clothing',
  'different weather than described',
  'different time of day than described',
  'text',
  'subtitles',
  'watermark',
  'logo',
  'low quality',
  'artifacts',
]

const COMPACT_VIDEO_NEGATIVE: readonly string[] = [
  'extra characters',
  'different clothing',
  'different props than described',
  'different location than described',
  'different weather than described',
  'different time of day than described',
  'text',
  'watermark',
  'low quality',
]

const TIME_OF_DAY_LABELS: Readonly<Record<StoryTimeOfDay, string>> = {
  dawn: 'amanecer',
  morning: 'mañana',
  noon: 'mediodía',
  afternoon: 'tarde',
  'golden-hour': 'hora dorada',
  dusk: 'atardecer',
  night: 'noche',
}

const WEATHER_LABELS: Readonly<Record<StoryWeather, string>> = {
  clear: 'despejado',
  cloudy: 'nublado',
  overcast: 'cubierto',
  'light-rain': 'llovizna',
  rain: 'lluvia',
  storm: 'tormenta',
  snow: 'nieve',
  fog: 'niebla',
  windy: 'viento',
}

const CAMERA_LABELS: Readonly<Record<StoryCameraShot, string>> = {
  wide: 'plano general',
  medium: 'plano medio',
  'close-up': 'primer plano',
  'low-angle': 'contrapicado',
  'high-angle': 'picado',
  tracking: 'travelling',
  'over-the-shoulder': 'plano sobre el hombro',
  detail: 'detalle',
}

const SCENE_ROLE_LABELS: Readonly<Record<StorySceneRole, string>> = {
  establishing: 'presentación',
  development: 'desarrollo',
  escalation: 'ascenso',
  climax: 'clímax',
  resolution: 'resolución',
}

const TONE_LABELS: Readonly<Record<StoryTone, string>> = {
  humor: 'Humor',
  aventura: 'Aventura',
  absurdo: 'Absurdo',
  heartwarming: 'Emotivo',
  dramatic: 'Dramático',
  neutral: 'Neutro',
}

export function storyTimeOfDayLabel(value: StoryTimeOfDay): string {
  return TIME_OF_DAY_LABELS[value]
}

export function storyWeatherLabel(value: StoryWeather): string {
  return WEATHER_LABELS[value]
}

export function storyCameraLabel(value: StoryCameraShot): string {
  return CAMERA_LABELS[value]
}

export function storySceneRoleLabel(value: StorySceneRole): string {
  return SCENE_ROLE_LABELS[value]
}

export function storyToneLabel(value: StoryTone): string {
  return TONE_LABELS[value]
}

function characterById(bible: StoryBible, id: string): StoryCharacter | undefined {
  return bible.characters.find((character) => character.id === id)
}

function propById(bible: StoryBible, id: string): StoryProp | undefined {
  return bible.props.find((prop) => prop.id === id)
}

function locationById(bible: StoryBible, id: string): StoryLocation | undefined {
  return bible.locations.find((location) => location.id === id)
}

function signatureProp(bible: StoryBible): StoryProp | null {
  return bible.signaturePropId === null
    ? null
    : propById(bible, bible.signaturePropId) ?? null
}

function sceneLocation(bible: StoryBible, beat: StoryBeat): StoryLocation {
  return locationById(bible, beat.locationId) ?? bible.locations[0]!
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ')

  if (normalized.length <= maxLength) return normalized

  const slice = normalized.slice(0, Math.max(0, maxLength - 1))
  const lastSpace = slice.lastIndexOf(' ')

  if (lastSpace <= 0) return `${slice}…`

  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

/** Full, byte-identical canon block used by keyframes and QC. */
export function composeGlobalBlock(bible: StoryBible): string {
  const characters = bible.characters
    .map((character) =>
      `${character.name} (${character.id}): ${character.description} Vestuario: ${character.wardrobe}. `,
    )
    .join('')
  const locations = bible.locations
    .map((location) => `${location.name} (${location.id}): ${location.description}. `)
    .join('')
  const props = bible.props
    .map((prop) => `${prop.name} (${prop.id}): ${prop.description}. `)
    .join('')
  const rules = bible.continuityRules.map((rule) => `${rule} `).join('')

  return 'CONTINUIDAD GLOBAL (idéntica en todas las escenas). '
    + `Estilo: ${bible.style}. Tono: ${storyToneLabel(bible.tone)}. Tema: ${bible.theme}. `
    + `Personajes: ${characters}`
    + `Localizaciones: ${locations}`
    + `Objetos: ${props}`
    + `Reglas: ${rules}`
    + `Prohibido: ${bible.forbidden.join(', ')}.`
}

/** Scene block with the scene's own location, time, weather and action. */
export function composeSceneBlock(
  bible: StoryBible,
  beat: StoryBeat,
  options: { readonly includeContinuity?: boolean } = {},
): string {
  const location = sceneLocation(bible, beat)
  const present = beat.characters
    .map((id) => {
      const character = characterById(bible, id)

      return character ? `${character.name} (${character.id})` : id
    })
    .join(', ')
  const objects = beat.props
    .map((id) => {
      const prop = propById(bible, id)

      return prop ? `${prop.name} (${prop.id})` : id
    })
    .join(', ')
  const continuity = options.includeContinuity === false
    ? ''
    : beat.continuityFromPrevious
      ? `Continúa de la escena anterior: ${beat.continuityFromPrevious}. `
      : 'Primera escena: establece la situación. '

  return `ESCENA ${beat.order} (${storySceneRoleLabel(beat.sceneRole)}). `
    + `Localización: ${location.name} — ${location.description}. `
    + `Hora: ${storyTimeOfDayLabel(beat.timeOfDay)}. Clima: ${storyWeatherLabel(beat.weather)}. `
    + `Cámara: ${storyCameraLabel(beat.camera)}. `
    + `Presentes: ${present}. `
    + `Objetos: ${objects.length > 0 ? objects : 'Sin objetos'}. `
    + `Acción: ${beat.action}. `
    + `Composición: ${beat.visualPrompt}. `
    + continuity
}

/** Compact, deterministic video block, specific to the scene. */
export function composeVideoGlobalBlock(
  bible: StoryBible,
  beat: StoryBeat,
  options: { readonly minimal?: boolean } = {},
): string {
  const lead = characterById(bible, bible.leadCharacterId)
  const signature = signatureProp(bible)
  const location = sceneLocation(bible, beat)
  const leadBlock = lead === undefined
    ? ''
    : `Protagonista: ${lead.name} (${lead.id}), vestuario: ${compactText(lead.wardrobe, 90)}. `
  const signatureBlock = signature === null
    ? ''
    : `Prop característico: ${signature.name} (${signature.id}) — ${compactText(signature.description, 70)}. `
  const contextBlock = `Localización: ${location.name}. Hora: ${storyTimeOfDayLabel(beat.timeOfDay)}. Clima: ${storyWeatherLabel(beat.weather)}. `
  const lock = 'No cambies identidad, ropa, props, localización, hora ni clima declarados.'

  if (options.minimal === true) {
    return `CONTINUIDAD DE VÍDEO. ${leadBlock}${signatureBlock}${contextBlock}${lock}`
  }

  const present = beat.characters
    .map((id) => characterById(bible, id))
    .filter((character): character is StoryCharacter => character !== undefined)
    .map((character) => `${character.name}: ${compactText(character.wardrobe, 70)}`)
    .join('; ')
  const objects = beat.props
    .map((id) => propById(bible, id))
    .filter((prop): prop is StoryProp => prop !== undefined)
    .map((prop) => prop.name)
    .join(', ')

  return 'CONTINUIDAD DE VÍDEO. '
    + leadBlock
    + signatureBlock
    + contextBlock
    + `Presentes: ${present.length > 0 ? present : '—'}. `
    + `Objetos: ${objects.length > 0 ? objects : 'Sin objetos'}. `
    + lock
}

function dedupeTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const term of terms) {
    const normalized = term.trim().replace(/\s+/g, ' ').toLowerCase()

    if (normalized.length === 0 || seen.has(normalized)) continue

    seen.add(normalized)
    result.push(term.trim().replace(/\s+/g, ' '))
  }

  return result
}

function normalizeTerm(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().replace(/-/g, ' ')
}

function canonTerms(bible: StoryBible): readonly string[] {
  return [
    ...bible.characters.flatMap((character) => [character.id, character.name]),
    ...bible.locations.flatMap((location) => [location.id, location.name]),
    ...bible.props.flatMap((prop) => [prop.id, prop.name]),
  ]
}

function conflictsWithCanon(term: string, terms: readonly string[]): boolean {
  const normalized = normalizeTerm(term)

  return terms.some((candidate) => {
    const other = normalizeTerm(candidate)

    return normalized === other
      || (normalized.length >= 3 && other.length >= 3
        && (normalized.includes(other) || other.includes(normalized)))
  })
}

function contrastTerms(beat: StoryBeat): readonly string[] {
  const terms: string[] = []

  if (beat.timeOfDay !== 'night') terms.push('night')
  if (beat.weather !== 'rain' && beat.weather !== 'light-rain') terms.push('rain')
  if (beat.weather !== 'storm') terms.push('storm')
  if (beat.weather !== 'snow') terms.push('snow')
  if (beat.weather !== 'fog') terms.push('fog')

  return terms
}

/** Server-derived negative, filtered against the canon and the scene context. */
export function composeNegative(bible: StoryBible, beat: StoryBeat): string {
  const location = sceneLocation(bible, beat)
  const terms = canonTerms(bible).concat(
    storyTimeOfDayLabel(beat.timeOfDay),
    storyWeatherLabel(beat.weather),
    beat.timeOfDay,
    beat.weather,
    location.id,
    location.name,
  )
  const candidates = [...BASE_NEGATIVE, ...bible.forbidden, ...contrastTerms(beat)]
  const filtered = candidates.filter((term) => !conflictsWithCanon(term, terms))

  return dedupeTerms(filtered).join(', ')
}

export function storyKeyframeFluxPrompt(visualPrompt: string): string {
  return `Cinematic vertical 9:16 keyframe for a short film. ${visualPrompt}. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.`
}

export function storyKeyframeKontextPrompt(visualPrompt: string): string {
  return `Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short film. ${visualPrompt}. Preserve subject identity, clothing and color palette. No text, no watermark, no logo.`
}

export function storyVideoLegacyPrompt(visualPrompt: string): string {
  return `${visualPrompt}. Vertical 9:16 short film scene, smooth natural motion, consistent subject, no text, no watermark, no logo.`
}

export function composeKeyframe(input: KeyframePromptInput): ComposedKeyframePrompt {
  const prompt = input.bible === null
    ? input.hasReference
      ? storyKeyframeKontextPrompt(input.beat.visualPrompt)
      : storyKeyframeFluxPrompt(input.beat.visualPrompt)
    : [
        composeGlobalBlock(input.bible),
        composeSceneBlock(input.bible, input.beat),
        `${KEYFRAME_STAGE_BLOCK} Localización: ${sceneLocation(input.bible, input.beat).name}. Hora: ${storyTimeOfDayLabel(input.beat.timeOfDay)}. Clima: ${storyWeatherLabel(input.beat.weather)}.`,
        `Avoid: ${composeNegative(input.bible, input.beat)}`,
      ].join(' ')

  if (input.maxLength !== undefined && prompt.length > input.maxLength) {
    throw new StoryError('invalid-visual-prompt')
  }

  return { prompt }
}

function joinVideoPrompt(
  globalBlock: string,
  sceneBlock: string,
  stageBlock: string,
  avoid?: string,
): string {
  return [
    globalBlock,
    sceneBlock,
    stageBlock,
    ...(avoid === undefined ? [] : [`Avoid: ${avoid}`]),
  ].join(' ')
}

export function composeVideo(input: VideoPromptInput): ComposedVideoPrompt {
  if (input.bible === null) {
    const prompt = storyVideoLegacyPrompt(input.beat.visualPrompt)

    if (prompt.length > STORY_VIDEO_PROMPT_MAX_LENGTH) {
      throw new StoryError('invalid-visual-prompt')
    }

    return {
      prompt,
      negativePrompt: KLING_LEGACY_NEGATIVE_PROMPT,
    }
  }

  const negativePrompt = composeNegative(input.bible, input.beat)
  const globalBlock = composeVideoGlobalBlock(input.bible, input.beat)
  const minimalGlobal = composeVideoGlobalBlock(input.bible, input.beat, { minimal: true })
  const fullScene = composeSceneBlock(input.bible, input.beat)
  const sceneWithoutContinuity = composeSceneBlock(input.bible, input.beat, {
    includeContinuity: false,
  })
  const stageBlock = `${VIDEO_STAGE_BLOCK} Localización: ${sceneLocation(input.bible, input.beat).name}. Hora: ${storyTimeOfDayLabel(input.beat.timeOfDay)}. Clima: ${storyWeatherLabel(input.beat.weather)}.`
  const shortNegative = COMPACT_VIDEO_NEGATIVE.join(', ')
  const candidates = input.preset === 'fast'
    ? [
        joinVideoPrompt(globalBlock, fullScene, stageBlock, negativePrompt),
        joinVideoPrompt(globalBlock, fullScene, stageBlock, shortNegative),
        joinVideoPrompt(globalBlock, sceneWithoutContinuity, stageBlock, shortNegative),
        joinVideoPrompt(minimalGlobal, sceneWithoutContinuity, stageBlock, shortNegative),
      ]
    : [
        joinVideoPrompt(globalBlock, fullScene, stageBlock),
        joinVideoPrompt(globalBlock, sceneWithoutContinuity, stageBlock),
        joinVideoPrompt(minimalGlobal, sceneWithoutContinuity, stageBlock),
      ]
  const prompt = candidates.find(
    (candidate) => candidate.length <= STORY_VIDEO_PROMPT_MAX_LENGTH,
  )

  if (prompt === undefined) {
    throw new StoryError('invalid-visual-prompt')
  }

  return { prompt, negativePrompt }
}

export const storyPromptComposer: StoryPromptComposer = {
  composeGlobalBlock,
  composeNegative,
  composeKeyframe,
  composeVideo,
}

/**
 * Rebuilds a beat for a persisted scene. Legacy plans (005) have no canon, so
 * a stable synthesis is used and `narration` never enters a prompt.
 */
export function storyBeatForScene(
  plan: StoryPlan | null,
  scene: { readonly order: number; readonly visualPrompt: string; readonly narration: string },
  total: number,
): StoryBeat {
  const beat = plan?.beats.find((item) => item.order === scene.order)

  if (beat) return beat

  const sceneRole: StorySceneRole = scene.order === 1
    ? 'establishing'
    : scene.order === total
      ? 'resolution'
      : 'development'
  const storyFunction: StoryStoryFunction = scene.order === 1
    ? 'hook'
    : scene.order === total
      ? 'payoff'
      : 'complication'
  const bible = plan?.storyBible ?? null
  const location = bible?.locations[0]

  return {
    order: scene.order,
    sceneRole,
    locationId: location?.id ?? '',
    timeOfDay: 'morning',
    weather: 'clear',
    characters: bible ? [bible.leadCharacterId] : [],
    props: [],
    action: scene.visualPrompt,
    narration: scene.narration,
    storyFunction,
    gag: null,
    visualPrompt: scene.visualPrompt,
    camera: 'wide',
    continuityFromPrevious: scene.order === 1 ? null : 'Continúa la escena anterior.',
    transition: 'cut',
  }
}
