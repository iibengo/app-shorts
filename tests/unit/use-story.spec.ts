import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useStory, type UseStoryReturn } from '~/composables/useStory'
import { StoryApiClientError, type StoryApi } from '~/composables/useStoryApi'
import { makeSceneDto, makeStoryDto } from '../helpers/story'
import type { Story, StoryJob, StoryStatus } from '~/models/story'

function storyFor(status: StoryStatus, overrides: Partial<Story> = {}): Story {
  return makeStoryDto({
    status,
    scenes: Array.from({ length: 5 }, (_value, index) =>
      makeSceneDto({
        order: index + 1,
        status: status === 'GENERATING_VIDEOS'
          ? 'VIDEO_RUNNING'
          : status === 'WAITING_APPROVAL'
            ? 'KEYFRAME_READY'
            : 'PENDING',
        keyframeAttempts: status === 'WAITING_APPROVAL' ? 1 : 0,
        videoAttempts: status === 'GENERATING_VIDEOS' ? 1 : 0,
      }),
    ),
    ...overrides,
  })
}

function jobFor(status: StoryStatus): StoryJob {
  return {
    storyId: 'story-test-0001',
    status,
    version: 2,
    pollAfterMs: status === 'READY' || status === 'FAILED' || status === 'CANCELLED'
      ? 0
      : 2_500,
  }
}

function createApi(overrides: Partial<StoryApi> = {}) {
  const getStory = vi.fn(async () => storyFor('WAITING_APPROVAL'))
  const createStory = vi.fn(async () => storyFor('GENERATING_KEYFRAMES'))
  const createUploadTicket = vi.fn()
  const uploadReference = vi.fn()
  const updateKeyframe = vi.fn(async () => jobFor('GENERATING_KEYFRAMES'))
  const approve = vi.fn(async () => jobFor('GENERATING_VIDEOS'))
  const retryVideo = vi.fn(async () => jobFor('GENERATING_VIDEOS'))
  const assemble = vi.fn(async () => jobFor('VIDEOS_READY'))
  const retryQc = vi.fn(async () => jobFor('VIDEOS_READY'))
  const approveQc = vi.fn(async () => jobFor('ASSEMBLING'))
  const recoverScene = vi.fn(async () => jobFor('GENERATING_KEYFRAMES'))
  const cancel = vi.fn(async () => storyFor('CANCELLED'))

  const api = {
    getStory,
    createStory,
    createUploadTicket,
    uploadReference,
    updateKeyframe,
    approve,
    retryVideo,
    assemble,
    retryQc,
    approveQc,
    recoverScene,
    cancel,
    ...overrides,
  } as unknown as StoryApi

  return {
    api,
    getStory,
    createStory,
    updateKeyframe,
    approve,
    retryVideo,
    assemble,
    retryQc,
    approveQc,
    recoverScene,
    cancel,
  }
}

