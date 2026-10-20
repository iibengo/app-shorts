import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  ComposerApiClientError,
  type ComposerApi,
} from '~/composables/useComposerApi'
import type { ComposerJob } from '~/models/composer'

const state = vi.hoisted(() => ({
  api: null as unknown,
}))

vi.mock('~/composables/useComposerApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/composables/useComposerApi')>()

  return {
    ...actual,
    useComposerApi: () => state.api,
  }
})

const { default: ComposerPage } = await import('~/pages/composer.vue')

type QueuedJob = Extract<ComposerJob, { status: 'queued' }>
type SucceededJob = Extract<ComposerJob, { status: 'succeeded' }>

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

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

function queuedJob(): QueuedJob {
  return { ...baseJob(), status: 'queued', stage: 'queued', queuePosition: null }
}

function succeededJob(): SucceededJob {
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
  }
}

function createApi(overrides: Partial<ComposerApi> = {}) {
  const api: ComposerApi = {
    createUploadTicket: vi.fn(),
    uploadReference: vi.fn(),
    generate: vi.fn(async () => queuedJob()),
    getJob: vi.fn(async () => succeededJob()),
    cancelJob: vi.fn(),
    ...overrides,
  }

  state.api = api

  return api
}

async function mountPage() {
  return mountSuspended(ComposerPage, { route: '/composer', attachTo: document.body })
}

async function submitPrompt(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  prompt: string,
) {
  await wrapper.get('[data-testid="composer-prompt-input"]').setValue(prompt)
  await wrapper.get('[data-testid="composer-form"]').trigger('submit')
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  createApi()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('composer page keyframe errors', () => {
  it('announces a retryable keyframe timeout, focuses Reintentar and recovers', async () => {
    const api = createApi({
      generate: vi.fn()
        .mockRejectedValueOnce(new ComposerApiClientError({
          code: 'keyframe-timeout',
          message: 'La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.',
          retryable: true,
        }, { status: 504 }))
        .mockResolvedValueOnce(queuedJob()),
    })
    const wrapper = await mountPage()

    await submitPrompt(wrapper, 'Idea que falla')

    const error = wrapper.get('[data-testid="composer-error"]')
    const retry = wrapper.get('[data-testid="composer-retry"]')

    expect(error.attributes('role')).toBe('alert')
    expect(normalize(error.get('p').text())).toBe(
      'La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.',
    )
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement).value,
    ).toBe('Idea que falla')
    expect(document.activeElement).toBe(retry.element)

    await retry.trigger('click')
    await nextTick()
    await nextTick()

    expect(api.generate).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )
  })

  it('offers Editar idea for content blocked errors without Reintentar', async () => {
    const api = createApi({
      generate: vi.fn().mockRejectedValueOnce(new ComposerApiClientError({
        code: 'content-blocked',
        message: 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
        retryable: false,
      }, { status: 422 })),
    })
    const wrapper = await mountPage()

    await submitPrompt(wrapper, 'Idea bloqueada')

    expect(normalize(wrapper.get('[data-testid="composer-error"]').text())).toContain(
      'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
    )
    expect(wrapper.find('[data-testid="composer-retry"]').exists()).toBe(false)

    const edit = wrapper.get('[data-testid="composer-edit"]')
    expect(document.activeElement).toBe(edit.element)

    await edit.trigger('click')
    await nextTick()

    expect(api.generate).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-prompt-input"]').element,
    )
  })

  it('surfaces rate limits with the remaining minutes', async () => {
    createApi({
      generate: vi.fn().mockRejectedValueOnce(new ComposerApiClientError({
        code: 'rate-limited',
        message: 'Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.',
        retryable: true,
      }, { retryAfterSeconds: 120, status: 429 })),
    })
    const wrapper = await mountPage()

    await submitPrompt(wrapper, 'Idea limitada')

    expect(normalize(wrapper.get('[data-testid="composer-error"]').text())).toContain(
      'Has alcanzado el límite de generaciones. Inténtalo de nuevo en 2 minutos.',
    )
    expect(wrapper.get('[data-testid="composer-retry"]').exists()).toBe(true)
  })
})

describe('composer page poll errors', () => {
  it('shows an expired job, keeps Editar idea and recovers the draft', async () => {
    createApi({
      getJob: vi.fn().mockRejectedValueOnce(new ComposerApiClientError({
        code: 'job-expired',
        message: 'Esta generación ya no está disponible. Empieza de nuevo.',
        retryable: false,
      }, { status: 410 })),
    })
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea caducada')
    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-error"]').text())).toContain(
      'Esta generación ya no está disponible. Empieza de nuevo.',
    )
    expect(wrapper.find('[data-testid="composer-retry"]').exists()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-edit"]').element,
    )

    await wrapper.get('[data-testid="composer-edit"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement).value,
    ).toBe('Idea caducada')
  })

  it('shows a retryable network polling error and preserves the job', async () => {
    createApi({
      getJob: vi.fn()
        .mockRejectedValueOnce(new TypeError('offline'))
        .mockRejectedValueOnce(new TypeError('offline'))
        .mockRejectedValueOnce(new TypeError('offline')),
    })
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea sin red')
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(3_000)
    await nextTick()
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-error"]').text())).toContain(
      'No se pudo iniciar la generación. Inténtalo de nuevo.',
    )
    expect(wrapper.get('[data-testid="composer-retry"]').exists()).toBe(true)
  })
})
