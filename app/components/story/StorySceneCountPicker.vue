<script setup lang="ts">
import {
  STORY_COPY,
  STORY_SCENE_COUNTS,
  STORY_SCENE_COUNT_LABELS,
} from '~/data/story'
import type { StorySceneCount } from '~/models/story'

defineProps<{
  sceneCount: StorySceneCount
}>()

const emit = defineEmits<{
  'update:sceneCount': [value: StorySceneCount]
}>()

function handleChange(event: Event, value: StorySceneCount): void {
  const target = event.target as HTMLInputElement | null

  if (target?.checked) {
    emit('update:sceneCount', value)
  }
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-scene-count-legend" class="text-sm font-medium text-brand-text">
      {{ STORY_COPY.sceneCountLegend }}
    </legend>

    <div
      data-testid="story-scene-count"
      role="radiogroup"
      aria-labelledby="story-scene-count-legend"
      class="mt-2 grid grid-cols-3 gap-2"
    >
      <label
        v-for="count in STORY_SCENE_COUNTS"
        :key="count"
        class="relative block cursor-pointer"
      >
        <input
          :id="`story-scene-count-${count}`"
          :data-testid="`story-scene-count-${count}`"
          type="radio"
          name="story-scene-count"
          :value="count"
          :checked="sceneCount === count"
          class="peer sr-only"
          @change="handleChange($event, count)"
        >

        <span
          class="flex min-h-11 items-center justify-center rounded-2xl border border-white/15 bg-brand-ink px-2 text-sm font-semibold text-brand-text motion-safe:transition-colors peer-checked:border-brand-fuchsia peer-checked:bg-brand-fuchsia/10 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fuchsia peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText]"
        >{{ STORY_SCENE_COUNT_LABELS[count] }}</span>
      </label>
    </div>

    <p class="mt-2 text-xs text-brand-muted">
      {{ STORY_COPY.sceneCountHelp }}
    </p>
  </fieldset>
</template>
