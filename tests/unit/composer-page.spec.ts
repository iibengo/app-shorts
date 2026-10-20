import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import {
  ComposerApiClientError,
  type ComposerApi,
} from '~/composables/useComposerApi'
import type { ComposerJob, ComposerUploadTicket } from '~/models/composer'

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
type RunningJob = Extract<ComposerJob, { status: 'running' }>
type SucceededJob = Extract<ComposerJob, { status: 'succeeded' }>
type FailedJob = Extract<ComposerJob, { status: 'failed' }>

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const TICKET: ComposerUploadTicket = {
  uploadUrl: 'https://v3.fal.media/files/test/upload?signature=test',
  fileUrl: 'https://v3.fal.media/files/test/composer-ref.png',
  expiresAt: '2030-01-01T00:00:00.000Z',
  uploadHeaders: { 'Content-Type': 'image/png' },
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
  return { ...baseJob(), status: 'queued', stage: 'queued', queuePosition: 3, ...overrides }
}

function runningJob(overrides: Partial<RunningJob> = {}): RunningJob {
  return { ...baseJob(), status: 'running', stage: 'video', queuePosition: null, ...overrides }
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

function failedJob(): FailedJob {
  return {
    ...baseJob(),
    status: 'failed',
    stage: 'video',
    error: {
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    },
  }
}

function createApi(overrides: Partial<ComposerApi> = {}) {
  const api: ComposerApi = {
    createUploadTicket: vi.fn(async () => TICKET),
    uploadReference: vi.fn(async () => undefined),
    generate: vi.fn(async () => queuedJob()),
    getJob: vi.fn(async () => succeededJob()),
    cancelJob: vi.fn(async () => ({
      ...baseJob(),
      status: 'cancelled' as const,
      stage: 'queued' as const,
    })),
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
}

function makeFile(name: string, type: string, size = 1_024): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { configurable: true, value: size })
  return file
}

beforeEach(() => {
  createApi()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('composer page initial render', () => {
  it('renders the idle page with a single h1, stepper and complete form', async () => {
    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="composer-page"]').exists()).toBe(true)
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(normalize(wrapper.get('[data-testid="composer-h1"]').text())).toBe(
      'Crea un short con IA',
    )
    expect(normalize(wrapper.get('[data-testid="composer-intro"]').text())).toBe(
      'Describe una idea, añade una imagen de referencia opcional y genera un vídeo vertical de 9:16. La generación es real y consume créditos.',
    )
    expect(wrapper.get('[data-testid="composer-stepper"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-prompt-input"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-reference"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-generate"]').exists()).toBe(true)

    const currentStep = wrapper.findAll('[data-testid="composer-step"]')[0]
    expect(currentStep?.attributes('data-step')).toBe('input')
    expect(currentStep?.attributes('data-state')).toBe('current')

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-result"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-partial"]').exists()).toBe(false)
    expect(wrapper.findAll('video')).toHaveLength(0)
  })

  it('uses the fast preset and 6 seconds as defaults', async () => {
    const wrapper = await mountPage()

    expect(
      (wrapper.get('[data-testid="composer-preset-fast"]').element as HTMLInputElement).checked,
    ).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-settings-summary"]').get('span').text())).toBe(
      'Ajustes · 6 s',
    )

    const select = wrapper.get('[data-testid="composer-duration"]')
      .element as HTMLSelectElement
    expect(select.value).toBe('6')
    expect([...select.options].map((option) => option.value)).toEqual(['6', '10'])
  })

  it('renders the no-JS notice in the markup', async () => {
    const wrapper = await mountPage()
    const html = wrapper.html()

    expect(html).toContain('data-testid="composer-nojs-notice"')
    expect(html).toContain(
      'El estudio de creación necesita JavaScript para generar un vídeo con IA. Puedes volver al feed de prueba.',
    )
  })

  it('does not render publication, download or sharing actions', async () => {
    const wrapper = await mountPage()
    const text = normalize(wrapper.text())

    expect(text).not.toMatch(/\b(Publicar|Descargar|Compartir)\b/)
    expect(wrapper.findAll('a')).toHaveLength(1)
  })

  it('updates duration options and summary when switching to Calidad', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="composer-preset-quality"]').setValue(true)
    await nextTick()

    const select = wrapper.get('[data-testid="composer-duration"]')
      .element as HTMLSelectElement
    expect(select.value).toBe('5')
    expect([...select.options].map((option) => option.value)).toEqual(['5', '10'])
    expect(normalize(wrapper.get('[data-testid="composer-settings-summary"]').get('span').text())).toBe(
      'Ajustes · 5 s',
    )
  })

  it('allows choosing 10 seconds from Ajustes', async () => {
    const wrapper = await mountPage()
    const select = wrapper.get('[data-testid="composer-duration"]')

    await select.setValue('10')
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-settings-summary"]').get('span').text())).toBe(
      'Ajustes · 10 s',
    )
  })
})

