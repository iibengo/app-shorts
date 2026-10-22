<script setup lang="ts">
import { computed } from 'vue'
import {
  STORY_MODE_CREATIVE_NOTICE,
  STORY_MODE_DESCRIPTIONS,
  STORY_MODE_HELP,
  STORY_MODE_LABELS,
  STORY_MODE_LEGEND,
  STORY_MODES,
} from '~/data/story'
import type { StoryMode } from '~/models/story'

const props = defineProps<{
  mode: StoryMode
}>()

const emit = defineEmits<{
  'update:mode': [value: StoryMode]
}>()

const help = computed(() => STORY_MODE_HELP[props.mode])
const describedBy = computed(() => `story-mode-help${props.mode === 'creative' ? ' story-mode-creative-notice' : ''}`)

function handleChange(event: Event, value: StoryMode): void {
  const target = event.target as HTMLInputElement | null

  if (target?.checked) {
    emit('update:mode', value)
  }
}
</script>

<template>
  <fieldset class="mt-5">
    <legend id="story-mode-legend" class="text-sm font-medium text-brand-text">
      {{ STORY_MODE_LEGEND }}
    </legend>

    <div
      data-testid="story-mode-group"
      role="radiogroup"
      aria-labelledby="story-mode-legend"
      :aria-describedby="describedBy"
      class="mt-2 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="item in STORY_MODES"
        :key="item"
        class="relative block cursor-pointer"
      >
        <input
          :id="`story-mode-${item}`"
          :data-testid="`story-mode-${item}`"
          type="radio"
          name="story-mode"
          :value="item"
          :checked="mode === item"
          class="peer sr-only"
          @change="handleChange($event, item)"
        >

        <span
          class="flex min-h-11 flex-col gap-1 rounded-2xl border border-white/15 bg-brand-ink p-3 text-brand-text motion-safe:transition-colors peer-checked:border-brand-fuchsia peer-checked:bg-brand-fuchsia/10 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fuchsia peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText]"
        >
          <span class="text-sm font-semibold">{{ STORY_MODE_LABELS[item] }}</span>
          <span class="text-xs leading-relaxed text-brand-muted">{{ STORY_MODE_DESCRIPTIONS[item] }}</span>
        </span>
      </label>
    </div>

    <p id="story-mode-help" data-testid="story-mode-help" class="mt-2 text-xs text-brand-muted">
      {{ help }}
    </p>

    <p
      v-if="mode === 'creative'"
      id="story-mode-creative-notice"
      data-testid="story-mode-creative-notice"
      class="mt-2 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
    >
      {{ STORY_MODE_CREATIVE_NOTICE }}
    </p>
  </fieldset>
</template>
