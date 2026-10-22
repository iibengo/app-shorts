<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY, STORY_MAX_PREMISE_LENGTH } from '~/data/story'
import type { StoryJobError } from '~/models/story'

const props = withDefaults(
  defineProps<{
    premise: string
    issue: StoryJobError | null
    submitDisabled?: boolean
  }>(),
  {
    submitDisabled: false,
  },
)

const emit = defineEmits<{
  'update:premise': [value: string]
  submit: []
}>()

const premiseInput = ref<HTMLTextAreaElement | null>(null)

const premiseLength = computed(() => props.premise.length)
const describedBy = computed(() => (
  props.issue
    ? 'story-premise-help story-premise-error'
    : 'story-premise-help'
))

function handleInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:premise', target?.value ?? '')
}

function focusPremise(): void {
  premiseInput.value?.focus()
}

defineExpose({ focusPremise })
</script>

<template>
  <form
    data-testid="story-create-form"
    novalidate
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
    @submit.prevent="emit('submit')"
  >
    <h2 class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl">
      {{ STORY_COPY.formTitle }}
    </h2>

    <div class="mt-4">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <label for="story-premise-input" class="text-sm font-medium text-brand-text">
          {{ STORY_COPY.premiseLabel }}
        </label>

        <span
          data-testid="story-premise-counter"
          :aria-label="`${premiseLength} de 600 caracteres`"
          class="text-xs tabular-nums text-brand-muted"
        >{{ premiseLength }}/600</span>
      </div>

      <textarea
        id="story-premise-input"
        ref="premiseInput"
        data-testid="story-premise"
        :value="premise"
        :maxlength="STORY_MAX_PREMISE_LENGTH"
        :placeholder="STORY_COPY.premisePlaceholder"
        rows="5"
        aria-required="true"
        :aria-invalid="issue ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/15 bg-brand-ink px-3 py-3 text-base leading-relaxed text-brand-text placeholder:text-brand-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
        @input="handleInput"
      />

      <p id="story-premise-help" data-testid="story-premise-help" class="mt-2 text-xs text-brand-muted">
        {{ STORY_COPY.premiseHelp }}
      </p>

      <p
        v-if="issue"
        id="story-premise-error"
        data-testid="story-premise-error"
        role="alert"
        class="mt-2 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
      >
        {{ issue.message }}
      </p>
    </div>

    <slot name="mode" />
    <slot name="sceneCount" />
    <slot name="preset" />
    <slot name="reference" />

    <p
      data-testid="story-privacy"
      class="mt-5 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
    >
      {{ STORY_COPY.privacy }}
    </p>

    <AppButton
      type="submit"
      data-testid="story-create"
      :disabled="submitDisabled"
      class="mt-5 min-h-12 w-full text-base"
    >
      {{ STORY_COPY.create }}
    </AppButton>
  </form>
</template>
