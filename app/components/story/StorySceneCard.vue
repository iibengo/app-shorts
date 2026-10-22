<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import {
  STORY_COPY,
  STORY_MAX_VISUAL_PROMPT_LENGTH,
  STORY_SCENE_LABELS,
} from '~/data/story'
import type {
  StoryBeat,
  StoryBible,
  StoryBeatUpdateRequest,
  StoryScene,
} from '~/models/story'
import {
  canRegenerateKeyframe,
  storyAttemptLabel,
  storyCameraLabel,
  storySceneCharacterNames,
  storyScenePropNames,
  storySceneLocation,
  storySceneTitle,
  storyTimeOfDayLabel,
  storyWeatherLabel,
  validateStoryVisualPrompt,
} from '~/utils/story'

const props = defineProps<{
  scene: StoryScene
  total: number
  disabled: boolean
  bible?: StoryBible | null
  beat?: StoryBeat | null
  previousBeat?: StoryBeat | null
}>()

const emit = defineEmits<{
  regenerate: [input: StoryBeatUpdateRequest]
}>()

const card = ref<HTMLElement | null>(null)
const promptDraft = ref(props.scene.visualPrompt)
const localIssue = ref<string | null>(null)
const isRegenerating = ref(false)

const canRegenerate = computed(() => canRegenerateKeyframe(props.scene))
const attempted = computed(() => Math.max(1, Math.min(2, props.scene.keyframeAttempts)))
const regenerateDisabled = computed(() => (
  props.disabled || isRegenerating.value || !canRegenerate.value
))
const promptIssue = computed(() => validateStoryVisualPrompt(promptDraft.value))
const characterNames = computed(() =>
  storySceneCharacterNames(props.bible ?? null, props.beat ?? null),
)
const propNames = computed(() =>
  storyScenePropNames(props.bible ?? null, props.beat ?? null),
)
const showBible = computed(() => Boolean(props.bible && props.beat))
const continuityLabel = computed(() => (
  props.beat?.continuityFromPrevious ?? STORY_SCENE_LABELS.firstScene
))
const cameraLabel = computed(() =>
  props.beat ? storyCameraLabel(props.beat.camera) : '',
)
const location = computed(() => storySceneLocation(props.bible ?? null, props.beat ?? null))
const locationLabel = computed(() => location.value?.name ?? '')
const timeLabel = computed(() => props.beat ? storyTimeOfDayLabel(props.beat.timeOfDay) : '')
const weatherLabel = computed(() => props.beat ? storyWeatherLabel(props.beat.weather) : '')
const locationChanged = computed(() =>
  Boolean(props.beat && props.previousBeat && props.beat.locationId !== props.previousBeat.locationId),
)

watch(
  () => props.scene.visualPrompt,
  (value) => {
    promptDraft.value = value
  },
)

watch(
  () => props.scene.status,
  (status) => {
    if (status === 'KEYFRAME_READY') {
      isRegenerating.value = false
    }
  },
)

function handleSubmit(): void {
  const issue = promptIssue.value

  if (issue) {
    localIssue.value = issue.message

    return
  }

  localIssue.value = null
  isRegenerating.value = true

  emit('regenerate', {
    visualPrompt: promptDraft.value,
    narration: props.scene.narration,
    regenerate: true,
  })
}

function focusCard(): void {
  card.value?.focus()
}

defineExpose({ focusCard })
</script>

