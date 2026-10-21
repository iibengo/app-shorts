<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'
import type { Story, StoryScene } from '~/models/story'
import {
  countReadyVideos,
  formatStoryElapsed,
  sceneStatusLabel,
} from '~/utils/story'

const props = defineProps<{
  story: Story
  elapsedSeconds: number
  isSlow: boolean
}>()

const emit = defineEmits<{
  cancel: []
  retry: [sceneId: string]
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const orderedScenes = computed(() => (
  props.story.scenes.slice().sort((a, b) => a.order - b.order)
))
const done = computed(() => countReadyVideos(orderedScenes.value))
const elapsedLabel = computed(() => formatStoryElapsed(props.elapsedSeconds))

function canRetry(scene: StoryScene): boolean {
  return scene.status === 'VIDEO_FAILED' && scene.videoAttempts < 2
}

function statusLabel(scene: StoryScene): string {
  if (scene.status === 'KEYFRAME_READY' || scene.status === 'PENDING') {
    return 'Pendiente'
  }

  return sceneStatusLabel(scene.status)
}

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    data-testid="story-videos"
    aria-busy="true"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      data-testid="story-videos-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.videosTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ STORY_COPY.videosNote }}
    </p>

    <p
      data-testid="story-video-progress"
      class="mt-4 text-sm font-medium text-brand-text"
    >
      {{ done }} de {{ story.sceneCount }} vídeos listos
    </p>

    <ol class="mt-3 flex flex-col gap-2">
      <li
        v-for="scene in orderedScenes"
        :key="scene.id"
        data-testid="story-video-scene"
        :data-scene-order="scene.order"
        :data-scene-status="scene.status"
        class="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-brand-ink px-3 py-2 text-sm"
      >
        <span class="flex items-center gap-2 text-brand-text">
          <span
            aria-hidden="true"
            class="size-2.5 shrink-0 rounded-full"
            :class="{
              'bg-amber-400': scene.status === 'VIDEO_QUEUED' || scene.status === 'KEYFRAME_READY',
              'bg-brand-violet': scene.status === 'VIDEO_RUNNING',
              'bg-emerald-400': scene.status === 'VIDEO_READY',
              'bg-brand-fuchsia': scene.status === 'VIDEO_FAILED',
              'bg-white/30': scene.status === 'PENDING',
            }"
          />
          Escena {{ scene.order }} de {{ story.sceneCount }}
        </span>

        <span class="flex items-center gap-2">
          <span class="text-brand-muted">{{ statusLabel(scene) }}</span>

          <AppButton
            v-if="canRetry(scene)"
            type="button"
            variant="secondary"
            data-testid="story-video-retry"
            class="min-h-11 text-xs"
            @click="emit('retry', scene.id)"
          >
            {{ STORY_COPY.retryScene }}
          </AppButton>
        </span>
      </li>
    </ol>

    <p data-testid="story-elapsed" class="mt-3 text-xs tabular-nums text-brand-muted">
      Tiempo transcurrido: {{ elapsedLabel }}
    </p>

    <p
      v-if="isSlow"
      data-testid="story-slow"
      class="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text"
    >
      {{ STORY_COPY.videosSlow }}
    </p>

    <AppButton
      type="button"
      variant="secondary"
      data-testid="story-cancel"
      class="mt-4 w-full sm:w-auto"
      @click="emit('cancel')"
    >
      {{ STORY_COPY.cancel }}
    </AppButton>
  </section>
</template>
