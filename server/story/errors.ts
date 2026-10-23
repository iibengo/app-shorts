import { setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import type {
  StoryApiError,
  StoryErrorCode,
  StoryJobError,
} from '~/models/story'
import { isComposerError } from '../shared/errors'
import type { ComposerError } from '../shared/errors'

export interface StoryErrorDefinition {
  readonly status: number
  readonly message: string
  readonly retryable: boolean
}

const DEFINITIONS: Readonly<Record<StoryErrorCode, StoryErrorDefinition>> = {
  'invalid-request': {
    status: 400,
    message: 'La solicitud no es válida.',
    retryable: false,
  },
  'premise-required': {
    status: 400,
    message: 'Escribe una premisa para crear tu historia.',
    retryable: false,
  },
  'premise-too-long': {
    status: 400,
    message: 'La premisa no puede superar los 600 caracteres.',
    retryable: false,
  },
  'invalid-premise': {
    status: 400,
    message: 'La premisa contiene caracteres no admitidos.',
    retryable: false,
  },
  'invalid-scene-count': {
    status: 400,
    message: 'El número de escenas no es válido. Elige entre 4 y 6.',
    retryable: false,
  },
  'invalid-preset': {
    status: 400,
    message: 'El estilo de generación no es válido.',
    retryable: false,
  },
  'invalid-mode': {
    status: 400,
    message: 'El modo de la historia no es válido.',
    retryable: false,
  },
  'invalid-platform': {
    status: 400,
    message: 'La plataforma no es válida.',
    retryable: false,
  },
  'invalid-duration': {
    status: 400,
    message: 'La duración no es válida. Elige 15, 30, 45, 60 o 90 segundos.',
    retryable: false,
  },
  'invalid-cost-mode': {
    status: 400,
    message: 'El modo de producción no es válido para esta duración o preset.',
    retryable: false,
  },
  'invalid-visual-style': {
    status: 400,
    message: 'El estilo visual no es válido.',
    retryable: false,
  },
  'invalid-shot-duration': {
    status: 400,
    message: 'La duración del plano no es válida o supera la duración máxima de la historia.',
    retryable: false,
  },
  'shot-not-found': {
    status: 404,
    message: 'El plano no existe en esta historia.',
    retryable: false,
  },
  'invalid-reference': {
    status: 400,
    message: 'La imagen de referencia no es válida.',
    retryable: false,
  },
  'reference-empty': {
    status: 400,
    message: 'El archivo está vacío.',
    retryable: false,
  },
  'reference-too-large': {
    status: 400,
    message: 'La imagen supera el máximo de 8 MB.',
    retryable: false,
  },
  'unsupported-reference-type': {
    status: 400,
    message: 'Formato no admitido. Usa PNG, JPG o WebP.',
    retryable: false,
  },
  'invalid-file-name': {
    status: 400,
    message: 'El nombre del archivo no es válido.',
    retryable: false,
  },
  'invalid-visual-prompt': {
    status: 400,
    message: 'El prompt visual no es válido.',
    retryable: false,
  },
  'invalid-narration': {
    status: 400,
    message: 'La narración no es válida.',
    retryable: false,
  },
  'unsupported-media-type': {
    status: 415,
    message: 'El formato de la solicitud no es válido.',
    retryable: false,
  },
  'payload-too-large': {
    status: 413,
    message: 'La solicitud es demasiado grande.',
    retryable: false,
  },
  'cross-origin-request': {
    status: 403,
    message: 'La solicitud no está permitida.',
    retryable: false,
  },
  'story-not-found': {
    status: 404,
    message: 'Esta historia no está disponible en este navegador.',
    retryable: false,
  },
  'story-expired': {
    status: 410,
    message: 'Esta historia ya no está disponible. Empieza de nuevo.',
    retryable: false,
  },
  'beat-not-found': {
    status: 404,
    message: 'La escena no existe en esta historia.',
    retryable: false,
  },
  'story-not-ready': {
    status: 409,
    message: 'La historia aún no está lista para esta acción.',
    retryable: false,
  },
  'scene-not-ready': {
    status: 409,
    message: 'La escena no está en el estado necesario para esta acción.',
    retryable: false,
  },
  'keyframe-limit-reached': {
    status: 409,
    message: 'Esta escena ya no puede regenerar la imagen.',
    retryable: false,
  },
  'video-retry-limit-reached': {
    status: 409,
    message: 'Esta escena ya no puede reintentar el vídeo.',
    retryable: false,
  },
  'story-not-cancellable': {
    status: 409,
    message: 'Esta historia ya ha terminado y no se puede cancelar.',
    retryable: false,
  },
  'story-in-progress': {
    status: 409,
    message: 'Ya tienes una historia en curso. Termínala o cancélala primero.',
    retryable: false,
  },
  'idempotency-conflict': {
    status: 409,
    message: 'La solicitud entra en conflicto con otra anterior.',
    retryable: false,
  },
  'rate-limited': {
    status: 429,
    message: 'Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.',
    retryable: true,
  },
  'server-busy': {
    status: 429,
    message: 'El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.',
    retryable: true,
  },
  'story-budget-exhausted': {
    status: 429,
    message: 'Esta historia ha alcanzado su límite de 8 dólares. Empieza una nueva.',
    retryable: false,
  },
  'daily-budget-exhausted': {
    status: 429,
    message: 'El estudio ha alcanzado su límite diario. Inténtalo mañana.',
    retryable: false,
  },
  'assembly-busy': {
    status: 429,
    message: 'El montaje está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.',
    retryable: true,
  },
  'director-not-configured': {
    status: 503,
    message: 'La creación de historias no está disponible ahora mismo.',
    retryable: false,
  },
  'director-timeout': {
    status: 504,
    message: 'La IA tardó demasiado en escribir el guion. Inténtalo de nuevo.',
    retryable: true,
  },
  'director-invalid-output': {
    status: 502,
    message: 'La IA no devolvió un guion válido. Inténtalo de nuevo.',
    retryable: true,
  },
  'director-unavailable': {
    status: 503,
    message: 'El servicio de guion no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: false,
  },
  'reference-expired': {
    status: 502,
    message: 'La imagen de referencia ha caducado. Empieza de nuevo.',
    retryable: false,
  },
  'content-blocked': {
    status: 422,
    message: 'El contenido no cumple las políticas del proveedor. Cambia la premisa o la imagen.',
    retryable: false,
  },
  'provider-rejected': {
    status: 422,
    message: 'No se pudo generar una escena con estos datos. Cambia la premisa o la imagen.',
    retryable: false,
  },
  'provider-busy': {
    status: 503,
    message: 'El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: true,
  },
  'provider-error': {
    status: 502,
    message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: true,
  },
  'provider-invalid-output': {
    status: 502,
    message: 'El proveedor devolvió un resultado no válido. Inténtalo de nuevo.',
    retryable: true,
  },
  'provider-timeout': {
    status: 504,
    message: 'La generación está tardando más de lo esperado. Inténtalo de nuevo.',
    retryable: true,
  },
  'keyframe-failed': {
    status: 502,
    message: 'No se pudieron crear todas las imágenes de la historia.',
    retryable: false,
  },
  'video-failed': {
    status: 502,
    message: 'No se pudieron generar todos los vídeos de la historia.',
    retryable: false,
  },
  'assembly-failed': {
    status: 502,
    message: 'No se pudo montar el vídeo final. Puedes reintentar el montaje.',
    retryable: true,
  },
  'ffmpeg-not-configured': {
    status: 503,
    message: 'El montaje de vídeo no está disponible ahora mismo.',
    retryable: false,
  },
  'assembly-timeout': {
    status: 504,
    message: 'El montaje tardó demasiado. Puedes reintentarlo.',
    retryable: true,
  },
  'database-unavailable': {
    status: 503,
    message: 'No se pudo acceder a la historia. Inténtalo de nuevo.',
    retryable: true,
  },
  'story-not-configured': {
    status: 503,
    message: 'La creación de historias no está disponible ahora mismo.',
    retryable: false,
  },
  'cancel-failed': {
    status: 502,
    message: 'No se pudo cancelar la historia. Inténtalo de nuevo.',
    retryable: true,
  },
  'internal-error': {
    status: 500,
    message: 'Algo salió mal. Inténtalo de nuevo.',
    retryable: false,
  },
}

export function getStoryErrorDefinition(code: StoryErrorCode): StoryErrorDefinition {
  return DEFINITIONS[code]
}

const STORY_ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(DEFINITIONS))

