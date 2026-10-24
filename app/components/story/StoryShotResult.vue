<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import {
  STORY_COST_MODE_LABELS,
  STORY_COST_MODE_COPY,
  STORY_COPY,
} from '~/data/story'
import type { Story } from '~/models/story'
import { storyModeLabel } from '~/utils/story'

const props = defineProps<{ story: Story }>()
const emit = defineEmits<{ restart: [] }>()
const heading = ref<HTMLHeadingElement | null>(null)
const duration = computed(() =>
  props.story.finalDurationSeconds ?? props.story.plannedDurationSeconds)
const shots = computed(() =>
  props.story.scenes.reduce((total, scene) => total + scene.shots.length, 0))
const poster = computed(() =>
  props.story.scenes.flatMap((scene) => scene.shots).find((shot) => shot.keyframeUrl)?.keyframeUrl)

onMounted(() => heading.value?.focus())
</script>

<template>
  <section data-testid="story-shot-result" class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6">
    <span data-testid="story-shot-result-badge" class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia">{{ STORY_COPY.resultBadge }}</span>
    <h2 ref="heading" data-testid="story-shot-result-heading" tabindex="-1" class="mt-2 text-lg font-semibold text-brand-text sm:text-xl">
      {{ STORY_COPY.resultTitle }}
    </h2>

    <video v-if="story.finalVideoUrl" data-testid="story-shot-final-video" :src="story.finalVideoUrl" :poster="poster ?? undefined" :aria-label="story.title ?? 'Vídeo final'" controls playsinline preload="metadata" controlslist="nodownload" class="mt-4 aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 bg-black object-cover" />

    <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <div><dt class="text-brand-muted">Planos</dt><dd data-testid="story-shot-result-shots" class="text-brand-text">{{ shots }}</dd></div>
      <div><dt class="text-brand-muted">Duración final</dt><dd data-testid="story-shot-result-duration" class="text-brand-text tabular-nums">{{ duration }} s</dd></div>
      <div><dt class="text-brand-muted">Formato</dt><dd class="text-brand-text">9:16</dd></div>
      <div><dt class="text-brand-muted">Modo</dt><dd data-testid="story-shot-result-mode" class="text-brand-text">{{ storyModeLabel(story.mode) }}</dd></div>
      <div><dt class="text-brand-muted">Coste</dt><dd data-testid="story-shot-result-cost" class="text-brand-text">{{ STORY_COST_MODE_LABELS[story.costMode] }}</dd></div>
    </dl>

    <p class="mt-4 text-xs leading-relaxed text-brand-muted">{{ STORY_COST_MODE_COPY.styleHelp }}</p>

    <AppButton type="button" data-testid="story-shot-restart" class="mt-4 w-full sm:w-auto" @click="emit('restart')">
      {{ STORY_COPY.startAnother }}
    </AppButton>
  </section>
</template>
