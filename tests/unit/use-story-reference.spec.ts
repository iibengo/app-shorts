import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useStoryReference } from '~/composables/useStoryReference'
import { StoryApiClientError, type StoryApi } from '~/composables/useStoryApi'
import type { StoryUploadTicket } from '~/models/story'

const TICKET: StoryUploadTicket = {
  uploadUrl: 'https://v3.fal.media/files/test/upload?signature=abc',
  fileUrl: 'https://v3.fal.media/files/test/story-ref.webp',
  expiresAt: '2026-10-21T19:00:00.000Z',
  uploadHeaders: { 'Content-Type': 'image/webp' },
}

function file(name = 'actor.webp', type = 'image/webp', size = 1_024): File {
  return new File([new Uint8Array(size)], name, { type })
}

function createApi(overrides: Partial<StoryApi> = {}) {
  const createUploadTicket = vi.fn(async () => TICKET)
  const uploadReference = vi.fn(async () => undefined)
  const api = {
    createStory: vi.fn(),
    getStory: vi.fn(),
    createUploadTicket,
    uploadReference,
    updateKeyframe: vi.fn(),
    approve: vi.fn(),
    retryVideo: vi.fn(),
    assemble: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  } as unknown as StoryApi

  return { api, createUploadTicket, uploadReference }
}

const objectUrls = new Map<File, string>()
let objectUrlCounter = 0

function installObjectUrl() {
  const create = vi.fn((value: Blob) => {
    const url = `blob:story-${++objectUrlCounter}`
    objectUrls.set(value as File, url)

    return url
  })
  const revoke = vi.fn()

  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true })

  return { create, revoke }
}

async function setup(api: StoryApi) {
  let composable!: ReturnType<typeof useStoryReference>

  const wrapper = await mountSuspended(defineComponent({
    setup() {
      composable = useStoryReference({ api })

      return () => h('div')
    },
  }))

  return { composable, wrapper }
}

let urls: ReturnType<typeof installObjectUrl>

beforeEach(() => {
  urls = installObjectUrl()
})

afterEach(() => {
  vi.restoreAllMocks()
  objectUrls.clear()
})

describe('useStoryReference validation', () => {
  it('starts empty and idle', async () => {
    const { api } = createApi()
    const { composable } = await setup(api)

    expect(composable.reference.value).toBeNull()
    expect(composable.uploadState.value).toBe('idle')
    expect(composable.issues.value).toEqual([])
  })

  it.each([
    [file('actor.gif', 'image/gif', 10), 'unsupported-reference-type'],
    [file('empty.webp', 'image/webp', 0), 'reference-empty'],
    [file('big.png', 'image/png', 8_388_609), 'reference-too-large'],
  ])('rejects an invalid file without requesting a ticket', async (value, code) => {
    const { api, createUploadTicket } = createApi()
    const { composable } = await setup(api)

    await composable.selectFile(value)

    expect(composable.issues.value[0]?.code).toBe(code)
    expect(composable.uploadState.value).toBe('idle')
    expect(createUploadTicket).not.toHaveBeenCalled()
  })

  it('accepts a file with a parameterized mime type', async () => {
    const { api, createUploadTicket } = createApi()
    const { composable } = await setup(api)

    await composable.selectFile(file('actor.webp', 'image/webp; charset=binary'))

    expect(createUploadTicket).toHaveBeenCalledWith({
      fileName: 'actor.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
    })
  })
})

