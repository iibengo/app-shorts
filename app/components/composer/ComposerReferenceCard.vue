<script setup lang="ts">
import type { ComposerReference } from '~/models/composer'
import { formatFileSize } from '~/utils/composer'

const props = defineProps<{
  reference: ComposerReference
}>()

const emit = defineEmits<{
  remove: []
}>()

const removeLabel = `Eliminar ${props.reference.fileName}`
</script>

<template>
  <li
    data-testid="composer-reference-card"
    :data-reference-id="reference.id"
    data-reference-kind="image"
    tabindex="-1"
    class="flex items-start gap-3 rounded-2xl border border-white/10 bg-brand-ink p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
  >
    <img
      v-if="reference.previewUrl"
      data-testid="composer-reference-thumbnail"
      :src="reference.previewUrl"
      alt=""
      class="size-14 shrink-0 rounded-xl object-cover"
    >

    <span
      v-else
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
        Imagen · {{ formatFileSize(reference.sizeBytes) }}
      </p>
    </div>

    <button
      type="button"
      data-testid="composer-reference-remove"
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
</template>
