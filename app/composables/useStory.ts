import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import type {
  Story,
  StoryBeatUpdateRequest,
  StoryCreateRequest,
  StoryGenerationState,
  StoryJob,
  StoryJobError,
  StoryShotUpdateRequest,
  StoryStatus,
} from '~/models/story'
import {
  isStoryTerminal,
  preferredPollDelay,
  storyPollAfterMs,
} from '~/utils/story'
import type { StoryApi } from './useStoryApi'
import {
  StoryApiClientError,
  toStoryApiClientError,
  useStoryApi,
} from './useStoryApi'

export interface UseStoryOptions {
  readonly api?: StoryApi
  readonly storyId?: string
}

export interface UseStoryReturn {
  state: Ref<StoryGenerationState>
  story: ComputedRef<Story | null>
  statusMessage: ComputedRef<string>
  notFound: Ref<boolean>
  createError: Ref<StoryJobError | null>
  commandError: Ref<StoryJobError | null>
  pollError: Ref<StoryJobError | null>
  isOnline: Ref<boolean>
  elapsedSeconds: Ref<number>
  createStory: (input: StoryCreateRequest) => Promise<Story | null>
  loadStory: (storyId?: string) => Promise<Story | null>
  regenerateScene: (
    sceneId: string,
    input: StoryBeatUpdateRequest,
  ) => Promise<StoryJob | null>
  regenerateShot: (
    shotId: string,
    input: StoryShotUpdateRequest,
  ) => Promise<StoryJob | null>
  approve: () => Promise<StoryJob | null>
  retryScene: (sceneId: string) => Promise<StoryJob | null>
  retryShot: (shotId: string) => Promise<StoryJob | null>
  /** 015: requeue a failed character reference. */
  retryCharacter: (characterId: string) => Promise<StoryJob | null>
  recoverShot: (shotId: string) => Promise<StoryJob | null>
  retryAssembly: () => Promise<StoryJob | null>
  retryQc: () => Promise<StoryJob | null>
  approveQc: () => Promise<StoryJob | null>
  recoverScene: (sceneId: string) => Promise<StoryJob | null>
  cancel: () => Promise<Story | null>
  restart: () => void
  clearError: () => void
  retryPolling: () => void
}

const MAX_POLL_FAILURES = 3
const BACKOFF_MS: readonly number[] = [2_000, 3_000, 5_000, 8_000]

const STATUS_MESSAGES: Readonly<Record<StoryStatus, string>> = {
  PLANNING: 'Escribiendo el guion',
  GENERATING_KEYFRAMES: 'Preparando las imágenes',
  WAITING_APPROVAL: 'Revisa las imágenes',
  GENERATING_VIDEOS: 'Generando los vídeos',
  VIDEOS_READY: 'Revisando la continuidad',
  QC: 'Revisando la continuidad',
  WAITING_QC: 'Revisa la continuidad',
  ASSEMBLING: 'Montando el vídeo final',
  READY: 'Tu historia',
  FAILED: 'No se pudo completar la historia',
  CANCELLED: 'Historia cancelada.',
}

function stateForStory(story: Story): StoryGenerationState {
  if (story.status === 'WAITING_APPROVAL') {
    return { status: 'review', story }
  }

  if (story.status === 'GENERATING_VIDEOS') {
    return { status: 'videos', story }
  }

  if (story.status === 'VIDEOS_READY' || story.status === 'QC') {
    return { status: 'qc', story }
  }

  if (story.status === 'WAITING_QC') {
    return { status: 'waiting-qc', story }
  }

  if (story.status === 'ASSEMBLING') {
    return { status: 'assembling', story }
  }

  if (story.status === 'READY') {
    return { status: 'ready', story }
  }

  if (story.status === 'CANCELLED') {
    return { status: 'cancelled', story }
  }

  if (story.status === 'FAILED') {
    return {
      status: 'failed',
      story,
      error: story.error ?? {
        code: 'internal-error',
        message: 'No se pudo completar la historia',
        retryable: false,
      },
    }
  }

  return { status: 'keyframes', story }
}

function toJobError(error: unknown): StoryJobError {
  const clientError = toStoryApiClientError(error)

  return {
    code: clientError.code,
    message: clientError.message,
    retryable: clientError.retryable,
  }
}

