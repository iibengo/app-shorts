<script setup lang="ts">
import { computed } from 'vue'
import { STORY_TONE_LABELS } from '~/data/story'
import type { StoryTone } from '~/models/story'

const props = withDefaults(defineProps<{
  tone: StoryTone
  testId?: string
}>(), {
  testId: 'story-tone-badge',
})

const label = computed(() => STORY_TONE_LABELS[props.tone])
</script>

<template>
  <p
    :data-testid="testId"
    :data-tone="tone"
    class="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-brand-text forced-colors:border forced-colors:border-[ButtonText]"
  >
    Tono: {{ label }}
  </p>
</template>
