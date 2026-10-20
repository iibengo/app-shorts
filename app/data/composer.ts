import type {
  ComposerGenerationStage,
  ComposerImageMimeType,
  ComposerPoster,
  ComposerReferenceMimeType,
  ComposerVideoMimeType,
} from '~/models/composer'

export const COMPOSER_MAX_REFERENCES = 3
export const COMPOSER_MAX_PROMPT_LENGTH = 280

export const COMPOSER_MAX_IMAGE_BYTES = 8_388_608
export const COMPOSER_MAX_VIDEO_BYTES = 52_428_800

export const COMPOSER_IMAGE_MIME_TYPES: readonly ComposerImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
]

export const COMPOSER_VIDEO_MIME_TYPES: readonly ComposerVideoMimeType[] = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
]

export const COMPOSER_REFERENCE_MIME_TYPES: readonly ComposerReferenceMimeType[] = [
  ...COMPOSER_IMAGE_MIME_TYPES,
  ...COMPOSER_VIDEO_MIME_TYPES,
]

export const COMPOSER_FILE_ACCEPT = COMPOSER_REFERENCE_MIME_TYPES.join(',')

export const COMPOSER_POSTERS: readonly ComposerPoster[] = [
  {
    src: '/mock/composer/composer-01.svg',
    alt: 'Póster simulado abstracto violeta con ondas de luz.',
    width: 1080,
    height: 1920,
  },
  {
    src: '/mock/composer/composer-02.svg',
    alt: 'Póster simulado abstracto fucsia con formas geométricas.',
    width: 1080,
    height: 1920,
  },
  {
    src: '/mock/composer/composer-03.svg',
    alt: 'Póster simulado abstracto índigo con un marco luminoso.',
    width: 1080,
    height: 1920,
  },
  {
    src: '/mock/composer/composer-04.svg',
    alt: 'Póster simulado abstracto ámbar con un haz diagonal.',
    width: 1080,
    height: 1920,
  },
]

export const COMPOSER_TITLES: readonly string[] = [
  'Una idea que se mueve en vertical',
  'De la idea a la pantalla',
  'Ritmo, luz y un solo mensaje',
  'Tu historia en nueve por dieciséis',
]

export const COMPOSER_STAGE_TIMELINE: readonly {
  readonly delayMs: number
  readonly stage: ComposerGenerationStage
  readonly progress: number
}[] = [
  { delayMs: 0, stage: 'analyzing', progress: 15 },
  { delayMs: 800, stage: 'composing', progress: 50 },
  { delayMs: 1600, stage: 'rendering', progress: 80 },
]

export const COMPOSER_READY_DELAY_MS = 2400

export const COMPOSER_GENERATION_ERROR_MESSAGE =
  'No se pudo preparar la vista previa simulada. Inténtalo de nuevo.'

export const COMPOSER_MIN_DURATION_SECONDS = 12
export const COMPOSER_MAX_DURATION_SECONDS = 30
