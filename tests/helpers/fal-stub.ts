import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import fluxDev from '../fixtures/fal/flux-dev-result.json'
import fluxKontext from '../fixtures/fal/flux-kontext-result.json'
import minimax from '../fixtures/fal/minimax-result.json'

export type StubQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

export interface StubRequest {
  readonly method: string
  readonly path: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly authorization: string | undefined
  readonly body: unknown
}

export interface FalStubState {
  keyframeStatus: number
  keyframePayload: unknown
  kontextStatus: number
  kontextPayload: unknown
  submitStatus: number
  submitErrorMessage: string
  queueStatus: StubQueueStatus
  queuePosition: number | null
  resultStatus: number
  resultPayload: unknown
  cancelStatus: number
  keyframeDelayMs: number
}

export interface FalStub {
  readonly baseUrl: string
  readonly requests: StubRequest[]
  readonly state: FalStubState
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

function send(
  response: import('node:http').ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (response.writableEnded) return

  const body = payload === null ? '' : JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  response.end(body)
}

const initialState = (): FalStubState => ({
  keyframeStatus: 200,
  keyframePayload: fluxDev,
  kontextStatus: 200,
  kontextPayload: fluxKontext,
  submitStatus: 200,
  submitErrorMessage: 'submit failed',
  queueStatus: 'IN_QUEUE',
  queuePosition: 3,
  resultStatus: 200,
  resultPayload: minimax,
  cancelStatus: 200,
  keyframeDelayMs: 0,
})

export async function startFalStub(): Promise<FalStub> {
  const requests: StubRequest[] = []
  const state = initialState()
  let requestCounter = 0

  const server: Server = createServer(async (incoming, response) => {
    const path = incoming.url ?? '/'
    const pathname = new URL(path, 'http://stub.local').pathname
    const method = incoming.method ?? 'GET'
    const raw = await readBody(incoming)
    const authorization = incoming.headers.authorization
    const record: StubRequest = {
      method,
      path,
      headers: { ...incoming.headers },
      authorization,
      body: parseBody(raw),
    }
    requests.push(record)

    const requiresAuth =
      pathname.startsWith('/fal-ai/')
      || pathname.startsWith('/storage/')
      || pathname.startsWith('/queue/')

    if (requiresAuth && authorization !== 'Key test-key') {
      send(response, 401, { detail: 'invalid credentials' })
      return
    }

    if (method === 'POST' && pathname === '/storage/upload/initiate') {
      send(response, 200, {
        upload_url: 'https://v3.fal.media/files/test/upload?signature=test-signature',
        file_url: 'https://v3.fal.media/files/test/composer-ref-test.webp',
      })
      return
    }

    if (method === 'POST' && pathname === '/fal-ai/flux/dev') {
      if (state.keyframeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.keyframeDelayMs))
      }
      send(response, state.keyframeStatus, state.keyframePayload)
      return
    }

    if (method === 'POST' && pathname === '/fal-ai/flux-pro/kontext') {
      if (state.keyframeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.keyframeDelayMs))
      }
      send(response, state.kontextStatus, state.kontextPayload)
      return
    }

    if (method === 'POST' && pathname.startsWith('/fal-ai/')) {
      if (state.submitStatus !== 200) {
        send(response, state.submitStatus, { detail: state.submitErrorMessage })
        return
      }

      requestCounter += 1
      const requestId = `req-stub-${requestCounter}`
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

      send(response, 200, {
        request_id: requestId,
        status_url: `${base}/queue/requests/${requestId}/status`,
        response_url: `${base}/queue/requests/${requestId}`,
        cancel_url: `${base}/queue/requests/${requestId}/cancel`,
      })
      return
    }

    if (method === 'GET' && /^\/queue\/requests\/[^/]+\/status$/.test(pathname)) {
      send(response, 200, {
        status: state.queueStatus,
        ...(state.queuePosition === null ? {} : { queue_position: state.queuePosition }),
      })
      return
    }

    if (method === 'GET' && /^\/queue\/requests\/[^/]+$/.test(pathname)) {
      send(response, state.resultStatus, state.resultPayload)
      return
    }

    if (method === 'PUT' && /^\/queue\/requests\/[^/]+\/cancel$/.test(pathname)) {
      if (state.cancelStatus === 200) {
        send(response, 200, { status: 'CANCELLED' })
      } else {
        send(response, state.cancelStatus, { detail: 'cancel failed' })
      }
      return
    }

    send(response, 404, { detail: `unhandled stub route ${method} ${pathname}` })
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
      Object.assign(state, initialState())
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
