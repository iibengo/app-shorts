import type {
  ComposerImageMimeType,
  ComposerModelCapabilities,
  ComposerPreset,
  ComposerPresetDefinition,
  ComposerVideoDuration,
} from '~/models/composer'

export const COMPOSER_MAX_PROMPT_LENGTH = 280

export const COMPOSER_MAX_IMAGE_BYTES = 8_388_608

export const COMPOSER_MAX_REFERENCES = 1

export const COMPOSER_IMAGE_MIME_TYPES: readonly ComposerImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

export const COMPOSER_FILE_ACCEPT = COMPOSER_IMAGE_MIME_TYPES.join(',')

export const COMPOSER_PRESETS: readonly ComposerPresetDefinition[] = [
  {
    preset: 'fast',
    modelId: 'minimax-hailuo-02',
    label: 'Rápido',
    description: 'Menos espera, ideal para probar.',
    durations: [6, 10],
    defaultDurationSeconds: 6,
  },
  {
    preset: 'quality',
    modelId: 'kling-2.5-turbo-pro',
    label: 'Calidad',
    description: 'Más detalle y movimiento, tarda más.',
    durations: [5, 10],
    defaultDurationSeconds: 5,
  },
]

export const COMPOSER_MODELS: readonly ComposerModelCapabilities[] = [
  {
    id: 'minimax-hailuo-02',
    preset: 'fast',
    label: 'MiniMax Hailuo 02',
    durations: [6, 10],
    defaultDurationSeconds: 6,
    supportsImageReference: true,
    maxReferenceCount: 1,
    estimatedLatencySeconds: { min: 60, max: 180 },
    estimatedCostUsd: null,
  },
  {
    id: 'kling-2.5-turbo-pro',
    preset: 'quality',
    label: 'Kling 2.5 Turbo Pro',
    durations: [5, 10],
    defaultDurationSeconds: 5,
    supportsImageReference: true,
    maxReferenceCount: 1,
    estimatedLatencySeconds: { min: 90, max: 300 },
    estimatedCostUsd: null,
  },
]

export const COMPOSER_DEFAULT_PRESET: ComposerPreset = 'fast'

export const COMPOSER_DEFAULT_DURATION_SECONDS: ComposerVideoDuration = 6

export const COMPOSER_DURATIONS: readonly ComposerVideoDuration[] = [5, 6, 10]

export const COMPOSER_GENERATION_ERROR_MESSAGE =
  'No se pudo iniciar la generación. Inténtalo de nuevo.'

export const COMPOSER_UPLOAD_ERROR_MESSAGE =
  'No se pudo subir la imagen. Inténtalo de nuevo.'

export const COMPOSER_UPLOAD_EXPIRED_MESSAGE =
  'La subida ha caducado. Vuelve a seleccionar la imagen.'
