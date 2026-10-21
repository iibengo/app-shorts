<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { STORY_COPY } from '~/data/story'

const heading = ref<HTMLHeadingElement | null>(null)

onMounted(() => {
  heading.value?.focus()
})

defineExpose({ heading })
</script>

<template>
  <section data-testid="story-qc-progress" class="mt-6">
    <h2
      ref="heading"
      data-testid="story-qc-progress-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.qcProgressTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ STORY_COPY.qcProgressNote }}
    </p>

    <div
      class="mt-4 h-2 w-full overflow-hidden rounded-full border border-white/10 bg-brand-surface"
      aria-hidden="true"
    >
      <div class="h-full w-1/3 rounded-full bg-brand-fuchsia motion-safe:animate-pulse motion-reduce:hidden" />
    </div>
  </section>
</template>
