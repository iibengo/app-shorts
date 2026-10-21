// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { StoryError } from '../../../server/story/errors'
import {
  STORY_SESSION_COOKIE,
  STORY_SESSION_MAX_AGE_SECONDS,
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  ensureStorySessionId,
  getStoryReadContext,
  getStoryRequestContext,
  readStorySessionId,
} from '../../../server/story/session'
import { createTestEvent, responseHeader } from '../../helpers/h3'

const VALID_SESSION = 'abcdefghijklmnopqrstuvwx'
const SALT = 'ip-salt'

function event(headers: Readonly<Record<string, string>> = {}) {
  return createTestEvent({ method: 'POST', path: '/api/story', headers })
}

describe('story session cookie', () => {
  it('creates a 128-bit opaque cookie with the normative attributes', () => {
    const testEvent = event()
    const sessionId = ensureStorySessionId(testEvent)
    const cookie = String(responseHeader(testEvent, 'set-cookie'))

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(sessionId.length).toBeGreaterThanOrEqual(22)
    expect(cookie).toContain(`${STORY_SESSION_COOKIE}=${sessionId}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Max-Age=${STORY_SESSION_MAX_AGE_SECONDS}`)
    expect(STORY_SESSION_MAX_AGE_SECONDS).toBe(604_800)
    expect(cookie.toLowerCase()).not.toContain('secure')

    expect(cookie).not.toContain('premisa')
    expect(cookie).not.toContain('story-')
    expect(cookie).not.toContain('http')
  })

  it('marks the cookie Secure in production', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const testEvent = event()
      ensureStorySessionId(testEvent)
      expect(String(responseHeader(testEvent, 'set-cookie'))).toContain('Secure')
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('reuses a valid existing cookie without setting a new one', () => {
    const testEvent = event({ cookie: `${STORY_SESSION_COOKIE}=${VALID_SESSION}` })

    expect(readStorySessionId(testEvent)).toBe(VALID_SESSION)
    expect(ensureStorySessionId(testEvent)).toBe(VALID_SESSION)
    expect(responseHeader(testEvent, 'set-cookie')).toBeUndefined()
  })

  it.each([
    undefined,
    'short',
    'con caracteres inválidos',
    'a'.repeat(129),
  ])('rejects an invalid cookie value %#', (value) => {
    const headers = value === undefined ? {} : { cookie: `${STORY_SESSION_COOKIE}=${value}` }
    const testEvent = event(headers)

    expect(readStorySessionId(testEvent)).toBeNull()
  })

  it('replaces an invalid cookie with a fresh one', () => {
    const testEvent = event({ cookie: `${STORY_SESSION_COOKIE}=short` })
    const sessionId = ensureStorySessionId(testEvent)

    expect(sessionId).not.toBe('short')
    expect(String(responseHeader(testEvent, 'set-cookie'))).toContain(sessionId)
  })

  it('never creates a cookie on read paths', () => {
    const missing = event()
    const context = getStoryReadContext(missing, SALT)

    expect(context.sessionId).toBeNull()
    expect(responseHeader(missing, 'set-cookie')).toBeUndefined()

    const existing = event({ cookie: `${STORY_SESSION_COOKIE}=${VALID_SESSION}` })
    expect(getStoryReadContext(existing, SALT).sessionId).toBe(VALID_SESSION)
    expect(responseHeader(existing, 'set-cookie')).toBeUndefined()
  })

  it('hashes the client IP with the runtime salt on write paths', () => {
    const testEvent = createTestEvent({
      method: 'POST',
      path: '/api/story',
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
      remoteAddress: '127.0.0.1',
    })
    const context = getStoryRequestContext(testEvent, SALT)
    const expected = createHash('sha256').update(`${SALT}:203.0.113.9`).digest('hex')

    expect(context.ipHash).toBe(expected)
    expect(context.ipHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(context)).not.toContain('203.0.113.9')
    expect(context.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('falls back to x-real-ip and the socket address', () => {
    const realIp = createTestEvent({
      method: 'POST',
      path: '/api/story',
      headers: { 'x-real-ip': '198.51.100.7' },
    })
    const socket = createTestEvent({
      method: 'POST',
      path: '/api/story',
      remoteAddress: '192.0.2.44',
    })

    expect(getStoryRequestContext(realIp, SALT).ipHash).toBe(
      createHash('sha256').update(`${SALT}:198.51.100.7`).digest('hex'),
    )
    expect(getStoryRequestContext(socket, SALT).ipHash).toBe(
      createHash('sha256').update(`${SALT}:192.0.2.44`).digest('hex'),
    )
  })
})

describe('story response headers', () => {
  it('applies the no-store and hardening headers to every response', () => {
    const testEvent = event()
    applyStoryResponseHeaders(testEvent)

    expect(responseHeader(testEvent, 'cache-control')).toBe('no-store, max-age=0')
    expect(responseHeader(testEvent, 'x-content-type-options')).toBe('nosniff')
    expect(responseHeader(testEvent, 'x-robots-tag')).toBe('noindex')
    expect(responseHeader(testEvent, 'referrer-policy')).toBe('no-referrer')
  })
})

describe('story same-origin guard', () => {
  it('accepts requests without Origin, with a matching Origin and with null', () => {
    expect(() => assertStorySameOrigin(event())).not.toThrow()
    expect(() => assertStorySameOrigin(event({
      origin: 'https://ai-shorts.example',
      host: 'ai-shorts.example',
    }))).not.toThrow()
    expect(() => assertStorySameOrigin(event({
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    }))).not.toThrow()
    expect(() => assertStorySameOrigin(event({
      origin: 'null',
      host: 'ai-shorts.example',
    }))).not.toThrow()
  })

  it('rejects a mismatched Origin with cross-origin-request', () => {
    for (const headers of [
      { origin: 'https://evil.example', host: 'ai-shorts.example' },
      { origin: 'not a url', host: 'ai-shorts.example' },
      { origin: 'https://ai-shorts.example' },
    ]) {
      try {
        assertStorySameOrigin(event(headers))
        throw new Error('expected a cross-origin rejection')
      } catch (error) {
        expect(error).toBeInstanceOf(StoryError)
        expect((error as StoryError).code).toBe('cross-origin-request')
        expect((error as StoryError).status).toBe(403)
      }
    }
  })
})
