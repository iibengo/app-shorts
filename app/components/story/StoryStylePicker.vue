<script setup lang="ts">
import { STORY_COPY, STORY_VISUAL_STYLE_OPTIONS } from '~/data/story'
import type { StoryVisualStyle } from '~/models/story'

defineProps<{
  visualStyle: StoryVisualStyle
}>()

const emit = defineEmits<{
  'update:visualStyle': [value: StoryVisualStyle]
}>()

function handleChange(event: Event, value: StoryVisualStyle): void {
  const target = event.target as HTMLInputElement | null

  if (target?.checked) {
    emit('update:visualStyle', value)
  }
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-style-legend" class="text-sm font-medium text-brand-text">
      {{ STORY_COPY.visualStyleLegend }}
    </legend>

    <div
      data-testid="story-style-group"
      role="radiogroup"
      aria-labelledby="story-style-legend"
      class="mt-2 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="item in STORY_VISUAL_STYLE_OPTIONS"
        :key="item.visualStyle"
        class="relative block cursor-pointer"
      >
        <input
          :id="`story-style-${item.visualStyle}`"
          :data-testid="`story-style-${item.visualStyle}`"
          type="radio"
          name="story-style"
          :value="item.visualStyle"
          :checked="visualStyle === item.visualStyle"
          class="peer sr-only"
          @change="handleChange($event, item.visualStyle)"
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
