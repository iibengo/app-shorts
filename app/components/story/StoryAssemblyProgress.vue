<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { STORY_COPY } from '~/data/story'
import { formatStoryElapsed } from '~/utils/story'

const props = defineProps<{
  elapsedSeconds: number
}>()

const heading = ref<HTMLHeadingElement | null>(null)
const elapsedLabel = computed(() => formatStoryElapsed(props.elapsedSeconds))

const steps: readonly { readonly id: 'download' | 'concat' | 'upload'; readonly label: string }[] = [
  { id: 'download', label: STORY_COPY.assemblyStepDownload },
  { id: 'concat', label: STORY_COPY.assemblyStepConcat },
  { id: 'upload', label: STORY_COPY.assemblyStepUpload },
]

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    data-testid="story-assembling"
    aria-busy="true"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      data-testid="story-assembly-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.assemblyTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ STORY_COPY.assemblyNote }}
    </p>

    <ol class="mt-4 flex flex-col gap-2">
      <li
        v-for="step in steps"
        :key="step.id"
        data-testid="story-assembly-step"
        :data-step="step.id"
        class="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-brand-ink px-3 text-sm"
      >
        <span
          aria-hidden="true"
          class="size-2.5 shrink-0 rounded-full border border-white/30"
        />
        <span class="text-brand-text">{{ step.label }}</span>
      </li>
    </ol>

    <div
      role="progressbar"
      aria-label="Montaje del vídeo final"
      class="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10 forced-colors:border forced-colors:border-[ButtonText]"
    >
      <div class="story-assembly-bar h-full w-2/5 rounded-full bg-gradient-to-r from-brand-violet to-brand-fuchsia" />
    </div>

    <p data-testid="story-elapsed" class="mt-3 text-xs tabular-nums text-brand-muted">
      Tiempo transcurrido: {{ elapsedLabel }}
    </p>
  </section>
</template>

<style scoped>
.story-assembly-bar {
  width: 40%;
}

@media (prefers-reduced-motion: no-preference) {
  .story-assembly-bar {
    animation: story-assembly-indeterminate 1.4s ease-in-out infinite;
  }
}

@keyframes story-assembly-indeterminate {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
