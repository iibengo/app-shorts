<script setup lang="ts">
import { computed } from 'vue'
import { STORY_CANON_LABELS, STORY_TONE_LABELS } from '~/data/story'
import type { StoryBible } from '~/models/story'

const props = defineProps<{
  bible: StoryBible
}>()

const characters = computed(() => props.bible.characters)
const locations = computed(() => props.bible.locations)
const propsList = computed(() => props.bible.props)
</script>

<template>
  <details
    data-testid="story-canon"
    class="mt-4 rounded-2xl border border-white/10 bg-brand-surface p-3 forced-colors:border forced-colors:border-[ButtonText]"
  >
    <summary
      data-testid="story-canon-summary"
      class="min-h-11 cursor-pointer rounded-xl px-1 py-2 text-sm font-semibold text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
    >
      {{ STORY_CANON_LABELS.summary }}
    </summary>

    <dl class="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div data-testid="story-canon-style">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.style }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">{{ bible.style }}</dd>
      </div>

      <div data-testid="story-canon-tone">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.tone }}</dt>
        <dd class="mt-1 text-brand-text">{{ STORY_TONE_LABELS[bible.tone] }}</dd>
      </div>

      <div data-testid="story-canon-theme">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.theme }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">{{ bible.theme }}</dd>
      </div>

      <div data-testid="story-canon-characters">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.characters }}</dt>
        <dd class="mt-1">
          <ul class="space-y-1">
            <li
              v-for="character in characters"
              :key="character.id"
              data-testid="story-canon-character"
              :data-source="character.source"
              class="leading-relaxed text-brand-text"
            >
              {{ character.name }} · {{ character.wardrobe }}
              <span
                v-if="character.source === 'invented'"
                data-testid="story-invented-character"
                class="ml-1 rounded-full bg-brand-fuchsia/10 px-2 py-0.5 text-[11px] text-brand-text"
              >{{ STORY_CANON_LABELS.inventedCharacter }}</span>
            </li>
          </ul>
        </dd>
      </div>

      <div data-testid="story-canon-locations">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.locations }}</dt>
        <dd class="mt-1">
          <ul class="space-y-1">
            <li
              v-for="location in locations"
              :key="location.id"
              data-testid="story-canon-location"
              :data-source="location.source"
              class="leading-relaxed text-brand-text"
            >
              {{ location.name }} · {{ location.description }}
              <span
                v-if="location.source === 'invented'"
                data-testid="story-invented-location"
                class="ml-1 rounded-full bg-brand-fuchsia/10 px-2 py-0.5 text-[11px] text-brand-text"
              >{{ STORY_CANON_LABELS.inventedLocation }}</span>
            </li>
          </ul>
        </dd>
      </div>

      <div data-testid="story-canon-props">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.props }}</dt>
        <dd class="mt-1">
          <ul class="space-y-1">
            <li
              v-for="prop in propsList"
              :key="prop.id"
              data-testid="story-canon-prop"
              :data-source="prop.source"
              class="leading-relaxed text-brand-text"
            >
              {{ prop.name }} · {{ prop.description }}
              <span
                v-if="prop.source === 'invented'"
                data-testid="story-invented-prop"
                class="ml-1 rounded-full bg-brand-fuchsia/10 px-2 py-0.5 text-[11px] text-brand-text"
              >{{ STORY_CANON_LABELS.inventedProp }}</span>
            </li>
          </ul>
        </dd>
      </div>

      <div data-testid="story-canon-forbidden" class="sm:col-span-2">
        <dt class="text-xs font-medium text-brand-muted">{{ STORY_CANON_LABELS.forbidden }}</dt>
        <dd class="mt-1 leading-relaxed text-brand-text">{{ bible.forbidden.join(', ') }}</dd>
      </div>
    </dl>
  </details>
</template>
