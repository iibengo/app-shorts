<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'
import type { Story, StoryShot } from '~/models/story'
import {
  formatStoryElapsed,
  sceneStatusLabel,
  storyCameraLabel,
} from '~/utils/story'

const props = defineProps<{
  story: Story
  phase: 'keyframes' | 'videos' | 'assembling'
  elapsedSeconds: number
  isSlow: boolean
}>()
const emit = defineEmits<{
  cancel: []
  retryShot: [shotId: string]
  regenerateShot: [shotId: string, visualPrompt: string, durationSeconds: number]
}>()
const heading = ref<HTMLHeadingElement | null>(null)

const scenes = computed(() => props.story.scenes.slice().sort((a, b) => a.order - b.order))
const shots = computed(() => scenes.value.flatMap((scene) => scene.shots))
const done = computed(() => shots.value.filter((shot) =>
  props.phase === 'keyframes'
    ? shot.status === 'KEYFRAME_READY' || shot.status === 'VIDEO_READY'
    : shot.status === 'VIDEO_READY').length)
const title = computed(() => props.phase === 'keyframes'
  ? 'Preparando los planos'
  : props.phase === 'videos'
    ? STORY_COPY.videosTitle
    : 'Montando el vídeo final')

function canRetry(shot: StoryShot): boolean {
  return shot.status === 'VIDEO_FAILED' && shot.videoAttempts < 2
}

function canRegenerate(shot: StoryShot): boolean {
  return (shot.status === 'KEYFRAME_FAILED' || shot.status === 'PENDING')
    && shot.keyframeAttempts < 2
}

onMounted(() => heading.value?.focus())
</script>

<template>
  <section data-testid="story-shot-progress" :data-phase="phase" aria-busy="true" class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6">
    <h2 ref="heading" data-testid="story-shot-progress-heading" tabindex="-1" class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl">
      {{ title }}
    </h2>
    <p data-testid="story-shot-progress-total" class="mt-2 text-sm text-brand-text">
      {{ done }} de {{ shots.length }} {{ phase === 'videos' ? 'vídeos' : 'planos' }} listos · {{ story.plannedDurationSeconds }} s planificados
    </p>

    <section v-for="scene in scenes" :key="scene.id" class="mt-4">
      <h3 class="text-sm font-semibold text-brand-text">Escena {{ scene.order }} · {{ sceneStatusLabel(scene.status) }}</h3>
      <ol class="mt-2 flex flex-col gap-2">
        <li
          v-for="shot in scene.shots.slice().sort((a, b) => a.order - b.order)"
          :key="shot.id"
          data-testid="story-shot-progress-row"
          :data-shot-order="shot.order"
          :data-shot-status="shot.status"
          class="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-brand-ink px-3 py-2 text-sm"
        >
          <span class="text-brand-text">
            Plano {{ shot.order }} · {{ shot.durationSeconds }} s · {{ storyCameraLabel(shot.camera) }}
          </span>
          <span class="flex items-center gap-2">
            <span class="text-brand-muted">{{ sceneStatusLabel(shot.status) }}</span>
            <AppButton v-if="phase === 'videos' && canRetry(shot)" type="button" variant="secondary" data-testid="story-shot-retry" class="min-h-11 text-xs" @click="emit('retryShot', shot.id)">
              Reintentar
            </AppButton>
            <AppButton v-else-if="phase === 'keyframes' && canRegenerate(shot)" type="button" variant="secondary" data-testid="story-shot-regenerate" class="min-h-11 text-xs" @click="emit('regenerateShot', shot.id, shot.visualPrompt, shot.durationSeconds)">
              Regenerar
            </AppButton>
          </span>
        </li>
      </ol>
    </section>

    <p data-testid="story-shot-elapsed" class="mt-3 text-xs tabular-nums text-brand-muted">
      Tiempo transcurrido: {{ formatStoryElapsed(elapsedSeconds) }}
    </p>
    <p v-if="isSlow" data-testid="story-shot-slow" class="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text">
      {{ STORY_COPY.videosSlow }}
    </p>

    <AppButton v-if="phase !== 'assembling'" type="button" variant="secondary" data-testid="story-shot-cancel" class="mt-4 w-full sm:w-auto" @click="emit('cancel')">
      {{ STORY_COPY.cancel }}
    </AppButton>
  </section>
</template>
