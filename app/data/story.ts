import type {
  StoryCameraShot,
  StoryImageMimeType,
  StoryPreset,
  StoryQCIssueCode,
  StoryQCSeverity,
  StorySceneCount,
  StorySceneRole,
  StoryStatus,
  StoryTimeOfDay,
  StoryWeather,
} from '~/models/story'

export const STORY_MIN_PREMISE_LENGTH = 10
export const STORY_MAX_PREMISE_LENGTH = 600

export const STORY_SCENE_COUNTS: readonly StorySceneCount[] = [4, 5, 6]
export const STORY_DEFAULT_SCENE_COUNT: StorySceneCount = 5

export const STORY_SCENE_DURATION_SECONDS = 6

export const STORY_MAX_IMAGE_BYTES = 8_388_608

export const STORY_MAX_REFERENCES = 1

export const STORY_IMAGE_MIME_TYPES: readonly StoryImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

export const STORY_FILE_ACCEPT = STORY_IMAGE_MIME_TYPES.join(',')

export const STORY_MIN_VISUAL_PROMPT_LENGTH = 20
export const STORY_MAX_VISUAL_PROMPT_LENGTH = 600
export const STORY_MIN_NARRATION_LENGTH = 10
export const STORY_MAX_NARRATION_LENGTH = 280

export const STORY_MAX_KEYFRAME_ATTEMPTS = 2
export const STORY_MAX_VIDEO_ATTEMPTS = 2

export const STORY_POLL_AFTER_MS = 2_500

export interface StoryPresetOption {
  readonly preset: StoryPreset
  readonly modelId: 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'
  readonly label: string
  readonly description: string
}

export const STORY_PRESETS: readonly StoryPresetOption[] = [
  {
    preset: 'fast',
    modelId: 'minimax-hailuo-02',
    label: 'Rápido',
    description: 'MiniMax Hailuo 02. Menos espera.',
  },
  {
    preset: 'quality',
    modelId: 'kling-2.5-turbo-pro',
    label: 'Calidad',
    description: 'Kling 2.5 Turbo Pro. Más detalle y coste.',
  },
]

export const STORY_DEFAULT_PRESET: StoryPreset = 'fast'

export const STORY_SCENE_COUNT_LABELS: Readonly<Record<StorySceneCount, string>> = {
  4: '4 escenas',
  5: '5 escenas',
  6: '6 escenas',
}

export const STORY_PRESET_COPY: Readonly<Record<StoryPreset, string>> = {
  fast: 'Rápido',
  quality: 'Calidad',
}

export type StoryStepId = 'plan' | 'images' | 'videos' | 'result'

export interface StoryStep {
  readonly id: StoryStepId
  readonly label: string
}

export const STORY_STEPS: readonly StoryStep[] = [
  { id: 'plan', label: 'Guion' },
  { id: 'images', label: 'Imágenes' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'result', label: 'Resultado' },
]

/** Statuses that no longer poll. */
export const STORY_TERMINAL_STATUSES: readonly StoryStatus[] = [
  'READY',
  'FAILED',
  'CANCELLED',
  'WAITING_QC',
]

export const STORY_TIME_OF_DAY_LABELS: Readonly<Record<StoryTimeOfDay, string>> = {
  dawn: 'Amanecer',
  morning: 'Mañana',
  noon: 'Mediodía',
  afternoon: 'Tarde',
  'golden-hour': 'Hora dorada',
  dusk: 'Atardecer',
  night: 'Noche',
}

export const STORY_WEATHER_LABELS: Readonly<Record<StoryWeather, string>> = {
  clear: 'Despejado',
  cloudy: 'Nublado',
  overcast: 'Cubierto',
  'light-rain': 'Llovizna',
  rain: 'Lluvia',
  storm: 'Tormenta',
  snow: 'Nieve',
  fog: 'Niebla',
  windy: 'Viento',
}

export const STORY_CAMERA_LABELS: Readonly<Record<StoryCameraShot, string>> = {
  wide: 'Plano general',
  medium: 'Plano medio',
  'close-up': 'Primer plano',
  'low-angle': 'Contrapicado',
  'high-angle': 'Picado',
  tracking: 'Travelling',
  'over-the-shoulder': 'Plano sobre el hombro',
  detail: 'Detalle',
}

export const STORY_SCENE_ROLE_LABELS: Readonly<Record<StorySceneRole, string>> = {
  establishing: 'Presentación',
  development: 'Desarrollo',
  escalation: 'Ascenso',
  climax: 'Clímax',
  resolution: 'Resolución',
}

