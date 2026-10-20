import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useComposer, type UseComposerReturn } from '~/composables/useComposer'
import {
  ComposerApiClientError,
  type ComposerApi,
} from '~/composables/useComposerApi'
import type {
  ComposerJob,
  ComposerReference,
} from '~/models/composer'

type QueuedJob = Extract<ComposerJob, { status: 'queued' }>
type RunningJob = Extract<ComposerJob, { status: 'running' }>
type SucceededJob = Extract<ComposerJob, { status: 'succeeded' }>
type FailedJob = Extract<ComposerJob, { status: 'failed' }>

const REFERENCE: ComposerReference = {
  id: 'ref-1',
  fileName: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 1_024,
  fileUrl: 'https://v3.fal.media/files/test/foto.png',
  previewUrl: 'blob:foto',
  width: null,
  height: null,
  expiresAt: '2030-01-01T00:00:00.000Z',
}

function baseJob() {
  return {
    id: 'v1.fake.payload' as const,
    preset: 'fast' as const,
    modelId: 'minimax-hailuo-02' as const,
    durationSeconds: 6 as const,
    posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    createdAt: '2026-10-21T18:00:00.000Z',
    expiresAt: '2026-10-21T19:00:00.000Z',
    pollAfterMs: 2_000,
  }
}

function queuedJob(overrides: Partial<QueuedJob> = {}): QueuedJob {
  return {
    ...baseJob(),
    status: 'queued',
    stage: 'queued',
    queuePosition: 3,
    ...overrides,
  }
}

function runningJob(overrides: Partial<RunningJob> = {}): RunningJob {
  return {
    ...baseJob(),
    status: 'running',
    stage: 'video',
    queuePosition: null,
    ...overrides,
  }
}

function succeededJob(overrides: Partial<SucceededJob> = {}): SucceededJob {
  return {
    ...baseJob(),
    status: 'succeeded',
    stage: 'finalizing',
    output: {
      videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      posterUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      width: null,
      height: null,
      durationSeconds: 6,
      modelId: 'minimax-hailuo-02',
      expiresAt: '2026-10-21T19:00:00.000Z',
    },
    ...overrides,
  }
}

function failedJob(error: FailedJob['error'], overrides: Partial<FailedJob> = {}): FailedJob {
  return {
    ...baseJob(),
    status: 'failed',
    stage: 'video',
    error,
    ...overrides,
  }
}

function cancelledJob(): Extract<ComposerJob, { status: 'cancelled' }> {
  return {
    ...baseJob(),
    status: 'cancelled',
    stage: 'queued',
  }
}

function createApi(overrides: Partial<ComposerApi> = {}) {
  const generate = vi.fn(async () => queuedJob())
  const getJob = vi.fn(async () => queuedJob())
  const cancelJob = vi.fn(async () => cancelledJob())
  const api = {
    createUploadTicket: vi.fn(),
    uploadReference: vi.fn(),
    generate,
    getJob,
    cancelJob,
    ...overrides,
  } as unknown as ComposerApi

  return {
    api,
    generate: api.generate as ReturnType<typeof vi.fn>,
    getJob: api.getJob as ReturnType<typeof vi.fn>,
    cancelJob: api.cancelJob as ReturnType<typeof vi.fn>,
  }
}

