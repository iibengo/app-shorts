import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  useComposerReferences,
  type UseComposerReferencesReturn,
} from '~/composables/useComposerReferences'
import {
  ComposerApiClientError,
  type ComposerApi,
} from '~/composables/useComposerApi'
import type { ComposerUploadTicket } from '~/models/composer'

const TICKET: ComposerUploadTicket = {
  uploadUrl: 'https://v3.fal.media/files/test/upload?signature=test',
  fileUrl: 'https://v3.fal.media/files/test/composer-ref.webp',
  expiresAt: '2030-01-01T00:00:00.000Z',
  uploadHeaders: { 'Content-Type': 'image/png' },
}

function makeFile(name: string, type: string, size = 1_024): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

function createApi(overrides: Partial<ComposerApi> = {}) {
  const createUploadTicket = vi.fn(async () => TICKET)
  const uploadReference = vi.fn(async () => undefined)
  const api = {
    createUploadTicket,
    uploadReference,
    generate: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
    ...overrides,
  } as unknown as ComposerApi

  return { api, createUploadTicket, uploadReference }
}

async function setupReferences(api: ComposerApi) {
  let composable!: UseComposerReferencesReturn
  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        composable = useComposerReferences({ api })
        return () => h('div')
      },
    }),
  )

  return { refs: composable, wrapper }
}

const createObjectURL = vi.fn((file: File) => `blob:mock/${file.name}`)
const revokeObjectURL = vi.fn()

beforeEach(() => {
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useComposerReferences initial state and validation', () => {
  it('starts empty and idle', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    expect(refs.reference.value).toBeNull()
    expect(refs.uploadState.value).toBe('idle')
    expect(refs.issues.value).toEqual([])
  })

  it('rejects an empty file before requesting a ticket', async () => {
    const { api, createUploadTicket } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('vacio.png', 'image/png', 0))

    expect(refs.issues.value).toEqual([
      {
        code: 'reference-empty',
        field: 'reference',
        message: 'El archivo está vacío.',
      },
    ])
    expect(createUploadTicket).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects unsupported types without guessing from the extension', async () => {
    const { api, createUploadTicket } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('foto.png', 'text/plain', 10))

    expect(refs.issues.value).toEqual([
      {
        code: 'unsupported-reference-type',
        field: 'reference',
        message: 'Formato no admitido. Usa PNG, JPG o WebP.',
      },
    ])
    expect(createUploadTicket).not.toHaveBeenCalled()
  })

  it('accepts exactly 8 MiB and rejects one byte more without replacing a valid reference', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('limite.png', 'image/png', 8_388_608))
    expect(refs.reference.value?.fileName).toBe('limite.png')

    await refs.selectFile(makeFile('grande.png', 'image/png', 8_388_609))

    expect(refs.issues.value).toEqual([
      {
        code: 'reference-too-large',
        field: 'reference',
        message: 'La imagen supera el máximo de 8 MB.',
      },
    ])
    expect(refs.reference.value?.fileName).toBe('limite.png')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('normalises MIME parameters before requesting the ticket', async () => {
    const { api, createUploadTicket } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('foto.png', 'image/png; charset=binary', 10))

    expect(createUploadTicket).toHaveBeenCalledWith({
      fileName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 10,
    })
  })
})