export const STORY_QC_ISSUE_COPY: Readonly<Record<StoryQCIssueCode, string>> = {
  'missing-lead-character': 'El personaje principal no aparece en esta escena.',
  'missing-character': 'Falta un personaje que debería aparecer.',
  'extra-character': 'Aparece un personaje que no está en la historia.',
  'wrong-wardrobe': 'La ropa de un personaje no coincide con la historia.',
  'missing-prop': 'Falta un objeto importante de la escena.',
  'wrong-prop': 'Aparece un objeto o vehículo que no corresponde.',
  'wrong-location': 'La localización no coincide con la historia.',
  'wrong-weather': 'El clima no coincide con la historia.',
  'wrong-time-of-day': 'La hora del día no coincide con la historia.',
  'continuity-break': 'La escena no continúa de forma coherente con la anterior.',
  'text-or-watermark': 'Hay texto, logotipo o marca de agua en la imagen.',
  'visual-artifact': 'Hay artefactos visuales en la imagen.',
  'frames-unavailable': 'No se pudieron extraer los fotogramas de esta escena.',
  'technical-duration': 'El clip no dura 6 segundos.',
  'technical-streams': 'El clip tiene audio o pistas no permitidas.',
  'technical-aspect': 'El clip no es vertical 9:16.',
  'technical-resolution': 'La resolución del clip es demasiado baja.',
}

export const STORY_QC_SEVERITY_LABELS: Readonly<Record<StoryQCSeverity, string>> = {
  blocking: 'Problema',
  warning: 'Aviso',
}

export const STORY_BIBLE_LABELS = {
  summary: 'Continuidad de la historia',
  style: 'Estilo visual',
  location: 'Localización',
  time: 'Hora',
  weather: 'Clima',
  characters: 'Personajes',
  props: 'Objetos',
  forbidden: 'No debe aparecer',
  sceneCharacters: 'Personajes',
  sceneProps: 'Objetos',
  sceneCamera: 'Cámara',
  sceneContinuity: 'Continuidad',
  noProps: 'Sin objetos',
  firstScene: 'Abre la historia',
} as const