export function isStoryErrorCode(value: string): value is StoryErrorCode {
  return STORY_ERROR_CODES.has(value)
}

export function storyErrorMessage(code: StoryErrorCode): string {
  return DEFINITIONS[code].message
}

export class StoryError extends Error {
  readonly code: StoryErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly retryAfterSeconds: number | undefined
  readonly providerStatus: number | undefined

  constructor(
    code: StoryErrorCode,
    options: {
      readonly retryAfterSeconds?: number
      readonly providerStatus?: number
    } = {},
  ) {
    const definition = getStoryErrorDefinition(code)

    super(definition.message)
    this.name = 'StoryError'
    this.code = code
    this.status = definition.status
    this.retryable = definition.retryable
    this.retryAfterSeconds = options.retryAfterSeconds
    this.providerStatus = options.providerStatus
  }
}

export function isStoryError(error: unknown): error is StoryError {
  return error instanceof StoryError
}

function isDatabaseError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as {
    readonly name?: unknown
    readonly code?: unknown
  }

  if (typeof candidate.name === 'string' && candidate.name.includes('Prisma')) {
    return true
  }

  if (candidate.name === 'DatabaseConfigurationError') {
    return true
  }

  return typeof candidate.code === 'string' && /^P\d{4}$/.test(candidate.code)
}

