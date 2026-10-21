<script setup lang="ts">
import { computed } from 'vue'
import { STORY_BIBLE_LABELS } from '~/data/story'
import type { StoryBible } from '~/models/story'
import { storyTimeOfDayLabel, storyWeatherLabel } from '~/utils/story'

const props = defineProps<{
  bible: StoryBible
}>()

const characters = computed(() =>
  props.bible.characters.map((character) => `${character.name} · ${character.wardrobe}`),
)
const propsList = computed(() =>
  props.bible.props.map((prop) => `${prop.name} · ${prop.description}`),
)
</script>

<template>
  <details
    data-testid="story-bible"
    class="mt-4 rounded-2xl border border-white/10 bg-brand-surface p-3 forced-colors:border forced-colors:border-[ButtonText]"
  >
    <summary
      data-testid="story-bible-summary"
      class="min-h-11 cursor-pointer rounded-xl px-1 py-2 text-sm font-semibold text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
    >
      {{ STORY_BIBLE_LABELS.summary }}
    </summary>

    <dl class="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div data-testid="story-bible-style">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.style }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">{{ bible.style }}</dd>
      </div>

      <div data-testid="story-bible-location">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.location }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">
          {{ bible.location.name }} — {{ bible.location.description }}
        </dd>
      </div>

      <div data-testid="story-bible-time">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.time }}</dt>
        <dd class="mt-1 text-brand-text">{{ storyTimeOfDayLabel(bible.timeOfDay) }}</dd>
      </div>

      <div data-testid="story-bible-weather">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.weather }}</dt>
        <dd class="mt-1 text-brand-text">{{ storyWeatherLabel(bible.weather) }}</dd>
      </div>

      <div data-testid="story-bible-characters">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.characters }}</dt>
        <dd class="mt-1">
          <ul class="space-y-1">
            <li v-for="character in characters" :key="character" class="leading-relaxed text-brand-text">
              {{ character }}
            </li>
          </ul>
        </dd>
      </div>

      <div data-testid="story-bible-props">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.props }}</dt>
        <dd class="mt-1">
          <ul class="space-y-1">
            <li v-for="prop in propsList" :key="prop" class="leading-relaxed text-brand-text">
              {{ prop }}
            </li>
          </ul>
        </dd>
      </div>

      <div data-testid="story-bible-forbidden" class="sm:col-span-2">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_BIBLE_LABELS.forbidden }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">
          {{ bible.forbidden.join(', ') }}
        </dd>
      </div>
    </dl>
  </details>
</template>
