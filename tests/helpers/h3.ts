import { Readable } from 'node:stream'
import { H3Event } from 'h3'

export interface TestEventOptions {
  readonly method?: string
  readonly path?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
  readonly remoteAddress?: string
}

export interface TestH3Event extends H3Event {
  readonly testHeaders: ReadonlyMap<string, string | number | readonly string[]>
}

export function createTestEvent(options: TestEventOptions = {}): TestH3Event {
  const body = options.body
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body, 'utf8')]) as unknown as {
    method: string
    url: string
    headers: Record<string, string>
    socket: { remoteAddress: string }
    on: (...args: unknown[]) => unknown
    once: (...args: unknown[]) => unknown
    removeListener: (...args: unknown[]) => unknown
  }

  request.method = options.method ?? 'GET'
  request.url = options.path ?? '/'
  request.headers = { ...(options.headers ?? {}) }
  if (body !== undefined && request.headers['content-length'] === undefined) {
    request.headers['content-length'] = String(Buffer.byteLength(body, 'utf8'))
  }
  request.socket = { remoteAddress: options.remoteAddress ?? '127.0.0.1' }

  const headers = new Map<string, string | number | readonly string[]>()
  const response = {
    statusCode: 200,
    statusMessage: '',
    writableEnded: false,
    headersSent: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), value)
      return response
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase())
    },
    hasHeader(name: string) {
      return headers.has(name.toLowerCase())
    },
    removeHeader(name: string) {
      headers.delete(name.toLowerCase())
    },
    getHeaders() {
      return Object.fromEntries(headers)
    },
    appendHeader(name: string, value: string | readonly string[]) {
      const current = headers.get(name.toLowerCase())
      const values = [
        ...(Array.isArray(current) ? current : current === undefined ? [] : [current]),
        ...(Array.isArray(value) ? value : [value]),
      ]
      headers.set(name.toLowerCase(), values as string[])
      return response
    },
    on: () => response,
    once: () => response,
    off: () => response,
    removeListener: () => response,
    end: () => {
      response.writableEnded = true
    },
    write: () => true,
  }

  const event = new H3Event(
    request as unknown as ConstructorParameters<typeof H3Event>[0],
    response as unknown as ConstructorParameters<typeof H3Event>[1],
  ) as TestH3Event

  Object.defineProperty(event, 'testHeaders', {
    value: headers,
    enumerable: false,
  })

  return event
}

export function responseHeader(
  event: TestH3Event,
  name: string,
): string | number | readonly string[] | undefined {
  return event.testHeaders.get(name.toLowerCase())
}
