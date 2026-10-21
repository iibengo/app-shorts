import { randomBytes } from 'node:crypto'
import {
  getCookie,
  getRequestHeader,
  setCookie,
  setResponseHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { hashIp, resolveClientIp } from '../shared/request-context'
import { StoryError } from './errors'

export const STORY_SESSION_COOKIE = 'story_sid'
export const STORY_SESSION_MAX_AGE_SECONDS = 604_800

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/

export interface StoryRequestContext {
  readonly sessionId: string
  readonly ipHash: string
}

export interface StoryReadContext {
  readonly sessionId: string | null
  readonly ipHash: string
}

export function applyStoryResponseHeaders(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
}

export function readStorySessionId(event: H3Event): string | null {
  const value = getCookie(event, STORY_SESSION_COOKIE)

  if (!value || !SESSION_ID_PATTERN.test(value)) {
    return null
  }

  return value
}

export function ensureStorySessionId(event: H3Event): string {
  const existing = readStorySessionId(event)

  if (existing) {
    return existing
  }

  const sessionId = randomBytes(16).toString('base64url')

  setCookie(event, STORY_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: STORY_SESSION_MAX_AGE_SECONDS,
  })

  return sessionId
}

export function getStoryRequestContext(
  event: H3Event,
  ipSalt: string,
): StoryRequestContext {
  return {
    sessionId: ensureStorySessionId(event),
    ipHash: hashIp(resolveClientIp(event), ipSalt),
  }
}

export function getStoryReadContext(event: H3Event, ipSalt: string): StoryReadContext {
  return {
    sessionId: readStorySessionId(event),
    ipHash: hashIp(resolveClientIp(event), ipSalt),
  }
}

export function assertStorySameOrigin(event: H3Event): void {
  const origin = getRequestHeader(event, 'origin')

  if (!origin || origin === 'null') {
    return
  }

  const host = getRequestHeader(event, 'host')

  if (!host) {
    throw new StoryError('cross-origin-request')
  }

  let originHost: string

  try {
    originHost = new URL(origin).host
  } catch {
    throw new StoryError('cross-origin-request')
  }

  if (originHost !== host) {
    throw new StoryError('cross-origin-request')
  }
}
