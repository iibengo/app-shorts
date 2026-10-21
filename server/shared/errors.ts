import { setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import type { ComposerApiError, ComposerErrorCode, ComposerJobError } from '~/models/composer'

export interface ComposerErrorDefinition {
  readonly status: number
  readonly message: string
  readonly retryable: boolean
}

const DEFINITIONS: Readonly<Record<ComposerErrorCode, ComposerErrorDefinition>> = {
  'invalid-request': {
    status: 400,
    message: 'La solicitud no es válida.',
    retryable: false,
  },
  'invalid-prompt': {
    status: 400,
    message: 'La idea contiene caracteres no admitidos.',
    retryable: false,
  },
  'prompt-required': {
    status: 400,
    message: 'Escribe una idea para generar tu short.',
    retryable: false,
  },
  'prompt-too-long': {
    status: 400,
    message: 'La idea no puede superar los 280 caracteres.',
    retryable: false,
  },
  'invalid-preset': {
    status: 400,
    message: 'El estilo de generación no es válido.',
    retryable: false,
  },
  'invalid-duration': {
    status: 400,
    message: 'La duración no es válida para el estilo elegido.',
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
  'rate-limited': {
    status: 429,
    message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
    retryable: true,
  },
  'server-busy': {
    status: 429,
    message: 'El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.',
    retryable: true,
  },
  'budget-exhausted': {
    status: 429,
    message: 'El estudio ha alcanzado su límite diario de generaciones. Inténtalo mañana.',
    retryable: false,
  },
  'generation-in-progress': {
    status: 409,
    message: 'Ya tienes una generación en curso. Espera a que termine o cancélala.',
    retryable: false,
  },
  'idempotency-conflict': {
    status: 409,
    message: 'La solicitud entra en conflicto con otra anterior.',
    retryable: false,
  },
  'ai-not-configured': {
    status: 503,
    message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: false,
  },
  'ai-unavailable': {
    status: 503,
    message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: false,
  },
  'ai-credits-exhausted': {
    status: 503,
    message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    retryable: false,
  },
  'content-blocked': {
    status: 422,
    message: 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
    retryable: false,
  },
  'provider-rejected': {
    status: 422,
    message: 'No se pudo generar el vídeo con estos datos. Cambia la idea o la imagen.',
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
  'keyframe-timeout': {
    status: 504,
    message: 'La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.',
    retryable: true,
  },
  'provider-timeout': {
    status: 504,
    message: 'La generación está tardando más de lo esperado. Inténtalo de nuevo.',
    retryable: true,
  },
  'job-not-found': {
    status: 404,
    message: 'Esta generación ya no está disponible. Empieza de nuevo.',
    retryable: false,
  },
  'job-expired': {
    status: 410,
    message: 'Esta generación ya no está disponible. Empieza de nuevo.',
    retryable: false,
  },
  'job-not-cancellable': {
    status: 409,
    message: 'Esta generación ya ha terminado y no se puede cancelar.',
    retryable: false,
  },
  'cancel-failed': {
    status: 502,
    message: 'No se pudo cancelar la generación. Inténtalo de nuevo.',
    retryable: true,
  },
  'internal-error': {
    status: 500,
    message: 'Algo salió mal. Inténtalo de nuevo.',
    retryable: false,
  },
}

export function getComposerErrorDefinition(
  code: ComposerErrorCode,
): ComposerErrorDefinition {
  return DEFINITIONS[code]
}

export class ComposerError extends Error {
  readonly code: ComposerErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly retryAfterSeconds: number | undefined
  readonly providerStatus: number | undefined

  constructor(
    code: ComposerErrorCode,
    options: {
      readonly retryAfterSeconds?: number
      readonly providerStatus?: number
    } = {},
  ) {
    const definition = getComposerErrorDefinition(code)

    super(definition.message)
    this.name = 'ComposerError'
    this.code = code
    this.status = definition.status
    this.retryable = definition.retryable
    this.retryAfterSeconds = options.retryAfterSeconds
    this.providerStatus = options.providerStatus
  }
}

export function isComposerError(error: unknown): error is ComposerError {
  return error instanceof ComposerError
}

export function toComposerJobError(error: ComposerError): ComposerJobError {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  }
}

export function toComposerApiError(error: unknown): ComposerApiError {
  if (isComposerError(error)) {
    const jobError = toComposerJobError(error)

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

  return {
    error: toComposerJobError(new ComposerError('internal-error')),
  }
}

export function sendComposerError(event: H3Event, error: unknown): ComposerApiError {
  const composerError = isComposerError(error)
    ? error
    : new ComposerError('internal-error')
  const body = toComposerApiError(composerError)

  setResponseStatus(event, composerError.status)

  if (body.error.retryAfterSeconds !== undefined) {
    setResponseHeader(event, 'Retry-After', body.error.retryAfterSeconds)
  }

  return body
}
