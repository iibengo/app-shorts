// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFalHttpClient } from '../../../server/composer/fal-http-client'
import { ComposerError } from '../../../server/composer/errors'

const ALLOWED = ['https://queue.fal.run', 'https://fal.run', 'https://rest.fal.ai']

type FetchImpl = typeof fetch

function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function createClient(fetchImpl: FetchImpl) {
  return createFalHttpClient({
    apiKey: 'test-key',
    allowedOrigins: ALLOWED,
    fetchImpl,
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('NativeFalHttpClient request contract', () => {
  it('sends the Key authorization header and JSON body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true })) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    const response = await client.request<{ ok: boolean }>({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: { prompt: 'Idea' },
      timeoutMs: 1_000,
    })

    expect(response.status).toBe(200)
    expect(response.data).toEqual({ ok: true })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://fal.run/fal-ai/flux/dev')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ prompt: 'Idea' }))
    expect(init?.redirect).toBe('error')
    expect(init?.credentials).toBe('omit')
    expect(init?.cache).toBe('no-store')

    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Key test-key')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('does not allow callers to override authorization or content-type', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({})) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await client.request({
      url: 'https://rest.fal.ai/storage/upload/initiate',
      method: 'POST',
      body: {},
      timeoutMs: 1_000,
      headers: {
        Authorization: 'Bearer attacker',
        'Content-Type': 'text/plain',
        'X-Fal-Object-Lifecycle': '{"expiration_duration_seconds":3600}',
      },
    })

    const headers = new Headers(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Key test-key')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-fal-object-lifecycle')).toBe(
      '{"expiration_duration_seconds":3600}',
    )
  })

  it('rejects URLs outside the allowlist before fetching', async () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://evil.example/steal',
      method: 'GET',
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'provider-invalid-output' })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows insecure origins only when explicitly enabled for tests', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true })) as unknown as FetchImpl
    const client = createFalHttpClient({
      apiKey: 'test-key',
      allowedOrigins: ['http://127.0.0.1:4010'],
      allowInsecure: true,
      fetchImpl,
    })

    await expect(client.request({
      url: 'http://127.0.0.1:4010/status',
      method: 'GET',
      timeoutMs: 1_000,
    })).resolves.toMatchObject({ status: 200 })
  })

  it('does not retry POST requests', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'boom' }, 500)) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'provider-error' })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('NativeFalHttpClient error mapping', () => {
  it.each([
    [401, 'ai-unavailable', 503, false],
    [403, 'ai-unavailable', 503, false],
    [402, 'ai-credits-exhausted', 503, false],
    [429, 'provider-busy', 503, true],
    [408, 'provider-timeout', 504, true],
    [504, 'provider-timeout', 504, true],
    [500, 'provider-error', 502, true],
  ] as const)('maps HTTP %i to %s', async (status, code, mappedStatus, retryable) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'raw fal' }, status, {
      'retry-after': '7',
    })) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    const error = await client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'GET',
      timeoutMs: 1_000,
    }).catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ComposerError)
    expect(error).toMatchObject({ code, status: mappedStatus, retryable })
    expect((error as ComposerError).message).not.toContain('raw fal')
  })

  it('maps policy payloads to content-blocked', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      detail: 'NSFW content detected',
      code: 'content_policy_violation',
    }, 422)) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'content-blocked' })
  })

  it('maps other 400/422 payloads to provider-rejected', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: 'invalid arguments' }, 400)) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'provider-rejected' })
  })

  it('maps NSFW arrays to content-blocked', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      has_nsfw_concepts: [false, true],
    }, 422)) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'content-blocked' })
  })

  it('parses retry-after dates', async () => {
    const retryAt = new Date(Date.now() + 5_000).toUTCString()
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429, {
      'retry-after': retryAt,
    })) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    const error = await client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'GET',
      timeoutMs: 1_000,
    }).catch((value: unknown) => value)

    expect((error as ComposerError).retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect((error as ComposerError).retryAfterSeconds).toBeLessThanOrEqual(6)
  })
})

describe('NativeFalHttpClient timeouts and aborts', () => {
  it('aborts a hanging request with provider-timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    const expectation = expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 45_000,
    })).rejects.toMatchObject({ code: 'provider-timeout' })

    await vi.advanceTimersByTimeAsync(45_000)
    await expectation
  })

  it('respects an external AbortSignal', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    )) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    const request = client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: {},
      timeoutMs: 45_000,
      signal: controller.signal,
    })

    controller.abort()

    await expect(request).rejects.toMatchObject({ code: 'provider-timeout' })
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl
    const client = createClient(fetchImpl)
    const controller = new AbortController()
    controller.abort()

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'GET',
      timeoutMs: 1_000,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'provider-timeout' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps network failures to provider-error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await expect(client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'GET',
      timeoutMs: 1_000,
    })).rejects.toMatchObject({ code: 'provider-error' })
  })

  it('never logs the key, full URL or prompt', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true })) as unknown as FetchImpl
    const client = createClient(fetchImpl)

    await client.request({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      body: { prompt: 'private prompt' },
      timeoutMs: 1_000,
    })

    const calls = [...log.mock.calls, ...info.mock.calls, ...error.mock.calls]
    expect(JSON.stringify(calls)).not.toContain('test-key')
    expect(JSON.stringify(calls)).not.toContain('private prompt')
    expect(JSON.stringify(calls)).not.toContain('https://fal.run')
  })
})

describe('balance reported as a lock', () => {
  it('treats a 403 that mentions the balance as exhausted credits', async () => {
    // Fal locks the account with 403 and a balance message when it runs dry.
    // Mapping it to ai-unavailable made an empty wallet look like an outage,
    // and sent a whole session hunting a bug that did not exist.
    const client = createFalHttpClient({
      apiKey: 'test-key',
      allowedOrigins: ALLOWED,
      fetchImpl: (async () => new Response(
        JSON.stringify({ detail: 'User is locked. Reason: Exhausted balance.' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch,
    })

    const error = await client.request({ url: 'https://rest.fal.ai/storage/upload/initiate', method: 'POST', headers: {}, body: {} })
      .catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('ai-credits-exhausted')
  })

  it('still treats a plain 403 as unavailable', async () => {
    const client = createFalHttpClient({
      apiKey: 'test-key',
      allowedOrigins: ALLOWED,
      fetchImpl: (async () => new Response(
        JSON.stringify({ detail: 'Forbidden' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch,
    })

    const error = await client.request({ url: 'https://rest.fal.ai/x', method: 'POST', headers: {}, body: {} })
      .catch((caught: unknown) => caught)

    expect((error as { code?: string }).code).toBe('ai-unavailable')
  })
})