export function toStoryJobError(error: StoryError): StoryJobError {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  }
}

export function toStoryApiError(error: unknown): StoryApiError {
  if (isStoryError(error)) {
    const jobError = toStoryJobError(error)

    if (error.retryAfterSeconds !== undefined) {
      return {
        error: {
          ...jobError,
          retryAfterSeconds: Math.max(1, Math.ceil(error.retryAfterSeconds)),
        },
      }
    }

    return { error: jobError }
  }

  return { error: toStoryJobError(new StoryError('internal-error')) }
}

export function sendStoryError(event: H3Event, error: unknown): StoryApiError {
  // Normalize at the boundary so ComposerError (shared Fal transport) and
  // database failures map to stable Story codes instead of a generic 500.
  const storyError = toStoryError(error)
  const body = toStoryApiError(storyError)

  setResponseStatus(event, storyError.status)

  if (body.error.retryAfterSeconds !== undefined) {
    setResponseHeader(event, 'Retry-After', body.error.retryAfterSeconds)
  }

  return body
}

const COMPOSER_CODE_MAP: Readonly<Record<string, StoryErrorCode>> = {
  'content-blocked': 'content-blocked',
  'provider-rejected': 'provider-rejected',
  'provider-busy': 'provider-busy',
  'provider-error': 'provider-error',
  'provider-invalid-output': 'provider-invalid-output',
  'provider-timeout': 'provider-timeout',
  'ai-unavailable': 'provider-error',
  'ai-credits-exhausted': 'provider-error',
  'ai-not-configured': 'story-not-configured',
  'job-not-cancellable': 'scene-not-ready',
  'cancel-failed': 'cancel-failed',
  'internal-error': 'internal-error',
}

/**
 * Translates a Fal transport error at the Story boundary without leaking
 * provider messages. `retryAfterSeconds` is preserved.
 */
export function translateComposerError(error: ComposerError): StoryError {
  const code = COMPOSER_CODE_MAP[error.code] ?? 'provider-error'

  return new StoryError(code, {
    retryAfterSeconds: error.retryAfterSeconds,
    providerStatus: error.providerStatus,
  })
}

/**
 * Normalizes a thrown value into a StoryError, translating `ComposerError`
 * from the shared Fal layer at the boundary.
 */
export function toStoryError(error: unknown): StoryError {
  if (isStoryError(error)) {
    return error
  }

  if (isComposerError(error)) {
    return translateComposerError(error)
  }

  if (isDatabaseError(error)) {
    return new StoryError('database-unavailable')
  }

  return new StoryError('internal-error')
}
