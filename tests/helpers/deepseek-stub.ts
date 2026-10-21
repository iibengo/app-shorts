import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import plan5 from '../fixtures/deepseek/deepseek-plan-5.json'

export interface DeepSeekStubRequest {
  readonly method: string
  readonly path: string
  readonly authorization: string | undefined
  readonly body: unknown
}

export interface DeepSeekStubState {
  status: number
  errorPayload: unknown
  delayMs: number
  /** Queued assistant contents. Objects are serialized as JSON strings. */
  contents: unknown[]
}

export interface DeepSeekStub {
  readonly baseUrl: string
  readonly requests: DeepSeekStubRequest[]
  readonly state: DeepSeekStubState
  reset(): void
  close(): Promise<void>
}

function readBody(request: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function parseBody(raw: string): unknown {
  if (raw.length === 0) return null

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function contentOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export async function startDeepSeekStub(): Promise<DeepSeekStub> {
  const requests: DeepSeekStubRequest[] = []
  const state: DeepSeekStubState = {
    status: 200,
    errorPayload: { error: { message: 'stub failure' } },
    delayMs: 0,
    contents: [plan5],
  }

  const server: Server = createServer(async (incoming, response) => {
    const path = incoming.url ?? '/'
    const pathname = new URL(path, 'http://stub.local').pathname
    const raw = await readBody(incoming)

    requests.push({
      method: incoming.method ?? 'GET',
      path,
      authorization: incoming.headers.authorization,
      body: parseBody(raw),
    })

    if (incoming.method !== 'POST' || pathname !== '/chat/completions') {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'unhandled stub route' }))

      return
    }

    if (state.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, state.delayMs))
    }

    if (state.status !== 200) {
      response.writeHead(state.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(state.errorPayload))

      return
    }

    const content = state.contents.length > 0
      ? state.contents.shift()
      : plan5

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      id: 'chatcmpl-stub',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: contentOf(content) },
          finish_reason: 'stop',
        },
      ],
    }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    requests,
    state,
    reset() {
      requests.length = 0
      state.status = 200
      state.errorPayload = { error: { message: 'stub failure' } }
      state.delayMs = 0
      state.contents = [plan5]
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
