<script setup lang="ts">
import { STORY_COPY, STORY_PRESETS } from '~/data/story'
import type { StoryPreset } from '~/models/story'

defineProps<{
  preset: StoryPreset
}>()

const emit = defineEmits<{
  'update:preset': [value: StoryPreset]
}>()

function handleChange(event: Event, value: StoryPreset): void {
  const target = event.target as HTMLInputElement | null

  if (target?.checked) {
    emit('update:preset', value)
  }
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-preset-legend" class="text-sm font-medium text-brand-text">
      {{ STORY_COPY.presetLegend }}
    </legend>

    <div
      data-testid="story-preset-group"
      role="radiogroup"
      aria-labelledby="story-preset-legend"
      class="mt-2 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="item in STORY_PRESETS"
        :key="item.preset"
        class="relative block cursor-pointer"
      >
        <input
          :id="`story-preset-${item.preset}`"
          :data-testid="`story-preset-${item.preset}`"
          type="radio"
          name="story-preset"
          :value="item.preset"
          :checked="preset === item.preset"
          class="peer sr-only"
          @change="handleChange($event, item.preset)"
        >

        <span
          class="flex min-h-11 flex-col gap-1 rounded-2xl border border-white/15 bg-brand-ink p-3 text-brand-text motion-safe:transition-colors peer-checked:border-brand-fuchsia peer-checked:bg-brand-fuchsia/10 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fuchsia peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText]"
        >
          <span class="text-sm font-semibold">{{ item.label }}</span>
          <span class="text-xs leading-relaxed text-brand-muted">{{ item.description }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
