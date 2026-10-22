<script setup lang="ts">
import { computed } from 'vue'
import {
  STORY_COST_MODE_COPY,
  STORY_COST_PROFILES,
  STORY_DURATION_LABELS,
} from '~/data/story'
import type { StoryCostMode, StoryDurationSeconds } from '~/models/story'

const props = defineProps<{ costMode: StoryCostMode; targetDurationSeconds: StoryDurationSeconds }>()
const emit = defineEmits<{ 'update:targetDurationSeconds': [value: StoryDurationSeconds] }>()

const durations = computed(() => STORY_COST_PROFILES
  .filter((profile) => profile.costMode === props.costMode)
  .map((profile) => profile.durationSeconds))

function handleChange(event: Event, value: StoryDurationSeconds): void {
  const target = event.target as HTMLInputElement | null
  if (target?.checked) emit('update:targetDurationSeconds', value)
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-duration-legend" class="text-sm font-medium text-brand-text">Duración</legend>
    <div
      data-testid="story-duration-group"
      role="radiogroup"
      aria-labelledby="story-duration-legend"
      aria-describedby="story-duration-help"
      class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      <label v-for="item in durations" :key="item" class="relative block cursor-pointer">
        <input
          :id="`story-duration-${item}`"
          :data-testid="`story-duration-${item}`"
          type="radio"
          name="story-duration"
          :value="item"
          :checked="targetDurationSeconds === item"
          class="peer sr-only"
          @change="handleChange($event, item)"
        >
        <span class="flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-white/15 bg-brand-ink p-3 text-sm font-semibold text-brand-text peer-checked:border-brand-fuchsia forced-colors:border forced-colors:border-[ButtonText]">
          {{ STORY_DURATION_LABELS[item] }}
          <span v-if="item === 90" data-testid="story-duration-advanced" class="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-brand-muted">
            {{ STORY_COST_MODE_COPY.advanced }}
          </span>
        </span>
      </label>
    </div>
    <p id="story-duration-help" data-testid="story-duration-help" class="mt-2 text-xs text-brand-muted">
      {{ STORY_COST_MODE_COPY.durationHelp }}
    </p>
  </fieldset>
</template>
