// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPOSER_SESSION_COOKIE,
  applyComposerResponseHeaders,
  assertSameOrigin,
  ensureSessionId,
  getRequestContext,
  hashIp,
  readSessionId,
  resolveClientIp,
} from '../../../server/composer/request-context'
import { createTestEvent, responseHeader } from '../../helpers/h3'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

describe('resolveClientIp', () => {
  it('prefers the first X-Forwarded-For address', () => {
    const event = createTestEvent({
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-real-ip': '198.51.100.4',
      },
      remoteAddress: '127.0.0.1',
    })

    expect(resolveClientIp(event)).toBe('203.0.113.10')
  })

  it('falls back to X-Real-IP and then the socket address', () => {
    expect(resolveClientIp(createTestEvent({
      headers: { 'x-real-ip': ' 198.51.100.4 ' },
    }))).toBe('198.51.100.4')

    expect(resolveClientIp(createTestEvent({ remoteAddress: '192.0.2.9' })))
      .toBe('192.0.2.9')
  })

  it('returns unknown when no address is available', () => {
    const event = createTestEvent()
    Object.defineProperty(event.node.req, 'socket', { value: {} })

    expect(resolveClientIp(event)).toBe('unknown')
  })
})

describe('session cookie', () => {
  it('creates an opaque 128 bit HttpOnly session cookie', () => {
    const event = createTestEvent({ headers: { host: 'localhost' } })

    const sessionId = ensureSessionId(event)
    const cookie = String(responseHeader(event, 'set-cookie'))

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(cookie).toContain(`${COMPOSER_SESSION_COOKIE}=${sessionId}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=86400')
    expect(cookie).not.toContain('Secure')
  })

  it('adds Secure in production', () => {
    process.env.NODE_ENV = 'production'
    const event = createTestEvent()

    ensureSessionId(event)

    expect(String(responseHeader(event, 'set-cookie'))).toContain('Secure')
  })

  it('reads an existing valid cookie without setting a new one', () => {
    const event = createTestEvent({
      headers: { cookie: `${COMPOSER_SESSION_COOKIE}=abcdefghijklmnopqrstuv` },
    })

    expect(readSessionId(event)).toBe('abcdefghijklmnopqrstuv')
    expect(ensureSessionId(event)).toBe('abcdefghijklmnopqrstuv')
    expect(responseHeader(event, 'set-cookie')).toBeUndefined()
  })

  it('rejects malformed cookies and generates a fresh one', () => {
    for (const value of ['short', 'not valid because spaces', 'a'.repeat(200)]) {
      const event = createTestEvent({
        headers: { cookie: `${COMPOSER_SESSION_COOKIE}=${value}` },
      })

      expect(readSessionId(event), value).toBeNull()
      expect(ensureSessionId(event)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    }
  })
})

describe('hashIp', () => {
  it('is stable, salted and never contains the clear IP', () => {
    const first = hashIp('203.0.113.10', 'salt-a')
    const second = hashIp('203.0.113.10', 'salt-a')
    const otherSalt = hashIp('203.0.113.10', 'salt-b')

    expect(first).toBe(second)
    expect(first).not.toBe(otherSalt)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toContain('203.0.113.10')
  })
})

describe('assertSameOrigin', () => {
  it('accepts a matching origin', () => {
    const event = createTestEvent({
      headers: { origin: 'https://example.com', host: 'example.com' },
    })

    expect(() => assertSameOrigin(event)).not.toThrow()
  })

  it('allows requests without Origin or with a null Origin', () => {
    expect(() => assertSameOrigin(createTestEvent())).not.toThrow()
    expect(() => assertSameOrigin(createTestEvent({
      headers: { origin: 'null', host: 'example.com' },
    }))).not.toThrow()
  })

  it('rejects cross-origin, malformed and hostless requests', () => {
    expect(() => assertSameOrigin(createTestEvent({
      headers: { origin: 'https://evil.example', host: 'example.com' },
    }))).toThrowError(expect.objectContaining({ code: 'cross-origin-request' }))

    expect(() => assertSameOrigin(createTestEvent({
      headers: { origin: 'not a url', host: 'example.com' },
    }))).toThrowError(expect.objectContaining({ code: 'cross-origin-request' }))

    expect(() => assertSameOrigin(createTestEvent({
      headers: { origin: 'https://example.com' },
    }))).toThrowError(expect.objectContaining({ code: 'cross-origin-request' }))
  })
})

describe('request context and response headers', () => {
  it('combines the session id with the hashed IP', () => {
    const event = createTestEvent({
      headers: {
        'x-forwarded-for': '203.0.113.10',
        cookie: `${COMPOSER_SESSION_COOKIE}=abcdefghijklmnopqrstuv`,
      },
    })

    const context = getRequestContext(event, 'salt')

    expect(context.sessionId).toBe('abcdefghijklmnopqrstuv')
    expect(context.ipHash).toBe(hashIp('203.0.113.10', 'salt'))
  })

  it('applies the no-store, nosniff, noindex and no-referrer headers', () => {
    const event = createTestEvent()

    applyComposerResponseHeaders(event)

    expect(responseHeader(event, 'cache-control')).toBe('no-store, max-age=0')
    expect(responseHeader(event, 'x-content-type-options')).toBe('nosniff')
    expect(responseHeader(event, 'x-robots-tag')).toBe('noindex')
    expect(responseHeader(event, 'referrer-policy')).toBe('no-referrer')
  })
})