<template>
  <li
    ref="card"
    data-testid="story-scene-card"
    :data-scene-order="scene.order"
    :data-scene-status="scene.status"
    tabindex="-1"
    class="rounded-2xl border border-white/10 bg-brand-surface p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
  >
    <h3 class="text-base font-semibold tracking-tight text-brand-text">
      {{ storySceneTitle(scene.order, total) }}
    </h3>

    <img
      v-if="scene.keyframeUrl"
      data-testid="story-scene-keyframe"
      :src="scene.keyframeUrl"
      :alt="`Imagen de la escena ${scene.order}`"
      class="mt-3 aspect-[9/16] w-full rounded-xl border border-white/10 bg-black object-cover"
    >

    <div
      v-else
      aria-hidden="true"
      class="mt-3 flex aspect-[9/16] w-full items-center justify-center rounded-xl border border-white/10 bg-black text-xs text-brand-muted forced-colors:border forced-colors:border-[ButtonText]"
    >
      {{ STORY_COPY.keyframes }}
    </div>

    <div class="mt-3">
      <p class="text-xs font-medium text-brand-muted">
        {{ STORY_COPY.narrationLabel }}
      </p>
      <p data-testid="story-scene-narration" class="mt-1 text-sm leading-relaxed text-brand-text">
        {{ scene.narration }}
      </p>
    </div>

    <div class="mt-3">
      <label :for="`story-scene-prompt-${scene.id}`" class="text-xs font-medium text-brand-muted">
        {{ STORY_COPY.visualPromptLabel }}
      </label>

      <textarea
        :id="`story-scene-prompt-${scene.id}`"
        v-model="promptDraft"
        data-testid="story-scene-prompt"
        :maxlength="STORY_MAX_VISUAL_PROMPT_LENGTH"
        rows="4"
        class="mt-1 w-full resize-y rounded-xl border border-white/15 bg-brand-ink px-3 py-2 text-base leading-relaxed text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface forced-colors:border forced-colors:border-[ButtonText]"
      />
    </div>

    <div
      v-if="showBible"
      data-testid="story-scene-context"
      class="mt-3 rounded-xl border border-white/10 bg-brand-ink p-3 text-sm"
    >
      <dl class="space-y-2">
        <div data-testid="story-scene-location">
          <dt class="text-xs font-medium text-brand-muted">
            {{ STORY_SCENE_LABELS.location }}
          </dt>
          <dd class="mt-0.5 text-brand-text">{{ locationLabel }}</dd>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div data-testid="story-scene-time">
            <dt class="text-xs font-medium text-brand-muted">{{ STORY_SCENE_LABELS.time }}</dt>
            <dd class="mt-0.5 text-brand-text">{{ timeLabel }}</dd>
          </div>
          <div data-testid="story-scene-weather">
            <dt class="text-xs font-medium text-brand-muted">{{ STORY_SCENE_LABELS.weather }}</dt>
            <dd class="mt-0.5 text-brand-text">{{ weatherLabel }}</dd>
          </div>
        </div>

        <div data-testid="story-scene-characters">
          <dt class="text-xs font-medium text-brand-muted">
            {{ STORY_SCENE_LABELS.characters }}
          </dt>
          <dd class="mt-0.5 text-brand-text">
            {{ characterNames.length > 0 ? characterNames.join(', ') : '—' }}
          </dd>
        </div>

        <div data-testid="story-scene-props">
          <dt class="text-xs font-medium text-brand-muted">
            {{ STORY_SCENE_LABELS.props }}
          </dt>
          <dd class="mt-0.5 text-brand-text">
            {{ propNames.length > 0 ? propNames.join(', ') : STORY_SCENE_LABELS.noProps }}
          </dd>
        </div>

        <div data-testid="story-scene-camera">
          <dt class="text-xs font-medium text-brand-muted">
            {{ STORY_SCENE_LABELS.camera }}
          </dt>
          <dd class="mt-0.5 text-brand-text">{{ cameraLabel }}</dd>
        </div>

        <div data-testid="story-scene-continuity">
          <dt class="text-xs font-medium text-brand-muted">
            {{ STORY_SCENE_LABELS.continuity }}
          </dt>
          <dd class="mt-0.5 leading-relaxed text-brand-text">{{ continuityLabel }}</dd>
        </div>

        <p
          v-if="locationChanged"
          data-testid="story-scene-location-change"
          class="text-[11px] font-medium text-brand-fuchsia"
        >
          {{ STORY_SCENE_LABELS.locationChange }}
        </p>
      </dl>
    </div>

    <p
      data-testid="story-scene-attempt"
      class="mt-2 text-xs tabular-nums text-brand-muted"
    >
      {{ storyAttemptLabel(attempted) }}
    </p>

    <p
      v-if="isRegenerating"
      role="status"
      aria-live="polite"
      class="mt-2 text-xs text-brand-text"
    >
      {{ STORY_COPY.regenerating }}
    </p>

    <p
      v-if="scene.error"
      data-testid="story-scene-error"
      role="alert"
      class="mt-2 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
    >
      {{ STORY_COPY.regenerateFailed }}
    </p>

    <p
      v-if="localIssue"
      role="alert"
      class="mt-2 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
    >
      {{ localIssue }}
    </p>

    <p
      v-if="scene.keyframeAttempts >= 2"
      class="mt-2 text-xs text-brand-muted"
    >
      {{ STORY_COPY.keyframeLimitReached }}
    </p>

    <AppButton
      type="button"
      data-testid="story-scene-regenerate"
      :disabled="regenerateDisabled"
      class="mt-3 min-h-11 w-full text-sm"
      @click="handleSubmit"
    >
      {{ STORY_COPY.regenerate }}
    </AppButton>
  </li>
</template>
