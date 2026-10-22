import type {
  StoryBible,
  StoryBeat,
  StoryCameraShot,
  StoryCharacter,
  StoryPlan,
  StoryProp,
  StoryPreset,
  StorySceneRole,
  StoryTimeOfDay,
  StoryWeather,
} from '~/models/story'

export interface KeyframePromptInput {
  readonly bible: StoryBible | null
  readonly beat: StoryBeat
  readonly hasReference: boolean
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
  'Animate this keyframe only. Preserve character identity, exact clothing, the signature prop, the background, the weather and the time of day. '
  + 'Do not add characters. Do not change the vehicle or prop. Do not cut away. Vertical 9:16, smooth natural motion, no text, no subtitles, no watermark, no logo.'

const BASE_NEGATIVE: readonly string[] = [
  'extra characters',
  'characters not in the story bible',
  'different vehicle or prop',
  'different clothing',
  'different weather',
  'different time of day',
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
  'different prop',
  'different weather',
  'different time of day',
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

function characterById(bible: StoryBible, id: string) {
  return bible.characters.find((character) => character.id === id)
}

function propById(bible: StoryBible, id: string) {
  return bible.props.find((prop) => prop.id === id)
}

function signatureProp(bible: StoryBible) {
  return bible.signaturePropId === null
    ? null
    : propById(bible, bible.signaturePropId) ?? null
}

/**
 * Pure, deterministic continuity block. It must be byte-identical for every
 * scene and stage of the same story.
 */
export function composeGlobalBlock(bible: StoryBible): string {
  const characters = bible.characters
    .map((character) =>
      `${character.name} (${character.id}): ${character.description} Vestuario: ${character.wardrobe}. `,
    )
    .join('')
  const props = bible.props
    .map((prop) => `${prop.name} (${prop.id}): ${prop.description}. `)
    .join('')
  const rules = bible.continuityRules.map((rule) => `${rule} `).join('')
  const signature = signatureProp(bible)
  const signatureBlock = signature === null
    ? ''
    : `Objeto característico: ${signature.name} — ${signature.description}. `

  return 'CONTINUIDAD GLOBAL (idéntica en todas las escenas). '
    + `Estilo: ${bible.style}. `
    + `Localización: ${bible.location.name} — ${bible.location.description}. `
    + `Hora del día: ${storyTimeOfDayLabel(bible.timeOfDay)}. `
    + `Clima: ${storyWeatherLabel(bible.weather)}. `
    + `Personajes: ${characters}`
    + signatureBlock
    + `Objetos: ${props}`
    + `Reglas: ${rules}`
    + `Prohibido: ${bible.forbidden.join(', ')}.`
}

/** Scene block. Uses the exact names and wardrobe of the bible. */
export function composeSceneBlock(
  bible: StoryBible,
  beat: StoryBeat,
  options: { readonly includeContinuity?: boolean } = {},
): string {
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
    + `Cámara: ${storyCameraLabel(beat.camera)}. `
    + `Presentes: ${present}. `
    + `Objetos: ${objects.length > 0 ? objects : 'Sin objetos'}. `
    + `Acción: ${beat.visualPrompt}. `
    + continuity
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

/**
 * Server-derived negative. It can never contradict the bible: contrast terms
 * are only added when they are not part of the declared time, weather or props.
 */
export function composeNegative(bible: StoryBible, _beat: StoryBeat): string {
  const terms: string[] = [...BASE_NEGATIVE, ...bible.forbidden]
  const timeOfDay = bible.timeOfDay
  const weather = bible.weather

  if (timeOfDay !== 'night') terms.push('night')
  if (weather !== 'rain' && weather !== 'light-rain') terms.push('rain')
  if (weather !== 'storm') terms.push('storm')
  if (weather !== 'snow') terms.push('snow')
  if (weather !== 'fog') terms.push('fog')

  const hasBicycle = bible.props.some((prop) =>
    `${prop.id} ${prop.name}`.toLowerCase().includes('bicycle'),
  )

  if (!hasBicycle) terms.push('bicycle')

  return dedupeTerms(terms).join(', ')
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

function compactText(value: string, maxLength: number): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ')

  if (normalized.length <= maxLength) return normalized

  const slice = normalized.slice(0, Math.max(0, maxLength - 1))
  const lastSpace = slice.lastIndexOf(' ')

  if (lastSpace <= 0) return normalized

  return `${slice.slice(0, lastSpace).trimEnd()}…`
}

function compactCharacter(character: { readonly name: string; readonly wardrobe: string }): string {
  return `${character.name}: ${compactText(character.wardrobe, 70)}`
}

function compactProp(prop: { readonly name: string; readonly description: string }): string {
  return `${prop.name}: ${compactText(prop.description, 60)}`
}

/**
 * Compact, deterministic continuity block for video models. It keeps only the
 * essential bible facts and never includes long descriptions.
 */
export function composeVideoGlobalBlock(
  bible: StoryBible,
  beat: StoryBeat,
  options: { readonly minimal?: boolean } = {},
): string {
  const lead = characterById(bible, bible.leadCharacterId)
  const signature = signatureProp(bible)
  const leadBlock = lead === undefined
    ? ''
    : `Protagonista: ${lead.name} (${lead.id}), vestuario: ${compactText(lead.wardrobe, 90)}. `
  const signatureBlock = signature === null
    ? ''
    : `Prop característico: ${signature.name} (${signature.id}) — ${compactText(signature.description, 70)}. `
  const locationBlock = `Localización: ${bible.location.name}. `
  const timeBlock = `Hora: ${storyTimeOfDayLabel(bible.timeOfDay)}. Clima: ${storyWeatherLabel(bible.weather)}. `
  const lock = 'No cambies identidad, ropa, prop, fondo, clima ni hora.'

  if (options.minimal === true) {
    return `CONTINUIDAD DE VÍDEO. ${leadBlock}${signatureBlock}${locationBlock}${timeBlock}${lock}`
  }

  const present = beat.characters
    .map((id) => characterById(bible, id))
    .filter((character): character is StoryCharacter => character !== undefined)
    .map(compactCharacter)
    .join('; ')
  const objects = beat.props
    .map((id) => propById(bible, id))
    .filter((prop): prop is StoryProp => prop !== undefined)
    .map(compactProp)
    .join('; ')

  return 'CONTINUIDAD DE VÍDEO. '
    + leadBlock
    + signatureBlock
    + locationBlock
    + timeBlock
    + `Presentes: ${present.length > 0 ? present : '—'}. `
    + `Objetos: ${objects.length > 0 ? objects : 'Sin objetos'}. `
    + lock
}

function joinVideoPrompt(
  globalBlock: string,
  sceneBlock: string,
  avoid?: string,
): string {
  return [
    globalBlock,
    sceneBlock,
    VIDEO_STAGE_BLOCK,
    ...(avoid === undefined ? [] : [`Avoid: ${avoid}`]),
  ].join(' ')
}

export function composeKeyframe(input: KeyframePromptInput): ComposedKeyframePrompt {
  if (input.bible === null) {
    return {
      prompt: input.hasReference
        ? storyKeyframeKontextPrompt(input.beat.visualPrompt)
        : storyKeyframeFluxPrompt(input.beat.visualPrompt),
    }
  }

  return {
    prompt: [
      composeGlobalBlock(input.bible),
      composeSceneBlock(input.bible, input.beat),
      KEYFRAME_STAGE_BLOCK,
      `Avoid: ${composeNegative(input.bible, input.beat)}`,
    ].join(' '),
  }
}

export function composeVideo(input: VideoPromptInput): ComposedVideoPrompt {
  if (input.bible === null) {
    return {
      prompt: storyVideoLegacyPrompt(input.beat.visualPrompt),
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
  const shortNegative = COMPACT_VIDEO_NEGATIVE.join(', ')
  const candidates = input.preset === 'fast'
    ? [
        joinVideoPrompt(globalBlock, fullScene, negativePrompt),
        joinVideoPrompt(globalBlock, fullScene, shortNegative),
        joinVideoPrompt(globalBlock, sceneWithoutContinuity, shortNegative),
        joinVideoPrompt(minimalGlobal, sceneWithoutContinuity, shortNegative),
      ]
    : [
        joinVideoPrompt(globalBlock, fullScene),
        joinVideoPrompt(globalBlock, sceneWithoutContinuity),
        joinVideoPrompt(minimalGlobal, sceneWithoutContinuity),
      ]
  const prompt = candidates.find(
    (candidate) => candidate.length <= STORY_VIDEO_PROMPT_MAX_LENGTH,
  ) ?? candidates[candidates.length - 1]!

  return { prompt, negativePrompt }
}

export const storyPromptComposer: StoryPromptComposer = {
  composeGlobalBlock,
  composeNegative,
  composeKeyframe,
  composeVideo,
}

/**
 * Rebuilds a beat for a persisted scene. Legacy plans (005) have no continuity
 * fields, so a stable synthesis is used and `narration` never enters a prompt.
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

  return {
    order: scene.order,
    sceneRole,
    visualPrompt: scene.visualPrompt,
    narration: scene.narration,
    characters: [],
    props: [],
    camera: 'wide',
    continuityFromPrevious: scene.order === 1 ? null : 'Continúa la escena anterior.',
    transition: 'cut',
  }
}