async function setupComposer(
  api: ComposerApi,
  options: {
    references?: Ref<ComposerReference | null>
    onReferenceExpired?: () => void
  } = {},
) {
  const references = options.references ?? ref<ComposerReference | null>(null)
  let composer!: UseComposerReturn

  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        composer = useComposer({
          references,
          api,
          ...(options.onReferenceExpired ? { onReferenceExpired: options.onReferenceExpired } : {}),
        })
        return () => h('div')
      },
    }),
  )

  return { composer, references, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useComposer initial state and validation', () => {
  it('starts idle with the fast preset and 6 seconds', async () => {
    const { api } = createApi()
    const { composer } = await setupComposer(api)

    expect(composer.prompt.value).toBe('')
    expect(composer.preset.value).toBe('fast')
    expect(composer.durationSeconds.value).toBe(6)
    expect(composer.generation.value).toEqual({ status: 'idle' })
    expect(composer.step.value).toBe('input')
    expect(composer.isGenerating.value).toBe(false)
    expect(composer.issues.value).toEqual([])
    expect(composer.statusMessage.value).toBe('')
  })

  it('rejects an empty prompt without calling the API', async () => {
    const { api, generate } = createApi()
    const { composer } = await setupComposer(api)

    await composer.generate()

    expect(composer.issues.value).toEqual([
      {
        code: 'prompt-required',
        field: 'prompt',
        message: 'Escribe una idea para generar tu short.',
      },
    ])
    expect(composer.generation.value).toEqual({ status: 'idle' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('rejects a prompt over 280 characters and accepts exactly 280', async () => {
    const { api, generate } = createApi()
    const { composer } = await setupComposer(api)

    composer.prompt.value = 'a'.repeat(281)
    await nextTick()
    await composer.generate()
    expect(composer.issues.value[0]?.code).toBe('prompt-too-long')
    expect(generate).not.toHaveBeenCalled()

    composer.prompt.value = 'a'.repeat(280)
    await nextTick()
    await composer.generate()
    expect(composer.generation.value).toMatchObject({
      status: 'queued',
      attempt: 1,
    })
  })

  it('clears issues when the prompt changes', async () => {
    const { api } = createApi()
    const { composer } = await setupComposer(api)

    await composer.generate()
    expect(composer.issues.value).toHaveLength(1)

    composer.prompt.value = 'Una idea'
    await nextTick()
    expect(composer.issues.value).toEqual([])
  })

  it('adjusts an invalid duration when the preset changes', async () => {
    const { api } = createApi()
    const { composer } = await setupComposer(api)

    expect(composer.durationSeconds.value).toBe(6)
    composer.preset.value = 'quality'
    await nextTick()
    expect(composer.durationSeconds.value).toBe(5)

    composer.durationSeconds.value = 10
    composer.preset.value = 'fast'
    await nextTick()
    expect(composer.durationSeconds.value).toBe(10)
  })
})

describe('useComposer generation and polling', () => {
  it('submits a valid request and transitions to queued', async () => {
    const { api, generate } = createApi()
    const { composer } = await setupComposer(api)
    composer.prompt.value = '  Un short sobre luz natural  '

    await composer.generate()

    expect(generate).toHaveBeenCalledWith({
      prompt: 'Un short sobre luz natural',
      preset: 'fast',
      durationSeconds: 6,
      referenceUrl: null,
    }, expect.any(AbortSignal))
    expect(composer.generation.value).toEqual({
      status: 'queued',
      job: queuedJob(),
      attempt: 1,
    })
    expect(composer.step.value).toBe('generating')
    expect(composer.isGenerating.value).toBe(true)
    expect(composer.statusMessage.value).toBe('En cola')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('sends the reference fileUrl when a reference exists', async () => {
    const { api, generate } = createApi()
    const references = ref<ComposerReference | null>(REFERENCE)
    const { composer } = await setupComposer(api, { references })
    composer.prompt.value = 'Idea con imagen'

    await composer.generate()

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ referenceUrl: REFERENCE.fileUrl }),
      expect.any(AbortSignal),
    )
  })

  it('polls queued -> running -> ready and focuses the result state', async () => {
    const { api, getJob } = createApi()
    getJob
      .mockResolvedValueOnce(runningJob())
      .mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    expect(composer.statusMessage.value).toBe('En cola')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value).toMatchObject({
      status: 'running',
      job: runningJob(),
      attempt: 1,
    })
    expect(composer.statusMessage.value).toBe('Generando el vídeo')
    expect(composer.step.value).toBe('generating')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value).toMatchObject({
      status: 'ready',
      job: succeededJob(),
      attempt: 1,
    })
    expect(composer.statusMessage.value).toBe('Vídeo listo.')
    expect(composer.step.value).toBe('preview')
    expect(composer.isGenerating.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clamps short poll intervals to at least one second', async () => {
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(runningJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'
    ;(api.generate as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      queuedJob({ pollAfterMs: 200 }),
    )

    await composer.generate()
    await vi.advanceTimersByTimeAsync(999)
    expect(getJob).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(getJob).toHaveBeenCalledTimes(1)
  })

  it('does not overlap polls', async () => {
    const { api, getJob } = createApi()
    let resolvePoll!: (value: RunningJob) => void
    getJob.mockReturnValueOnce(new Promise<RunningJob>((resolve) => {
      resolvePoll = resolve
    }))
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(getJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(getJob).toHaveBeenCalledTimes(1)

    resolvePoll(runningJob())
    await vi.advanceTimersByTimeAsync(0)
    expect(composer.generation.value.status).toBe('running')
  })

  it('retries network polling failures with backoff and surfaces a retryable error after three', async () => {
    const { api, getJob } = createApi()
    getJob
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(getJob).toHaveBeenCalledTimes(1)
    expect(composer.generation.value.status).toBe('queued')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(getJob).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(getJob).toHaveBeenCalledTimes(3)
    expect(composer.generation.value).toMatchObject({
      status: 'error',
      phase: 'poll',
      error: { retryable: true },
      jobId: queuedJob().id,
      posterUrl: queuedJob().posterUrl,
    })
  })

  it('respects Retry-After for polling rate limits without an error', async () => {
    const { api, getJob } = createApi()
    getJob
      .mockRejectedValueOnce(new ComposerApiClientError({
        code: 'rate-limited',
        message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
        retryable: true,
      }, { retryAfterSeconds: 2, status: 429 }))
      .mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value.status).toBe('queued')
    expect(getJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_999)
    expect(getJob).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(getJob).toHaveBeenCalledTimes(2)
    expect(composer.generation.value.status).toBe('ready')
  })

  it('maps job-not-found and job-expired to a terminal poll error', async () => {
    for (const code of ['job-not-found', 'job-expired'] as const) {
      const { api, getJob } = createApi()
      getJob.mockRejectedValueOnce(new ComposerApiClientError({
        code,
        message: 'Esta generación ya no está disponible. Empieza de nuevo.',
        retryable: false,
      }, { status: code === 'job-expired' ? 410 : 404 }))
      const { composer } = await setupComposer(api)
      composer.prompt.value = 'Idea'

      await composer.generate()
      await vi.advanceTimersByTimeAsync(2_000)

      expect(composer.generation.value).toMatchObject({
        status: 'error',
        phase: 'poll',
        error: { code, retryable: false },
        jobId: queuedJob().id,
      })
    }
  })

  it('maps a failed job to a video error with the poster', async () => {
    const { api, getJob } = createApi()
    const error = {
      code: 'provider-error' as const,
      message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    }
    getJob.mockResolvedValueOnce(failedJob(error))
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(composer.generation.value).toEqual({
      status: 'error',
      phase: 'video',
      error,
      jobId: failedJob(error).id,
      posterUrl: failedJob(error).posterUrl,
      attempt: 1,
    })
  })

  it('maps a cancelled job from polling to cancelled', async () => {
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(cancelledJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(composer.generation.value).toEqual({
      status: 'cancelled',
      jobId: cancelledJob().id,
      attempt: 1,
    })
  })
})

describe('useComposer cancel, retry, regenerate and edit', () => {
  it('cancels a queued job through the API and keeps the draft', async () => {
    const { api, cancelJob } = createApi()
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Borrador conservado'

    await composer.generate()
    await composer.cancel()

    expect(cancelJob).toHaveBeenCalledWith(queuedJob().id, expect.any(AbortSignal))
    expect(composer.generation.value).toEqual({
      status: 'cancelled',
      jobId: queuedJob().id,
      attempt: 1,
    })
    expect(composer.prompt.value).toBe('Borrador conservado')
    expect(composer.statusMessage.value).toBe('Generación cancelada.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts the generate request when cancelling while submitting', async () => {
    let resolveGenerate!: (value: QueuedJob) => void
    let receivedSignal: AbortSignal | undefined
    const { api } = createApi({
      generate: vi.fn((_request, signal?: AbortSignal) => {
        receivedSignal = signal
        return new Promise<QueuedJob>((resolve) => {
          resolveGenerate = resolve
        })
      }),
    })
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    const generating = composer.generate()
    await Promise.resolve()
    expect(composer.generation.value).toMatchObject({ status: 'submitting', attempt: 1 })

    await composer.cancel()

    expect(receivedSignal?.aborted).toBe(true)
    expect(composer.generation.value).toEqual({
      status: 'cancelled',
      jobId: null,
      attempt: 1,
    })

    resolveGenerate(queuedJob())
    await generating
    expect(composer.generation.value.status).toBe('cancelled')
  })

  it('surfaces a cancel failure as a retryable poll error without losing the job', async () => {
    const failure = new ComposerApiClientError({
      code: 'cancel-failed',
      message: 'No se pudo cancelar la generación. Inténtalo de nuevo.',
      retryable: true,
    })
    const { api, cancelJob } = createApi()
    cancelJob.mockRejectedValueOnce(failure)
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await composer.cancel()

    expect(composer.generation.value).toMatchObject({
      status: 'error',
      phase: 'poll',
      jobId: queuedJob().id,
      posterUrl: queuedJob().posterUrl,
      error: { code: 'cancel-failed', retryable: true },
    })
  })

  it('ignores cancel in idle, ready and error states', async () => {
    const { api, cancelJob } = createApi()
    const { composer } = await setupComposer(api)

    await composer.cancel()
    expect(cancelJob).not.toHaveBeenCalled()
    expect(composer.generation.value.status).toBe('idle')
  })

  it('reuses the same job when retrying after a poll error', async () => {
    const { api, getJob } = createApi()
    getJob
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(composer.generation.value.status).toBe('error')

    await composer.retry()
    expect(composer.generation.value).toMatchObject({
      status: 'queued',
      job: queuedJob(),
      attempt: 1,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(composer.generation.value.status).toBe('ready')
    expect(getJob).toHaveBeenCalledTimes(4)
  })

  it('creates a new job with attempt + 1 when retrying a retryable video error', async () => {
    const { api, getJob, generate } = createApi()
    getJob.mockResolvedValueOnce(failedJob({
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    }))
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value.status).toBe('error')

    await composer.retry()

    expect(generate).toHaveBeenCalledTimes(2)
    expect(composer.generation.value).toMatchObject({
      status: 'queued',
      attempt: 2,
    })
  })

  it('does not retry a non-retryable keyframe error', async () => {
    const { api, generate } = createApi()
    generate.mockRejectedValueOnce(new ComposerApiClientError({
      code: 'content-blocked',
      message: 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
      retryable: false,
    }))
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    expect(composer.generation.value).toMatchObject({
      status: 'error',
      phase: 'keyframe',
      error: { code: 'content-blocked', retryable: false },
    })

    await composer.retry()
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('regenerates from ready with a new attempt', async () => {
    const { api, getJob, generate } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Misma idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value.status).toBe('ready')

    await composer.regenerate()

    expect(generate).toHaveBeenCalledTimes(2)
    expect(composer.generation.value).toMatchObject({
      status: 'queued',
      attempt: 2,
    })
  })

  it('ignores regenerate unless ready', async () => {
    const { api, generate } = createApi()
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.regenerate()
    expect(generate).not.toHaveBeenCalled()

    await composer.generate()
    await composer.regenerate()
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('edits back to idle preserving the draft and keeping the reference', async () => {
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const references = ref<ComposerReference | null>(REFERENCE)
    const { composer } = await setupComposer(api, { references })
    composer.prompt.value = 'Idea editable'
    composer.preset.value = 'quality'
    composer.durationSeconds.value = 10

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(composer.generation.value.status).toBe('ready')

    composer.edit()

    expect(composer.generation.value).toEqual({ status: 'idle' })
    expect(composer.prompt.value).toBe('Idea editable')
    expect(composer.preset.value).toBe('quality')
    expect(composer.durationSeconds.value).toBe(10)
    expect(references.value).toEqual(REFERENCE)
  })

  it('clears an expired reference before generating and calls the expiry hook', async () => {
    const onReferenceExpired = vi.fn()
    const expired = { ...REFERENCE, expiresAt: '2020-01-01T00:00:00.000Z' }
    const references = ref<ComposerReference | null>(expired)
    const { api, generate } = createApi()
    const { composer } = await setupComposer(api, {
      references,
      onReferenceExpired,
    })
    composer.prompt.value = 'Idea'

    await composer.generate()

    expect(onReferenceExpired).toHaveBeenCalledTimes(1)
    expect(generate).not.toHaveBeenCalled()
    expect(composer.generation.value).toEqual({
      status: 'error',
      phase: 'keyframe',
      error: {
        code: 'invalid-reference',
        message: 'La subida ha caducado. Vuelve a seleccionar la imagen.',
        retryable: false,
      },
      jobId: null,
      posterUrl: null,
      attempt: 0,
    })
  })

  it('calls the expiry hook when editing with an expired reference', async () => {
    const onReferenceExpired = vi.fn()
    const references = ref<ComposerReference | null>(REFERENCE)
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api, {
      references,
      onReferenceExpired,
    })
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)
    references.value = { ...REFERENCE, expiresAt: '2020-01-01T00:00:00.000Z' }
    composer.edit()

    expect(onReferenceExpired).toHaveBeenCalledTimes(1)
  })

  it('ignores double generates while a generation is active', async () => {
    let resolveGenerate!: (value: QueuedJob) => void
    const { api, generate } = createApi({
      generate: vi.fn(() => new Promise<QueuedJob>((resolve) => {
        resolveGenerate = resolve
      })),
    })
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    const first = composer.generate()
    await Promise.resolve()
    await composer.generate()
    await composer.generate()
    expect(generate).toHaveBeenCalledTimes(1)

    resolveGenerate(queuedJob())
    await first
    await composer.generate()
    expect(generate).toHaveBeenCalledTimes(1)
  })
})

describe('useComposer visibility, offline and cleanup', () => {
  it('pauses polling offline and resumes immediately when online', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get')
    online.mockReturnValue(false)
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    expect(vi.getTimerCount()).toBe(0)
    expect(composer.generation.value.status).toBe('queued')

    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(getJob).toHaveBeenCalledTimes(1)
    expect(composer.generation.value.status).toBe('ready')
  })

  it('pauses polling when the document is hidden and resumes on visibilitychange', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get')
    hidden.mockReturnValue(true)
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    expect(vi.getTimerCount()).toBe(0)

    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(getJob).toHaveBeenCalledTimes(1)
    expect(composer.generation.value.status).toBe('ready')
  })

  it('aborts polling and clears timers on unmount', async () => {
    const { api, getJob } = createApi()
    const { composer, wrapper } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(getJob).not.toHaveBeenCalled()
  })

  it('does not persist any draft or result in web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { api, getJob } = createApi()
    getJob.mockResolvedValueOnce(succeededJob())
    const { composer } = await setupComposer(api)
    composer.prompt.value = 'Idea'

    await composer.generate()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(setItem).not.toHaveBeenCalled()
  })
})