export const STORY_COPY = {
  brand: 'AI Shorts',
  beta: 'BETA',
  betaExplanation:
    'BETA. La creación de historias con IA es real, consume créditos y puede tardar varios minutos.',
  back: 'Volver al feed',
  h1: 'Crea una historia con IA',
  intro:
    'Escribe una premisa. La IA prepara entre 4 y 6 escenas de 6 segundos con sus imágenes y tú decides cuándo generar los vídeos.',
  formTitle: 'Tu historia',
  premiseLabel: 'Premisa',
  premisePlaceholder: 'Una repostera descubre que sus postres pueden predecir el futuro.',
  premiseHelp: 'Máximo 600 caracteres.',
  sceneCountLegend: 'Escenas',
  sceneCountHelp: 'Cada escena dura 6 segundos.',
  presetLegend: 'Calidad de vídeo',
  referenceTitle: 'Imagen de referencia (opcional)',
  referenceHelp:
    'Una imagen PNG, JPG o WebP de hasta 8 MB. Se usa para el guion y para las imágenes de todas las escenas. Se envía a DeepSeek y a Fal; Fal la elimina en 1 hora.',
  referenceAdd: 'Añadir imagen',
  referenceEmpty: 'Sin imagen. Puedes crear la historia solo con texto.',
  referenceMax: 'Máximo 1 imagen. Elimina la actual para cambiarla.',
  referenceUploading: 'Subiendo imagen…',
  referenceReady: 'Imagen lista.',
  referenceRetry: 'Reintentar subida',
  privacy:
    'Tu premisa se envía a DeepSeek para escribir el guion. Fal genera las imágenes y los vídeos, y DeepSeek revisa fotogramas de los clips para comprobar la continuidad. AI Shorts guarda la historia 24 horas para que puedas volver a ella desde este navegador. La imagen de referencia se elimina de Fal en 1 hora.',
  create: 'Crear historia',
  planning: 'Escribiendo el guion',
  planningNote: 'La IA está preparando las escenas. Puede tardar unos segundos.',
  keyframes: 'Preparando las imágenes',
  keyframesNote: 'Estamos creando una imagen por escena.',
  reviewTitle: 'Revisa las imágenes',
  sceneTitle: 'Escena {n} de {total}',
  narrationLabel: 'Narración (solo en pantalla)',
  visualPromptLabel: 'Prompt visual',
  regenerate: 'Guardar y regenerar',
  regenerating: 'Regenerando imagen…',
  regenerated: 'Imagen lista.',
  regenerateFailed: 'No se pudo regenerar la imagen.',
  attempt: 'Imagen {n} de 2',
  keyframeLimitReached: 'Esta escena ya no puede regenerar la imagen.',
  approve: 'Aprobar y generar vídeos',
  videosTitle: 'Generando los vídeos',
  videosNote: 'Los vídeos se generan de dos en dos. Puede tardar varios minutos.',
  videosSlow: 'Está tardando más de lo habitual. Puedes seguir esperando o cancelar.',
  assemblyTitle: 'Montando el vídeo final',
  assemblyStepDownload: 'Descargando los vídeos',
  assemblyStepConcat: 'Uniendo las escenas',
  assemblyStepUpload: 'Subiendo el resultado',
  assemblyNote:
    'Estamos uniendo las escenas con cortes secos. Sin música, voz ni texto en pantalla.',
  qcProgressTitle: 'Revisando la continuidad',
  qcProgressNote:
    'Comprobamos que cada escena mantiene a los mismos personajes, la ropa, los objetos, la hora y el clima.',
  qcTitle: 'Revisa la continuidad',
  qcIntro:
    'Estas son las escenas de tu historia. Puedes reintentar una escena, regenerar su imagen y su vídeo, aprobar de todos modos o cancelar.',
  qcVerdictProblems: 'Hemos encontrado {n} problemas de continuidad.',
  qcVerdictWarnings: 'Hemos encontrado {n} avisos de continuidad.',
  qcVerdictNone: 'No hemos encontrado problemas de continuidad.',
  qcVerdictUnavailable: 'La revisión automática no está disponible.',
  qcVerdictNeedsReview: 'No hemos podido confirmar la continuidad con suficiente confianza.',
  qcRetryBlocked:
    'No se puede volver a revisar mientras una escena tenga el vídeo roto.',
  qcUnavailable:
    'La revisión automática no está disponible. Revisa las escenas antes de continuar.',
  qcFramesMissing: 'Fotogramas no disponibles.',
  qcFramesAlt: 'Fotogramas de la escena {n}: inicio, medio y final',
  qcOverrideWarning:
    'Al aprobar de todos modos, la historia puede mantener los problemas detectados.',
  qcOverrideConfirm: 'Entiendo que el vídeo puede tener errores de continuidad.',
  qcOverride: 'Aprobar de todos modos',
  qcRetry: 'Volver a revisar',
  qcRecover: 'Regenerar imagen y vídeo',
  qcRecoverVideo: 'Reintentar vídeo',
  qcRetryLimit: 'No quedan reintentos para esta escena.',
  resultManualReview: 'Continuidad revisada manualmente.',
  cancel: 'Cancelar historia',
  cancelled: 'Historia cancelada.',
  failedTitle: 'No se pudo completar la historia',
  retryScene: 'Reintentar escena',
  retryAssembly: 'Reintentar montaje',
  startOver: 'Empezar de nuevo',
  startAnother: 'Empezar otra historia',
  resultBadge: 'IA',
  resultTitle: 'Tu historia',
  resultScenes: 'Escenas',
  resultDuration: 'Duración',
  resultFormat: 'Formato',
  resultStyle: 'Estilo',
  resultReference: 'Referencia',
  resultReferenceZero: 'Sin referencia',
  resultReferenceOne: '1 imagen',
  resultNote:
    'Generado con IA. Puede contener errores. No se ha publicado. El enlace del vídeo caduca en 24 horas.',
  expired: 'Esta historia ya no está disponible. Empieza de nuevo.',
  notOwned: 'Esta historia no está disponible en este navegador.',
  offlineCreate: 'Sin conexión. La creación necesita internet.',
  offlinePolling: 'Sin conexión. Reintentaremos cuando vuelvas a estar en línea.',
  nojsCreate:
    'La creación de historias necesita JavaScript. Puedes volver al feed de prueba.',
  nojsDetail:
    'Esta historia necesita JavaScript para mostrar su progreso. Puedes volver al feed de prueba.',
  metaTitle: 'AI Shorts — Historias con IA',
  metaDescription:
    'Crea una historia de 4 a 6 escenas con IA: revisa las imágenes, genera los vídeos y recibe un vídeo vertical de hasta 36 segundos.',
  metaDetailTitle: 'Tu historia — AI Shorts',
} as const
