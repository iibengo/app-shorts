import type {
  StoryCameraShot,
  StoryImageMimeType,
  StoryMode,
  StoryPreset,
  StoryQCIssueCode,
  StoryQCSeverity,
  StorySceneCount,
  StorySceneRole,
  StoryStatus,
  StoryTimeOfDay,
  StoryTone,
  StoryWeather,
  StoryVisualStyle,
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

export interface StoryVisualStyleOption {
  readonly visualStyle: StoryVisualStyle
  readonly label: string
  readonly description: string
}

export const STORY_VISUAL_STYLE_OPTIONS: readonly StoryVisualStyleOption[] = [
  {
    visualStyle: 'cartoon3d',
    label: '3D cartoon',
    description: 'Personajes 3D brillantes, estilo Pixar. El look por defecto.',
  },
  {
    visualStyle: 'papercraft',
    label: 'Papercraft',
    description: 'Low-poly de papel, fondo oscuro con neón.',
  },
  {
    visualStyle: 'voxel',
    label: 'Voxel',
    description: 'Bloques cúbicos, tipo Minecraft. El más fácil de mantener consistente.',
  },
  {
    visualStyle: 'clay',
    label: 'Clay',
    description: 'Plastilina y stop-motion, luz cálida de maqueta.',
  },
  {
    visualStyle: 'anime',
    label: 'Anime',
    description: 'Cel shading limpio, colores vivos.',
  },
  {
    visualStyle: 'photo',
    label: 'Realista',
    description: 'Fotografía cinematográfica, luz natural.',
  },
]

export const STORY_DEFAULT_VISUAL_STYLE: StoryVisualStyle = 'cartoon3d'

export const STORY_DEFAULT_PRESET: StoryPreset = 'fast'

export const STORY_MODE_LEGEND = 'Modo de la historia'

export const STORY_MODES: readonly StoryMode[] = ['faithful', 'creative']
export const STORY_DEFAULT_MODE: StoryMode = 'faithful'

export const STORY_MODE_LABELS: Readonly<Record<StoryMode, string>> = {
  faithful: 'Fiel a la premisa',
  creative: 'Modo creativo',
}

export const STORY_MODE_DESCRIPTIONS: Readonly<Record<StoryMode, string>> = {
  faithful: 'Solo aparecen los personajes, lugares y objetos de tu premisa.',
  creative: 'El narrador puede añadir personajes secundarios, lugares y giros que sirvan a tu premisa.',
}

export const STORY_MODE_HELP: Readonly<Record<StoryMode, string>> = {
  faithful: 'El guion se ciñe a lo que escribiste.',
  creative: 'Puede añadir hasta 2 personajes, 3 lugares y 4 objetos inventados. El protagonista, el tema y el conflicto salen de tu premisa.',
}

export const STORY_MODE_CREATIVE_NOTICE =
  'En modo creativo pueden aparecer personajes, lugares y objetos que no están en tu premisa.'

export const STORY_TONE_LABELS: Readonly<Record<StoryTone, string>> = {
  humor: 'Humor',
  aventura: 'Aventura',
  absurdo: 'Absurdo',
  heartwarming: 'Emotivo',
  dramatic: 'Dramático',
  neutral: 'Neutro',
}

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
  'technical-aspect': 'El clip no tiene un formato vertical compatible con 9:16.',
  'technical-resolution': 'La resolución del clip es demasiado baja.',
}

export const STORY_QC_SEVERITY_LABELS: Readonly<Record<StoryQCSeverity, string>> = {
  blocking: 'Problema',
  warning: 'Aviso',
}

export const STORY_CANON_LABELS = {
  summary: 'Canon de la historia',
  style: 'Estilo visual',
  tone: 'Tono',
  theme: 'Tema',
  characters: 'Personajes',
  locations: 'Localizaciones',
  props: 'Objetos',
  forbidden: 'No debe aparecer',
  inventedCharacter: 'Personaje inventado',
  inventedLocation: 'Localización inventada',
  inventedProp: 'Objeto inventado',
} as const

