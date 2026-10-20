<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ComposerGenerationProgress from '~/components/composer/ComposerGenerationProgress.vue'
import ComposerHeader from '~/components/composer/ComposerHeader.vue'
import ComposerPreview from '~/components/composer/ComposerPreview.vue'
import ComposerPromptForm from '~/components/composer/ComposerPromptForm.vue'
import ComposerReferencePicker from '~/components/composer/ComposerReferencePicker.vue'
import ComposerStepper from '~/components/composer/ComposerStepper.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { useComposer } from '~/composables/useComposer'
import { useComposerReferences } from '~/composables/useComposerReferences'
import { COMPOSER_MAX_REFERENCES } from '~/data/composer'

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
  title: 'AI Shorts — Estudio de creación (demo)',
  description:
    'Estudio de creación simulado de AI Shorts: describe una idea, añade referencias opcionales y genera una vista previa ficticia. No se crea ni se publica ningún vídeo real.',
})

const {
  references,
  issues: referenceIssues,
  addFiles,
  removeReference,
} = useComposerReferences()

const {
  prompt,
  issues,
  generation,
  step,
  statusMessage,
  generate,
  cancel,
  regenerate,
  edit,
  retry,
} = useComposer({ references })

const form = ref<{ focusPrompt: () => void } | null>(null)
const retryWrapper = ref<HTMLElement | null>(null)

const promptIssue = computed(
  () => issues.value.find((issue) => issue.field === 'prompt') ?? null,
)

function handlePromptUpdate(value: string): void {
  prompt.value = value
}

function focusPrompt(): void {
  void nextTick(() => {
    form.value?.focusPrompt()
  })
}

function handleSubmit(): void {
  generate()

  if (issues.value.some((issue) => issue.field === 'prompt')) {
    focusPrompt()
  }
}

function handleCancel(): void {
  cancel()
  focusPrompt()
}

function handleEdit(): void {
  edit()
  focusPrompt()
}

watch(
  () => generation.value.status,
  async (status) => {
    if (status !== 'error') return

    await nextTick()
    retryWrapper.value?.querySelector<HTMLButtonElement>('button')?.focus()
  },
)
</script>

<template>
  <div
    data-testid="composer-page"
    class="min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <ComposerHeader />

    <main class="mx-auto w-full max-w-3xl overflow-x-clip pb-[calc(env(safe-area-inset-bottom)_+_2rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-8">
      <h1
        data-testid="composer-h1"
        class="text-3xl font-semibold leading-tight tracking-tight text-brand-text sm:text-4xl"
      >
        Crea un short de prueba
      </h1>

      <p
        data-testid="composer-intro"
        class="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted sm:text-base"
      >
        Describe una idea, añade referencias opcionales y genera una vista previa simulada. No se crea ni se publica ningún vídeo real.
      </p>

      <noscript data-allow-mismatch="children">
        <p
          data-testid="composer-nojs-notice"
          class="mt-4 rounded-2xl border border-white/15 bg-brand-surface p-3 text-sm leading-relaxed text-brand-text"
        >
          El estudio de creación necesita JavaScript para generar la vista previa simulada. Puedes volver al feed de prueba.
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

      <ComposerGenerationProgress
        v-if="generation.status === 'generating'"
        :stage="generation.stage"
        :progress="generation.progress"
        :attempt="generation.attempt"
        @cancel="handleCancel"
      />

      <ComposerPreview
        v-else-if="generation.status === 'ready'"
        :preview="generation.result"
        @regenerate="regenerate"
        @edit="handleEdit"
      />

      <template v-else>
        <div
          v-if="generation.status === 'error'"
          data-testid="composer-error"
          role="alert"
          class="mt-6 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
        >
          <div class="flex items-start gap-2">
            <svg
              class="mt-0.5 size-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <p>{{ generation.message }}</p>
          </div>

          <div ref="retryWrapper" class="mt-3">
            <AppButton
              type="button"
              data-testid="composer-retry"
              @click="retry"
            >
              Reintentar
            </AppButton>
          </div>
        </div>

        <ComposerPromptForm
          ref="form"
          :prompt="prompt"
          :prompt-issue="promptIssue"
          @update:prompt="handlePromptUpdate"
          @submit="handleSubmit"
        >
          <template #references>
            <ComposerReferencePicker
              :references="references"
              :max-references="COMPOSER_MAX_REFERENCES"
              :issues="referenceIssues"
              @add="addFiles"
              @remove="removeReference"
            />
          </template>
        </ComposerPromptForm>
      </template>
    </main>
  </div>
</template>
