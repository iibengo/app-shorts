// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ComposerError,
  getComposerErrorDefinition,
  isComposerError,
  sendComposerError,
  toComposerApiError,
  toComposerJobError,
} from '../../../server/composer/errors'
import { createTestEvent, responseHeader } from '../../helpers/h3'

describe('ComposerError definitions', () => {
  it.each([
    ['prompt-required', 400, false, 'Escribe una idea para generar tu short.'],
    ['prompt-too-long', 400, false, 'La idea no puede superar los 280 caracteres.'],
    ['invalid-duration', 400, false, 'La duración no es válida para el estilo elegido.'],
    ['cross-origin-request', 403, false, 'La solicitud no está permitida.'],
    ['job-not-found', 404, false, 'Esta generación ya no está disponible. Empieza de nuevo.'],
    ['generation-in-progress', 409, false, 'Ya tienes una generación en curso. Espera a que termine o cancélala.'],
    ['job-expired', 410, false, 'Esta generación ya no está disponible. Empieza de nuevo.'],
    ['payload-too-large', 413, false, 'La solicitud es demasiado grande.'],
    ['unsupported-media-type', 415, false, 'El formato de la solicitud no es válido.'],
    ['content-blocked', 422, false, 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.'],
    ['rate-limited', 429, true, 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.'],
    ['server-busy', 429, true, 'El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.'],
    ['budget-exhausted', 429, false, 'El estudio ha alcanzado su límite diario de generaciones. Inténtalo mañana.'],
    ['provider-error', 502, true, 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'],
    ['provider-invalid-output', 502, true, 'El proveedor devolvió un resultado no válido. Inténtalo de nuevo.'],
    ['cancel-failed', 502, true, 'No se pudo cancelar la generación. Inténtalo de nuevo.'],
    ['ai-not-configured', 503, false, 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.'],
    ['provider-busy', 503, true, 'El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.'],
    ['keyframe-timeout', 504, true, 'La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.'],
    ['provider-timeout', 504, true, 'La generación está tardando más de lo esperado. Inténtalo de nuevo.'],
    ['internal-error', 500, false, 'Algo salió mal. Inténtalo de nuevo.'],
  ] as const)('maps %s to HTTP %i', (code, status, retryable, message) => {
    const definition = getComposerErrorDefinition(code)
    const error = new ComposerError(code)

    expect(definition.status).toBe(status)
    expect(definition.retryable).toBe(retryable)
    expect(definition.message).toBe(message)
    expect(error.status).toBe(status)
    expect(error.retryable).toBe(retryable)
    expect(error.message).toBe(message)
    expect(isComposerError(error)).toBe(true)
  })

  it('keeps provider status and retry-after metadata internal', () => {
    const error = new ComposerError('provider-busy', {
      providerStatus: 429,
      retryAfterSeconds: 12,
    })

    expect(error.providerStatus).toBe(429)
    expect(error.retryAfterSeconds).toBe(12)
    expect(toComposerJobError(error)).toEqual({
      code: 'provider-busy',
      message: 'El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    })
  })

  it('serialises retry-after seconds rounded up and never leaks internals', () => {
    const error = new ComposerError('rate-limited', { retryAfterSeconds: 12.2 })

    const apiError = toComposerApiError(error)

    expect(apiError).toEqual({
      error: {
        code: 'rate-limited',
        message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
        retryable: true,
        retryAfterSeconds: 13,
      },
    })
    expect(JSON.stringify(apiError)).not.toContain('Key ')
    expect(JSON.stringify(apiError)).not.toContain('fal.run')
  })

  it('maps unknown failures to internal-error without exposing the cause', () => {
    const clientError = toComposerApiError(new Error('raw provider stack trace'))

    expect(clientError.error).toEqual({
      code: 'internal-error',
      message: 'Algo salió mal. Inténtalo de nuevo.',
      retryable: false,
    })
    expect(JSON.stringify(clientError)).not.toContain('stack trace')
  })
})

describe('sendComposerError', () => {
  it('sets the HTTP status and Retry-After for rate limits', () => {
    const event = createTestEvent()

    const body = sendComposerError(
      event,
      new ComposerError('rate-limited', { retryAfterSeconds: 4.2 }),
    )

    expect(event.node.res.statusCode).toBe(429)
    expect(responseHeader(event, 'retry-after')).toBe(5)
    expect(body.error.code).toBe('rate-limited')
  })

  it('sets the status for validation errors without Retry-After', () => {
    const event = createTestEvent()

    sendComposerError(event, new ComposerError('invalid-duration'))

    expect(event.node.res.statusCode).toBe(400)
    expect(responseHeader(event, 'retry-after')).toBeUndefined()
  })
})
