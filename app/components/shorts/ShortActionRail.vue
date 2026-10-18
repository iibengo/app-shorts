<script setup lang="ts">
import ActionIconButton from '~/components/ui/ActionIconButton.vue'
import type { Short, ShortId } from '~/types/short'
import { formatCount } from '~/utils/shorts'

const props = defineProps<{
  short: Short
  isLiked: boolean
  isSaved: boolean
}>()

const emit = defineEmits<{
  'toggle-like': [id: ShortId]
  'toggle-save': [id: ShortId]
  share: [short: Short]
}>()

const likeCountId = `${props.short.id}-like-count`
const saveCountId = `${props.short.id}-save-count`
</script>

<template>
  <div
    data-testid="short-action-rail"
    class="flex flex-col items-center gap-4"
  >
    <div class="flex flex-col items-center gap-1">
      <ActionIconButton
        data-testid="short-like"
        label="Me gusta"
        :pressed="isLiked"
        tone="like"
        :described-by="likeCountId"
        @click="emit('toggle-like', short.id)"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          :fill="isLiked ? 'currentColor' : 'none'"
          :stroke="isLiked ? 'none' : 'currentColor'"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
        </svg>
      </ActionIconButton>

      <span
        :id="likeCountId"
        data-testid="short-like-count"
        role="img"
        :aria-label="`${short.stats.likes} me gusta`"
        class="text-[11px] font-medium tabular-nums text-white/90"
      >{{ formatCount(short.stats.likes) }}</span>
    </div>

    <div class="flex flex-col items-center gap-1">
      <ActionIconButton
        data-testid="short-save"
        label="Guardar"
        :pressed="isSaved"
        tone="save"
        :described-by="saveCountId"
        @click="emit('toggle-save', short.id)"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          :fill="isSaved ? 'currentColor' : 'none'"
          :stroke="isSaved ? 'none' : 'currentColor'"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 3.75h12a1 1 0 0 1 1 1v16.1a.5.5 0 0 1-.77.42L12 17.68l-6.23 3.59a.5.5 0 0 1-.77-.42V4.75a1 1 0 0 1 1-1Z" />
        </svg>
      </ActionIconButton>

      <span
        :id="saveCountId"
        data-testid="short-save-count"
        role="img"
        :aria-label="`${short.stats.saves} guardados`"
        class="text-[11px] font-medium tabular-nums text-white/90"
      >{{ formatCount(short.stats.saves) }}</span>
    </div>

    <ActionIconButton
      data-testid="short-share"
      label="Compartir"
      @click="emit('share', short)"
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
        <path d="M12 15V3m0 0 4 4m-4-4L8 7" />
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
    </ActionIconButton>
  </div>
</template>
