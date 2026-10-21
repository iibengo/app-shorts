<script setup lang="ts">
import {
  computed,
  nextTick,
  watch,
} from 'vue'
import StoryErrorAlert from '~/components/story/StoryErrorAlert.vue'
import StoryHeader from '~/components/story/StoryHeader.vue'
import StoryPlanProgress from '~/components/story/StoryPlanProgress.vue'
import StoryReview from '~/components/story/StoryReview.vue'
import StoryVideoProgress from '~/components/story/StoryVideoProgress.vue'
import StoryAssemblyProgress from '~/components/story/StoryAssemblyProgress.vue'
import StoryResult from '~/components/story/StoryResult.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'
import type { StoryBeatUpdateRequest } from '~/models/story'
import { useStory } from '~/composables/useStory'
import { useStoryApi } from '~/composables/useStoryApi'

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
  approve,
  retryScene,
  retryAssembly,
  cancel: cancelStory,
  restart,
  retryPolling,
} = useStory({ api, storyId })

const orderedScenes = computed(() => (
  story.value
    ? story.value.scenes.slice().sort((a, b) => a.order - b.order)
    : []
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
const isSlow = computed(() => elapsedSeconds.value >= 600)

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

      <StoryPlanProgress
        v-else-if="state.status === 'keyframes'"
        status="keyframes"
      />

      <StoryReview
        v-else-if="state.status === 'review' && story"
        :story="story"
        @regenerate="handleRegenerate"
        @approve="handleApprove"
      />

      <StoryVideoProgress
        v-else-if="state.status === 'videos' && story"
        :story="story"
        :elapsed-seconds="elapsedSeconds"
        :is-slow="isSlow"
        @cancel="handleCancel"
        @retry="handleRetryVideo"
      />

      <StoryAssemblyProgress
        v-else-if="state.status === 'assembling'"
        :elapsed-seconds="elapsedSeconds"
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
