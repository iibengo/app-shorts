<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StoryCanonSummary from '~/components/story/StoryCanonSummary.vue'
import StoryToneBadge from '~/components/story/StoryToneBadge.vue'
import StorySceneCard from '~/components/story/StorySceneCard.vue'
import StoryShotCard from '~/components/story/StoryShotCard.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY, STORY_SCENE_DURATION_SECONDS } from '~/data/story'
import type {
  Story,
  StoryBeatUpdateRequest,
  StoryShotUpdateRequest,
} from '~/models/story'
import { storyBeatForScene, storyModeLabel } from '~/utils/story'

const props = defineProps<{
  story: Story
}>()

const emit = defineEmits<{
  regenerate: [sceneId: string, input: StoryBeatUpdateRequest]
  regenerateShot: [shotId: string, input: StoryShotUpdateRequest]
  approve: []
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const orderedScenes = computed(() => (
  props.story.scenes.slice().sort((a, b) => a.order - b.order)
))
const isReel = computed(() => (
  orderedScenes.value.some((scene) => (scene.shots?.length ?? 0) > 0)
))
const allReady = computed(() => {
  if (isReel.value) {
    return orderedScenes.value.length > 0
      && orderedScenes.value.every((scene) => (
        scene.shots.length > 0
        && scene.shots.every((shot) => shot.status === 'KEYFRAME_READY')
      ))
  }

  return orderedScenes.value.length === props.story.sceneCount
    && orderedScenes.value.every((scene) => scene.status === 'KEYFRAME_READY')
})
const approveDisabled = computed(() => !allReady.value)

onMounted(() => {
  heading.value?.focus()
})

function handleRegenerate(sceneId: string, input: StoryBeatUpdateRequest): void {
  emit('regenerate', sceneId, input)
}

function handleRegenerateShot(
  shotId: string,
  visualPrompt: string,
  durationSeconds: number,
): void {
  emit('regenerateShot', shotId, {
    visualPrompt,
    durationSeconds: durationSeconds as StoryShotUpdateRequest['durationSeconds'],
    regenerate: true,
  })
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

    <ul v-if="!isReel" class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <StorySceneCard
        v-for="scene in orderedScenes"
        :key="scene.id"
        :scene="scene"
        :total="story.sceneCount ?? orderedScenes.length"
        :bible="story.plan?.storyBible ?? null"
        :beat="storyBeatForScene(story.plan, scene.order)"
        :previous-beat="scene.order > 1 ? storyBeatForScene(story.plan, scene.order - 1) : null"
        :disabled="!allReady"
        @regenerate="handleRegenerate(scene.id, $event)"
      />
    </ul>

    <div v-else class="mt-4 flex flex-col gap-4">
      <section
        v-for="scene in orderedScenes"
        :key="scene.id"
        data-testid="story-reel-scene"
        :data-scene-order="scene.order"
        class="rounded-2xl border border-white/10 bg-brand-surface p-3"
      >
        <h3 class="text-sm font-semibold text-brand-text">
          Escena {{ scene.order }} · {{ scene.narration }}
        </h3>

        <ul class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <StoryShotCard
            v-for="shot in scene.shots.slice().sort((a, b) => a.order - b.order)"
            :key="shot.id"
            :shot="shot"
            :total="story.shotCount"
            @regenerate="handleRegenerateShot(shot.id, $event[0], $event[1])"
          />
        </ul>
      </section>
    </div>

    <p
      data-testid="story-approve-note"
      class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
    >
      <template v-if="isReel">
        Al aprobar se generarán {{ story.shotCount }} planos y se cobrarán {{ story.shotCount }} generaciones.
        Duración planificada: {{ story.plannedDurationSeconds }} s.
      </template>
      <template v-else>
        Al aprobar se generarán {{ story.sceneCount }} vídeos de {{ STORY_SCENE_DURATION_SECONDS }} segundos y se cobrarán {{ story.sceneCount }} generaciones.
      </template>
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
