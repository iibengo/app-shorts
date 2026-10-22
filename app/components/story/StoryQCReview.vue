<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY, STORY_QC_SEVERITY_LABELS } from '~/data/story'
import type {
  Story,
  StoryQCSceneResult,
  StoryScene,
  StoryShot,
} from '~/models/story'
import {
  canRecoverQcScene,
  canRetryQcVideo,
  storyQcBlockingCount,
  storyQcIssueCopy,
  storyQcWarningCount,
  storySceneTitle,
} from '~/utils/story'

const props = defineProps<{
  story: Story
}>()

const emit = defineEmits<{
  retry: []
  recover: [sceneId: string]
  retryVideo: [sceneId: string]
  recoverShot: [shotId: string]
  retryShot: [shotId: string]
  approve: []
  cancel: []
  startOver: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)
const confirmed = ref(false)

const qc = computed(() => props.story.qc)
const scenesById = computed(() => {
  const map = new Map<string, StoryScene>()

  for (const scene of props.story.scenes) map.set(scene.id, scene)

  return map
})
const isReel = computed(() => props.story.shotCount > 0)
const shotsById = computed(() => {
  const map = new Map<string, StoryShot>()

  for (const scene of props.story.scenes) {
    for (const shot of scene.shots) map.set(shot.id, shot)
  }

  return map
})
const allShots = computed(() => props.story.scenes.flatMap((scene) => scene.shots))
const rows = computed<readonly {
  readonly result: StoryQCSceneResult
  readonly scene: StoryScene | null
  readonly shot: StoryShot | null
}[]>(() => {
  const current = qc.value

  if (!current) return []

  const legacy = current as unknown as { readonly scenes?: readonly StoryQCSceneResult[] }

  if (legacy.scenes) {
    return legacy.scenes
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((result) => ({
        result,
        scene: scenesById.value.get(result.sceneId) ?? null,
        shot: null,
      }))
  }

  return current.shots
    .slice()
    .sort((a, b) => a.shotOrder - b.shotOrder)
    .map((result) => ({
      result: {
        ...result,
        order: result.shotOrder,
      },
      scene: scenesById.value.get(result.sceneId) ?? null,
      shot: shotsById.value.get(result.shotId) ?? null,
    }))
})

const unavailable = computed(() =>
  !qc.value || qc.value.status === 'UNAVAILABLE' || qc.value.evaluator === 'none',
)
const blocking = computed(() => storyQcBlockingCount(qc.value?.issues ?? []))
const warnings = computed(() => storyQcWarningCount(qc.value?.issues ?? []))
const verdict = computed(() => {
  if (!qc.value || qc.value.status === 'UNAVAILABLE' || qc.value.evaluator === 'none') {
    return STORY_COPY.qcVerdictUnavailable
  }

  if (qc.value.status === 'NEEDS_REVIEW') {
    return STORY_COPY.qcVerdictNeedsReview
  }

  if (blocking.value > 0) {
    return countCopy(STORY_COPY.qcVerdictProblems, blocking.value)
  }

  if (warnings.value > 0) {
    return countCopy(STORY_COPY.qcVerdictWarnings, warnings.value)
  }

  return STORY_COPY.qcVerdictNone
})
const hasBrokenClip = computed(() => (
  isReel.value
    ? allShots.value.some((shot) => shot.status === 'VIDEO_FAILED')
    : props.story.scenes.some((scene) => scene.status === 'VIDEO_FAILED')
))
const allScenesHaveVideo = computed(() => (
  isReel.value
    ? allShots.value.length > 0 && allShots.value.every((shot) => shot.videoUrl !== null)
    : props.story.scenes.every((scene) => scene.videoUrl !== null)
))
const exhaustedRetries = computed(() => (
  isReel.value
    ? allShots.value.some((shot) =>
      (shot.status === 'VIDEO_FAILED' && shot.videoAttempts >= 2)
      || (shot.status === 'VIDEO_READY' && shot.keyframeAttempts >= 2),
    )
    : props.story.scenes.some((scene) =>
      (scene.status === 'VIDEO_FAILED' && scene.videoAttempts >= 2)
      || (scene.status === 'VIDEO_READY' && scene.keyframeAttempts >= 2),
    )
))
const overrideDisabled = computed(() =>
  !confirmed.value || !qc.value || !allScenesHaveVideo.value || hasBrokenClip.value,
)

