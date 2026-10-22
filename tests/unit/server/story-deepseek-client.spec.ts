// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_MODEL,
  NativeDeepSeekClient,
} from '../../../server/story/deepseek-client'
import { StoryError } from '../../../server/story/errors'

interface Captured {
  readonly url: string
  readonly init: RequestInit
  readonly body: Record<string, unknown>
}

function abortableFetch(
  onRequest?: (url: string, init: RequestInit) => void,
): { readonly fetchImpl: typeof fetch; readonly calls: Captured[] } {
  const calls: Captured[] = []

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const captured = { url: String(input), init: init ?? {}, body }

    calls.push(captured)
    onRequest?.(captured.url, captured.init)

    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal

      if (signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'))

        return
      }

      signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    })
  }) as typeof fetch

  return { fetchImpl, calls }
}

function responseFetch(
  response: Response,
): { readonly fetchImpl: typeof fetch; readonly calls: Captured[] } {
  const calls: Captured[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    })

    return response
  }) as typeof fetch

  return { fetchImpl, calls }
}

function completion(content: string | null, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({
    choices: [{
      index: 0,
      message: { role: 'assistant', content: content ?? '' },
      finish_reason: finishReason,
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function errorOf(run: () => Promise<unknown>): Promise<StoryError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)

    return error as StoryError
  }

  throw new Error('expected StoryError')
}

describe('DeepSeekClient request contract', () => {
  it('sends the fixed model, JSON mode, stream false and no seed', async () => {
    const { fetchImpl, calls } = responseFetch(completion('{"ok":true}'))
    const client = new NativeDeepSeekClient({
      apiKey: 'test-key',
      baseUrl: 'https://deepseek.test/',
      fetchImpl,
    })

    const result = await client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0.4,
      maxTokens: 123,
      timeoutMs: 1_000,
    })

    expect(result).toMatchObject({
      content: '{"ok":true}',
      finishReason: 'stop',
      httpStatus: 200,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://deepseek.test/chat/completions')
    expect(calls[0]?.body).toMatchObject({
      model: DEEPSEEK_MODEL,
      temperature: 0.4,
      max_tokens: 123,
      stream: false,
      response_format: { type: 'json_object' },
    })
    expect(calls[0]?.body).not.toHaveProperty('seed')
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    })
  })

  it('returns an empty content and unknown finish reason for invalid JSON', async () => {
    const fetchImpl = (async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
    const client = new NativeDeepSeekClient({
      apiKey: 'test-key',
      fetchImpl,
    })

    const result = await client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
    })

    expect(result).toEqual({
      content: null,
      finishReason: 'unknown',
      httpStatus: 200,
    })
  })
})

describe('DeepSeekClient error mapping', () => {
  it.each([401, 403, 429, 500, 503])('maps %i to director-unavailable', async (status) => {
    const { fetchImpl } = responseFetch(new Response('{}', { status }))
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
    }))

    expect(error.code).toBe('director-unavailable')
    expect(error.status).toBe(503)
  })

  it.each([400, 422])('maps %i to director-invalid-output', async (status) => {
    const { fetchImpl } = responseFetch(new Response('{"error":"bad request"}', { status }))
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
    }))

    expect(error.code).toBe('director-invalid-output')
    expect(error.status).toBe(502)
  })

  it('maps a policy rejection on 400 to content-blocked', async () => {
    const { fetchImpl } = responseFetch(new Response(
      JSON.stringify({ error: { message: 'blocked by safety policy' } }),
      { status: 400 },
    ))
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
    }))

    expect(error.code).toBe('content-blocked')
  })

  it('maps a network failure to director-unavailable', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('network down')
    }) as typeof fetch
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
    }))

    expect(error.code).toBe('director-unavailable')
  })
})

describe('DeepSeekClient aborts', () => {
  it('maps its own timeout to director-timeout', async () => {
    const { fetchImpl } = abortableFetch()
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 5,
    }))

    expect(error.code).toBe('director-timeout')
    expect(error.status).toBe(504)
  })

  it('shares and honours an external AbortSignal as a timeout', async () => {
    const { fetchImpl } = abortableFetch()
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const controller = new AbortController()

    setTimeout(() => controller.abort(), 5)

    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
      signal: controller.signal,
    }))

    expect(error.code).toBe('director-timeout')
  })

  it('aborts immediately when the external signal is already aborted', async () => {
    const { fetchImpl } = abortableFetch()
    const client = new NativeDeepSeekClient({ apiKey: 'key', fetchImpl })
    const controller = new AbortController()
    controller.abort()

    const error = await errorOf(() => client.complete({
      messages: [{ role: 'user', content: 'Hola' }],
      temperature: 0,
      maxTokens: 10,
      timeoutMs: 1_000,
      signal: controller.signal,
    }))

    expect(error.code).toBe('director-timeout')
  })
})
