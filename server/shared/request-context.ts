import { createHash, randomBytes } from 'node:crypto'
import {
  getCookie,
  getRequestHeader,
  setCookie,
  setResponseHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { ComposerError } from './errors'

export const COMPOSER_SESSION_COOKIE = 'composer_sid'

export interface ComposerRequestContext {
  readonly sessionId: string
  readonly ipHash: string
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/

export function applyComposerResponseHeaders(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
}

export function resolveClientIp(event: H3Event): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  const forwardedIp = forwarded?.split(',')[0]?.trim()

  if (forwardedIp) {
    return forwardedIp
  }

  const realIp = getRequestHeader(event, 'x-real-ip')?.trim()

  if (realIp) {
    return realIp
  }

  return event.node.req.socket.remoteAddress ?? 'unknown'
}

export function hashIp(ip: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex')
}

export function readSessionId(event: H3Event): string | null {
  const value = getCookie(event, COMPOSER_SESSION_COOKIE)

  if (!value || !SESSION_ID_PATTERN.test(value)) {
    return null
  }

  return value
}

export function ensureSessionId(event: H3Event): string {
  const existing = readSessionId(event)

  if (existing) {
    return existing
  }

  const sessionId = randomBytes(16).toString('base64url')

  setCookie(event, COMPOSER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86_400,
  })

  return sessionId
}

export function assertSameOrigin(event: H3Event): void {
  const origin = getRequestHeader(event, 'origin')

  if (!origin || origin === 'null') {
    return
  }

  const host = getRequestHeader(event, 'host')

  if (!host) {
    throw new ComposerError('cross-origin-request')
  }

  let originHost: string

  try {
    originHost = new URL(origin).host
  } catch {
    throw new ComposerError('cross-origin-request')
  }

  if (originHost !== host) {
    throw new ComposerError('cross-origin-request')
  }
}

export function getRequestContext(event: H3Event, ipSalt: string): ComposerRequestContext {
  const sessionId = ensureSessionId(event)
  const ipHash = hashIp(resolveClientIp(event), ipSalt)

  return { sessionId, ipHash }
}
