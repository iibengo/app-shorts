<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'
import type { Story } from '~/models/story'
import {
  formatStoryDuration,
  getStoryPreset,
  storyPosterUrl,
  storyReferenceLabel,
} from '~/utils/story'

const props = defineProps<{
  story: Story
}>()

const emit = defineEmits<{
  restart: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const poster = computed(() => storyPosterUrl(props.story.scenes))
const preset = computed(() => getStoryPreset(props.story.preset))
const duration = computed(() => formatStoryDuration(props.story.totalDurationSeconds))
const reference = computed(() => storyReferenceLabel(props.story.referenceUrl))

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    data-testid="story-result"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <span
      data-testid="story-result-badge"
      class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
    >{{ STORY_COPY.resultBadge }}</span>

    <h2
      ref="heading"
      data-testid="story-result-heading"
      tabindex="-1"
      class="mt-2 text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.resultTitle }}
    </h2>

    <video
      v-if="story.finalVideoUrl"
      data-testid="story-final-video"
      :src="story.finalVideoUrl"
      :poster="poster ?? undefined"
      controls
      playsinline
      preload="metadata"
      controlslist="nodownload"
      class="mt-4 aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 bg-black object-cover"
    />

    <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <div>
        <dt class="text-brand-muted">{{ STORY_COPY.resultScenes }}</dt>
        <dd data-testid="story-result-scenes" class="text-brand-text">
          {{ story.sceneCount }} escenas
        </dd>
      </div>

      <div>
        <dt class="text-brand-muted">{{ STORY_COPY.resultDuration }}</dt>
        <dd data-testid="story-result-duration" class="text-brand-text tabular-nums">
          {{ duration }}
        </dd>
      </div>

      <div>
        <dt class="text-brand-muted">{{ STORY_COPY.resultFormat }}</dt>
        <dd data-testid="story-result-format" class="text-brand-text">9:16</dd>
      </div>

      <div>
        <dt class="text-brand-muted">{{ STORY_COPY.resultStyle }}</dt>
        <dd data-testid="story-result-style" class="text-brand-text">
          {{ preset.label }}
        </dd>
      </div>

      <div>
        <dt class="text-brand-muted">{{ STORY_COPY.resultReference }}</dt>
        <dd data-testid="story-result-reference" class="text-brand-text">
          {{ reference }}
        </dd>
      </div>
    </dl>

    <p data-testid="story-result-note" class="mt-4 text-xs leading-relaxed text-brand-muted">
      {{ STORY_COPY.resultNote }}
    </p>

    <AppButton
      type="button"
      data-testid="story-restart"
      class="mt-4 w-full sm:w-auto"
      @click="emit('restart')"
    >
      {{ STORY_COPY.startAnother }}
    </AppButton>
  </section>
</template>
