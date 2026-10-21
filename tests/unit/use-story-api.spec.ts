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
  StoryApiClientError,
  toStoryApiClientError,
  useStoryApi,
} from '~/composables/useStoryApi'
import type { StoryCreateRequest, StoryUploadTicket } from '~/models/story'

let fetchMock: ReturnType<typeof vi.fn>
let globalFetch: ReturnType<typeof vi.fn>

const CREATE: StoryCreateRequest = {
  premise: 'Una repostera descubre que sus postres pueden predecir el futuro.',
  sceneCount: 5,
  preset: 'fast',
  referenceUrl: null,
  referenceExpiresAt: null,
}

const TICKET: StoryUploadTicket = {
  uploadUrl: 'https://v3.fal.media/files/test/upload?signature=abc',
  fileUrl: 'https://v3.fal.media/files/test/story-ref.webp',
  expiresAt: '2026-10-21T19:00:00.000Z',
  uploadHeaders: { 'Content-Type': 'image/webp' },
}

beforeEach(() => {
  fetchMock = vi.fn()
  globalFetch = vi.fn()
  fetchState.impl = fetchMock
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('fetch', globalFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  globalFetch.mockReset()
})

function lastFetchCall(index = -1) {
  const calls = fetchMock.mock.calls
  const call = calls.at(index)!

  return {
    url: call[0] as string,
    options: call[1] as Record<string, unknown>,
  }
}

describe('useStoryApi requests', () => {
  it('creates a story with the exact route, body and idempotency header', async () => {
    fetchMock.mockResolvedValueOnce({ id: 'story-1' })
    const api = useStoryApi()

    await api.createStory(CREATE)

    const { url, options } = lastFetchCall()

    expect(url).toBe('/api/story')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual(CREATE)
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
    })
  })

  it('passes an explicit idempotency key', async () => {
    fetchMock.mockResolvedValueOnce({ id: 'story-1' })

    await useStoryApi().createStory(CREATE, 'explicit-key-12345678')

    expect((lastFetchCall().options.headers as Record<string, string>)['Idempotency-Key'])
      .toBe('explicit-key-12345678')
  })

  it('gets a story with an encoded id and forwards the abort signal', async () => {
    fetchMock.mockResolvedValueOnce({ id: 'story-1' })
    const controller = new AbortController()

    await useStoryApi().getStory('story/with space', controller.signal)

    const { url, options } = lastFetchCall()

    expect(url).toBe('/api/story/story%2Fwith%20space')
    expect(options.signal).toBe(controller.signal)
    expect(options.method).toBeUndefined()
  })

  it('creates an upload ticket with the reference metadata and a key', async () => {
    fetchMock.mockResolvedValueOnce(TICKET)

    await useStoryApi().createUploadTicket({
      fileName: 'actor.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })

    const { url, options } = lastFetchCall()

    expect(url).toBe('/api/story/uploads')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      fileName: 'actor.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': expect.any(String),
    })
  })

  it('uploads the reference with a direct PUT and no credentials', async () => {
    globalFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))
    const controller = new AbortController()
    const file = new File([new Uint8Array([1, 2, 3])], 'actor.webp', { type: 'image/webp' })

    await useStoryApi().uploadReference(TICKET, file, controller.signal)

    const [url, options] = globalFetch.mock.calls[0] as [string, RequestInit]

    expect(url).toBe(TICKET.uploadUrl)
    expect(options).toMatchObject({
      method: 'PUT',
      headers: TICKET.uploadHeaders,
      body: file,
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    })
    expect(JSON.stringify(options)).not.toContain('Authorization')
  })

  it('calls the command routes with the exact paths', async () => {
    fetchMock.mockResolvedValue({})

    await useStoryApi().updateKeyframe('story-1', 'scene/2', { visualPrompt: 'Un prompt' })
    const keyframe = lastFetchCall()

    await useStoryApi().approve('story-1')
    const approve = lastFetchCall()

    await useStoryApi().retryVideo('story-1', 'scene-2')
    const retry = lastFetchCall()

    await useStoryApi().assemble('story-1')
    const assemble = lastFetchCall()

    await useStoryApi().retryQc('story-1')
    const retryQc = lastFetchCall()

    await useStoryApi().approveQc('story-1')
    const approveQc = lastFetchCall()

    await useStoryApi().recoverScene('story-1', 'scene-3')
    const recover = lastFetchCall()

    await useStoryApi().cancel('story-1')
    const cancel = lastFetchCall()

    expect(keyframe.url).toBe('/api/story/story-1/beats/scene%2F2/keyframe')
    expect(keyframe.options).toMatchObject({
      method: 'POST',
      body: { visualPrompt: 'Un prompt' },
    })
    expect(approve.url).toBe('/api/story/story-1/approve')
    expect(approve.options).toEqual({ method: 'POST' })
    expect(retry.url).toBe('/api/story/story-1/beats/scene-2/retry')
    expect(retry.options).toEqual({ method: 'POST' })
    expect(assemble.url).toBe('/api/story/story-1/assemble')
    expect(retryQc.url).toBe('/api/story/story-1/qc/retry')
    expect(retryQc.options).toEqual({ method: 'POST' })
    expect(approveQc.url).toBe('/api/story/story-1/qc/approve')
    expect(approveQc.options).toMatchObject({
      method: 'POST',
      body: { confirm: true },
    })
    expect(recover.url).toBe('/api/story/story-1/beats/scene-3/recover')
    expect(recover.options).toEqual({ method: 'POST' })
    expect(cancel.url).toBe('/api/story/story-1/cancel')
  })
})

