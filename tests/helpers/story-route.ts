import type { H3Event } from 'h3'
import type { StoryRuntime } from '../../server/story/runtime'
import { createTestEvent, type TestH3Event } from './h3'

export interface StoryRouteOptions {
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly runtime: StoryRuntime
  readonly params?: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly cookieSessionId?: string
  readonly origin?: string
  readonly host?: string
  readonly idempotencyKey?: string
  readonly contentType?: string | null
  readonly remoteAddress?: string
  readonly extraHeaders?: Readonly<Record<string, string>>
}

export interface StoryRouteResult<T = unknown> {
  readonly status: number
  readonly body: T
  readonly headers: ReadonlyMap<string, string | number | readonly string[]>
  readonly setCookie: string | null
  readonly event: TestH3Event
}

export function storyCookieHeader(sessionId: string): string {
  return `story_sid=${sessionId}`
}

export function readSetCookieAttribute(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null

  const parts = setCookie.split(';').map((part) => part.trim().toLowerCase())

  if (name.toLowerCase() === 'httponly') {
    return parts.includes('httponly') ? 'true' : null
  }

  const prefix = `${name.toLowerCase()}=`

  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return part.slice(prefix.length)
    }
  }

  return null
}

export async function callStoryRoute<T = unknown>(
  handler: (event: H3Event) => unknown,
  options: StoryRouteOptions,
): Promise<StoryRouteResult<T>> {
  const headers: Record<string, string> = { ...(options.extraHeaders ?? {}) }

  if (options.body !== undefined) {
    headers['content-type'] = options.contentType ?? 'application/json'
  } else if (options.contentType !== undefined && options.contentType !== null) {
    headers['content-type'] = options.contentType
  }

  if (options.cookieSessionId) {
    headers.cookie = storyCookieHeader(options.cookieSessionId)
  }

  if (options.idempotencyKey) {
    headers['idempotency-key'] = options.idempotencyKey
  }

  if (options.origin) {
    headers.origin = options.origin
    headers.host = options.host ?? 'localhost'
  } else if (options.host) {
    headers.host = options.host
  }

  const event = createTestEvent({
    method: options.method,
    path: options.path,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    remoteAddress: options.remoteAddress,
  })

  ;(event.context as { storyRuntime?: StoryRuntime }).storyRuntime = options.runtime

  if (options.params) {
    event.context.params = { ...options.params }
  }

  const body = await handler(event) as T
  const rawCookie = event.testHeaders.get('set-cookie')
  const setCookie = typeof rawCookie === 'string'
    ? rawCookie
    : Array.isArray(rawCookie)
      ? String(rawCookie[0])
      : null

  return {
    status: event.node.res.statusCode ?? 200,
    body,
    headers: event.testHeaders,
    setCookie,
    event,
  }
}