describe('composer page prompt validation', () => {
  it('announces the required error, focuses the prompt and does not generate', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="composer-form"]').trigger('submit')
    await nextTick()

    const error = wrapper.get('[data-testid="composer-prompt-error"]')
    const textarea = wrapper.get('[data-testid="composer-prompt-input"]')

    expect(normalize(error.text())).toBe('Escribe una idea para generar tu short.')
    expect(error.attributes('role')).toBe('alert')
    expect(textarea.attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(textarea.element)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(state.api).toBeTruthy()
    expect((state.api as ComposerApi).generate).not.toHaveBeenCalled()
  })
})

describe('composer page generation flow', () => {
  it('shows the keyframe stage while submitting and focuses the progress heading', async () => {
    let resolveGenerate!: (value: QueuedJob) => void
    createApi({
      generate: vi.fn(() => new Promise<QueuedJob>((resolve) => {
        resolveGenerate = resolve
      })),
    })
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Un short sobre luz natural')

    expect(wrapper.find('[data-testid="composer-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Creando el fotograma base',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )

    resolveGenerate(queuedJob())
    await nextTick()
    await nextTick()
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'En cola',
    )
  })

  it('runs queued -> running -> result with a real video and focused heading', async () => {
    createApi({
      getJob: vi.fn()
        .mockResolvedValueOnce(runningJob())
        .mockResolvedValueOnce(succeededJob()),
    })
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Un short sobre luz natural')

    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Generando el vídeo',
    )

    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-result"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="composer-result-badge"]').text()).toBe('IA')
    expect(normalize(wrapper.get('[data-testid="composer-result-heading"]').text())).toBe(
      'Tu short',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-model"]').text())).toBe(
      'MiniMax Hailuo 02',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-duration"]').text())).toBe('0:06')
    expect(normalize(wrapper.get('[data-testid="composer-result-reference"]').text())).toBe(
      'Sin referencia',
    )
    expect(normalize(wrapper.get('[data-testid="composer-result-attempt"]').text())).toBe(
      'Intento 1',
    )
    expect(normalize(wrapper.get('[data-testid="composer-status"]').text())).toBe('Vídeo listo.')
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-result-heading"]').element,
    )

    const video = wrapper.get('[data-testid="composer-video"]')
    expect(video.attributes('controls')).toBeDefined()
    expect(video.attributes('playsinline')).toBeDefined()
    expect(video.attributes('autoplay')).toBeUndefined()
    expect(video.attributes('loop')).toBeUndefined()
    expect(video.attributes('poster')).toBe(succeededJob().output.posterUrl)
    expect(wrapper.find('[data-testid="composer-regenerate"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="composer-edit"]').exists()).toBe(true)
  })

  it('does not duplicate a generation on a double submit', async () => {
    const api = createApi()
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="composer-prompt-input"]').setValue('Idea única')
    const form = wrapper.get('[data-testid="composer-form"]')
    await form.trigger('submit')
    await form.trigger('submit')
    await nextTick()

    expect(api.generate).toHaveBeenCalledTimes(1)
  })

  it('cancels, preserves the draft and returns focus to the prompt', async () => {
    const api = createApi()
    const wrapper = await mountPage()

    await submitPrompt(wrapper, 'Borrador que se conserva')
    await wrapper.get('[data-testid="composer-cancel"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(api.cancelJob).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement).value,
    ).toBe('Borrador que se conserva')
    expect(normalize(wrapper.get('[data-testid="composer-status"]').text())).toBe(
      'Generación cancelada.',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-prompt-input"]').element,
    )
  })

  it('edits from the result preserving the draft and focus', async () => {
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea para editar')
    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="composer-edit"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="composer-result"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement).value,
    ).toBe('Idea para editar')
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-prompt-input"]').element,
    )
  })

  it('regenerates with attempt 2', async () => {
    const api = createApi()
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea para regenerar')
    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-result-attempt"]').text())).toBe(
      'Intento 1',
    )

    await wrapper.get('[data-testid="composer-regenerate"]').trigger('click')
    await nextTick()

    expect(api.generate).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )
  })

  it('renders a partial success when the video fails but the poster exists', async () => {
    createApi({
      getJob: vi.fn().mockResolvedValueOnce(failedJob()),
    })
    const wrapper = await mountPage()
    vi.useFakeTimers()

    await submitPrompt(wrapper, 'Idea con fallo de vídeo')
    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    expect(wrapper.get('[data-testid="composer-partial"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-partial"]').get('h2').text())).toBe(
      'Fotograma base listo',
    )
    expect(wrapper.get('[data-testid="composer-video-poster"]').attributes('src')).toBe(
      failedJob().posterUrl,
    )
    expect(normalize(wrapper.text())).toContain(
      'No se pudo generar el vídeo, pero conservamos el fotograma base.',
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-partial"]').get('h2').element,
    )
  })
})

