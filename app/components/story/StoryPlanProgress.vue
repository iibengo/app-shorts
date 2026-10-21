<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { STORY_COPY } from '~/data/story'

const props = defineProps<{
  status: 'planning' | 'keyframes'
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const isPlanning = computed(() => props.status === 'planning')
const title = computed(() => (
  isPlanning.value ? STORY_COPY.planning : STORY_COPY.keyframes
))
const note = computed(() => (
  isPlanning.value ? STORY_COPY.planningNote : STORY_COPY.keyframesNote
))

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    :data-testid="isPlanning ? 'story-planning' : 'story-keyframes'"
    aria-busy="true"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ title }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ note }}
    </p>

    <div
      role="status"
      aria-live="polite"
      class="mt-4 flex items-center gap-2 text-sm text-brand-text"
    >
      <span
        aria-hidden="true"
        class="size-3 rounded-full border-2 border-brand-fuchsia border-t-transparent motion-safe:animate-spin"
      />
      <span>{{ title }}</span>
    </div>
  </section>
</template>
