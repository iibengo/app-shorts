import type { Readable } from 'node:stream'
import { ComposerError, isComposerError } from '../shared/errors'
import {
  assertFalApiUrl,
  assertSecureUploadUrl,
  isContentBlockedPayload,
} from './types'

export interface FalHttpRequest {
  readonly url: string
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface FalHttpResponse<T> {
  readonly status: number
  readonly data: T
  readonly headers: Headers
}

export interface FalBinaryUploadRequest {
  readonly url: string
  readonly body: Uint8Array | Readable
  readonly contentType: string
  readonly timeoutMs: number
}

export interface FalHttpClient {
  request<T>(request: FalHttpRequest): Promise<FalHttpResponse<T>>
  uploadBinary?(request: FalBinaryUploadRequest): Promise<FalHttpResponse<unknown>>
}

export interface FalHttpClientOptions {
  readonly apiKey: string
  readonly allowedOrigins: readonly string[]
  readonly allowInsecure?: boolean
  readonly fetchImpl?: typeof fetch
}

function parseRetryAfter(headers: Headers): number | undefined {
  const value = headers.get('retry-after')

  if (!value) return undefined

  const seconds = Number(value)

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(1, Math.ceil(seconds))
  }

  const date = Date.parse(value)

  if (Number.isFinite(date)) {
    return Math.max(1, Math.ceil((date - Date.now()) / 1000))
  }

  return undefined
}

/** The provider says the account is locked for balance, whatever the status. */
function mentionsBalance(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false

  const text = JSON.stringify(body).toLowerCase()

  return text.includes('balance') || text.includes('exhausted') || text.includes('locked')
}

function mapHttpError(
  status: number,
  body: unknown,
  headers: Headers,
): ComposerError {
  const retryAfterSeconds = parseRetryAfter(headers)

  // Fal answers 403 with a balance message when the account is locked, not a
  // permission problem. Treating it as "unavailable" hid an exhausted balance
  // behind "the service is down" for an entire session.
  if (status === 403 && mentionsBalance(body)) {
    return new ComposerError('ai-credits-exhausted', { providerStatus: status })
  }

  if (status === 401 || status === 403) {
    return new ComposerError('ai-unavailable', { providerStatus: status })
  }

  if (status === 402) {
    return new ComposerError('ai-credits-exhausted', { providerStatus: status })
  }

  if (status === 429) {
    return new ComposerError('provider-busy', {
      retryAfterSeconds,
      providerStatus: status,
    })
  }

  if (status === 408 || status === 504) {
    return new ComposerError('provider-timeout', {
      retryAfterSeconds,
      providerStatus: status,
    })
  }

  if (status === 400 || status === 422) {
    if (isContentBlockedPayload(body)) {
      return new ComposerError('content-blocked', { providerStatus: status })
    }

    return new ComposerError('provider-rejected', { providerStatus: status })
  }

  return new ComposerError('provider-error', {
    retryAfterSeconds,
    providerStatus: status,
  })
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()

  if (text.length === 0) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class NativeFalHttpClient implements FalHttpClient {
  private readonly apiKey: string
  private readonly allowedOrigins: readonly string[]
  private readonly allowInsecure: boolean
  private readonly fetchImpl: typeof fetch

  constructor(options: FalHttpClientOptions) {
    this.apiKey = options.apiKey
    this.allowedOrigins = options.allowedOrigins
    this.allowInsecure = options.allowInsecure ?? false
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async uploadBinary(
    request: FalBinaryUploadRequest,
  ): Promise<FalHttpResponse<unknown>> {
    let url: string

    try {
      url = assertSecureUploadUrl(request.url)
    } catch {
      throw new ComposerError('provider-invalid-output')
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, request.timeoutMs)
    const streaming = typeof (request.body as { pipe?: unknown }).pipe === 'function'

    try {
      const init = {
        method: 'PUT',
        headers: { 'Content-Type': request.contentType },
        body: request.body,
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        ...(streaming ? { duplex: 'half' } : {}),
      } as RequestInit

      // The signed upload URL is pre-authorized by the provider: no credentials.
      const response = await this.fetchImpl(url, init)
      const data = await readResponseBody(response)

      if (!response.ok) {
        throw mapHttpError(response.status, data, response.headers)
      }

      return {
        status: response.status,
        data,
        headers: response.headers,
      }
    } catch (error) {
      if (isComposerError(error)) {
        throw error
      }

      if (timedOut) {
        throw new ComposerError('provider-timeout')
      }

      throw new ComposerError('provider-error')
    } finally {
      clearTimeout(timer)
    }
  }

  async request<T>(request: FalHttpRequest): Promise<FalHttpResponse<T>> {
    let url: string

    try {
      url = assertFalApiUrl(request.url, this.allowedOrigins, this.allowInsecure)
    } catch {
      throw new ComposerError('provider-invalid-output')
    }

    if (request.signal?.aborted) {
      throw new ComposerError('provider-timeout')
    }

    const controller = new AbortController()
    const externalSignal = request.signal
    let timedOut = false

    const handleExternalAbort = (): void => {
      controller.abort()
    }

    externalSignal?.addEventListener('abort', handleExternalAbort, { once: true })

    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, request.timeoutMs)

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    for (const [name, value] of Object.entries(request.headers ?? {})) {
      const normalizedName = name.trim().toLowerCase()

      // Credentials and the JSON content type stay under this client's control.
      if (
        normalizedName.length === 0
        || normalizedName === 'authorization'
        || normalizedName === 'content-type'
      ) {
        continue
      }

      headers[name] = value
    }

    if (request.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    headers.Authorization = `Key ${this.apiKey}`

    try {
      const response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      })
      const data = await readResponseBody(response)

      if (!response.ok) {
        throw mapHttpError(response.status, data, response.headers)
      }

      return {
        status: response.status,
        data: data as T,
        headers: response.headers,
      }
    } catch (error) {
      if (isComposerError(error)) {
        throw error
      }

      if (timedOut || externalSignal?.aborted) {
        throw new ComposerError('provider-timeout')
      }

      throw new ComposerError('provider-error')
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', handleExternalAbort)
    }
  }
}

export function createFalHttpClient(options: FalHttpClientOptions): FalHttpClient {
  return new NativeFalHttpClient(options)
}