async function setupComposable(api: StoryApi, storyId?: string) {
  let composable!: UseStoryReturn

  const wrapper = await mountSuspended(defineComponent({
    setup() {
      composable = useStory({ api, ...(storyId ? { storyId } : {}) })

      return () => h('div')
    },
  }))

  return { composable, wrapper }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useStory initial state and creation', () => {
  it('starts idle with no story and no timer', async () => {
    const { api } = createApi()
    const { composable } = await setupComposable(api)

    expect(composable.state.value).toEqual({ status: 'idle' })
    expect(composable.story.value).toBeNull()
    expect(composable.statusMessage.value).toBe('')
    expect(composable.notFound.value).toBe(false)
    expect(composable.isOnline.value).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('creates a story and moves to the keyframe state', async () => {
    const { api, createStory } = createApi()
    const { composable } = await setupComposable(api)
    const request = {
      premise: 'Una premisa de prueba con longitud suficiente.',
      sceneCount: 5 as const,
      preset: 'fast' as const,
      referenceUrl: null,
      referenceExpiresAt: null,
    }

    const created = await composable.createStory(request)

    expect(createStory).toHaveBeenCalledWith(request)
    expect(created?.id).toBe('story-test-0001')
    expect(composable.state.value).toMatchObject({
      status: 'keyframes',
      story: { id: 'story-test-0001' },
    })
    expect(composable.statusMessage.value).toBe('Preparando las imágenes')
    expect(composable.createError.value).toBeNull()
    // Only the elapsed-time timer runs; polling starts with the detail page.
    expect(vi.getTimerCount()).toBe(1)
  })

  it('remembers the created id for later loads', async () => {
    const { api, getStory } = createApi()
    const { composable } = await setupComposable(api)

    await composable.createStory({
      premise: 'Una premisa de prueba con longitud suficiente.',
      sceneCount: 5,
      preset: 'fast',
      referenceUrl: null,
      referenceExpiresAt: null,
    })
    await composable.loadStory()

    expect(getStory).toHaveBeenCalledWith('story-test-0001', expect.any(AbortSignal))
  })

  it('returns to idle and exposes the creation error', async () => {
    const { api } = createApi({
      createStory: vi.fn(async () => {
        throw new StoryApiClientError({
          code: 'director-timeout',
          message: 'La IA tardó demasiado en escribir el guion. Inténtalo de nuevo.',
          retryable: true,
        })
      }),
    })
    const { composable } = await setupComposable(api)

    const created = await composable.createStory({
      premise: 'Una premisa de prueba con longitud suficiente.',
      sceneCount: 5,
      preset: 'fast',
      referenceUrl: null,
      referenceExpiresAt: null,
    })

    expect(created).toBeNull()
    expect(composable.state.value).toEqual({ status: 'idle' })
    expect(composable.createError.value).toEqual({
      code: 'director-timeout',
      message: 'La IA tardó demasiado en escribir el guion. Inténtalo de nuevo.',
      retryable: true,
    })

    composable.clearError()

    expect(composable.createError.value).toBeNull()
  })
})

describe('useStory load and state mapping', () => {
  it.each([
    ['GENERATING_KEYFRAMES', 'keyframes', 'Preparando las imágenes'],
    ['WAITING_APPROVAL', 'review', 'Revisa las imágenes'],
    ['GENERATING_VIDEOS', 'videos', 'Generando los vídeos'],
    ['VIDEOS_READY', 'qc', 'Revisando la continuidad'],
    ['QC', 'qc', 'Revisando la continuidad'],
    ['WAITING_QC', 'waiting-qc', 'Revisa la continuidad'],
    ['ASSEMBLING', 'assembling', 'Montando el vídeo final'],
    ['READY', 'ready', 'Tu historia'],
    ['CANCELLED', 'cancelled', 'Historia cancelada.'],
  ] as const)('maps %s to %s', async (status, state, message) => {
    const story = storyFor(status)
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(story)
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.state.value.status).toBe(state)
    expect(composable.story.value?.status).toBe(status)
    expect(composable.statusMessage.value).toBe(message)
  })

  it('maps FAILED using the persisted error', async () => {
    const error = {
      code: 'keyframe-failed' as const,
      message: 'No se pudieron crear todas las imágenes de la historia.',
      retryable: false,
    }
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('FAILED', { error }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.state.value).toEqual({
      status: 'failed',
      story: expect.objectContaining({ status: 'FAILED' }),
      error,
    })
    expect(composable.statusMessage.value).toBe('No se pudo completar la historia')
  })

  it('uses a safe fallback error when FAILED has no code', async () => {
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('FAILED', { error: null }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.state.value).toMatchObject({
      status: 'failed',
      error: {
        code: 'internal-error',
        retryable: false,
      },
    })
  })

  it('marks a missing story as not found without polling', async () => {
    const { api, getStory } = createApi()
    getStory.mockRejectedValueOnce(new StoryApiClientError({
      code: 'story-not-found',
      message: 'Esta historia no está disponible en este navegador.',
      retryable: false,
    }, { status: 404 }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.notFound.value).toBe(true)
    expect(composable.state.value).toEqual({ status: 'idle' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps an expired story to the terminal expired state', async () => {
    const { api, getStory } = createApi()
    getStory.mockRejectedValueOnce(new StoryApiClientError({
      code: 'story-expired',
      message: 'Esta historia ya no está disponible. Empieza de nuevo.',
      retryable: false,
    }, { status: 410 }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.state.value).toEqual({
      status: 'expired',
      storyId: 'story-test-0001',
    })
    expect(composable.statusMessage.value).toBe(
      'Esta historia ya no está disponible. Empieza de nuevo.',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('exposes a retryable poll error for a network failure while loading', async () => {
    const { api, getStory } = createApi()
    getStory.mockRejectedValueOnce(new TypeError('offline'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')

    expect(composable.pollError.value).toMatchObject({
      code: 'internal-error',
      retryable: true,
    })
  })
})

describe('useStory polling', () => {
  it('polls with the server pollAfterMs and advances states', async () => {
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockResolvedValueOnce(storyFor('GENERATING_VIDEOS'))
      .mockResolvedValueOnce(storyFor('READY'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(2_500)
    expect(getStory).toHaveBeenCalledTimes(2)
    expect(composable.state.value.status).toBe('videos')

    await vi.advanceTimersByTimeAsync(2_500)
    expect(composable.state.value.status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clamps short poll intervals to one second', async () => {
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('WAITING_APPROVAL', { pollAfterMs: 200 }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(999)
    expect(getStory).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(getStory).toHaveBeenCalledTimes(2)
  })

  it('does not overlap requests', async () => {
    let resolvePoll!: (story: Story) => void
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockReturnValueOnce(new Promise<Story>((resolve) => {
        resolvePoll = resolve
      }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)
    expect(getStory).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(getStory).toHaveBeenCalledTimes(2)

    resolvePoll(storyFor('GENERATING_VIDEOS'))
    await vi.advanceTimersByTimeAsync(0)
    expect(composable.state.value.status).toBe('videos')
  })

  it('stops polling on a 404 during polling', async () => {
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockRejectedValueOnce(new StoryApiClientError({
        code: 'story-not-found',
        message: 'Esta historia no está disponible en este navegador.',
        retryable: false,
      }, { status: 404 }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)

    expect(composable.notFound.value).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops polling on a 410 during polling', async () => {
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockRejectedValueOnce(new StoryApiClientError({
        code: 'story-expired',
        message: 'Esta historia ya no está disponible. Empieza de nuevo.',
        retryable: false,
      }, { status: 410 }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)

    expect(composable.state.value).toEqual({
      status: 'expired',
      storyId: 'story-test-0001',
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('honours Retry-After for a 429 without a terminal error', async () => {
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockRejectedValueOnce(new StoryApiClientError({
        code: 'rate-limited',
        message: 'Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.',
        retryable: true,
      }, { status: 429, retryAfterSeconds: 4 }))
      .mockResolvedValueOnce(storyFor('GENERATING_VIDEOS'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)

    expect(composable.pollError.value).toBeNull()
    await vi.advanceTimersByTimeAsync(3_999)
    expect(getStory).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getStory).toHaveBeenCalledTimes(3)
    expect(composable.state.value.status).toBe('videos')
  })

  it('backs off and surfaces a retryable error after three network failures', async () => {
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)
    expect(getStory).toHaveBeenCalledTimes(2)
    expect(composable.state.value.status).toBe('review')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(getStory).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(3_000)
    expect(getStory).toHaveBeenCalledTimes(4)
    expect(composable.pollError.value).toMatchObject({
      code: 'internal-error',
      retryable: true,
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resumes the same polling with retryPolling without creating anything', async () => {
    const { api, getStory, createStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(storyFor('READY'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(2_500)
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(composable.pollError.value).not.toBeNull()

    composable.retryPolling()
    await vi.advanceTimersByTimeAsync(0)

    expect(getStory).toHaveBeenCalledTimes(5)
    expect(composable.state.value.status).toBe('ready')
    expect(composable.pollError.value).toBeNull()
    expect(createStory).not.toHaveBeenCalled()
  })

  it('pauses polling while the tab is hidden and resumes on visibilitychange', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockResolvedValueOnce(storyFor('GENERATING_VIDEOS'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    expect(vi.getTimerCount()).toBe(0)

    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(getStory).toHaveBeenCalledTimes(2)
    expect(composable.state.value.status).toBe('videos')
  })

  it('pauses offline and resumes immediately when online', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { api, getStory } = createApi()
    getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockResolvedValueOnce(storyFor('GENERATING_VIDEOS'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    expect(composable.isOnline.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)

    expect(getStory).toHaveBeenCalledTimes(2)
    expect(composable.isOnline.value).toBe(true)
  })

  it('clears timers on unmount', async () => {
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
    const { composable, wrapper } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useStory commands', () => {
  async function loaded(overrides: Partial<StoryApi> = {}) {
    const helpers = createApi(overrides)
    helpers.getStory
      .mockResolvedValueOnce(storyFor('WAITING_APPROVAL'))
      .mockResolvedValue(storyFor('GENERATING_VIDEOS'))
    const { composable } = await setupComposable(helpers.api)

    await composable.loadStory('story-test-0001')

    return { ...helpers, composable }
  }

  it('regenerates a scene through the API and reloads the story', async () => {
    const { composable, updateKeyframe, getStory } = await loaded()

    const job = await composable.regenerateScene('scene-2', {
      visualPrompt: 'Un prompt visual nuevo con longitud suficiente.',
      regenerate: true,
    })

    expect(updateKeyframe).toHaveBeenCalledWith(
      'story-test-0001',
      'scene-2',
      expect.objectContaining({ regenerate: true }),
    )
    expect(job?.status).toBe('GENERATING_KEYFRAMES')
    expect(getStory).toHaveBeenCalledTimes(2)
  })

  it('approves through the API and reloads the story', async () => {
    const { composable, approve } = await loaded()

    const job = await composable.approve()

    expect(approve).toHaveBeenCalledWith('story-test-0001')
    expect(job?.status).toBe('GENERATING_VIDEOS')
  })

  it('retries a scene and the assembly through the API', async () => {
    const { composable, retryVideo, assemble } = await loaded()

    await composable.retryScene('scene-3')
    await composable.retryAssembly()

    expect(retryVideo).toHaveBeenCalledWith('story-test-0001', 'scene-3')
    expect(assemble).toHaveBeenCalledWith('story-test-0001')
  })

  it('runs the QC commands and the scene recovery through the API', async () => {
    const { composable, retryQc, approveQc, recoverScene } = await loaded()

    const retried = await composable.retryQc()
    const approved = await composable.approveQc()
    const recovered = await composable.recoverScene('scene-4')

    expect(retryQc).toHaveBeenCalledWith('story-test-0001')
    expect(approveQc).toHaveBeenCalledWith('story-test-0001')
    expect(recoverScene).toHaveBeenCalledWith('story-test-0001', 'scene-4')
    expect(retried?.status).toBe('VIDEOS_READY')
    expect(approved?.status).toBe('ASSEMBLING')
    expect(recovered?.status).toBe('GENERATING_KEYFRAMES')
  })

  it('does not schedule polling in WAITING_QC', async () => {
    vi.useFakeTimers()
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('WAITING_QC', {
      pollAfterMs: 0,
      scenes: Array.from({ length: 5 }, (_value, index) =>
        makeSceneDto({
          order: index + 1,
          status: 'VIDEO_READY',
          keyframeAttempts: 1,
          videoAttempts: 1,
        }),
      ),
    }))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(composable.state.value.status).toBe('waiting-qc')
    expect(getStory).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('exposes a command error and keeps the story', async () => {
    const { composable } = await loaded({
      approve: vi.fn(async () => {
        throw new StoryApiClientError({
          code: 'story-budget-exhausted',
          message: 'Esta historia ha alcanzado su límite de 8 dólares. Empieza una nueva.',
          retryable: false,
        }, { status: 429 })
      }),
    })

    const job = await composable.approve()

    expect(job).toBeNull()
    expect(composable.commandError.value).toEqual({
      code: 'story-budget-exhausted',
      message: 'Esta historia ha alcanzado su límite de 8 dólares. Empieza una nueva.',
      retryable: false,
    })
    expect(composable.story.value?.status).toBe('WAITING_APPROVAL')
    expect(composable.statusMessage.value).toBe('Revisa las imágenes')
  })

  it('cancels the story and stops polling', async () => {
    const { composable, cancel } = await loaded()

    const cancelled = await composable.cancel()

    expect(cancel).toHaveBeenCalledWith('story-test-0001')
    expect(cancelled?.status).toBe('CANCELLED')
    expect(composable.state.value.status).toBe('cancelled')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the command error when cancelling fails', async () => {
    const { composable } = await loaded({
      cancel: vi.fn(async () => {
        throw new StoryApiClientError({
          code: 'cancel-failed',
          message: 'No se pudo cancelar la historia. Inténtalo de nuevo.',
          retryable: true,
        })
      }),
    })

    const cancelled = await composable.cancel()

    expect(cancelled).toBeNull()
    expect(composable.commandError.value?.code).toBe('cancel-failed')
  })

  it('ignores commands without a story id', async () => {
    const { api, approve } = createApi()
    const { composable } = await setupComposable(api)

    expect(await composable.approve()).toBeNull()
    expect(await composable.regenerateScene('scene-1', { visualPrompt: 'x' })).toBeNull()
    expect(await composable.retryScene('scene-1')).toBeNull()
    expect(await composable.retryAssembly()).toBeNull()
    expect(await composable.cancel()).toBeNull()
    expect(approve).not.toHaveBeenCalled()
  })

  it('restarts to idle and clears timers and errors', async () => {
    const { composable } = await loaded()

    composable.restart()

    expect(composable.state.value).toEqual({ status: 'idle' })
    expect(composable.story.value).toBeNull()
    expect(composable.createError.value).toBeNull()
    expect(composable.commandError.value).toBeNull()
    expect(composable.pollError.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useStory privacy', () => {
  it('does not persist state in web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { api, getStory } = createApi()
    getStory.mockResolvedValueOnce(storyFor('READY'))
    const { composable } = await setupComposable(api)

    await composable.loadStory('story-test-0001')
    await vi.advanceTimersByTimeAsync(0)

    expect(setItem).not.toHaveBeenCalled()
  })
})