onMounted(() => {
  heading.value?.focus()
})

function issueSeverityLabel(severity: 'blocking' | 'warning'): string {
  return STORY_QC_SEVERITY_LABELS[severity]
}

function countCopy(template: string, count: number): string {
  const text = template.replace('{n}', String(count))

  if (count !== 1) return text

  return text.replace('problemas', 'problema').replace('avisos', 'aviso')
}

defineExpose({ heading })
</script>

<template>
  <section data-testid="story-qc" class="mt-6">
    <h2
      ref="heading"
      data-testid="story-qc-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ STORY_COPY.qcTitle }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ STORY_COPY.qcIntro }}
    </p>

    <p
      data-testid="story-qc-verdict"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="mt-3 rounded-2xl border border-white/10 bg-brand-surface p-3 text-sm font-medium text-brand-text"
    >
      {{ verdict }}
    </p>

    <p
      v-if="unavailable"
      data-testid="story-qc-unavailable"
      class="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm leading-relaxed text-brand-text"
    >
      {{ STORY_COPY.qcUnavailable }}
    </p>

    <ul class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <li
        v-for="({ result, scene }, index) in rows"
        :key="`${result.sceneId}-${result.order}-${index}`"
        data-testid="story-qc-scene"
        :data-scene-order="result.order"
        class="rounded-2xl border border-white/10 bg-brand-surface p-3 forced-colors:border forced-colors:border-[ButtonText]"
      >
        <h3 class="text-base font-semibold tracking-tight text-brand-text">
          <template v-if="isReel">Plano {{ result.order }} de {{ story.shotCount }}</template>
          <template v-else>{{ storySceneTitle(result.order, story.sceneCount ?? 0) }}</template>
        </h3>

        <img
          v-if="result.framesUrl"
          data-testid="story-qc-frames"
          :src="result.framesUrl"
          :alt="isReel
            ? `Fotogramas del plano ${result.order}: inicio, medio y final`
            : STORY_COPY.qcFramesAlt.replace('{n}', String(result.order))"
          loading="lazy"
          class="mt-3 aspect-[27/16] w-full rounded-xl border border-white/10 bg-black object-cover"
        >

        <p
          v-else
          data-testid="story-qc-frames-missing"
          class="mt-3 rounded-xl border border-white/10 bg-black p-3 text-xs text-brand-muted"
        >
          {{ STORY_COPY.qcFramesMissing }}
        </p>

        <ul v-if="result.issues.length > 0" class="mt-3 space-y-2">
          <li
            v-for="(issue, index) in result.issues"
            :key="`${issue.code}-${issue.frame}-${index}`"
            data-testid="story-qc-issue"
            :data-code="issue.code"
            :data-severity="issue.severity"
            class="rounded-xl border p-2 text-sm"
            :class="issue.severity === 'blocking'
              ? 'border-brand-fuchsia/40 bg-brand-fuchsia/10 text-brand-text'
              : 'border-amber-400/40 bg-amber-400/10 text-brand-text'"
          >
            <span class="font-semibold">{{ issueSeverityLabel(issue.severity) }}:</span>
            {{ storyQcIssueCopy(issue.code) }}
          </li>
        </ul>

        <div v-if="isReel && shot" class="mt-3 flex flex-col gap-2">
          <AppButton
            v-if="shot.status === 'VIDEO_FAILED' && shot.videoAttempts < 2"
            type="button"
            data-testid="story-qc-shot-retry"
            variant="secondary"
            class="min-h-11 w-full text-sm"
            @click="emit('retryShot', shot.id)"
          >
            {{ STORY_COPY.qcRecoverVideo }}
          </AppButton>

          <AppButton
            v-else-if="shot.status === 'VIDEO_READY' && shot.keyframeAttempts < 2"
            type="button"
            data-testid="story-qc-shot-recover"
            variant="secondary"
            class="min-h-11 w-full text-sm"
            @click="emit('recoverShot', shot.id)"
          >
            {{ STORY_COPY.qcRecover }}
          </AppButton>

          <p
            v-else-if="shot.status === 'VIDEO_FAILED' || shot.keyframeAttempts >= 2"
            class="text-xs leading-relaxed text-brand-muted"
          >
            {{ STORY_COPY.qcRetryLimit }}
          </p>
        </div>

        <div v-else-if="scene" class="mt-3 flex flex-col gap-2">
          <AppButton
            v-if="canRetryQcVideo(scene)"
            type="button"
            data-testid="story-qc-recover-video"
            variant="secondary"
            class="min-h-11 w-full text-sm"
            @click="emit('retryVideo', result.sceneId)"
          >
            {{ STORY_COPY.qcRecoverVideo }}
          </AppButton>

          <AppButton
            v-else-if="canRecoverQcScene(scene)"
            type="button"
            data-testid="story-qc-recover"
            variant="secondary"
            class="min-h-11 w-full text-sm"
            @click="emit('recover', result.sceneId)"
          >
            {{ STORY_COPY.qcRecover }}
          </AppButton>

          <p
            v-else-if="scene.status === 'VIDEO_FAILED' || scene.keyframeAttempts >= 2"
            class="text-xs leading-relaxed text-brand-muted"
          >
            {{ STORY_COPY.qcRetryLimit }}
          </p>
        </div>
      </li>
    </ul>

    <div class="mt-4 rounded-2xl border border-white/10 bg-brand-surface p-3">
      <p class="text-xs leading-relaxed text-brand-muted">
        {{ STORY_COPY.qcOverrideWarning }}
      </p>

      <label class="mt-3 flex min-h-11 items-start gap-2 text-sm text-brand-text">
        <input
          v-model="confirmed"
          data-testid="story-qc-override-confirm"
          type="checkbox"
          class="mt-0.5 h-5 w-5 rounded border-white/20 bg-brand-ink text-brand-fuchsia focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
        >
        <span>{{ STORY_COPY.qcOverrideConfirm }}</span>
      </label>

      <AppButton
        type="button"
        data-testid="story-qc-override"
        variant="secondary"
        :disabled="overrideDisabled"
        class="mt-3 min-h-11 w-full text-sm sm:w-auto"
        @click="emit('approve')"
      >
        {{ STORY_COPY.qcOverride }}
      </AppButton>
    </div>

    <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <AppButton
        type="button"
        data-testid="story-qc-retry"
        class="min-h-11 w-full text-sm sm:w-auto"
        :disabled="!allScenesHaveVideo"
        @click="emit('retry')"
      >
        {{ STORY_COPY.qcRetry }}
      </AppButton>

      <AppButton
        v-if="exhaustedRetries"
        type="button"
        data-testid="story-qc-start-over"
        class="min-h-11 w-full text-sm sm:w-auto"
        @click="emit('startOver')"
      >
        {{ STORY_COPY.startOver }}
      </AppButton>

      <AppButton
        type="button"
        data-testid="story-qc-cancel"
        variant="secondary"
        class="min-h-11 w-full text-sm sm:w-auto"
        @click="emit('cancel')"
      >
        {{ STORY_COPY.cancel }}
      </AppButton>
    </div>

    <p
      v-if="!allScenesHaveVideo"
      data-testid="story-qc-retry-blocked"
      class="mt-2 text-xs leading-relaxed text-brand-muted"
    >
      {{ STORY_COPY.qcRetryBlocked }}
    </p>
  </section>
</template>