export function useStory(options: UseStoryOptions = {}): UseStoryReturn {
  const api = options.api ?? useStoryApi()
  const state = ref<StoryGenerationState>({ status: 'idle' })
  const notFound = ref(false)
  const createError = ref<StoryJobError | null>(null)
  const commandError = ref<StoryJobError | null>(null)
  const pollError = ref<StoryJobError | null>(null)
  const isOnline = ref(true)
  const elapsedSeconds = ref(0)

  let currentId = options.storyId ?? null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollInFlight = false
  let pollFailures = 0
  let backoffIndex = 0
  let loadController: AbortController | null = null
  let elapsedTimer: ReturnType<typeof setTimeout> | null = null
  let elapsedRun = 0
  let listenersAttached = false

  const story = computed<Story | null>(() => {
    const current = state.value

    return 'story' in current ? current.story : null
  })

  const statusMessage = computed(() => {
    const current = state.value

    if (current.status === 'creating' || current.status === 'planning') {
      return 'Escribiendo el guion'
    }

    if (current.status === 'idle') {
      return ''
    }

    if (current.status === 'expired') {
      return 'Esta historia ya no está disponible. Empieza de nuevo.'
    }

    if ('story' in current) {
      return STATUS_MESSAGES[current.story.status]
    }

    return ''
  })

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function stopElapsed(): void {
    elapsedRun += 1

    if (elapsedTimer !== null) {
      clearTimeout(elapsedTimer)
      elapsedTimer = null
    }
  }

  function resetElapsed(): void {
    stopElapsed()
    elapsedSeconds.value = 0
  }

  function startElapsed(): void {
    stopElapsed()

    const run = elapsedRun

    const tick = (): void => {
      elapsedTimer = setTimeout(() => {
        if (run !== elapsedRun) return

        elapsedSeconds.value += 1
        tick()
      }, 1_000)
    }

    tick()
  }

  function syncElapsedTimer(): void {
    const current = state.value

    if (
      current.status === 'keyframes'
      || current.status === 'videos'
      || current.status === 'qc'
      || current.status === 'assembling'
    ) {
      if (elapsedTimer === null) {
        startElapsed()
      }

      return
    }

    stopElapsed()
  }

  function schedulePoll(delayMs: number): void {
    stopPolling()

    if (!import.meta.client) return
    if (delayMs <= 0) return

    const current = state.value

    if (!('story' in current)) return
    if (isStoryTerminal(current.story.status)) return
    if (pollError.value) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    pollTimer = setTimeout(() => {
      void pollOnce()
    }, preferredPollDelay(delayMs))
  }

  async function pollOnce(): Promise<void> {
    if (pollInFlight || !currentId) return

    pollInFlight = true

    try {
      const next = await api.getStory(currentId)

      state.value = stateForStory(next)
      pollFailures = 0
      backoffIndex = 0
      syncElapsedTimer()
      schedulePoll(storyPollAfterMs(next.status))
    } catch (error) {
      const clientError = error instanceof StoryApiClientError
        ? error
        : toStoryApiClientError(error)

      if (clientError.status === 404) {
        notFound.value = true
        stopPolling()

        return
      }

      if (clientError.status === 410) {
        state.value = { status: 'expired', storyId: currentId }
        stopPolling()

        return
      }

      if (clientError.code === 'rate-limited' && clientError.retryAfterSeconds) {
        schedulePoll(clientError.retryAfterSeconds * 1_000)

        return
      }

      pollFailures += 1

      if (pollFailures >= MAX_POLL_FAILURES) {
        pollError.value = toJobError(clientError)
        stopPolling()

        return
      }

      const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)] ?? 2_000
      backoffIndex += 1
      schedulePoll(delay)
    } finally {
      pollInFlight = false
    }
  }

  async function loadStory(storyId?: string): Promise<Story | null> {
    const id = storyId ?? currentId

    if (!id) return null

    currentId = id
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    notFound.value = false
    pollError.value = null

    try {
      const next = await api.getStory(id, controller.signal)

      if (controller.signal.aborted) return null

      state.value = stateForStory(next)
      syncElapsedTimer()
      schedulePoll(next.pollAfterMs)

      return next
    } catch (error) {
      if (controller.signal.aborted) return null

      const clientError = toStoryApiClientError(error)

      if (clientError.status === 404) {
        notFound.value = true

        return null
      }

      if (clientError.status === 410) {
        state.value = { status: 'expired', storyId: id }

        return null
      }

      pollError.value = toJobError(clientError)

      return null
    }
  }

  async function createStory(input: StoryCreateRequest): Promise<Story | null> {
    createError.value = null
    commandError.value = null
    state.value = { status: 'creating', premise: input.premise }

    try {
      state.value = { status: 'planning', premise: input.premise }

      const created = await api.createStory(input)

      state.value = stateForStory(created)
      currentId = created.id
      syncElapsedTimer()

      return created
    } catch (error) {
      state.value = { status: 'idle' }
      createError.value = toJobError(error)

      return null
    }
  }

  async function runCommand(
    action: (id: string) => Promise<StoryJob>,
  ): Promise<StoryJob | null> {
    if (!currentId) return null

    commandError.value = null

    try {
      const job = await action(currentId)
      await loadStory(currentId)

      return job
    } catch (error) {
      commandError.value = toJobError(error)

      return null
    }
  }

  async function regenerateScene(
    sceneId: string,
    input: StoryBeatUpdateRequest,
  ): Promise<StoryJob | null> {
    if (!currentId) return null

    return runCommand((id) => api.updateKeyframe(id, sceneId, input))
  }

  async function regenerateShot(
    shotId: string,
    input: StoryShotUpdateRequest,
  ): Promise<StoryJob | null> {
    if (!currentId) return null

    return runCommand((id) => api.regenerateShot(id, shotId, input))
  }

  async function approve(): Promise<StoryJob | null> {
    return runCommand((id) => api.approve(id))
  }

  async function retryScene(sceneId: string): Promise<StoryJob | null> {
    return runCommand((id) => api.retryVideo(id, sceneId))
  }

  async function retryCharacter(characterId: string): Promise<StoryJob | null> {
    if (!currentId) return null

    return runCommand((id) => api.retryCharacter(id, characterId))
  }

  async function retryShot(shotId: string): Promise<StoryJob | null> {
    if (!currentId) return null

    return runCommand((id) => api.retryShot(id, shotId))
  }

  async function recoverShot(shotId: string): Promise<StoryJob | null> {
    if (!currentId) return null

    return runCommand((id) => api.recoverShot(id, shotId))
  }

  async function retryAssembly(): Promise<StoryJob | null> {
    return runCommand((id) => api.assemble(id))
  }

  async function retryQc(): Promise<StoryJob | null> {
    return runCommand((id) => api.retryQc(id))
  }

  async function approveQc(): Promise<StoryJob | null> {
    return runCommand((id) => api.approveQc(id))
  }

  async function recoverScene(sceneId: string): Promise<StoryJob | null> {
    return runCommand((id) => api.recoverScene(id, sceneId))
  }

  async function cancel(): Promise<Story | null> {
    if (!currentId) return null

    commandError.value = null

    try {
      const cancelled = await api.cancel(currentId)

      state.value = stateForStory(cancelled)
      stopPolling()

      return cancelled
    } catch (error) {
      commandError.value = toJobError(error)

      return null
    }
  }

  function restart(): void {
    stopPolling()
    resetElapsed()
    currentId = null
    notFound.value = false
    createError.value = null
    commandError.value = null
    pollError.value = null
    state.value = { status: 'idle' }
  }

  function clearError(): void {
    createError.value = null
    commandError.value = null
  }

  function retryPolling(): void {
    pollError.value = null
    pollFailures = 0
    backoffIndex = 0
    void loadStory()
  }

  function handleVisibility(): void {
    if (typeof document === 'undefined' || document.hidden) return

    if (pollError.value) return

    const current = state.value

    if ('story' in current && !isStoryTerminal(current.story.status)) {
      stopPolling()
      void pollOnce()
    }
  }

  function handleOnline(): void {
    isOnline.value = true

    if (pollError.value) return

    const current = state.value

    if ('story' in current && !isStoryTerminal(current.story.status)) {
      stopPolling()
      void pollOnce()
    }
  }

  function handleOffline(): void {
    isOnline.value = false
    stopPolling()
  }

  function attachListeners(): void {
    if (listenersAttached || typeof window === 'undefined') return

    listenersAttached = true
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
  }

  function detachListeners(): void {
    if (!listenersAttached || typeof window === 'undefined') return

    listenersAttached = false
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibility)
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      isOnline.value = typeof navigator === 'undefined' ? true : navigator.onLine
      attachListeners()

      if (currentId) {
        void loadStory(currentId)
      }
    })

    onBeforeUnmount(() => {
      detachListeners()
      stopPolling()
      stopElapsed()
      loadController?.abort()
    })
  }

  return {
    state,
    story,
    statusMessage,
    notFound,
    createError,
    commandError,
    pollError,
    isOnline,
    elapsedSeconds,
    createStory,
    loadStory,
    regenerateScene,
    regenerateShot,
    approve,
    retryScene,
    retryShot,
    retryCharacter,
    recoverShot,
    retryAssembly,
    retryQc,
    approveQc,
    recoverScene,
    cancel,
    restart,
    clearError,
    retryPolling,
  }
}