describe('useComposerReferences signed upload flow', () => {
  it('requests a ticket, performs the PUT and exposes only model-safe fields', async () => {
    const { api, createUploadTicket, uploadReference } = createApi()
    const { refs } = await setupReferences(api)
    const file = makeFile('look.webp', 'image/webp', 482_133)

    await refs.selectFile(file)

    expect(createUploadTicket).toHaveBeenCalledWith({
      fileName: 'look.webp',
      contentType: 'image/webp',
      sizeBytes: 482_133,
    })
    expect(uploadReference).toHaveBeenCalledWith(
      TICKET,
      file,
      expect.any(AbortSignal),
    )
    expect(refs.uploadState.value).toBe('idle')
    expect(refs.reference.value).toMatchObject({
      id: 'ref-1',
      fileName: 'look.webp',
      mimeType: 'image/webp',
      sizeBytes: 482_133,
      fileUrl: TICKET.fileUrl,
      previewUrl: 'blob:mock/look.webp',
      width: null,
      height: null,
      expiresAt: TICKET.expiresAt,
    })
    expect(Object.keys(refs.reference.value!)).not.toContain('file')
    expect(JSON.stringify(refs.reference.value)).not.toContain('File')
  })

  it('opens a new ticket when the upload URL returns 403', async () => {
    const firstTicket = { ...TICKET, fileUrl: 'https://v3.fal.media/files/test/first.webp' }
    const secondTicket = { ...TICKET, fileUrl: 'https://v3.fal.media/files/test/second.webp' }
    const { api, createUploadTicket, uploadReference } = createApi()
    createUploadTicket
      .mockResolvedValueOnce(firstTicket)
      .mockResolvedValueOnce(secondTicket)
    uploadReference
      .mockRejectedValueOnce(new ComposerApiClientError({
        code: 'invalid-reference',
        message: 'La imagen de referencia no es válida.',
        retryable: false,
      }, { status: 403 }))
      .mockResolvedValueOnce(undefined)
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))

    expect(createUploadTicket).toHaveBeenCalledTimes(2)
    expect(uploadReference).toHaveBeenCalledTimes(2)
    expect(refs.reference.value?.fileUrl).toBe(secondTicket.fileUrl)
  })

  it('renews an already expired ticket before retrying', async () => {
    const expired = { ...TICKET, expiresAt: '2020-01-01T00:00:00.000Z' }
    const { api, createUploadTicket, uploadReference } = createApi()
    createUploadTicket
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(TICKET)
    uploadReference
      .mockRejectedValueOnce(new ComposerApiClientError({
        code: 'internal-error',
        message: 'No se pudo iniciar la generación. Inténtalo de nuevo.',
        retryable: true,
      }))
      .mockResolvedValueOnce(undefined)
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))

    expect(createUploadTicket).toHaveBeenCalledTimes(2)
    expect(refs.reference.value?.expiresAt).toBe(TICKET.expiresAt)
  })

  it('retries once with the same ticket before surfacing an upload error', async () => {
    const failure = new ComposerApiClientError({
      code: 'internal-error',
      message: 'No se pudo iniciar la generación. Inténtalo de nuevo.',
      retryable: true,
    })
    const { api, createUploadTicket, uploadReference } = createApi()
    uploadReference
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))

    expect(createUploadTicket).toHaveBeenCalledTimes(1)
    expect(uploadReference).toHaveBeenCalledTimes(2)
    expect(refs.uploadState.value).toBe('error')
    expect(refs.reference.value).toBeNull()
  })

  it('retries the upload from the same retained File after a failure', async () => {
    const failure = new ComposerApiClientError({
      code: 'internal-error',
      message: 'No se pudo iniciar la generación. Inténtalo de nuevo.',
      retryable: true,
    })
    const { api, uploadReference } = createApi()
    uploadReference
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))
    expect(refs.uploadState.value).toBe('error')

    await refs.retryUpload()

    expect(refs.uploadState.value).toBe('idle')
    expect(refs.reference.value?.fileName).toBe('a.png')
    expect(uploadReference).toHaveBeenCalledTimes(3)
  })

  it('does nothing on retry without a pending File or while uploading', async () => {
    const { api, uploadReference } = createApi()
    const { refs } = await setupReferences(api)

    await refs.retryUpload()
    expect(uploadReference).not.toHaveBeenCalled()

    const pending = new Promise<void>(() => {})
    uploadReference.mockReturnValueOnce(pending)
    void refs.selectFile(makeFile('a.png', 'image/png'))

    expect(refs.uploadState.value).toBe('uploading')
    await refs.retryUpload()
    expect(uploadReference).toHaveBeenCalledTimes(1)
  })
})