describe('useStoryApi error parsing', () => {
  it('maps a structured API error preserving the status and retryAfter', async () => {
    fetchMock.mockRejectedValueOnce({
      status: 429,
      data: {
        error: {
          code: 'rate-limited',
          message: 'Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.',
          retryable: true,
          retryAfterSeconds: 30,
        },
      },
    })

    try {
      await useStoryApi().getStory('story-1')
      throw new Error('expected a failure')
    } catch (error) {
      expect(error).toBeInstanceOf(StoryApiClientError)
      expect(error).toMatchObject({
        code: 'rate-limited',
        message: 'Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.',
        retryable: true,
        retryAfterSeconds: 30,
        status: 429,
      })
    }
  })

  it('maps a network failure to a retryable internal error', () => {
    const error = toStoryApiClientError(new TypeError('fetch failed'))

    expect(error).toMatchObject({
      code: 'internal-error',
      message: 'Algo salió mal. Inténtalo de nuevo.',
      retryable: true,
      status: null,
    })
  })

  it('returns the same client error unchanged', () => {
    const original = new StoryApiClientError({
      code: 'story-expired',
      message: 'Esta historia ya no está disponible. Empieza de nuevo.',
      retryable: false,
    }, { status: 410 })

    expect(toStoryApiClientError(original)).toBe(original)
  })

  it.each([
    [413, 'reference-too-large', 'La imagen supera el máximo de 8 MB.'],
    [415, 'unsupported-reference-type', 'Formato no admitido. Usa PNG, JPG o WebP.'],
    [403, 'invalid-reference', 'La imagen de referencia no es válida.'],
    [500, 'internal-error', 'No se pudo subir la imagen. Inténtalo de nuevo.'],
  ])('maps upload status %i to %s', async (status, code, message) => {
    globalFetch.mockResolvedValueOnce(new Response(null, { status }))

    try {
      await useStoryApi().uploadReference(TICKET, new File(['x'], 'a.webp', { type: 'image/webp' }))
      throw new Error('expected a failure')
    } catch (error) {
      expect(error).toBeInstanceOf(StoryApiClientError)
      expect(error).toMatchObject({ code, message, status })
    }
  })

  it('maps a network upload failure to a retryable internal error', async () => {
    globalFetch.mockRejectedValueOnce(new TypeError('network down'))

    try {
      await useStoryApi().uploadReference(TICKET, new File(['x'], 'a.webp', { type: 'image/webp' }))
      throw new Error('expected a failure')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'internal-error',
        message: 'No se pudo subir la imagen. Inténtalo de nuevo.',
        retryable: true,
      })
    }
  })

  it('does not swallow an abort during the PUT', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    globalFetch.mockRejectedValueOnce(abort)
    const controller = new AbortController()
    controller.abort()

    await expect(useStoryApi().uploadReference(
      TICKET,
      new File(['x'], 'a.webp', { type: 'image/webp' }),
      controller.signal,
    )).rejects.toBe(abort)
  })

})