describe('useStoryReference upload flow', () => {
  it('requests a ticket, uploads the file and exposes the reference', async () => {
    const { api, createUploadTicket, uploadReference } = createApi()
    const { composable } = await setup(api)
    const value = file()

    await composable.selectFile(value)

    expect(createUploadTicket).toHaveBeenCalledTimes(1)
    expect(uploadReference).toHaveBeenCalledWith(TICKET, value, expect.any(AbortSignal))
    expect(composable.reference.value).toEqual({
      fileName: 'actor.webp',
      contentType: 'image/webp',
      sizeBytes: 1_024,
      fileUrl: TICKET.fileUrl,
      expiresAt: TICKET.expiresAt,
    })
    expect(composable.uploadState.value).toBe('idle')
    expect(composable.issues.value).toEqual([])
    expect(urls.create).toHaveBeenCalledWith(value)
  })

  it('surfaces a retryable upload failure and retries the same file', async () => {
    const failure = new StoryApiClientError({
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo.',
      retryable: true,
    })
    const { api, createUploadTicket, uploadReference } = createApi()
    uploadReference
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const { composable } = await setup(api)

    await composable.selectFile(file())

    expect(composable.uploadState.value).toBe('error')
    expect(composable.issues.value).toEqual([{
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo.',
      retryable: true,
    }])
    expect(composable.reference.value).toBeNull()
    expect(createUploadTicket).toHaveBeenCalledTimes(1)

    await composable.retryUpload()

    expect(createUploadTicket).toHaveBeenCalledTimes(2)
    expect(composable.reference.value?.fileUrl).toBe(TICKET.fileUrl)
    expect(composable.uploadState.value).toBe('idle')
    expect(composable.issues.value).toEqual([])
  })

  it('does not retry without a pending file', async () => {
    const { api, createUploadTicket } = createApi()
    const { composable } = await setup(api)

    await composable.retryUpload()

    expect(createUploadTicket).not.toHaveBeenCalled()
  })

  it('ignores a new selection while an upload is in flight', async () => {
    let resolveTicket!: (ticket: StoryUploadTicket) => void
    const pending = new Promise<StoryUploadTicket>((resolve) => {
      resolveTicket = resolve
    })
    const { api, createUploadTicket } = createApi()
    createUploadTicket.mockReturnValueOnce(pending)
    const { composable } = await setup(api)

    const first = composable.selectFile(file('first.webp'))
    await composable.selectFile(file('second.webp'))

    expect(createUploadTicket).toHaveBeenCalledTimes(1)
    expect(composable.uploadState.value).toBe('uploading')

    resolveTicket(TICKET)
    await first
  })

  it('replaces the reference and revokes the previous object URL', async () => {
    const { api, createUploadTicket } = createApi()
    createUploadTicket
      .mockResolvedValueOnce(TICKET)
      .mockResolvedValueOnce({
        ...TICKET,
        fileUrl: 'https://v3.fal.media/files/test/second.webp',
      })
    const { composable } = await setup(api)
    const first = file('first.webp')
    const second = file('second.webp')

    await composable.selectFile(first)
    const firstUrl = objectUrls.get(first)
    await composable.selectFile(second)

    expect(composable.reference.value?.fileName).toBe('second.webp')
    expect(composable.reference.value?.fileUrl).toBe(
      'https://v3.fal.media/files/test/second.webp',
    )
    expect(urls.revoke).toHaveBeenCalledWith(firstUrl)
  })

  it('removes the reference and revokes the object URL', async () => {
    const { api } = createApi()
    const { composable } = await setup(api)
    const value = file()

    await composable.selectFile(value)
    const url = objectUrls.get(value)

    composable.removeReference()

    expect(composable.reference.value).toBeNull()
    expect(composable.uploadState.value).toBe('idle')
    expect(urls.revoke).toHaveBeenCalledWith(url)
  })

  it('clears issues without touching the reference', async () => {
    const { api } = createApi()
    const { composable } = await setup(api)

    await composable.selectFile(file('actor.gif', 'image/gif'))
    expect(composable.issues.value).toHaveLength(1)

    composable.clearIssues()

    expect(composable.issues.value).toEqual([])
  })

  it('aborts and revokes on unmount', async () => {
    let resolveTicket!: (ticket: StoryUploadTicket) => void
    const pending = new Promise<StoryUploadTicket>((resolve) => {
      resolveTicket = resolve
    })
    const { api, uploadReference } = createApi()
    api.createUploadTicket = vi.fn().mockReturnValueOnce(pending)
    const { composable, wrapper } = await setup(api)

    const selection = composable.selectFile(file())
    await Promise.resolve()
    wrapper.unmount()

    expect(objectUrls.size).toBe(1)
    expect(urls.revoke).toHaveBeenCalledTimes(1)

    resolveTicket(TICKET)
    await selection

    expect(uploadReference).toHaveBeenCalledTimes(1)
    expect((uploadReference.mock.calls[0]?.[2] as AbortSignal).aborted).toBe(true)
    expect(composable.reference.value).toBeNull()
  })
})
