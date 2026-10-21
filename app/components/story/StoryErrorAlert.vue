<script setup lang="ts">
import type { StoryJobError } from '~/models/story'

defineProps<{
  error: StoryJobError
}>()
</script>

<template>
  <div
    data-testid="story-error"
    role="alert"
    class="mt-6 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text forced-colors:border forced-colors:border-[ButtonText]"
  >
    <p>{{ error.message }}</p>

    <div v-if="$slots.default" class="mt-3 flex flex-col gap-2 sm:flex-row">
      <slot />
    </div>
  </div>
</template>