describe('composer page reference upload', () => {
  it('shows the single image card and counts it in the result', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/foto.png')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const api = createApi()
    const wrapper = await mountPage()
    vi.useFakeTimers()

    const input = wrapper.get('[data-testid="composer-reference-input"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [makeFile('foto.png', 'image/png')],
    })
    await input.trigger('change')
    await nextTick()
    await nextTick()

    expect(api.createUploadTicket).toHaveBeenCalledWith({
      fileName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 1_024,
    })
    expect(wrapper.findAll('[data-testid="composer-reference-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('1 de 1')

    await submitPrompt(wrapper, 'Idea con imagen')
    await vi.advanceTimersByTimeAsync(2_000)
    await nextTick()
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-result-reference"]').text())).toBe(
      '1 imagen',
    )
    expect(api.generate).toHaveBeenCalledWith(
      expect.objectContaining({ referenceUrl: TICKET.fileUrl }),
      expect.any(AbortSignal),
    )
  })

  it('rejects an invalid file with the exact copy and no ticket', async () => {
    const api = createApi()
    const wrapper = await mountPage()
    const input = wrapper.get('[data-testid="composer-reference-input"]')

    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [makeFile('animado.gif', 'image/gif')],
    })
    await input.trigger('change')
    await nextTick()

    expect(normalize(wrapper.get('[data-testid="composer-reference-error"]').text())).toBe(
      'Formato no admitido. Usa PNG, JPG o WebP.',
    )
    expect(api.createUploadTicket).not.toHaveBeenCalled()
  })

  it('removes the reference and revokes the ObjectURL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock/foto.png')
    const wrapper = await mountPage()

    const input = wrapper.get('[data-testid="composer-reference-input"]')
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [makeFile('foto.png', 'image/png')],
    })
    await input.trigger('change')
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="composer-reference-remove"]').trigger('click')
    await nextTick()

    expect(revoke).toHaveBeenCalledWith('blob:mock/foto.png')
    expect(wrapper.find('[data-testid="composer-reference-card"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-reference-count"]').text()).toBe('0 de 1')
  })
})

describe('composer page offline behaviour', () => {
  it('disables generation, explains why and recovers when online', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const api = createApi()
    const wrapper = await mountPage()
    await nextTick()

    expect(wrapper.get('[data-testid="composer-offline"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-offline"]').text())).toBe(
      'Sin conexión. La generación necesita internet.',
    )
    expect(wrapper.get('[data-testid="composer-generate"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="composer-prompt-input"]').setValue('Idea sin red')
    await wrapper.get('[data-testid="composer-form"]').trigger('submit')
    await nextTick()
    expect(api.generate).not.toHaveBeenCalled()

    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await nextTick()

    expect(wrapper.find('[data-testid="composer-offline"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-generate"]').attributes('disabled')).toBeUndefined()
  })
})
