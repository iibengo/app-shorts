// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryErrorCode } from '~/models/story'
import { ComposerError } from '../../../server/shared/errors'
import {
  StoryError,
  getStoryErrorDefinition,
  isStoryError,
  isStoryErrorCode,
  sendStoryError,
  storyErrorMessage,
  toStoryApiError,
  toStoryError,
  toStoryJobError,
  translateComposerError,
} from '../../../server/story/errors'
import { createTestEvent, responseHeader } from '../../helpers/h3'

const ALL_CODES: readonly StoryErrorCode[] = [
  'invalid-request',
  'premise-required',
  'premise-too-long',
  'invalid-premise',
  'invalid-scene-count',
  'invalid-preset',
  'invalid-reference',
  'reference-empty',
  'reference-too-large',
  'unsupported-reference-type',
  'invalid-file-name',
  'invalid-visual-prompt',
  'invalid-narration',
  'unsupported-media-type',
  'payload-too-large',
  'cross-origin-request',
  'story-not-found',
  'story-expired',
  'beat-not-found',
  'story-not-ready',
  'scene-not-ready',
  'keyframe-limit-reached',
  'video-retry-limit-reached',
  'story-not-cancellable',
  'story-in-progress',
  'idempotency-conflict',
  'rate-limited',
  'server-busy',
  'story-budget-exhausted',
  'daily-budget-exhausted',
  'assembly-busy',
  'director-not-configured',
  'director-timeout',
  'director-invalid-output',
  'director-unavailable',
  'reference-expired',
  'content-blocked',
  'provider-rejected',
  'provider-busy',
  'provider-error',
  'provider-invalid-output',
  'provider-timeout',
  'keyframe-failed',
  'video-failed',
  'assembly-failed',
  'ffmpeg-not-configured',
  'assembly-timeout',
  'database-unavailable',
  'story-not-configured',
  'cancel-failed',
  'internal-error',
]

describe('StoryError definitions', () => {
  it('covers every code with a stable definition', () => {
    for (const code of ALL_CODES) {
      const definition = getStoryErrorDefinition(code)

      expect(definition.status, code).toBeGreaterThanOrEqual(400)
      expect(definition.status, code).toBeLessThan(600)
      expect(definition.message.length, code).toBeGreaterThan(0)
      expect(typeof definition.retryable, code).toBe('boolean')
      expect(definition.message, code).not.toMatch(/https?:\/\/|Authorization|NUXT_|Key /)
    }
  })

  it('recognizes exactly the known codes', () => {
    for (const code of ALL_CODES) {
      expect(isStoryErrorCode(code), code).toBe(true)
    }

    expect(isStoryErrorCode('unknown-code')).toBe(false)
    expect(isStoryErrorCode('READY')).toBe(false)
  })

  it('keeps the normative HTTP status and Spanish message for critical codes', () => {
    expect(getStoryErrorDefinition('premise-required')).toEqual({
      status: 400,
      message: 'Escribe una premisa para crear tu historia.',
      retryable: false,
    })
    expect(getStoryErrorDefinition('story-not-found')).toEqual({
      status: 404,
      message: 'Esta historia no está disponible en este navegador.',
      retryable: false,
    })
    expect(getStoryErrorDefinition('story-expired')).toEqual({
      status: 410,
      message: 'Esta historia ya no está disponible. Empieza de nuevo.',
      retryable: false,
    })
    expect(getStoryErrorDefinition('rate-limited')).toEqual({
      status: 429,
      message: 'Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.',
      retryable: true,
    })
    expect(getStoryErrorDefinition('story-budget-exhausted')).toEqual({
      status: 429,
      message: 'Esta historia ha alcanzado su límite de 8 dólares. Empieza una nueva.',
      retryable: false,
    })
    expect(getStoryErrorDefinition('director-timeout').status).toBe(504)
    expect(getStoryErrorDefinition('director-invalid-output').status).toBe(502)
    expect(getStoryErrorDefinition('director-unavailable').status).toBe(503)
    expect(getStoryErrorDefinition('ffmpeg-not-configured').status).toBe(503)
    expect(getStoryErrorDefinition('database-unavailable'), 'db').toMatchObject({
      status: 503,
      retryable: true,
    })
    expect(getStoryErrorDefinition('assembly-failed').status).toBe(502)
    expect(getStoryErrorDefinition('internal-error').status).toBe(500)
    expect(storyErrorMessage('invalid-request')).toBe('La solicitud no es válida.')
  })

  it('builds a StoryError from its definition', () => {
    const error = new StoryError('rate-limited', { retryAfterSeconds: 12 })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('StoryError')
    expect(error.code).toBe('rate-limited')
    expect(error.status).toBe(429)
    expect(error.retryable).toBe(true)
    expect(error.retryAfterSeconds).toBe(12)
    expect(error.message).toBe('Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.')
    expect(isStoryError(error)).toBe(true)
    expect(isStoryError(new Error('x'))).toBe(false)
  })
})

