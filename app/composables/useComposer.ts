import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  COMPOSER_DEFAULT_DURATION_SECONDS,
  COMPOSER_DEFAULT_PRESET,
  COMPOSER_UPLOAD_EXPIRED_MESSAGE,
} from '~/data/composer'
import type {
  ComposerGenerationRequest,
  ComposerGenerationState,
  ComposerJob,
  ComposerJobError,
  ComposerJobId,
  ComposerPreset,
  ComposerReference,
  ComposerStep,
  ComposerValidationIssue,
  ComposerVideoDuration,
} from '~/models/composer'
import {
  buildComposerGenerationRequest,
  composerStageLabel,
  resolveComposerDuration,
  validateComposerPrompt,
} from '~/utils/composer'
import type { ComposerApi } from './useComposerApi'
import {
  ComposerApiClientError,
  toComposerApiClientError,
  useComposerApi,
} from './useComposerApi'

export interface UseComposerOptions {
  readonly references: Ref<ComposerReference | null>
  readonly api?: ComposerApi
  readonly onReferenceExpired?: () => void
}

export interface UseComposerReturn {
  prompt: Ref<string>
  preset: Ref<ComposerPreset>
  durationSeconds: Ref<ComposerVideoDuration>
  generation: Ref<ComposerGenerationState>
  issues: Ref<ComposerValidationIssue[]>
  step: ComputedRef<ComposerStep>
  statusMessage: ComputedRef<string>
  isGenerating: ComputedRef<boolean>
  generate: () => Promise<void>
  cancel: () => Promise<void>
  retry: () => Promise<void>
  regenerate: () => Promise<void>
  edit: () => void
  clearIssues: () => void
}

const DEFAULT_BACKOFF_MS: readonly number[] = [
  2_000,
  2_000,
  3_000,
  5_000,
  8_000,
  10_000,
]

const MAX_POLL_FAILURES = 3
const MIN_POLL_DELAY_MS = 1_000
const MAX_POLL_DELAY_MS = 10_000

type PollDelayMode = 'clamped' | 'exact' | 'immediate'

function clampPollDelay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKOFF_MS[0]!
  }

  return Math.min(MAX_POLL_DELAY_MS, Math.max(MIN_POLL_DELAY_MS, Math.trunc(value)))
}

function createGenerationError(
  error: ComposerJobError,
  attempt: number,
): ComposerGenerationState {
  return {
    status: 'error',
    phase: 'keyframe',
    error,
    jobId: null,
    posterUrl: null,
    attempt,
  }
}

function resolveJobError(error: unknown): ComposerJobError {
  if (error instanceof ComposerApiClientError) {
    const retryAfterSeconds = error.retryAfterSeconds
    const message = error.code === 'rate-limited' && retryAfterSeconds !== undefined
      ? `Has alcanzado el límite de generaciones. Inténtalo de nuevo en ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minutos.`
      : error.message

    return {
      code: error.code,
      message,
      retryable: error.retryable,
    }
  }

  const clientError = toComposerApiClientError(error)

  return {
    code: clientError.code,
    message: clientError.message,
    retryable: clientError.retryable,
  }
}

