<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import ComposerGenerationProgress from '~/components/composer/ComposerGenerationProgress.vue'
import ComposerHeader from '~/components/composer/ComposerHeader.vue'
import ComposerPartialResult from '~/components/composer/ComposerPartialResult.vue'
import ComposerPresetPicker from '~/components/composer/ComposerPresetPicker.vue'
import ComposerPromptForm from '~/components/composer/ComposerPromptForm.vue'
import ComposerReferencePicker from '~/components/composer/ComposerReferencePicker.vue'
import ComposerResult from '~/components/composer/ComposerResult.vue'
import ComposerStepper from '~/components/composer/ComposerStepper.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { useComposer } from '~/composables/useComposer'
import { useComposerApi } from '~/composables/useComposerApi'
import { useComposerReferences } from '~/composables/useComposerReferences'
import type {
  ComposerJob,
  ComposerJobError,
  ComposerJobStage,
  ComposerPreset,
  ComposerVideoDuration,
} from '~/models/composer'
import { getComposerDurations, isComposerDurationAllowed } from '~/utils/composer'

useHead({
  htmlAttrs: {
    lang: 'es',
    class: 'bg-brand-ink',
  },
  bodyAttrs: {
    class: 'bg-brand-ink',
  },
  meta: [
    { name: 'color-scheme', content: 'dark' },
    { name: 'theme-color', content: '#09090b' },
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

useSeoMeta({
  title: 'AI Shorts — Estudio de creación',
  description:
    'Estudio de creación de AI Shorts: describe una idea, añade una imagen opcional y genera un vídeo vertical de 9:16 con IA.',
})

const api = useComposerApi()
const {
  reference,
  uploadState,
  issues: referenceIssues,
  selectFile,
  removeReference,
  retryUpload,
} = useComposerReferences({ api })

const {
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
} = useComposer({
  references: reference,
  api,
  onReferenceExpired: () => {
    removeReference()
  },
})

const pageRoot = ref<HTMLElement | null>(null)
const form = ref<{ focusPrompt: () => void } | null>(null)
const isOnline = ref(true)
const elapsedSeconds = ref(0)

let elapsedTimer: ReturnType<typeof setTimeout> | null = null
let elapsedRun = 0

const promptIssue = computed(
  () => issues.value.find((issue) => issue.field === 'prompt') ?? null,
)

const submitDisabled = computed(
  () => !isOnline.value || uploadState.value === 'uploading',
)

const durations = computed(() => getComposerDurations(preset.value))

const progressStage = computed<ComposerJobStage>(() => {
  const current = generation.value

  if (current.status === 'submitting') return 'keyframe'
  if (current.status === 'queued') return 'queued'
  if (current.status === 'running') return current.job.stage

  return 'keyframe'
})

const queuePosition = computed(() => (
  generation.value.status === 'queued'
    ? generation.value.job.queuePosition
    : null
))

const isSlow = computed(() => elapsedSeconds.value >= 600)

const currentAttempt = computed(() => {
  const current = generation.value

  if (
    current.status === 'submitting'
    || current.status === 'queued'
    || current.status === 'running'
  ) {
    return current.attempt
  }

  return 1
})

const readyJob = computed<Extract<ComposerJob, { status: 'succeeded' }> | null>(
  () => (generation.value.status === 'ready' ? generation.value.job : null),
)

const partialResult = computed<{
  readonly posterUrl: string
  readonly error: ComposerJobError
} | null>(() => {
  const current = generation.value

  if (
    current.status === 'error'
    && current.phase === 'video'
    && current.posterUrl !== null
  ) {
    return {
      posterUrl: current.posterUrl,
      error: current.error,
    }
  }

  return null
})

const referenceCount = computed<0 | 1>(() => (reference.value ? 1 : 0))

const resultAttempt = computed(() => {
  const current = generation.value

  if (current.status === 'ready' || current.status === 'error') {
    return current.attempt
  }

  return 1
})

function stopElapsedTimer(): void {
  elapsedRun += 1

  if (elapsedTimer !== null) {
    clearTimeout(elapsedTimer)
    elapsedTimer = null
  }
}

function startElapsedTimer(): void {
  stopElapsedTimer()
  elapsedSeconds.value = 0

  const currentRun = elapsedRun

  const tick = (): void => {
    elapsedTimer = setTimeout(() => {
      if (currentRun !== elapsedRun) return

      elapsedSeconds.value += 1
      tick()
    }, 1_000)
  }

  tick()
}

function focusPrompt(): void {
  void nextTick(() => {
    form.value?.focusPrompt()
  })
}

async function handleSubmit(): Promise<void> {
  if (!isOnline.value || uploadState.value === 'uploading') {
    return
  }

  await generate()
  await nextTick()

  if (issues.value.some((issue) => issue.field === 'prompt')) {
    focusPrompt()
  }
}

function handlePromptUpdate(value: string): void {
  prompt.value = value
}

function handlePresetUpdate(value: ComposerPreset): void {
  preset.value = value
}

function handleDurationChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  const value = Number(target?.value)

  if (Number.isInteger(value) && isComposerDurationAllowed(preset.value, value)) {
    durationSeconds.value = value as ComposerVideoDuration
  }
}

function handleReferenceSelect(file: File): void {
  void selectFile(file)
}

function handleReferenceRetry(): void {
  void retryUpload()
}

async function handleCancel(): Promise<void> {
  await cancel()
  await nextTick()

  if (generation.value.status === 'cancelled') {
    focusPrompt()
  }
}

async function handleRetry(): Promise<void> {
  await retry()
}

function handleRegenerate(): void {
  void regenerate()
}

function handleEdit(): void {
  edit()
  focusPrompt()
}

function handleOnline(): void {
  isOnline.value = true
}

function handleOffline(): void {
  isOnline.value = false
}

watch(isGenerating, (value) => {
  if (value) {
    startElapsedTimer()
    return
  }

  stopElapsedTimer()
})

watch(
  () => generation.value.status,
  async (status) => {
    if (status !== 'error') return

    if (partialResult.value) return

    await nextTick()
    const target = pageRoot.value?.querySelector<HTMLElement>(
      '[data-testid="composer-retry"], [data-testid="composer-edit"]',
    )
    target?.focus()
  },
)

watch(reference, async (value, previous) => {
  if (!value || previous) return

  await nextTick()
  pageRoot.value
    ?.querySelector<HTMLElement>('[data-testid="composer-reference-card"]')
    ?.focus()
})

onMounted(() => {
  isOnline.value = navigator.onLine
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  stopElapsedTimer()
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})
</script>

<template>
  <div
    ref="pageRoot"
    data-testid="composer-page"
    class="min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <ComposerHeader />

    <main class="mx-auto w-full max-w-3xl overflow-x-clip pb-[calc(env(safe-area-inset-bottom)_+_2rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-8">
      <h1
        data-testid="composer-h1"
        class="text-3xl font-semibold leading-tight tracking-tight text-brand-text sm:text-4xl"
      >
        Crea un short con IA
      </h1>

      <p
        data-testid="composer-intro"
        class="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted sm:text-base"
      >
        Describe una idea, añade una imagen de referencia opcional y genera un vídeo vertical de 9:16. La generación es real y consume créditos.
      </p>

      <noscript data-allow-mismatch="children">
        <p
          data-testid="composer-nojs-notice"
          class="mt-4 rounded-2xl border border-white/15 bg-brand-surface p-3 text-sm leading-relaxed text-brand-text"
        >
          El estudio de creación necesita JavaScript para generar un vídeo con IA. Puedes volver al feed de prueba.
        </p>
      </noscript>

      <ComposerStepper :current="step" />

      <div class="relative z-20 mt-4 flex justify-center">
        <p
          data-testid="composer-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          class="text-center text-sm text-brand-text"
          :class="statusMessage
            ? 'rounded-full border border-white/10 bg-black/[0.75] px-4 py-2 shadow-lg'
            : 'sr-only'"
        >
          {{ statusMessage }}
        </p>
      </div>

      <p
        v-if="!isOnline"
        data-testid="composer-offline"
        role="status"
        class="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text"
      >
        Sin conexión. La generación necesita internet.
      </p>

      <ComposerGenerationProgress
        v-if="isGenerating"
        :stage="progressStage"
        :queue-position="queuePosition"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        :attempt="currentAttempt"
        @cancel="handleCancel"
      />

      <ComposerResult
        v-else-if="readyJob"
        :job="readyJob"
        :reference-count="referenceCount"
        :attempt="resultAttempt"
        @regenerate="handleRegenerate"
        @edit="handleEdit"
      />

      <ComposerPartialResult
        v-else-if="partialResult"
        :poster-url="partialResult.posterUrl"
        :error="partialResult.error"
        @retry="handleRetry"
        @edit="handleEdit"
      />

      <template v-else>
        <div
          v-if="generation.status === 'error'"
          data-testid="composer-error"
          role="alert"
          class="mt-6 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
        >
          <p>{{ generation.error.message }}</p>

          <div class="mt-3 flex flex-col gap-2 sm:flex-row">
            <AppButton
              v-if="generation.error.retryable"
              type="button"
              data-testid="composer-retry"
              class="w-full sm:w-auto"
              @click="handleRetry"
            >
              Reintentar
            </AppButton>

            <AppButton
              type="button"
              variant="secondary"
              data-testid="composer-edit"
              class="w-full sm:w-auto"
              @click="handleEdit"
            >
              Editar idea
            </AppButton>
          </div>
        </div>

        <ComposerPromptForm
          ref="form"
          :prompt="prompt"
          :prompt-issue="promptIssue"
          :submit-disabled="submitDisabled"
          @update:prompt="handlePromptUpdate"
          @submit="handleSubmit"
        >
          <template #preset>
            <ComposerPresetPicker
              :preset="preset"
              @update:preset="handlePresetUpdate"
            />
          </template>

          <template #reference>
            <ComposerReferencePicker
              :reference="reference"
              :upload-state="uploadState"
              :issues="referenceIssues"
              @select="handleReferenceSelect"
              @remove="removeReference"
              @retry="handleReferenceRetry"
            />
          </template>

          <template #settings>
            <details data-testid="composer-settings" class="mt-5">
              <summary
                data-testid="composer-settings-summary"
                class="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/15 bg-brand-ink px-3 text-sm font-medium text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
              >
                <span>Ajustes · {{ durationSeconds }} s</span>
                <span aria-hidden="true" class="text-brand-muted">⌄</span>
              </summary>

              <div class="mt-2 rounded-2xl border border-white/10 bg-brand-ink p-3">
                <label for="composer-duration" class="text-sm font-medium text-brand-text">
                  Duración
                </label>

                <select
                  id="composer-duration"
                  data-testid="composer-duration"
                  :value="durationSeconds"
                  class="mt-2 min-h-11 w-full rounded-2xl border border-white/15 bg-brand-ink px-3 text-base text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
                  @change="handleDurationChange"
                >
                  <option
                    v-for="duration in durations"
                    :key="duration"
                    :value="duration"
                  >
                    {{ duration }} s
                  </option>
                </select>

                <p class="mt-2 text-xs leading-relaxed text-brand-muted">
                  La duración afecta al tiempo de espera y al coste.
                </p>
              </div>
            </details>
          </template>
        </ComposerPromptForm>
      </template>
    </main>
  </div>
</template>