export const STORY_SCENE_LABELS = {
  location: 'Localización',
  time: 'Hora',
  weather: 'Clima',
  characters: 'Personajes',
  props: 'Objetos',
  camera: 'Cámara',
  continuity: 'Continuidad',
  noProps: 'Sin objetos',
  firstScene: 'Abre la historia',
  locationChange: 'Cambio de escena',
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
  visualStyleLegend: 'Estilo visual',
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
  resultStyle: 'Calidad',
  resultVisualStyle: 'Estilo visual',
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

// --- Spec 008: perfiles de producción y planos ---

export const STORY_PLATFORMS = ['tiktok', 'reels'] as const
export const STORY_DEFAULT_PLATFORM = 'tiktok'
export const STORY_PLATFORM_LABELS = {
  tiktok: 'TikTok',
  reels: 'Reels',
} as const

export const STORY_COST_MODES = ['budget', 'standard', 'production'] as const
export const STORY_DEFAULT_COST_MODE = 'standard'
export const STORY_COST_MODE_LABELS = {
  budget: 'Presupuesto',
  standard: 'Estándar',
  production: 'Producción',
} as const
export const STORY_COST_MODE_DESCRIPTIONS = {
  budget: 'El perfil más barato. Micro-relato completo con Rápido y un cap duro que depende de la duración.',
  standard: 'Reel de 15–60 s con cobertura equilibrada y un coste contenido.',
  production: 'Cobertura máxima para 90 s, con 26–30 planos. Es la opción más cara.',
} as const

export const STORY_DURATIONS = [15, 30, 45, 60, 90] as const
export const STORY_DEFAULT_DURATION = 30
export const STORY_DURATION_LABELS = {
  15: '15 s',
  30: '30 s',
  45: '45 s',
  60: '60 s',
  90: '90 s',
} as const

export interface StoryCostProfileOption {
  readonly costMode: 'budget' | 'standard' | 'production'
  readonly durationSeconds: 15 | 30 | 45 | 60 | 90
  readonly plannedMin: number
  readonly plannedMax: number
  readonly sceneMin: number
  readonly sceneMax: number
  readonly shotMin: number
  readonly shotMax: number
  readonly exactShotCount: number | null
  readonly shotDurationMin: 2 | 3 | 4 | 5 | 6
  readonly shotDurationMax: 2 | 3 | 4 | 5 | 6
  readonly preset: 'fast' | 'both'
  readonly rhythm: 'tiktok' | 'slow'
  readonly capUsd: number
  readonly maxVideoAttempts: 2
  readonly attemptsReset: boolean
  readonly qualityAllowed: boolean
  readonly timeMinMinutes: number
  readonly timeMaxMinutes: number
  readonly slowThresholdMs: number
}

export const STORY_COST_PROFILES: readonly StoryCostProfileOption[] = [
  { costMode: 'budget', durationSeconds: 15, plannedMin: 12, plannedMax: 15, sceneMin: 2, sceneMax: 3, shotMin: 4, shotMax: 5, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 5, preset: 'fast', rhythm: 'tiktok', capUsd: 2.5, maxVideoAttempts: 2, attemptsReset: false, qualityAllowed: false, timeMinMinutes: 3, timeMaxMinutes: 5, slowThresholdMs: 378_000 },
  { costMode: 'standard', durationSeconds: 15, plannedMin: 14, plannedMax: 15, sceneMin: 2, sceneMax: 3, shotMin: 4, shotMax: 6, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 6, preset: 'both', rhythm: 'tiktok', capUsd: 5, maxVideoAttempts: 2, attemptsReset: true, qualityAllowed: true, timeMinMinutes: 4, timeMaxMinutes: 6, slowThresholdMs: 450_000 },
  { costMode: 'standard', durationSeconds: 30, plannedMin: 29, plannedMax: 30, sceneMin: 3, sceneMax: 5, shotMin: 9, shotMax: 12, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 6, preset: 'both', rhythm: 'tiktok', capUsd: 7, maxVideoAttempts: 2, attemptsReset: true, qualityAllowed: true, timeMinMinutes: 5, timeMaxMinutes: 10, slowThresholdMs: 750_000 },
  { costMode: 'standard', durationSeconds: 45, plannedMin: 44, plannedMax: 45, sceneMin: 4, sceneMax: 6, shotMin: 14, shotMax: 16, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 6, preset: 'both', rhythm: 'tiktok', capUsd: 9, maxVideoAttempts: 2, attemptsReset: true, qualityAllowed: true, timeMinMinutes: 7, timeMaxMinutes: 12, slowThresholdMs: 900_000 },
  { costMode: 'standard', durationSeconds: 60, plannedMin: 59, plannedMax: 60, sceneMin: 5, sceneMax: 8, shotMin: 18, shotMax: 22, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 6, preset: 'both', rhythm: 'tiktok', capUsd: 11, maxVideoAttempts: 2, attemptsReset: true, qualityAllowed: true, timeMinMinutes: 10, timeMaxMinutes: 16, slowThresholdMs: 1_200_000 },
  { costMode: 'budget', durationSeconds: 90, plannedMin: 90, plannedMax: 90, sceneMin: 5, sceneMax: 8, shotMin: 15, shotMax: 15, exactShotCount: 15, shotDurationMin: 6, shotDurationMax: 6, preset: 'fast', rhythm: 'slow', capUsd: 7, maxVideoAttempts: 2, attemptsReset: false, qualityAllowed: false, timeMinMinutes: 12, timeMaxMinutes: 18, slowThresholdMs: 1_350_000 },
  { costMode: 'production', durationSeconds: 90, plannedMin: 89, plannedMax: 90, sceneMin: 7, sceneMax: 10, shotMin: 26, shotMax: 30, exactShotCount: null, shotDurationMin: 2, shotDurationMax: 6, preset: 'both', rhythm: 'tiktok', capUsd: 15, maxVideoAttempts: 2, attemptsReset: true, qualityAllowed: true, timeMinMinutes: 17, timeMaxMinutes: 25, slowThresholdMs: 1_878_000 },
] as const

export const STORY_SHOT_FRAMING_LABELS: Readonly<Record<string, string>> = {
  establishing: 'Establecimiento',
  wide: 'Plano general',
  medium: 'Plano medio',
  'close-up': 'Primer plano',
  'extreme-close-up': 'Primerísimo plano',
  detail: 'Detalle',
  reaction: 'Reacción',
  'over-the-shoulder': 'Sobre el hombro',
  'two-shot': 'Plano de dos',
  insert: 'Insert',
}

export const STORY_MAX_SHOT_PROMPT_LENGTH = 400

export const STORY_COST_MODE_COPY = {
  legend: 'Modo de producción',
  help: 'El modo y la duración fijan el coste y el número de planos.',
  budgetWarning: 'El modo Presupuesto tiene un límite de {cap} USD. Si se agota antes de terminar, la historia se detiene.',
  advanced: 'Avanzado',
  warning90: '90 s es una opción avanzada. Puede tardar 17–25 minutos y consume más créditos.',
  styleHelp: 'El estilo visual depende de tu referencia y del prompt, no del modo de coste.',
  budgetPreset: 'El modo Presupuesto usa Rápido.',
  budgetReference: 'Con imagen de referencia se generan 4 planos; sin ella, hasta 5.',
  durationHelp: 'Solo se muestran las duraciones válidas para el modo.',
  platformHelp: 'Formato vertical 9:16. TikTok y Reels comparten formato y duración en esta versión.',
  intro: 'Escribe una premisa. La IA reparte la historia en escenas y planos, con un gancho en el primer segundo y cambios de plano para mantener la atención. Tú decides cuándo generar los vídeos.',
  reviewTitle: 'Revisa los planos',
  plannedDuration: 'Duración planificada',
  shotRegenerate: 'Regenerar plano',
  shotRegenerating: 'Regenerando plano…',
  shotReady: 'Plano listo.',
  sceneRegenerate: 'Regenerar escena',
  sceneRegenerating: 'Regenerando la escena…',
  varietyWarning: 'Dos planos seguidos se parecen mucho. Puedes regenerar el segundo.',
  legacyShot: 'Plano heredado',
  similar: 'similar-shots',
  budgetExhausted: 'Esta historia ha alcanzado su límite de coste. Empieza una nueva o elige una duración menor.',
} as const

/**
 * 012: a secondary character with no image of its own is invented again in
 * every shot, so the progress screen names each one while it is generated.
 */
export const STORY_CHARACTER_REF_COPY = {
  title: 'Personajes',
  pending: 'Preparando a {name}…',
  ready: 'Imagen lista',
  failed: 'Referencia no disponible',
  failedNote: 'La historia continúa, pero {name} puede cambiar entre planos.',
  count: '{n} personajes con imagen propia',
  focus: 'En foco: {name}',
} as const
