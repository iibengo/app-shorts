<script setup lang="ts">
import { computed } from 'vue'
import ShortActionRail from '~/components/shorts/ShortActionRail.vue'
import ShortPoster from '~/components/shorts/ShortPoster.vue'
import type { Short, ShortId } from '~/types/short'

const props = defineProps<{
  short: Short
  isLiked: boolean
  isSaved: boolean
  isActive: boolean
  priority?: boolean
}>()

const emit = defineEmits<{
  'toggle-like': [id: ShortId]
  'toggle-save': [id: ShortId]
  share: [short: Short]
}>()

const titleId = computed(() => `${props.short.id}-title`)
</script>

<template>
  <article
    :data-short-id="short.id"
    :data-active="isActive ? 'true' : 'false'"
    :aria-current="isActive ? 'true' : undefined"
    :aria-labelledby="titleId"
    data-testid="short-card"
    class="relative flex min-h-svh w-full snap-start snap-always items-center justify-center overflow-hidden bg-brand-ink"
  >
    <div
      class="relative flex min-h-svh w-full flex-col justify-end overflow-hidden bg-brand-ink md:h-[calc(100svh_-_3rem)] md:min-h-0 md:max-h-[56rem] md:w-auto md:max-w-full md:aspect-[9/16] md:rounded-[28px] md:border md:border-white/10 md:shadow-2xl md:shadow-black/50"
    >
      <ShortPoster
        :poster="short.media.poster"
        :duration-seconds="short.durationSeconds"
        :priority="priority"
      />

      <div
        class="relative z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] pl-4 pr-20 pt-24 sm:pl-6 sm:pr-24 forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
      >
        <div data-testid="short-creator" class="flex flex-col">
          <p class="text-sm font-semibold text-white forced-colors:text-[CanvasText]">
            {{ short.creator.name }}
          </p>
          <p class="text-xs text-zinc-200 forced-colors:text-[CanvasText]">
            {{ short.creator.handle }}
          </p>
        </div>

        <h2
          :id="titleId"
          data-testid="short-title"
          class="line-clamp-2 text-xl font-semibold leading-[1.1] tracking-tight text-white sm:text-2xl md:text-3xl forced-colors:text-[CanvasText]"
        >
          {{ short.title }}
        </h2>

        <ul
          data-testid="short-tags"
          class="flex flex-wrap gap-1.5"
        >
          <li
            v-for="tag in short.tags"
            :key="tag"
            class="rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
          >
            {{ tag }}
          </li>
        </ul>
      </div>

      <div
        class="absolute bottom-[calc(env(safe-area-inset-bottom)_+_1.5rem)] right-[calc(env(safe-area-inset-right)_+_0.75rem)] z-30 sm:right-[calc(env(safe-area-inset-right)_+_1.25rem)]"
      >
        <ShortActionRail
          :short="short"
          :is-liked="isLiked"
          :is-saved="isSaved"
          @toggle-like="emit('toggle-like', $event)"
          @toggle-save="emit('toggle-save', $event)"
          @share="emit('share', $event)"
        />
      </div>
    </div>
  </article>
</template>
