import type { H3Event } from 'h3'
import { createTestEvent, responseHeader, type TestH3Event } from './h3'

export interface ApiCallOptions {
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly path: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly params?: Readonly<Record<string, string>>
  readonly remoteAddress?: string
}

export interface ApiCallResult<T = unknown> {
  readonly status: number
  readonly body: T
  readonly headers: ReadonlyMap<string, string | number | readonly string[]>
  readonly cookie: string | null
  readonly event: TestH3Event
}

export async function callHandler<T = unknown>(
  handler: (event: H3Event) => unknown,
  options: ApiCallOptions,
): Promise<ApiCallResult<T>> {
  const event = createTestEvent({
    method: options.method,
    path: options.path,
    headers: options.headers,
    body: options.body,
    remoteAddress: options.remoteAddress,
  })

  if (options.params) {
    event.context.params = { ...options.params }
  }

  const body = await handler(event) as T
  const setCookie = responseHeader(event, 'set-cookie')
  const cookie = typeof setCookie === 'string' ? setCookie.split(';')[0] ?? null : null

  return {
    status: event.node.res.statusCode ?? 200,
    body,
    headers: event.testHeaders,
    cookie,
    event,
  }
}

export function jsonPost(
  handler: (event: H3Event) => unknown,
  path: string,
  body: unknown,
  options: {
    readonly headers?: Readonly<Record<string, string>>
  } = {},
) {
  return callHandler(handler, {
    method: 'POST',
    path,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}
