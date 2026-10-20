<script setup lang="ts">
import { onMounted, ref } from 'vue'
import FeedEnd from '~/components/shorts/FeedEnd.vue'
import ShortCard from '~/components/shorts/ShortCard.vue'
import { useActiveShort } from '~/composables/useActiveShort'
import { useShortsFeed } from '~/composables/useShortsFeed'
import type { Short, ShortId } from '~/models/short'

const props = defineProps<{
  shorts: readonly Short[]
}>()

const emit = defineEmits<{
  share: [short: Short]
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const { states, toggleLike, toggleSave } = useShortsFeed(props.shorts)
const { activeShortId } = useActiveShort({
  container: scrollContainer,
  initialId: props.shorts[0]?.id ?? 'short-001',
})

onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
})

function isLikedFor(id: ShortId): boolean {
  return states[id]?.isLiked ?? false
}

function isSavedFor(id: ShortId): boolean {
  return states[id]?.isSaved ?? false
}
</script>

<template>
  <main
    ref="scrollContainer"
    data-testid="shorts-feed"
    data-scroll-lock
    tabindex="0"
    class="relative h-svh w-full snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain bg-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-fuchsia"
  >
    <h1 class="sr-only">Feed de shorts de prueba</h1>

    <ShortCard
      v-for="(short, index) in shorts"
      :key="short.id"
      :short="short"
      :is-liked="isLikedFor(short.id)"
      :is-saved="isSavedFor(short.id)"
      :is-active="activeShortId === short.id"
      :priority="index === 0"
      @toggle-like="toggleLike"
      @toggle-save="toggleSave"
      @share="emit('share', $event)"
    />

    <FeedEnd />
  </main>
</template>
