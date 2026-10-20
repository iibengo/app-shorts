import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import {
  COMPOSER_GENERATION_ERROR_MESSAGE,
  COMPOSER_READY_DELAY_MS,
  COMPOSER_STAGE_TIMELINE,
} from '~/data/composer'
import type {
  ComposerDraft,
  ComposerGenerationRequest,
  ComposerGenerationStage,
  ComposerGenerationState,
  ComposerGenerator,
  ComposerReference,
  ComposerStep,
  ComposerValidationIssue,
} from '~/models/composer'
import {
  buildComposerGenerationRequest,
  buildGeneratedShortPreview,
  validateComposerPrompt,
} from '~/utils/composer'

export interface UseComposerOptions {
  references: Ref<readonly ComposerReference[]>
  generator?: ComposerGenerator
}

export interface UseComposerReturn {
  prompt: Ref<string>
  draft: ComputedRef<ComposerDraft>
  issues: Ref<ComposerValidationIssue[]>
  generation: Ref<ComposerGenerationState>
  step: ComputedRef<ComposerStep>
  statusMessage: Ref<string>
  isGenerating: ComputedRef<boolean>
  generate: () => void
  cancel: () => void
  regenerate: () => void
  edit: () => void
  retry: () => void
  clearIssues: () => void
}

export function useComposer(options: UseComposerOptions): UseComposerReturn {
  const prompt = ref('')
  const issues = ref<ComposerValidationIssue[]>([])
  const generation = ref<ComposerGenerationState>({ status: 'idle' })
  const statusMessage = ref('')

  const generator = options.generator ?? buildGeneratedShortPreview

  let attempt = 0
  let runId = 0
  let timers: ReturnType<typeof setTimeout>[] = []

  const draft = computed<ComposerDraft>(() => ({
    prompt: prompt.value,
    references: options.references.value,
  }))

  const step = computed<ComposerStep>(() => {
    if (generation.value.status === 'generating') return 'generating'
    if (generation.value.status === 'ready') return 'preview'

    return 'input'
  })

  const isGenerating = computed(() => generation.value.status === 'generating')

  function clearTimers(): void {
    for (const timer of timers) {
      clearTimeout(timer)
    }

    timers = []
  }

  function isActiveRun(run: number): boolean {
    return run === runId && generation.value.status === 'generating'
  }

  function scheduleStage(
    run: number,
    request: ComposerGenerationRequest,
    stage: ComposerGenerationStage,
    progress: number,
    delayMs: number,
  ): void {
    const timer = setTimeout(() => {
      if (!isActiveRun(run)) return

      generation.value = {
        status: 'generating',
        stage,
        progress,
        attempt: request.attempt,
      }
    }, delayMs)

    timers.push(timer)
  }

  function scheduleResult(run: number, request: ComposerGenerationRequest): void {
    const timer = setTimeout(() => {
      if (!isActiveRun(run)) return

      clearTimers()

      try {
        const result = generator(request)
        generation.value = { status: 'ready', result }
        statusMessage.value = 'Vista previa lista.'
      } catch {
        generation.value = {
          status: 'error',
          message: COMPOSER_GENERATION_ERROR_MESSAGE,
          attempt: request.attempt,
        }
      }
    }, COMPOSER_READY_DELAY_MS)

    timers.push(timer)
  }

  function startGeneration(): void {
    attempt += 1
    runId += 1
    const run = runId

    clearTimers()
    statusMessage.value = ''
    issues.value = []

    const request = buildComposerGenerationRequest(
      prompt.value,
      options.references.value,
      attempt,
    )

    generation.value = {
      status: 'generating',
      stage: 'analyzing',
      progress: 15,
      attempt: request.attempt,
    }

    for (const stage of COMPOSER_STAGE_TIMELINE) {
      if (stage.delayMs === 0) continue

      scheduleStage(run, request, stage.stage, stage.progress, stage.delayMs)
    }
    scheduleResult(run, request)
  }

  function generate(): void {
    if (generation.value.status === 'generating') return

    const issue = validateComposerPrompt(prompt.value)

    if (issue) {
      issues.value = [issue]
      return
    }

    startGeneration()
  }

  function cancel(): void {
    if (generation.value.status !== 'generating') return

    runId += 1
    clearTimers()
    generation.value = { status: 'idle' }
    statusMessage.value = 'Generación cancelada.'
  }

  function regenerate(): void {
    if (generation.value.status !== 'ready') return

    startGeneration()
  }

  function edit(): void {
    if (generation.value.status !== 'ready') return

    generation.value = { status: 'idle' }
    statusMessage.value = ''
  }

  function retry(): void {
    if (generation.value.status !== 'error') return

    startGeneration()
  }

  function clearIssues(): void {
    issues.value = []
  }

  watch(prompt, () => {
    if (issues.value.length > 0) {
      issues.value = []
    }

    if (generation.value.status === 'error') {
      generation.value = { status: 'idle' }
    }
  })

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      runId += 1
      clearTimers()
    })
  }

  return {
    prompt,
    draft,
    issues,
    generation,
    step,
    statusMessage,
    isGenerating,
    generate,
    cancel,
    regenerate,
    edit,
    retry,
    clearIssues,
  }
}
