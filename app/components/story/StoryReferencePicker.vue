<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import {
  STORY_COPY,
  STORY_FILE_ACCEPT,
} from '~/data/story'
import type { StoryJobError, StoryReference } from '~/models/story'
import { formatStoryFileSize } from '~/utils/story'

const props = defineProps<{
  reference: StoryReference | null
  uploadState: 'idle' | 'uploading' | 'error'
  issues: readonly StoryJobError[]
}>()

const emit = defineEmits<{
  select: [file: File]
  remove: []
  retry: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const isUploading = computed(() => props.uploadState === 'uploading')
const hasError = computed(() => props.issues.length > 0 || props.uploadState === 'error')
const referenceCount = computed(() => (props.reference ? 1 : 0))
const removeLabel = computed(() => (
  props.reference ? `Eliminar ${props.reference.fileName}` : 'Eliminar imagen'
))

function openFilePicker(): void {
  fileInput.value?.click()
}

function handleChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (input) {
    input.value = ''
  }

  if (file) {
    emit('select', file)
  }
}
</script>

<template>
  <section
    data-testid="story-reference"
    aria-labelledby="story-reference-heading"
    class="mt-5"
  >
    <h3
      id="story-reference-heading"
      class="text-sm font-medium tracking-tight text-brand-text"
    >
      {{ STORY_COPY.referenceTitle }}
    </h3>

    <p class="mt-1 text-xs leading-relaxed text-brand-muted">
      {{ STORY_COPY.referenceHelp }}
    </p>

    <div class="mt-3">
      <input
        id="story-reference-input"
        ref="fileInput"
        data-testid="story-reference-input"
        type="file"
        :accept="STORY_FILE_ACCEPT"
        tabindex="-1"
        aria-label="Añadir imagen"
        class="sr-only"
        @change="handleChange"
      >

      <button
        type="button"
        data-testid="story-reference-add"
        :disabled="reference !== null || isUploading"
        class="flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
        @click="openFilePicker"
      >
        {{ STORY_COPY.referenceAdd }}
      </button>

      <div class="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p
          data-testid="story-reference-count"
          class="text-xs tabular-nums text-brand-muted"
        >{{ referenceCount }} de 1</p>

        <p v-if="reference" class="text-xs leading-relaxed text-brand-muted">
          {{ STORY_COPY.referenceMax }}
        </p>
      </div>

      <p
        v-if="reference && uploadState === 'idle'"
        role="status"
        aria-live="polite"
        class="sr-only"
      >
        {{ STORY_COPY.referenceReady }}
      </p>

      <p
        v-if="!reference && !isUploading"
        data-testid="story-reference-empty"
        class="mt-1 text-xs leading-relaxed text-brand-muted"
      >
        {{ STORY_COPY.referenceEmpty }}
      </p>

      <p
        v-if="isUploading"
        data-testid="story-reference-uploading"
        role="status"
        aria-live="polite"
        class="mt-2 flex items-center gap-2 text-xs text-brand-text"
      >
        <span
          aria-hidden="true"
          class="size-3 rounded-full border-2 border-brand-fuchsia border-t-transparent motion-safe:animate-spin"
        />
        {{ STORY_COPY.referenceUploading }}
      </p>

      <div
        v-if="hasError"
        data-testid="story-reference-error"
        role="alert"
        class="mt-3 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
      >
        <p v-for="(issue, index) in issues" :key="`${issue.code}-${index}`">
          {{ issue.message }}
        </p>

        <div v-if="uploadState === 'error'" class="mt-3">
          <AppButton
            type="button"
            data-testid="story-reference-retry"
            @click="emit('retry')"
          >
            {{ STORY_COPY.referenceRetry }}
          </AppButton>
        </div>
      </div>

      <ul v-if="reference" class="mt-3">
        <li
          data-testid="story-reference-card"
          tabindex="-1"
          class="flex items-start gap-3 rounded-2xl border border-white/10 bg-brand-ink p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
        >
          <span
            aria-hidden="true"
            class="flex size-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-brand-muted forced-colors:border forced-colors:border-[ButtonText]"
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              focusable="false"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m21 16-4.5-4.5L8 20" />
            </svg>
          </span>

          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 break-words text-sm font-medium text-brand-text">
              {{ reference.fileName }}
            </p>
            <p class="mt-0.5 text-xs text-brand-muted">
              Imagen · {{ formatStoryFileSize(reference.sizeBytes) }}
            </p>
          </div>

          <button
            type="button"
            data-testid="story-reference-remove"
            :aria-label="removeLabel"
            class="flex size-11 shrink-0 items-center justify-center rounded-full text-brand-muted motion-safe:transition-colors hover:bg-white/5 hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
            @click="emit('remove')"
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <span class="sr-only">{{ removeLabel }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