function isReferenceExpired(reference: ComposerReference): boolean {
  const expiresAt = Date.parse(reference.expiresAt)

  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

export function useComposer(options: UseComposerOptions): UseComposerReturn {
  const api = options.api ?? useComposerApi()
  const prompt = ref('')
  const preset = ref<ComposerPreset>(COMPOSER_DEFAULT_PRESET)
  const durationSeconds = ref<ComposerVideoDuration>(
    COMPOSER_DEFAULT_DURATION_SECONDS,
  )
  const generation = ref<ComposerGenerationState>({ status: 'idle' })
  const issues = ref<ComposerValidationIssue[]>([])

  let attempt = 0
  let runId = 0
  let abortController: AbortController | null = null
  let cancelController: AbortController | null = null
  let pollController: AbortController | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let pollInFlight = false
  let pollFailures = 0
  let backoffIndex = 0
  let cancelInFlight = false
  let lastJob: ComposerJob | null = null

  const step = computed<ComposerStep>(() => {
    if (
      generation.value.status === 'submitting'
      || generation.value.status === 'queued'
      || generation.value.status === 'running'
    ) {
      return 'generating'
    }

    if (generation.value.status === 'ready') {
      return 'preview'
    }

    return 'input'
  })

  const isGenerating = computed(() => (
    generation.value.status === 'submitting'
    || generation.value.status === 'queued'
    || generation.value.status === 'running'
  ))

  const statusMessage = computed(() => {
    const current = generation.value

    if (current.status === 'submitting') {
      return composerStageLabel('keyframe')
    }

    if (current.status === 'queued') {
      return composerStageLabel('queued')
    }

    if (current.status === 'running') {
      return composerStageLabel(current.job.stage)
    }

    if (current.status === 'ready') {
      return 'Vídeo listo.'
    }

    if (current.status === 'cancelled') {
      return 'Generación cancelada.'
    }

    return ''
  })

  function clearIssues(): void {
    issues.value = []
  }

  function activeJobId(): ComposerJobId | null {
    const current = generation.value

    if (current.status === 'queued' || current.status === 'running') {
      return current.job.id
    }

    return null
  }

  function activePosterUrl(): string | null {
    const current = generation.value

    if (current.status === 'queued' || current.status === 'running') {
      return current.job.posterUrl
    }

    return lastJob?.posterUrl ?? null
  }

  function shouldContinuePolling(jobId: ComposerJobId): boolean {
    return activeJobId() === jobId
  }

  function isPollingPaused(): boolean {
    const hidden = typeof document !== 'undefined' && document.hidden
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false

    return hidden || offline
  }

  function clearPollTimer(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function abortPoll(): void {
    pollController?.abort()
    pollController = null
    pollInFlight = false
  }

  function stopPolling(): void {
    clearPollTimer()
    abortPoll()
    pollFailures = 0
    backoffIndex = 0
  }

  function nextBackoffDelay(): number {
    const delay = DEFAULT_BACKOFF_MS[Math.min(backoffIndex, DEFAULT_BACKOFF_MS.length - 1)]!
    backoffIndex += 1

    return delay
  }

  function schedulePoll(
    delayMs: number,
    jobId: ComposerJobId,
    currentAttempt: number,
    mode: PollDelayMode = 'clamped',
  ): void {
    if (!shouldContinuePolling(jobId)) {
      clearPollTimer()
      return
    }

    clearPollTimer()

    if (isPollingPaused()) {
      return
    }

    const delay = mode === 'immediate'
      ? 0
      : mode === 'exact'
        ? Math.max(0, Math.trunc(delayMs))
        : clampPollDelay(delayMs)

    pollTimer = setTimeout(() => {
      pollTimer = null
      void pollJob(jobId, currentAttempt)
    }, delay)
  }

  function resumePolling(): void {
    const jobId = activeJobId()
    const current = generation.value

    if (!jobId) return
    if (current.status !== 'queued' && current.status !== 'running') return

    schedulePoll(0, jobId, current.attempt, 'immediate')
  }

  function setPollError(
    jobId: ComposerJobId,
    currentAttempt: number,
    error: ComposerJobError,
  ): void {
    generation.value = {
      status: 'error',
      phase: 'poll',
      error,
      jobId,
      posterUrl: activePosterUrl(),
      attempt: currentAttempt,
    }
    stopPolling()
  }

  async function pollJob(
    jobId: ComposerJobId,
    currentAttempt: number,
  ): Promise<void> {
    if (pollInFlight || isPollingPaused() || !shouldContinuePolling(jobId)) {
      return
    }

    const current = generation.value

    if (current.status !== 'queued' && current.status !== 'running') {
      return
    }

    clearPollTimer()

    const currentRun = runId
    const controller = new AbortController()

    pollController = controller
    pollInFlight = true

    try {
      const job = await api.getJob(jobId, controller.signal)

      if (
        controller.signal.aborted
        || currentRun !== runId
        || !shouldContinuePolling(jobId)
      ) {
        return
      }

      lastJob = job
      pollFailures = 0
      backoffIndex = 0

      if (job.status === 'queued') {
        generation.value = {
          status: 'queued',
          job,
          attempt: currentAttempt,
        }
        schedulePoll(job.pollAfterMs, job.id, currentAttempt)
        return
      }

      if (job.status === 'running') {
        generation.value = {
          status: 'running',
          job,
          attempt: currentAttempt,
        }
        schedulePoll(job.pollAfterMs, job.id, currentAttempt)
        return
      }

      if (job.status === 'succeeded') {
        generation.value = {
          status: 'ready',
          job,
          attempt: currentAttempt,
        }
        stopPolling()
        return
      }

      if (job.status === 'failed') {
        generation.value = {
          status: 'error',
          phase: 'video',
          error: job.error,
          jobId: job.id,
          posterUrl: job.posterUrl,
          attempt: currentAttempt,
        }
        stopPolling()
        return
      }

      generation.value = {
        status: 'cancelled',
        jobId: job.id,
        attempt: currentAttempt,
      }
      stopPolling()
    } catch (error) {
      if (
        controller.signal.aborted
        || currentRun !== runId
        || !shouldContinuePolling(jobId)
      ) {
        return
      }

      if (isPollingPaused()) {
        return
      }

      const clientError = toComposerApiClientError(error)

      if (clientError.code === 'rate-limited') {
        const retryAfterMs = Math.max(
          0,
          Math.trunc((clientError.retryAfterSeconds ?? 2) * 1_000),
        )

        schedulePoll(retryAfterMs, jobId, currentAttempt, 'exact')
        return
      }

      if (
        clientError.code === 'job-not-found'
        || clientError.code === 'job-expired'
      ) {
        setPollError(jobId, currentAttempt, resolveJobError(error))
        return
      }

      if (
        clientError.status !== null
        && clientError.status >= 400
        && clientError.status < 500
      ) {
        setPollError(jobId, currentAttempt, resolveJobError(error))
        return
      }

      pollFailures += 1

      if (pollFailures >= MAX_POLL_FAILURES) {
        setPollError(jobId, currentAttempt, {
          ...resolveJobError(error),
          retryable: true,
        })
        return
      }

      schedulePoll(nextBackoffDelay(), jobId, currentAttempt)
    } finally {
      pollInFlight = false

      if (pollController === controller) {
        pollController = null
      }
    }
  }

  function beginPolling(
    job: Extract<ComposerJob, { status: 'queued' | 'running' }>,
    currentAttempt: number,
  ): void {
    lastJob = job
    pollFailures = 0
    backoffIndex = 0
    schedulePoll(job.pollAfterMs, job.id, currentAttempt)
  }

  function applyJob(job: ComposerJob, currentAttempt: number): void {
    lastJob = job

    if (job.status === 'queued') {
      generation.value = {
        status: 'queued',
        job,
        attempt: currentAttempt,
      }
      beginPolling(job, currentAttempt)
      return
    }

    if (job.status === 'running') {
      generation.value = {
        status: 'running',
        job,
        attempt: currentAttempt,
      }
      beginPolling(job, currentAttempt)
      return
    }

    if (job.status === 'succeeded') {
      generation.value = {
        status: 'ready',
        job,
        attempt: currentAttempt,
      }
      stopPolling()
      return
    }

    if (job.status === 'failed') {
      generation.value = {
        status: 'error',
        phase: 'video',
        error: job.error,
        jobId: job.id,
        posterUrl: job.posterUrl,
        attempt: currentAttempt,
      }
      stopPolling()
      return
    }

    generation.value = {
      status: 'cancelled',
      jobId: job.id,
      attempt: currentAttempt,
    }
    stopPolling()
  }

  async function generate(): Promise<void> {
    if (isGenerating.value) {
      return
    }

    const promptIssue = validateComposerPrompt(prompt.value)

    if (promptIssue) {
      issues.value = [promptIssue]
      return
    }

    issues.value = []

    const reference = options.references.value

    if (reference && isReferenceExpired(reference)) {
      options.onReferenceExpired?.()
      generation.value = createGenerationError(
        {
          code: 'invalid-reference',
          message: COMPOSER_UPLOAD_EXPIRED_MESSAGE,
          retryable: false,
        },
        attempt,
      )
      return
    }

    stopPolling()
    lastJob = null
    attempt += 1

    const currentAttempt = attempt
    const request: ComposerGenerationRequest = buildComposerGenerationRequest(
      prompt.value,
      preset.value,
      durationSeconds.value,
      reference?.fileUrl ?? null,
    )
    const controller = new AbortController()
    const currentRun = ++runId

    abortController = controller
    generation.value = { status: 'submitting', attempt: currentAttempt }

    try {
      const job = await api.generate(request, controller.signal)

      if (currentRun !== runId) return

      applyJob(job, currentAttempt)
    } catch (error) {
      if (currentRun !== runId) return

      if (controller.signal.aborted) {
        generation.value = {
          status: 'cancelled',
          jobId: null,
          attempt: currentAttempt,
        }
        return
      }

      generation.value = createGenerationError(
        resolveJobError(error),
        currentAttempt,
      )
    } finally {
      if (currentRun === runId) {
        abortController = null
      }
    }
  }

  async function cancel(): Promise<void> {
    const current = generation.value

    if (current.status === 'submitting') {
      runId += 1
      abortController?.abort()
      abortController = null
      stopPolling()
      generation.value = {
        status: 'cancelled',
        jobId: null,
        attempt: current.attempt,
      }
      return
    }

    if (current.status !== 'queued' && current.status !== 'running') {
      return
    }

    if (cancelInFlight) {
      return
    }

    const currentRun = runId
    const controller = new AbortController()

    cancelInFlight = true
    stopPolling()
    cancelController = controller

    try {
      const job = await api.cancelJob(current.job.id, controller.signal)

      if (runId !== currentRun || controller.signal.aborted) {
        return
      }

      lastJob = job
      generation.value = {
        status: 'cancelled',
        jobId: job.id,
        attempt: current.attempt,
      }
    } catch (error) {
      if (runId !== currentRun || controller.signal.aborted) {
        return
      }

      generation.value = {
        status: 'error',
        phase: 'poll',
        error: {
          ...resolveJobError(error),
          retryable: true,
        },
        jobId: current.job.id,
        posterUrl: current.job.posterUrl,
        attempt: current.attempt,
      }
    } finally {
      cancelInFlight = false

      if (cancelController === controller) {
        cancelController = null
      }
    }
  }

  async function retry(): Promise<void> {
    const current = generation.value

    if (current.status !== 'error') {
      return
    }

    if (
      current.phase === 'poll'
      && current.jobId
      && lastJob
      && (lastJob.status === 'queued' || lastJob.status === 'running')
    ) {
      pollFailures = 0
      backoffIndex = 0

      if (lastJob.status === 'queued') {
        generation.value = {
          status: 'queued',
          job: lastJob,
          attempt: current.attempt,
        }
      } else {
        generation.value = {
          status: 'running',
          job: lastJob,
          attempt: current.attempt,
        }
      }

      schedulePoll(0, current.jobId, current.attempt, 'immediate')
      return
    }

    if (current.phase !== 'video' && !current.error.retryable) {
      return
    }

    await generate()
  }

  async function regenerate(): Promise<void> {
    if (generation.value.status !== 'ready') {
      return
    }

    await generate()
  }

  function edit(): void {
    const current = generation.value

    if (
      current.status !== 'ready'
      && current.status !== 'error'
      && current.status !== 'cancelled'
    ) {
      return
    }

    runId += 1
    stopPolling()
    abortController?.abort()
    abortController = null
    cancelController?.abort()
    cancelController = null
    cancelInFlight = false
    lastJob = null
    generation.value = { status: 'idle' }
    issues.value = []

    const reference = options.references.value

    if (reference && isReferenceExpired(reference)) {
      options.onReferenceExpired?.()
    }
  }

  function handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.hidden) {
      clearPollTimer()
      return
    }

    resumePolling()
  }

  function handleOnline(): void {
    resumePolling()
  }

  function handleOffline(): void {
    clearPollTimer()
  }

  watch(prompt, () => {
    if (issues.value.length > 0) {
      issues.value = []
    }
  })

  watch(preset, (value) => {
    const resolved = resolveComposerDuration(value, durationSeconds.value)

    if (resolved !== durationSeconds.value) {
      durationSeconds.value = resolved
    }
  })

  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange)
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
      }
    })

    onBeforeUnmount(() => {
      runId += 1
      stopPolling()
      abortController?.abort()
      abortController = null
      cancelController?.abort()
      cancelController = null
      cancelInFlight = false
      lastJob = null

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    })
  }

  return {
    prompt,
    preset,
    durationSeconds,
    generation,
    issues,
    step,
    statusMessage,
    isGenerating,
    generate,
    cancel,
    retry,
    regenerate,
    edit,
    clearIssues,
  }
}
