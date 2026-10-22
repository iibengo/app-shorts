<script setup lang="ts">
import { computed } from 'vue'
import { STORY_COST_MODE_COPY, STORY_COST_PROFILES } from '~/data/story'
import type { StoryCostMode, StoryDurationSeconds } from '~/models/story'

const props = defineProps<{ costMode: StoryCostMode; targetDurationSeconds: StoryDurationSeconds }>()
const profile = computed(() => STORY_COST_PROFILES.find((item) =>
  item.costMode === props.costMode && item.durationSeconds === props.targetDurationSeconds))
const budgetCap = computed(() => profile.value?.capUsd ?? 0)
const estimatedCost = computed(() => {
  if (!profile.value) return 0
  const shots = profile.value.exactShotCount ?? profile.value.shotMax

  return 0.032 + shots * (0.05 + 0.35)
})
</script>

<template>
  <div v-if="profile" class="mt-3 space-y-2">
    <p data-testid="story-cost-summary" class="rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs text-brand-muted">
      <span>{{ profile.durationSeconds }} s · {{ profile.exactShotCount ?? `${profile.shotMin}–${profile.shotMax}` }} planos · {{ profile.sceneMin }}–{{ profile.sceneMax }} escenas · </span>
      <span data-testid="story-cost-summary-cost" :data-cost-usd="estimatedCost.toFixed(2)">coste estimado ≈ {{ estimatedCost.toFixed(2) }} USD</span>
      <span> · </span>
      <span data-testid="story-cost-summary-time">{{ profile.timeMinMinutes }}–{{ profile.timeMaxMinutes }} min</span>
    </p>
    <p v-if="costMode === 'budget'" data-testid="story-budget-warning" class="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text">
      {{ STORY_COST_MODE_COPY.budgetWarning.replace('{cap}', budgetCap.toFixed(2)) }}
    </p>
    <p v-if="targetDurationSeconds === 90" data-testid="story-90-warning" class="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text">
      {{ STORY_COST_MODE_COPY.warning90 }}
    </p>
    <p data-testid="story-style-help" class="text-xs text-brand-muted">{{ STORY_COST_MODE_COPY.styleHelp }}</p>
  </div>
</template>
