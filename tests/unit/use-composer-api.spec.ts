import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchState = vi.hoisted(() => ({
  impl: null as unknown,
}))

vi.mock('#build/fetch.mjs', () => ({
  $fetch: (...args: unknown[]) => {
    const impl = fetchState.impl as (...input: unknown[]) => unknown
    return impl(...args)
  },
}))

import {
  ComposerApiClientError,
  toComposerApiClientError,
  useComposerApi,
} from '~/composables/useComposerApi'
import type {
  ComposerJob,
  ComposerUploadTicket,
} from '~/models/composer'

const TICKET: ComposerUploadTicket = {
  uploadUrl: 'https://v3.fal.media/files/test/upload?signature=test',
  fileUrl: 'https://v3.fal.media/files/test/composer-ref.webp',
  expiresAt: '2026-10-21T19:00:00.000Z',
  uploadHeaders: {
    'Content-Type': 'image/webp',
  },
}

const JOB: ComposerJob = {
  id: 'v1.payload.signature',
  status: 'queued',
  stage: 'queued',
  queuePosition: null,
  preset: 'fast',
  modelId: 'minimax-hailuo-02',
  durationSeconds: 6,
  posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  createdAt: '2026-10-21T18:00:00.000Z',
  expiresAt: '2026-10-21T19:00:00.000Z',
  pollAfterMs: 2_000,
}

function makeFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

let fetchMock: ReturnType<typeof vi.fn>
let uploadFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  uploadFetch = vi.fn()
  fetchState.impl = fetchMock
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('fetch', uploadFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useComposerApi same-origin requests', () => {
  it('creates an upload ticket through the exact route with JSON and idempotency headers', async () => {
    fetchMock.mockResolvedValue(TICKET)
    const api = useComposerApi()

    await expect(api.createUploadTicket({
      fileName: 'foto.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })).resolves.toEqual(TICKET)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]!
    const headers = options.headers as Record<string, string>

    expect(url).toBe('/api/composer/uploads')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      fileName: 'foto.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9._~-]{8,128}$/)
  })

  it('generates through the exact route and forwards the abort signal', async () => {
    fetchMock.mockResolvedValue(JOB)
    const api = useComposerApi()
    const controller = new AbortController()
    const request = {
      prompt: 'Idea',
      preset: 'fast' as const,
      durationSeconds: 6 as const,
      referenceUrl: null,
    }

    await expect(api.generate(request, controller.signal)).resolves.toEqual(JOB)

    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/composer/generate')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual(request)
    expect(options.signal).toBe(controller.signal)
  })

  it('gets a job from the encoded exact route', async () => {
    fetchMock.mockResolvedValue(JOB)
    const api = useComposerApi()

    await expect(api.getJob(JOB.id)).resolves.toEqual(JOB)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/composer/jobs/${encodeURIComponent(JOB.id)}`,
      { signal: undefined },
    )
  })

  it('cancels with POST on the exact route', async () => {
    fetchMock.mockResolvedValue({ ...JOB, status: 'cancelled', stage: 'queued' })
    const api = useComposerApi()

    await api.cancelJob(JOB.id)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/composer/jobs/${encodeURIComponent(JOB.id)}/cancel`,
      { method: 'POST', signal: undefined },
    )
  })

  it('never sends the Fal key or an Authorization header', async () => {
    fetchMock.mockResolvedValue(TICKET)
    const api = useComposerApi()

    await api.createUploadTicket({
      fileName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 1,
    })

    const serialized = JSON.stringify(fetchMock.mock.calls[0])
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('test-key')
    expect(serialized).not.toContain('NUXT_FAL_KEY')
  })
})

describe('useComposerApi direct Fal upload', () => {
  it('PUTs the file to the signed URL with exactly the ticket headers', async () => {
    uploadFetch.mockResolvedValue(new Response(null, { status: 200 }))
    const api = useComposerApi()
    const file = makeFile('foto.webp', 'image/webp')
    const controller = new AbortController()

    await api.uploadReference(TICKET, file, controller.signal)

    expect(uploadFetch).toHaveBeenCalledTimes(1)
    const [url, options] = uploadFetch.mock.calls[0]!

    expect(url).toBe(TICKET.uploadUrl)
    expect(options.method).toBe('PUT')
    expect(options.headers).toEqual({ 'Content-Type': 'image/webp' })
    expect(options.body).toBe(file)
    expect(options.mode).toBe('cors')
    expect(options.credentials).toBe('omit')
    expect(options.redirect).toBe('error')
    expect(options.cache).toBe('no-store')
    expect(options.signal).toBe(controller.signal)
    expect(JSON.stringify(options.headers)).not.toContain('Authorization')
    expect(JSON.stringify(options.headers)).not.toContain('Cookie')
  })

  it.each([
    [413, 'reference-too-large'],
    [415, 'unsupported-reference-type'],
    [403, 'invalid-reference'],
    [500, 'internal-error'],
  ] as const)('maps upload HTTP %i to %s', async (status, code) => {
    uploadFetch.mockResolvedValue(new Response(null, { status }))
    const api = useComposerApi()

    const error = await api.uploadReference(TICKET, makeFile('a.png', 'image/png'))
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ComposerApiClientError)
    expect(error).toMatchObject({ code, status })
  })

  it('maps a network failure to a retryable internal error', async () => {
    uploadFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const api = useComposerApi()

    await expect(api.uploadReference(TICKET, makeFile('a.png', 'image/png')))
      .rejects.toMatchObject({
        code: 'internal-error',
        retryable: true,
      })
  })

  it('forwards the abort reason when the upload was deliberately aborted', async () => {
    const controller = new AbortController()
    uploadFetch.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    const api = useComposerApi()

    await expect(api.uploadReference(
      TICKET,
      makeFile('a.png', 'image/png'),
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('useComposerApi error parsing', () => {
  it('parses ComposerApiError payloads with Retry-After seconds', async () => {
    fetchMock.mockRejectedValue({
      status: 429,
      data: {
        error: {
          code: 'rate-limited',
          message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
          retryable: true,
          retryAfterSeconds: 30,
        },
      },
    })
    const api = useComposerApi()

    const error = await api.generate({
      prompt: 'Idea',
      preset: 'fast',
      durationSeconds: 6,
      referenceUrl: null,
    }).catch((value: unknown) => value)

    expect(error).toBeInstanceOf(ComposerApiClientError)
    expect(error).toMatchObject({
      code: 'rate-limited',
      message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
      retryable: true,
      retryAfterSeconds: 30,
      status: 429,
    })
  })

  it('normalises unknown thrown values into an internal error', async () => {
    const error = toComposerApiClientError(new Error('raw stack'))

    expect(error).toBeInstanceOf(ComposerApiClientError)
    expect(error).toMatchObject({
      code: 'internal-error',
      message: 'No se pudo iniciar la generación. Inténtalo de nuevo.',
      retryable: true,
      status: null,
    })
    expect(error.message).not.toContain('raw stack')
  })

  it('keeps an existing ComposerApiClientError untouched', () => {
    const original = new ComposerApiClientError({
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    })

    expect(toComposerApiClientError(original)).toBe(original)
  })

  it('rejects payloads that do not match the error contract', () => {
    for (const value of [
      { data: { error: { code: 1, message: 'x', retryable: true } } },
      { data: { error: { code: 'provider-error', message: 'x' } } },
      { data: null },
      'nope',
    ]) {
      const error = toComposerApiClientError(value)
      expect(error.code).toBe('internal-error')
    }
  })
})
