<script setup lang="ts">
import { STORY_COST_MODE_COPY, STORY_PLATFORM_LABELS, STORY_PLATFORMS } from '~/data/story'
import type { StoryPlatform } from '~/models/story'

defineProps<{ platform: StoryPlatform }>()
const emit = defineEmits<{ 'update:platform': [value: StoryPlatform] }>()

function handleChange(event: Event, value: StoryPlatform): void {
  const target = event.target as HTMLInputElement | null
  if (target?.checked) emit('update:platform', value)
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-platform-legend" class="text-sm font-medium text-brand-text">Plataforma</legend>
    <div
      data-testid="story-platform-group"
      role="radiogroup"
      aria-labelledby="story-platform-legend"
      aria-describedby="story-platform-help"
      class="mt-2 grid gap-2 sm:grid-cols-2"
    >
      <label v-for="item in STORY_PLATFORMS" :key="item" class="relative block cursor-pointer">
        <input
          :id="`story-platform-${item}`"
          :data-testid="`story-platform-${item}`"
          type="radio"
          name="story-platform"
          :value="item"
          :checked="platform === item"
          class="peer sr-only"
          @change="handleChange($event, item)"
        >
        <span class="flex min-h-11 items-center justify-center rounded-2xl border border-white/15 bg-brand-ink p-3 text-sm font-semibold text-brand-text peer-checked:border-brand-fuchsia forced-colors:border forced-colors:border-[ButtonText]">
          {{ STORY_PLATFORM_LABELS[item] }}
        </span>
      </label>
    </div>
    <p id="story-platform-help" data-testid="story-platform-help" class="mt-2 text-xs text-brand-muted">
      {{ STORY_COST_MODE_COPY.platformHelp }}
    </p>
  </fieldset>
</template>
