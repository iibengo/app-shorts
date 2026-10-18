<script setup lang="ts">
import { computed } from 'vue'
import type { ShortPoster } from '~/types/short'
import { formatDuration } from '~/utils/shorts'

const props = withDefaults(
  defineProps<{
    poster: ShortPoster
    durationSeconds: number
    priority?: boolean
  }>(),
  {
    priority: false,
  },
)

const durationLabel = computed(() => `Duración: ${props.durationSeconds} segundos`)
const visibleDuration = computed(() => formatDuration(props.durationSeconds))
</script>

<template>
  <div class="absolute inset-0 z-0">
    <img
      data-testid="short-poster"
      :src="poster.src"
      :alt="poster.alt"
      :width="poster.width"
      :height="poster.height"
      :loading="priority ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : undefined"
      decoding="async"
      class="h-full w-full object-cover"
    >

    <div
      data-testid="short-scrim-top"
      class="pointer-events-none absolute inset-x-0 top-0 z-10 h-[32%]"
      style="background: linear-gradient(180deg, rgba(9, 9, 11, 0.88) 0%, rgba(9, 9, 11, 0.45) 55%, rgba(9, 9, 11, 0) 100%)"
      aria-hidden="true"
    />

    <div
      data-testid="short-scrim-bottom"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[68%]"
      style="background: linear-gradient(0deg, rgba(9, 9, 11, 0.96) 0%, rgba(9, 9, 11, 0.72) 38%, rgba(9, 9, 11, 0.28) 70%, rgba(9, 9, 11, 0) 100%)"
      aria-hidden="true"
    />

    <span
      data-testid="short-duration"
      role="timer"
      :aria-label="durationLabel"
      class="absolute right-3 top-[calc(env(safe-area-inset-top)_+_7.5rem)] z-20 rounded-full bg-black/[0.55] px-2.5 py-1 text-[11px] font-medium tabular-nums text-white forced-colors:border forced-colors:border-[ButtonText] sm:right-5 sm:top-[calc(env(safe-area-inset-top)_+_4.5rem)]"
    >{{ visibleDuration }}</span>
  </div>
</template>