describe('useComposerReferences single-reference lifecycle', () => {
  it('replaces the previous reference with a new id and revokes its ObjectURL', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))
    const firstUrl = refs.reference.value?.previewUrl

    await refs.selectFile(makeFile('b.png', 'image/png'))

    expect(refs.reference.value?.id).toBe('ref-2')
    expect(refs.reference.value?.fileName).toBe('b.png')
    expect(revokeObjectURL).toHaveBeenCalledWith(firstUrl)
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('does not reuse ids after removal', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))
    expect(refs.reference.value?.id).toBe('ref-1')

    refs.removeReference()
    await refs.selectFile(makeFile('b.png', 'image/png'))
    expect(refs.reference.value?.id).toBe('ref-2')
  })

  it('revokes the ObjectURL on remove and discards the file', async () => {
    const { api, uploadReference } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('a.png', 'image/png'))
    const url = refs.reference.value?.previewUrl

    refs.removeReference()

    expect(revokeObjectURL).toHaveBeenCalledWith(url)
    expect(refs.reference.value).toBeNull()
    expect(refs.uploadState.value).toBe('idle')
    expect(refs.issues.value).toEqual([])

    await refs.retryUpload()
    expect(uploadReference).toHaveBeenCalledTimes(1)
  })

  it('aborts the in-flight PUT and revokes the preview on remove', async () => {
    let receivedSignal: AbortSignal | undefined
    const { api } = createApi({
      uploadReference: vi.fn((_ticket, _file, signal?: AbortSignal) => {
        receivedSignal = signal
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    })
    const { refs } = await setupReferences(api)
    const selecting = refs.selectFile(makeFile('a.png', 'image/png'))

    await Promise.resolve()
    await Promise.resolve()

    expect(refs.uploadState.value).toBe('uploading')
    expect(receivedSignal?.aborted).toBe(false)

    refs.removeReference()
    await selecting

    expect(receivedSignal?.aborted).toBe(true)
    expect(refs.reference.value).toBeNull()
    expect(refs.uploadState.value).toBe('idle')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/a.png')
  })

  it('revokes the ObjectURL and aborts on unmount', async () => {
    let receivedSignal: AbortSignal | undefined
    const { api } = createApi({
      uploadReference: vi.fn((_ticket, _file, signal?: AbortSignal) => {
        receivedSignal = signal
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    })
    const { refs, wrapper } = await setupReferences(api)
    const selecting = refs.selectFile(makeFile('a.png', 'image/png'))
    await Promise.resolve()
    await Promise.resolve()

    wrapper.unmount()
    await selecting

    expect(receivedSignal?.aborted).toBe(true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/a.png')
  })

  it('keeps working without URL.createObjectURL', async () => {
    const original = URL.createObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: undefined,
    })
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    try {
      await refs.selectFile(makeFile('a.png', 'image/png'))
      expect(refs.reference.value?.previewUrl).toBeNull()
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: original,
      })
    }
  })

  it('ignores a missing or throwing revokeObjectURL', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)
    await refs.selectFile(makeFile('a.png', 'image/png'))

    const original = URL.revokeObjectURL
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(() => refs.removeReference()).not.toThrow()
    } finally {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: original,
      })
    }

    await refs.selectFile(makeFile('b.png', 'image/png'))
    vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => {
      throw new Error('cannot revoke')
    })
    expect(() => refs.removeReference()).not.toThrow()
  })

  it('clears issues on demand', async () => {
    const { api } = createApi()
    const { refs } = await setupReferences(api)

    await refs.selectFile(makeFile('raro.txt', 'text/plain', 10))
    expect(refs.issues.value).toHaveLength(1)

    refs.clearIssues()
    expect(refs.issues.value).toEqual([])
  })
})
