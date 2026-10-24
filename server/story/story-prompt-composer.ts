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
  StoryShotFraming,
  StoryStoryFunction,
  StoryTimeOfDay,
  StoryVisualStyle,
  StoryTone,
  StoryWeather,
} from '~/models/story'
import { focusSizeBlock } from './focus-framing'
import { StoryError } from './errors'
import { styleBlockFor, styleBlockShort, styleNegativeFor } from './visual-style'

export interface KeyframePromptInput {
  readonly bible: StoryBible | null
  readonly beat: StoryBeat
  readonly hasReference: boolean
  /** 010: look of the channel, prepended to the prompt. */
  readonly visualStyle?: StoryVisualStyle
  /** 010c: identity of the reference must be preserved, not suggested. */
  readonly withIdentityLock?: boolean
  /** 008 passes 4.000 to bound the final keyframe prompt deterministically. */
  readonly maxLength?: number
  /**
   * 012: name of the character the shot is about, when the subject resolves to
   * one. Fixes how much of the frame that character occupies.
   */
  readonly focusCharacterName?: string | null
  /**
   * 012: the reference is only a look reference (no character in the frame), so
   * the body must forbid adding the person instead of locking an identity.
   */
  readonly styleOnlyReference?: boolean
}

export interface VideoPromptInput {
  readonly bible: StoryBible | null
  readonly beat: StoryBeat
  readonly preset: StoryPreset
  /** 010: look of the channel, prepended to the prompt. */
  readonly visualStyle?: StoryVisualStyle
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

/**
 * FLUX.1 [dev] and Kontext read at most ~512 T5 tokens, and the shot-specific
 * text must survive. 900 characters of English stay well below that ceiling.
 */
export const KEYFRAME_PROMPT_MAX_CHARS = 900

/** Constant negative prompt of 004. It is normative and must not change. */
export const KLING_LEGACY_NEGATIVE_PROMPT =
  'blur, distortion, flicker, text, watermark, logo, low quality, deformed hands'

/**
 * 013: Nano Banana has no negative channel and Google's guide says "describe
 * what you want, not what you don't". Banned words such as "no text" name the
 * very thing they forbid, so this block describes the frame instead: one frozen
 * instant with clean surfaces.
 */
export const KEYFRAME_STAGE_BLOCK_EN =
  'A single frozen instant in vertical 9:16, clean surfaces and unmarked areas.'

/**
 * 013: eight providers say the same thing about image-to-video: the first frame
 * already carries the subject, the scene and the style, so the prompt describes
 * motion only. Repeating the scene makes the model re-decide it, and a list of
 * prohibitions names what it should avoid.
 */
export const VIDEO_STAGE_BLOCK =
  'The first frame already shows the subject, the place and the look: animate only what happens next. '
  + 'One clear action, one camera move, smooth natural motion, the same person and the same palette throughout. '
  // 013: the video model invents headlines on every screen it animates, and
  // neither MiniMax nor Kling takes a negative channel that survives contact
  // with the prompt. The target is not a blank screen, which looks broken: it
  // is an unreadable one. Colour, bars and blurry shapes read as a working
  // monitor, while real copy belongs to the graphics layer, not to the model.
  + 'Every screen shows abstract unreadable content: colour blocks, soft bars and blurry shapes, with letters that never resolve into words. '
  + 'Screens and surfaces keep the same look as the first frame, and the only motion is the action described, vertical 9:16.'

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

const TIME_OF_DAY_EN: Readonly<Record<StoryTimeOfDay, string>> = {
  dawn: 'dawn',
  morning: 'morning',
  noon: 'midday',
  afternoon: 'afternoon',
  'golden-hour': 'golden hour',
  dusk: 'dusk',
  night: 'night',
}

const WEATHER_EN: Readonly<Record<StoryWeather, string>> = {
  clear: 'clear sky',
  cloudy: 'cloudy',
  overcast: 'overcast',
  'light-rain': 'light rain',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
  fog: 'fog',
  windy: 'windy',
}

const CAMERA_EN: Readonly<Record<StoryCameraShot, string>> = {
  wide: 'wide shot',
  medium: 'medium shot',
  'close-up': 'close-up',
  'low-angle': 'low angle',
  'high-angle': 'high angle',
  tracking: 'tracking shot',
  'over-the-shoulder': 'over-the-shoulder shot',
  detail: 'detail shot',
}

const FRAMING_EN: Readonly<Record<StoryShotFraming, string>> = {
  establishing: 'establishing shot',
  wide: 'wide shot',
  medium: 'medium shot',
  'close-up': 'close-up',
  'extreme-close-up': 'extreme close-up',
  detail: 'detail shot',
  reaction: 'reaction shot',
  'over-the-shoulder': 'over-the-shoulder shot',
  'two-shot': 'two-shot',
  insert: 'insert shot',
}

const TONE_EN: Readonly<Record<StoryTone, string>> = {
  humor: 'humor',
  aventura: 'adventure',
  absurdo: 'absurd',
  heartwarming: 'heartwarming',
  dramatic: 'dramatic',
  neutral: 'neutral',
}

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`
}

function stripTrailingPeriod(value: string): string {
  return value.replace(/[.;,\s]+$/u, '')
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
/**
 * 013: the video counterpart of `composeSceneBlock`. Only what moves: the
 * action, the camera move and the continuity of the frame. No location, no
 * time, no weather, no wardrobe list.
 */
export function composeVideoMotionBlock(
  bible: StoryBible,
  beat: StoryBeat,
): string {
  const action = beat.action.trim()
  const camera = storyCameraLabel(beat.camera)
  const continuity = beat.continuityFromPrevious
    ? 'The same framing and lighting continue from the first frame. '
    : ''

  return `${action} ${continuity}Camera: ${camera}.`.trim()
}

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
  return `Vertical 9:16 keyframe for a short film. ${visualPrompt}. A single clear subject, natural lighting, plain unmarked surfaces.`
}

export function storyKeyframeKontextPrompt(visualPrompt: string): string {
  return `Using the reference image as the visual anchor, create a vertical 9:16 keyframe for a short film. ${visualPrompt}. The same subject, clothing and palette, in a clean frame with plain unmarked surfaces.`
}

/**
 * Prompt for one or more reference images (Kontext, Kontext multi, Nano Banana).
 * The reference already carries the look, so the text must not ask for a
 * different medium: a "photorealistic" line next to a low-poly avatar makes the
 * model render a real person instead of preserving the uploaded style.
 */
export function storyKeyframeReferencePrompt(visualPrompt: string): string {
  return `Using the reference image as the visual anchor, create a vertical 9:16 keyframe for a short film. ${visualPrompt}. The same person, the same clothing and the same palette as the reference, rendered in a clean frame with plain unmarked surfaces.`
}

/**
 * A shot with no character in it still wants the channel's look. The reference
 * is then a palette sample, and asking for its identity would insert a person
 * into an empty frame.
 */
export function storyKeyframeStyleReferencePrompt(visualPrompt: string): string {
  return `Using the reference image only for its visual style and palette, create a vertical 9:16 keyframe for a short film. ${visualPrompt}. An empty frame of this world, with plain unmarked surfaces and nobody from the reference present.`
}

export function storyVideoLegacyPrompt(visualPrompt: string): string {
  return `${visualPrompt}. Smooth natural motion, one clear action, the same subject throughout, vertical 9:16.`
}

/**
 * A reference image alone is only a suggestion: without an explicit
 * instruction the model reinterprets the face for every shot. This block turns
 * the reference into an order and names the same features the anchor shows.
 */
export const IDENTITY_LOCK_BLOCK =
  'Use the reference image as the exact same character. Keep the identical face, hair, beard, eyebrows, blue eyes and skin tone. Do not change the person.'

/** Per framing, so a three-quarter or profile shot does not invent a new face. */
const IDENTITY_LOCK_BY_FRAMING: Readonly<Record<StoryShotFraming, string>> = {
  // A wide or establishing frame cannot preserve a face it barely shows, so the
  // identity block asks for the framing that does: the face stays readable even
  // if the scene is wide.
  establishing: `${IDENTITY_LOCK_BLOCK} The face is clearly visible and readable in the frame.`,
  wide: `${IDENTITY_LOCK_BLOCK} The face is clearly visible and readable in the frame.`,
  medium: IDENTITY_LOCK_BLOCK,
  'close-up': IDENTITY_LOCK_BLOCK,
  'extreme-close-up': IDENTITY_LOCK_BLOCK,
  reaction: IDENTITY_LOCK_BLOCK,
  'over-the-shoulder': `${IDENTITY_LOCK_BLOCK} The face is turned three-quarters toward the camera so it stays readable.`,
  'two-shot': IDENTITY_LOCK_BLOCK,
  detail: IDENTITY_LOCK_BLOCK,
  insert: IDENTITY_LOCK_BLOCK,
}

/**
 * A 2x2 character sheet is a grid, and the model copies that structure: shots
 * come back as stacked panels instead of one frame. This line forbids it.
 */
export const SINGLE_FRAME_BLOCK =
  'Generate one single continuous frame: no grid, no collage, no panels, no split screen, no multiple scenes.'

/** Short form, used when the full identity block does not fit the budget. */
export const IDENTITY_LOCK_COMPACT =
  'Keep the exact same face, hair, beard and eyes as the reference character.'

export function identityLockFor(framing: StoryShotFraming | undefined): string {
  return IDENTITY_LOCK_BY_FRAMING[framing ?? 'medium']
}

export function composeKeyframe(input: KeyframePromptInput): ComposedKeyframePrompt {
  const budget = input.maxLength === undefined
    ? KEYFRAME_PROMPT_MAX_CHARS
    : Math.min(input.maxLength, KEYFRAME_PROMPT_MAX_CHARS)
  const stylePrefix = input.visualStyle === undefined
    ? ''
    : `${styleBlockFor(input.visualStyle)}. `
  // 012: a style-only reference carries no person, so locking an identity onto
  // it would paste the lead into a frame where the script put nobody.
  const lockIdentity = input.withIdentityLock === true && input.styleOnlyReference !== true
  const identity = lockIdentity ? identityLockFor(input.beat.framing) : ''
  // The grid guard follows the reference, not the identity lock: a reference
  // without it is exactly how a diptych gets generated.
  const singleFrame = input.hasReference === true ? SINGLE_FRAME_BLOCK : ''
  // The identity block is non-negotiable, but the style and the scene can
  // degrade: try the full version, then a compact identity line, then a
  // shorter style block. Never fail because the sum does not fit.
  const identityVariants = identity.length === 0
    ? ['']
    : [identity, IDENTITY_LOCK_COMPACT]
  let prompt = ''

  for (const identityVariant of identityVariants) {
    const identityPrefix = identityVariant.length === 0
      ? ''
      : `${identityVariant} ${singleFrame} `
    const styleVariants = input.visualStyle === undefined
      ? ['']
      : [`${styleBlockFor(input.visualStyle)}. `, `${styleBlockShort(input.visualStyle)}. `]

    for (const styleVariant of styleVariants) {
      const bodyBudget = Math.max(0, budget - styleVariant.length - identityPrefix.length)
      const body = input.bible === null
        ? input.hasReference
          ? input.styleOnlyReference === true
            ? storyKeyframeStyleReferencePrompt(input.beat.visualPrompt)
            : storyKeyframeReferencePrompt(input.beat.visualPrompt)
          : storyKeyframeFluxPrompt(input.beat.visualPrompt)
        : composeCanonKeyframePrompt(
            input.bible,
            input.beat,
            bodyBudget,
            input.focusCharacterName ?? null,
            input.styleOnlyReference === true,
          )
      const candidate = `${styleVariant}${identityPrefix}${body}`

      if (candidate.length <= budget) {
        prompt = candidate
        break
      }
    }

    if (prompt.length > 0) break
  }

  if (prompt.length === 0) {
    throw new StoryError('invalid-visual-prompt')
  }

  if (prompt.length > budget) {
    throw new StoryError('invalid-visual-prompt')
  }

  return { prompt }
}

function keyframeShotLine(beat: StoryBeat): string {
  const framing = beat.framing === undefined
    ? CAMERA_EN[beat.camera]
    : FRAMING_EN[beat.framing]
  const subject = beat.subject === undefined ? '' : compactText(beat.subject, 80)
  const action = stripTrailingPeriod(compactText(beat.action, 160))

  return subject.length === 0
    ? `${capitalizeFirst(framing)}: ${action}.`
    : `${capitalizeFirst(framing)} of ${subject}: ${action}.`
}

function keyframeEntities(
  bible: StoryBible,
  beat: StoryBeat,
  detailed: boolean,
): string {
  const characters = beat.characters
    .map((id) => characterById(bible, id))
    .filter((character): character is StoryCharacter => character !== undefined)
    .map((character) => detailed
      ? `${character.name} (${stripTrailingPeriod(compactText(character.wardrobe, 60))})`
      : character.name)
    .join('; ')
  const props = beat.props
    .map((id) => propById(bible, id))
    .filter((prop): prop is StoryProp => prop !== undefined)
    .map((prop) => prop.name)
    .join(', ')

  return [
    characters.length === 0 ? '' : `Characters: ${characters}.`,
    props.length === 0 ? '' : `Props: ${props}.`,
  ].filter((part) => part.length > 0).join(' ')
}

function keyframeContext(bible: StoryBible, beat: StoryBeat): string {
  const location = sceneLocation(bible, beat)

  return `Location: ${compactText(location.name, 60)}. Time: ${TIME_OF_DAY_EN[beat.timeOfDay]}. Weather: ${WEATHER_EN[beat.weather]}.`
}

function keyframeComposition(beat: StoryBeat): string {
  const composition = stripTrailingPeriod(compactText(beat.visualPrompt, 180))

  return composition.length === 0 ? '' : `Composition: ${composition}.`
}

function keyframeStyle(bible: StoryBible, withRules: boolean): string {
  const rules = withRules
    ? bible.continuityRules
        .slice(0, 2)
        .map((rule) => compactText(rule, 60))
        .join('; ')
    : ''
  const base = `Style: ${compactText(bible.style, 80)}. Tone: ${TONE_EN[bible.tone]}. Theme: ${compactText(bible.theme, 80)}.`

  return rules.length === 0 ? base : `${base} Continuity: ${rules}.`
}

/**
 * Canon keyframe prompt: shot first, then only the entities present, then the
 * location, and the style last. The degradation ladder is deterministic so a
 * long canon never truncates the shot-specific text.
 */
function composeCanonKeyframePrompt(
  bible: StoryBible,
  beat: StoryBeat,
  maxChars: number = KEYFRAME_PROMPT_MAX_CHARS,
  focusCharacterName?: string | null,
  styleOnlyReference?: boolean,
): string {
  const head = keyframeShotLine(beat)
  // The focus block is short and it is what stops a secondary character from
  // dissolving into the background, so it rides with the head, never degraded.
  const focus = focusSizeBlock(beat.framing, focusCharacterName ?? null)
  const composition = keyframeComposition(beat)
  const context = keyframeContext(bible, beat)
  const style = keyframeStyle(bible, true)
  const styleShort = keyframeStyle(bible, false)
  const entities = keyframeEntities(bible, beat, true)
  const entitiesShort = keyframeEntities(bible, beat, false)
  // A canon frame with nobody in it still uses the channel look; the reference
  // is a palette sample, so the frame must not inherit its subject.
  const noPerson = styleOnlyReference === true
    ? 'Use the reference image only for its visual style and palette. Do not add the person from the reference to this frame.'
    : ''
  const base = focus.length === 0 ? head : `${head} ${focus}`
  const shot = noPerson.length === 0 ? base : `${base} ${noPerson}`
  const candidates = [
    [shot, composition, entities, context, style, KEYFRAME_STAGE_BLOCK_EN],
    [shot, composition, entities, context, styleShort, KEYFRAME_STAGE_BLOCK_EN],
    [shot, composition, entitiesShort, context, styleShort, KEYFRAME_STAGE_BLOCK_EN],
    [shot, composition, context, styleShort, KEYFRAME_STAGE_BLOCK_EN],
    [shot, context, styleShort, KEYFRAME_STAGE_BLOCK_EN],
    // Last resort: the style and the composition are what make the frame look
    // like the channel, so the least destructive cut is the stage note. A shot
    // that would not fit must still produce a keyframe, never a failed one.
    [shot, context, styleShort],
    [head, context, styleShort],
  ].map((parts) => parts.filter((part) => part.length > 0).join(' '))

  return candidates.find((candidate) => candidate.length <= maxChars)
    ?? candidates[candidates.length - 1]!
}

function joinVideoPrompt(
  globalBlock: string,
  sceneBlock: string,
  stageBlock: string,
): string {
  return [globalBlock, sceneBlock, stageBlock].join(' ')
}

export function composeVideo(input: VideoPromptInput): ComposedVideoPrompt {
  const stylePrefix = input.visualStyle === undefined
    ? ''
    : `${styleBlockFor(input.visualStyle)}. `

  if (input.bible === null) {
    const prompt = `${stylePrefix}${storyVideoLegacyPrompt(input.beat.visualPrompt)}`

    if (prompt.length > STORY_VIDEO_PROMPT_MAX_LENGTH) {
      throw new StoryError('invalid-visual-prompt')
    }

    return {
      prompt,
      negativePrompt: input.visualStyle === undefined
        ? KLING_LEGACY_NEGATIVE_PROMPT
        : `${KLING_LEGACY_NEGATIVE_PROMPT}, ${styleNegativeFor(input.visualStyle)}`,
    }
  }

  const negativePrompt = input.visualStyle === undefined
    ? composeNegative(input.bible, input.beat)
    : `${composeNegative(input.bible, input.beat)}, ${styleNegativeFor(input.visualStyle)}`
  // 013: the video prompt describes motion only. No location, time, weather,
  // wardrobe or prop list: the first frame already shows them, and eight
  // providers agree that repeating the scene makes the model re-decide it
  // instead of animating it. Continuity lives in the negative channel for the
  // engines that accept one, and the motion block says it in positive.
  const motion = composeVideoMotionBlock(input.bible, input.beat)
  const stageBlock = VIDEO_STAGE_BLOCK
  const candidates = [
    joinVideoPrompt(motion, stageBlock),
    joinVideoPrompt(compactText(motion, 400), stageBlock),
  ]
  const styledCandidates = candidates.map((candidate) => `${stylePrefix}${candidate}`)
  const prompt = styledCandidates.find(
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
