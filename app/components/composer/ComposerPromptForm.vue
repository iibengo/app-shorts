<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { COMPOSER_MAX_PROMPT_LENGTH } from '~/data/composer'
import type { ComposerValidationIssue } from '~/models/composer'

const props = withDefaults(
  defineProps<{
    prompt: string
    promptIssue: ComposerValidationIssue | null
    submitDisabled?: boolean
  }>(),
  {
    submitDisabled: false,
  },
)

const emit = defineEmits<{
  'update:prompt': [value: string]
  submit: []
}>()

const promptInput = ref<HTMLTextAreaElement | null>(null)

const promptLength = computed(() => props.prompt.length)
const describedBy = computed(() => (
  props.promptIssue
    ? 'composer-prompt-help composer-prompt-error'
    : 'composer-prompt-help'
))

function handleInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:prompt', target?.value ?? '')
}

function focusPrompt(): void {
  promptInput.value?.focus()
}

defineExpose({ focusPrompt })
</script>

<template>
  <form
    data-testid="composer-form"
    novalidate
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
    @submit.prevent="emit('submit')"
  >
    <h2 class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl">Tu idea</h2>

    <div class="mt-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <label for="composer-prompt-input" class="text-sm font-medium text-brand-text">
          Describe tu idea
        </label>

        <span
          data-testid="composer-prompt-counter"
          :aria-label="`${promptLength} de 280 caracteres`"
          class="text-xs tabular-nums text-brand-muted"
        >{{ promptLength }}/280</span>
      </div>

      <textarea
        id="composer-prompt-input"
        ref="promptInput"
        data-testid="composer-prompt-input"
        :value="prompt"
        :maxlength="COMPOSER_MAX_PROMPT_LENGTH"
        placeholder="Un short sobre cómo preparar tu primer set de grabación."
        rows="5"
        aria-required="true"
        :aria-invalid="promptIssue ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/15 bg-brand-ink px-3 py-3 text-base leading-relaxed text-brand-text placeholder:text-brand-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
        @input="handleInput"
      />

      <p id="composer-prompt-help" data-testid="composer-prompt-help" class="mt-2 text-xs text-brand-muted">
        Máximo 280 caracteres.
      </p>

      <p
        v-if="promptIssue"
        id="composer-prompt-error"
        data-testid="composer-prompt-error"
        role="alert"
        class="mt-2 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
      >
        {{ promptIssue.message }}
      </p>
    </div>

    <slot name="preset" />
    <slot name="reference" />
    <slot name="settings" />

    <p
      data-testid="composer-privacy"
      class="mt-5 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
    >
      Tu idea y tu imagen se envían a Fal para generar el vídeo. AI Shorts no las guarda. La imagen de referencia se elimina del almacenamiento de Fal en 1 hora.
    </p>

    <AppButton
      type="submit"
      data-testid="composer-generate"
      :disabled="submitDisabled"
      class="mt-5 min-h-12 w-full text-base"
    >
      Generar vídeo
    </AppButton>
  </form>
</template>
