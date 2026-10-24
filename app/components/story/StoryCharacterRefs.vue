<script setup lang="ts">
import { computed } from 'vue'
import type { StoryCharacterReference } from '~/models/story'
import { STORY_CHARACTER_REF_COPY } from '~/data/story'

const props = defineProps<{
  refs: readonly StoryCharacterReference[]
  /** Canon names, so the list reads "Pixel" instead of "pixel". */
  names?: Readonly<Record<string, string>>
}>()

/** Only a ready reference with an image deserves a thumbnail. */
const items = computed(() => props.refs.map((ref) => ({
  ...ref,
  name: props.names?.[ref.characterId] ?? ref.characterId,
})))

const readyCount = computed(() => items.value.filter((item) => item.status === 'ready').length)

const summary = computed(() => STORY_CHARACTER_REF_COPY.count
  .replace('{n}', String(readyCount.value)))

/**
 * A failed reference says why, when the server kept the reason. "Not available"
 * alone leaves the user guessing whether it was the photo, the provider or the
 * budget.
 */
const failureReason = (ref: StoryCharacterReference & { readonly errorCode?: string }): string => {
  const code = ref.errorCode

  if (code === undefined || code.length === 0) return STORY_CHARACTER_REF_COPY.reasonFallback

  return STORY_CHARACTER_REF_COPY.reasons[code] ?? STORY_CHARACTER_REF_COPY.reasonFallback
}

const statusLabel = (ref: StoryCharacterReference, name: string): string => {
  if (ref.status === 'ready') return STORY_CHARACTER_REF_COPY.ready
  if (ref.status === 'failed') return STORY_CHARACTER_REF_COPY.failed.replace('{name}', name)

  return STORY_CHARACTER_REF_COPY.pending.replace('{name}', name)
}
</script>

<template>
  <section
    v-if="items.length > 0"
    data-testid="story-character-refs"
    class="mt-4 rounded-2xl border border-white/10 bg-brand-surface/60 p-4"
  >
    <h3 class="text-sm font-semibold tracking-tight text-brand-text">
      {{ STORY_CHARACTER_REF_COPY.title }}
    </h3>

    <p class="mt-1 text-xs text-brand-muted">
      {{ summary }}
    </p>

    <ul role="status" aria-live="polite" class="mt-3 grid gap-2 sm:grid-cols-2">
      <li
        v-for="item in items"
        :key="item.characterId"
        :data-testid="`story-character-ref-${item.characterId}`"
        class="flex items-center gap-3 rounded-xl border border-white/5 bg-brand-surface px-3 py-2"
      >
        <img
          v-if="item.status === 'ready' && item.imageUrl !== null"
          :src="item.imageUrl"
          :alt="item.name"
          loading="lazy"
          :data-testid="`story-character-ref-image-${item.characterId}`"
          class="size-10 shrink-0 rounded-lg border border-white/10 object-cover"
        >
        <span
          v-else
          aria-hidden="true"
          class="size-10 shrink-0 rounded-lg border border-dashed border-white/15 bg-white/5"
        />

        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm text-brand-text">{{ item.name }}</span>
          <span
            :data-testid="`story-character-ref-status-${item.characterId}`"
            class="block text-xs text-brand-muted"
          >
            {{ statusLabel(item, item.name) }}
          </span>
          <span
            v-if="item.status === 'failed'"
            class="mt-0.5 block text-xs text-brand-muted"
          >
            {{ failureReason(item) }}
            {{ STORY_CHARACTER_REF_COPY.failedNote.replace('{name}', item.name) }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
