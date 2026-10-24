<script setup lang="ts">
import {
  computed,
  nextTick,
  watch,
} from 'vue'
import StoryErrorAlert from '~/components/story/StoryErrorAlert.vue'
import StoryHeader from '~/components/story/StoryHeader.vue'
import StoryPlanProgress from '~/components/story/StoryPlanProgress.vue'
import StoryCharacterRefs from '~/components/story/StoryCharacterRefs.vue'
import StoryReview from '~/components/story/StoryReview.vue'
import StoryVideoProgress from '~/components/story/StoryVideoProgress.vue'
import StoryQCProgress from '~/components/story/StoryQCProgress.vue'
import StoryQCReview from '~/components/story/StoryQCReview.vue'
import StoryAssemblyProgress from '~/components/story/StoryAssemblyProgress.vue'
import StoryResult from '~/components/story/StoryResult.vue'
import StoryShotProgress from '~/components/story/StoryShotProgress.vue'
import StoryShotQC from '~/components/story/StoryShotQC.vue'
import StoryShotResult from '~/components/story/StoryShotResult.vue'
import StoryShotReview from '~/components/story/StoryShotReview.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'
import type { StoryBeatUpdateRequest, StoryShotUpdateRequest } from '~/models/story'
import { useStory } from '~/composables/useStory'
import { useStoryApi } from '~/composables/useStoryApi'
import { storySlowThresholdMs } from '~/utils/story'

