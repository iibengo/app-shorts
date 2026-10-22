<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StoryCanonSummary from '~/components/story/StoryCanonSummary.vue'
import StoryToneBadge from '~/components/story/StoryToneBadge.vue'
import StorySceneCard from '~/components/story/StorySceneCard.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY, STORY_SCENE_DURATION_SECONDS } from '~/data/story'
import type {
  Story,
  StoryBeatUpdateRequest,
} from '~/models/story'
import { storyBeatForScene, storyModeLabel } from '~/utils/story'

const props = defineProps<{
  story: Story
}>()

const emit = defineEmits<{
  regenerate: [sceneId: string, input: StoryBeatUpdateRequest]
  approve: []
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const orderedScenes = computed(() => (
  props.story.scenes.slice().sort((a, b) => a.order - b.order)
))
const allReady = computed(() => (
  orderedScenes.value.length === props.story.sceneCount
  && orderedScenes.value.every((scene) => scene.status === 'KEYFRAME_READY')
))
const approveDisabled = computed(() => !allReady.value)

onMounted(() => {
  heading.value?.focus()
})

function handleRegenerate(sceneId: string, input: StoryBeatUpdateRequest): void {
  emit('regenerate', sceneId, input)
}

defineExpose({ heading })
</script>

<template>
  <section data-testid="story-review" class="mt-6">
    <h2
      ref="heading"
      data-testid="story-review-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.reviewTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      Estas son las imágenes de tus {{ story.sceneCount }} escenas. Puedes regenerar una imagen antes de aprobar.
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <p
        data-testid="story-review-mode"
        :data-mode="story.mode"
        class="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-brand-text forced-colors:border forced-colors:border-[ButtonText]"
      >
        {{ storyModeLabel(story.mode) }}
      </p>

      <StoryToneBadge
        v-if="story.plan"
        test-id="story-review-tone"
        :tone="story.plan.tone"
      />
    </div>

    <StoryCanonSummary
      v-if="story.plan?.storyBible"
      :bible="story.plan.storyBible"
    />

    <ul class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <StorySceneCard
        v-for="scene in orderedScenes"
        :key="scene.id"
        :scene="scene"
        :total="story.sceneCount"
        :bible="story.plan?.storyBible ?? null"
        :beat="storyBeatForScene(story.plan, scene.order)"
        :previous-beat="scene.order > 1 ? storyBeatForScene(story.plan, scene.order - 1) : null"
        :disabled="!allReady"
        @regenerate="handleRegenerate(scene.id, $event)"
      />
    </ul>

    <p
      data-testid="story-approve-note"
      class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
    >
      Al aprobar se generarán {{ story.sceneCount }} vídeos de {{ STORY_SCENE_DURATION_SECONDS }} segundos y se cobrarán {{ story.sceneCount }} generaciones.
    </p>

    <div class="mt-3 flex flex-wrap gap-2">
      <AppButton
        type="button"
        data-testid="story-approve"
        :disabled="approveDisabled"
        class="min-h-12 w-full text-base sm:w-auto"
        @click="emit('approve')"
      >
        {{ STORY_COPY.approve }}
      </AppButton>

      <AppButton
        type="button"
        variant="secondary"
        data-testid="story-cancel"
        class="min-h-11 w-full sm:w-auto"
        @click="emit('cancel')"
      >
        {{ STORY_COPY.cancel }}
      </AppButton>
    </div>
  </section>
</template>