describe('StoryError serialization', () => {
  it('serializes a job error without retryAfter', () => {
    const error = new StoryError('story-expired')
    const jobError = toStoryJobError(error)

    expect(jobError).toEqual({
      code: 'story-expired',
      message: 'Esta historia ya no está disponible. Empieza de nuevo.',
      retryable: false,
    })
    expect(toStoryApiError(error)).toEqual({ error: jobError })
  })

  it('includes a rounded retryAfterSeconds when present', () => {
    expect(toStoryApiError(new StoryError('server-busy', { retryAfterSeconds: 2.2 }))).toEqual({
      error: {
        code: 'server-busy',
        message: 'El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.',
        retryable: true,
        retryAfterSeconds: 3,
      },
    })
  })

  it('never leaks provider details from an unknown error', () => {
    const body = toStoryApiError(new Error('SQLSTATE connection refused password=hunter2'))

    expect(body).toEqual({
      error: {
        code: 'internal-error',
        message: 'Algo salió mal. Inténtalo de nuevo.',
        retryable: false,
      },
    })
    expect(JSON.stringify(body)).not.toContain('SQLSTATE')
    expect(JSON.stringify(body)).not.toContain('hunter2')
  })

  it('writes the status and Retry-After header', () => {
    const event = createTestEvent({ method: 'GET', path: '/api/story/1' })
    const body = sendStoryError(event, new StoryError('rate-limited', { retryAfterSeconds: 7 }))

    expect(event.node.res.statusCode).toBe(429)
    expect(responseHeader(event, 'retry-after')).toBe(7)
    expect(body.error.retryAfterSeconds).toBe(7)
  })

  it('maps an unknown error to a 500 response', () => {
    const event = createTestEvent({ method: 'GET', path: '/api/story/1' })
    const body = sendStoryError(event, new Error('boom'))

    expect(event.node.res.statusCode).toBe(500)
    expect(body.error.code).toBe('internal-error')
  })

  it('maps a Prisma failure to 503 database-unavailable', () => {
    const event = createTestEvent({ method: 'GET', path: '/api/story/1' })
    const error = Object.assign(new Error('connection refused'), {
      name: 'PrismaClientInitializationError',
      code: 'P2021',
    })
    const body = sendStoryError(event, error)

    expect(event.node.res.statusCode).toBe(503)
    expect(body.error.code).toBe('database-unavailable')
    expect(JSON.stringify(body)).not.toContain('connection refused')
  })
})

describe('ComposerError translation', () => {
  const table: readonly [ComposerError['code'], StoryErrorCode][] = [
    ['content-blocked', 'content-blocked'],
    ['provider-rejected', 'provider-rejected'],
    ['provider-busy', 'provider-busy'],
    ['provider-error', 'provider-error'],
    ['provider-invalid-output', 'provider-invalid-output'],
    ['provider-timeout', 'provider-timeout'],
    ['ai-unavailable', 'provider-error'],
    ['ai-credits-exhausted', 'provider-error'],
    ['ai-not-configured', 'story-not-configured'],
    ['job-not-cancellable', 'scene-not-ready'],
    ['cancel-failed', 'cancel-failed'],
    ['internal-error', 'internal-error'],
  ]

  it.each(table)('translates %s to %s', (composerCode, storyCode) => {
    const translated = translateComposerError(new ComposerError(composerCode))

    expect(translated.code).toBe(storyCode)
    expect(translated.message).toBe(getStoryErrorDefinition(storyCode).message)
    expect(translated.providerStatus).toBeUndefined()
  })

  it('preserves retryAfterSeconds and providerStatus', () => {
    const translated = translateComposerError(new ComposerError('provider-busy', {
      retryAfterSeconds: 9,
      providerStatus: 429,
    }))

    expect(translated.retryAfterSeconds).toBe(9)
    expect(translated.providerStatus).toBe(429)
    expect(translated.status).toBe(503)
  })

  it('toStoryError normalizes StoryError, ComposerError, database and unknown errors', () => {
    const storyError = new StoryError('story-not-ready')

    expect(toStoryError(storyError)).toBe(storyError)
    expect(toStoryError(new ComposerError('provider-timeout')).code).toBe('provider-timeout')

    const databaseError = Object.assign(new Error('db down'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    })
    expect(toStoryError(databaseError).code).toBe('database-unavailable')

    const configError = Object.assign(new Error('missing DATABASE_URL'), {
      name: 'DatabaseConfigurationError',
    })
    expect(toStoryError(configError).code).toBe('database-unavailable')
    expect(toStoryError(new Error('unexpected')).code).toBe('internal-error')
    expect(toStoryError(new Error('unexpected')).message).toBe('Algo salió mal. Inténtalo de nuevo.')
  })
})