useHead({
  htmlAttrs: {
    lang: 'es',
    class: 'bg-brand-ink',
  },
  bodyAttrs: {
    class: 'bg-brand-ink',
  },
  meta: [
    { name: 'color-scheme', content: 'dark' },
    { name: 'theme-color', content: '#09090b' },
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

useSeoMeta({
  title: STORY_COPY.metaDetailTitle,
})

const route = useRoute()
const storyId = typeof route.params.id === 'string' ? route.params.id : ''
const api = useStoryApi()
const {
  state,
  story,
  statusMessage,
  notFound,
  commandError,
  pollError,
  isOnline,
  elapsedSeconds,
  regenerateScene,
  regenerateShot,
  approve,
  retryScene,
  retryShot,
  recoverShot,
  retryAssembly,
  retryQc,
  approveQc,
  recoverScene,
  cancel: cancelStory,
  restart,
  retryPolling,
} = useStory({ api, storyId })

/** Canon names keyed by id, so the reference list is readable. */
const characterNames = computed<Readonly<Record<string, string>>>(() => {
  const names: Record<string, string> = {}

  for (const character of story.value?.plan?.storyBible?.characters ?? []) {
    names[character.id] = character.name
  }

  return names
})

const orderedScenes = computed(() => (
  story.value
    ? story.value.scenes.slice().sort((a, b) => a.order - b.order)
    : []
))
const isReelStory = computed(() => (
  story.value?.scenes.some((scene) => scene.shots.length > 0) ?? false
))

const showLoading = computed(() => (
  !notFound.value
  && state.value.status !== 'expired'
  && story.value === null
))
const failedKeyframeScenes = computed(() => (
  orderedScenes.value.filter((scene) => scene.status === 'KEYFRAME_FAILED')
))
const failedVideoScenes = computed(() => (
  orderedScenes.value.filter(
    (scene) => scene.status === 'VIDEO_FAILED' && scene.videoAttempts < 2,
  )
))
const isSlow = computed(() => {
  const current = story.value

  if (!current) return false

  return elapsedSeconds.value * 1_000 >= storySlowThresholdMs(current)
})

async function handleRegenerate(
  sceneId: string,
  input: StoryBeatUpdateRequest,
): Promise<void> {
  const job = await regenerateScene(sceneId, input)

  if (!job) {
    await nextTick()
    document.querySelector<HTMLElement>('[data-testid="story-error"]')?.focus()

    return
  }

  await nextTick()
  document
    .querySelector<HTMLElement>('[data-testid="story-review-heading"]')
    ?.focus()
}

async function handleRegenerateShot(
  shotId: string,
  input: StoryShotUpdateRequest,
): Promise<void> {
  const job = await regenerateShot(shotId, input)

  if (!job) {
    await focusError()
    return
  }

  await nextTick()
  document
    .querySelector<HTMLElement>('[data-testid="story-review-heading"]')
    ?.focus()
}

async function handleRetryShot(shotId: string): Promise<void> {
  const job = await retryShot(shotId)

  if (!job) {
    await focusError()
  }
}

async function handleRecoverShot(shotId: string): Promise<void> {
  const job = await recoverShot(shotId)

  if (!job) {
    await focusError()
  }
}

async function handleApprove(): Promise<void> {
  const job = await approve()

  if (!job) {
    await nextTick()
    document.querySelector<HTMLElement>('[data-testid="story-error"]')?.focus()
  }
}

async function handleRetryScene(sceneId: string): Promise<void> {
  const scene = orderedScenes.value.find((item) => item.id === sceneId)

  if (!scene) return

  await handleRegenerate(sceneId, {
    visualPrompt: scene.visualPrompt,
    regenerate: true,
  })
}

async function handleRetryVideo(sceneId: string): Promise<void> {
  const job = await retryScene(sceneId)

  if (!job) {
    await focusError()
  }
}

async function handleRetryAssembly(): Promise<void> {
  const job = await retryAssembly()

  if (!job) {
    await focusError()
  }
}

async function handleRetryQc(): Promise<void> {
  const job = await retryQc()

  if (!job) {
    await focusError()
  }
}

async function handleApproveQc(): Promise<void> {
  const job = await approveQc()

  if (!job) {
    await focusError()
  }
}

async function handleRecoverScene(sceneId: string): Promise<void> {
  const job = await recoverScene(sceneId)

  if (!job) {
    await focusError()
  }
}

async function handleCancel(): Promise<void> {
  const cancelled = await cancelStory()

  if (!cancelled) return

  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="story-cancelled"]')?.focus()
}

async function focusError(): Promise<void> {
  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="story-error"]')?.focus()
}

function handleStartOver(): void {
  restart()
  void navigateTo('/story')
}

watch(
  () => state.value.status,
  async (status) => {
    if (status === 'failed') {
      await focusError()

      return
    }

    if (status === 'cancelled') {
      await nextTick()
      document.querySelector<HTMLElement>('[data-testid="story-cancelled"]')?.focus()
    }
  },
)
</script>

<template>
  <div
    data-testid="story-detail"
    class="min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <StoryHeader />

    <main class="mx-auto w-full max-w-5xl overflow-x-clip pb-[calc(env(safe-area-inset-bottom)_+_2rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-8">
      <h1
        data-testid="story-detail-heading"
        class="text-3xl font-semibold leading-tight tracking-tight text-brand-text sm:text-4xl"
      >
        Tu historia
      </h1>

      <noscript data-allow-mismatch="children">
        <p
          data-testid="story-nojs-notice"
          class="mt-4 rounded-2xl border border-white/15 bg-brand-surface p-3 text-sm leading-relaxed text-brand-text"
        >
          {{ STORY_COPY.nojsDetail }}
        </p>
      </noscript>

      <p
        data-testid="story-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="mt-4 text-center text-sm text-brand-text"
        :class="statusMessage
          ? 'rounded-full border border-white/10 bg-black/[0.75] px-4 py-2 shadow-lg'
          : 'sr-only'"
      >
        {{ statusMessage }}
      </p>

      <p
        v-if="!isOnline"
        data-testid="story-offline"
        role="status"
        class="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text"
      >
        {{ STORY_COPY.offlinePolling }}
      </p>

      <StoryErrorAlert v-if="pollError" :error="pollError" class="mt-4">
        <AppButton type="button" data-testid="story-retry-polling" @click="retryPolling">
          Reintentar
        </AppButton>
      </StoryErrorAlert>

      <StoryErrorAlert v-if="commandError" :error="commandError" class="mt-4" />

      <p
        v-if="showLoading"
        data-testid="story-loading"
        role="status"
        class="mt-6 text-sm text-brand-muted"
      >
        Cargando tu historia…
      </p>

      <section
        v-else-if="notFound"
        data-testid="story-not-owned"
        class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 text-sm leading-relaxed text-brand-text sm:p-6"
      >
        <p>{{ STORY_COPY.notOwned }}</p>

        <AppButton type="button" data-testid="story-start-over" class="mt-4" @click="handleStartOver">
          {{ STORY_COPY.startOver }}
        </AppButton>
      </section>

      <section
        v-else-if="state.status === 'expired'"
        data-testid="story-expired"
        class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 text-sm leading-relaxed text-brand-text sm:p-6"
      >
        <p>{{ STORY_COPY.expired }}</p>

        <AppButton type="button" data-testid="story-start-over" class="mt-4" @click="handleStartOver">
          {{ STORY_COPY.startOver }}
        </AppButton>
      </section>

      <StoryShotProgress
        v-else-if="state.status === 'keyframes' && story && isReelStory"
        :story="story"
        phase="keyframes"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        @cancel="handleCancel"
        @regenerateShot="(shotId, prompt, duration) => handleRegenerateShot(shotId, { visualPrompt: prompt, durationSeconds: duration, regenerate: true })"
      />

      <div v-else-if="state.status === 'keyframes'">
        <StoryPlanProgress status="keyframes" @cancel="handleCancel" />
        <StoryCharacterRefs
          v-if="story !== null"
          :refs="story.characterRefs"
          :names="characterNames"
        />
      </div>

      <template v-else-if="state.status === 'review' && story && isReelStory">
        <!-- The character references were only visible while they were being
             generated, so the user never saw how a secondary character ended
             up. They belong to the review too. -->
        <StoryCharacterRefs :refs="story.characterRefs" :names="characterNames" />

        <StoryShotReview
          :story="story"
          @regenerate-shot="handleRegenerateShot"
          @approve="handleApprove"
          @cancel="handleCancel"
        />
      </template>

      <StoryReview
        v-else-if="state.status === 'review' && story"
        :story="story"
        @regenerate="handleRegenerate"
        @approve="handleApprove"
        @cancel="handleCancel"
      />

      <StoryShotProgress
        v-else-if="state.status === 'videos' && story && isReelStory"
        :story="story"
        phase="videos"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        @cancel="handleCancel"
        @retryShot="handleRetryShot"
      />

      <StoryVideoProgress
        v-else-if="state.status === 'videos' && story"
        :story="story"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        @cancel="handleCancel"
        @retry="handleRetryVideo"
      />

      <StoryShotProgress
        v-else-if="state.status === 'qc' && story && isReelStory"
        :story="story"
        phase="videos"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        @cancel="handleCancel"
      />

      <StoryQCProgress
        v-else-if="state.status === 'qc'"
      />

      <StoryShotQC
        v-else-if="state.status === 'waiting-qc' && story && isReelStory"
        :story="story"
        @retryQc="handleRetryQc"
        @retryShot="handleRetryShot"
        @recoverShot="handleRecoverShot"
        @approve="handleApproveQc"
        @cancel="handleCancel"
        @startOver="handleStartOver"
      />

      <StoryQCReview
        v-else-if="state.status === 'waiting-qc' && story"
        :story="story"
        @retry="handleRetryQc"
        @recover="handleRecoverScene"
        @retry-video="handleRetryVideo"
        @approve="handleApproveQc"
        @cancel="handleCancel"
        @start-over="handleStartOver"
      />

      <StoryShotProgress
        v-else-if="state.status === 'assembling' && story && isReelStory"
        :story="story"
        phase="assembling"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
      />

      <StoryAssemblyProgress
        v-else-if="state.status === 'assembling'"
        :elapsed-seconds="elapsedSeconds"
      />

      <StoryShotResult
        v-else-if="state.status === 'ready' && story && isReelStory"
        :story="story"
        @restart="handleStartOver"
      />

      <StoryResult
        v-else-if="state.status === 'ready' && story"
        :story="story"
        @restart="handleStartOver"
      />

      <section
        v-else-if="state.status === 'failed'"
        data-testid="story-failed"
        class="mt-6"
      >
        <h2 class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl">
          {{ STORY_COPY.failedTitle }}
        </h2>

        <StoryErrorAlert :error="state.error" class="mt-3">
          <AppButton
            v-for="scene in failedKeyframeScenes"
            :key="scene.id"
            type="button"
            data-testid="story-retry-scene"
            :disabled="scene.keyframeAttempts >= 2"
            @click="handleRetryScene(scene.id)"
          >
            {{ STORY_COPY.retryScene }}
          </AppButton>

          <AppButton
            v-for="scene in failedVideoScenes"
            :key="scene.id"
            type="button"
            data-testid="story-retry-scene"
            @click="handleRetryVideo(scene.id)"
          >
            {{ STORY_COPY.retryScene }}
          </AppButton>

          <AppButton
            v-if="state.error.code === 'assembly-failed' || state.error.code === 'assembly-timeout' || state.error.code === 'ffmpeg-not-configured'"
            type="button"
            data-testid="story-retry-assembly"
            @click="handleRetryAssembly"
          >
            {{ STORY_COPY.retryAssembly }}
          </AppButton>

          <AppButton
            type="button"
            variant="secondary"
            data-testid="story-start-over"
            @click="handleStartOver"
          >
            {{ STORY_COPY.startOver }}
          </AppButton>
        </StoryErrorAlert>
      </section>

      <section
        v-else-if="state.status === 'cancelled'"
        data-testid="story-cancelled"
        tabindex="-1"
        class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 text-sm leading-relaxed text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:p-6"
      >
        <p>{{ STORY_COPY.cancelled }}</p>

        <AppButton type="button" data-testid="story-start-over" class="mt-4" @click="handleStartOver">
          {{ STORY_COPY.startOver }}
        </AppButton>
      </section>
    </main>
  </div>
</template>
