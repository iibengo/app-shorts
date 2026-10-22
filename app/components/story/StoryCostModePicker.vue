<script setup lang="ts">
import {
  STORY_COST_MODE_COPY,
  STORY_COST_MODE_DESCRIPTIONS,
  STORY_COST_MODE_LABELS,
  STORY_COST_MODES,
} from '~/data/story'
import type { StoryCostMode } from '~/models/story'

defineProps<{ costMode: StoryCostMode }>()
const emit = defineEmits<{ 'update:costMode': [value: StoryCostMode] }>()

function handleChange(event: Event, value: StoryCostMode): void {
  const target = event.target as HTMLInputElement | null
  if (target?.checked) emit('update:costMode', value)
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-cost-mode-legend" class="text-sm font-medium text-brand-text">
      {{ STORY_COST_MODE_COPY.legend }}
    </legend>
    <div
      data-testid="story-cost-mode-group"
      role="radiogroup"
      aria-labelledby="story-cost-mode-legend"
      aria-describedby="story-cost-mode-help"
      class="mt-2 grid gap-2 sm:grid-cols-3"
    >
      <label v-for="item in STORY_COST_MODES" :key="item" class="relative block cursor-pointer">
        <input
          :id="`story-cost-mode-${item}`"
          :data-testid="`story-cost-mode-${item}`"
          type="radio"
          name="story-cost-mode"
          :value="item"
          :checked="costMode === item"
          class="peer sr-only"
          @change="handleChange($event, item)"
        >
        <span class="flex min-h-11 flex-col gap-1 rounded-2xl border border-white/15 bg-brand-ink p-3 text-brand-text peer-checked:border-brand-fuchsia peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fuchsia forced-colors:border forced-colors:border-[ButtonText]">
          <span class="text-sm font-semibold">{{ STORY_COST_MODE_LABELS[item] }}</span>
          <span class="text-xs leading-relaxed text-brand-muted">{{ STORY_COST_MODE_DESCRIPTIONS[item] }}</span>
        </span>
      </label>
    </div>
    <p id="story-cost-mode-help" data-testid="story-cost-mode-help" class="mt-2 text-xs text-brand-muted">
      {{ STORY_COST_MODE_COPY.help }}
    </p>
  </fieldset>
</template>
