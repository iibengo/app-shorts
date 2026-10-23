<script setup lang="ts">
import {
  computed,
  nextTick,
  ref,
} from 'vue'
import StoryCreateForm from '~/components/story/StoryCreateForm.vue'
import StoryHeader from '~/components/story/StoryHeader.vue'
import StoryModePicker from '~/components/story/StoryModePicker.vue'
import StoryPlanProgress from '~/components/story/StoryPlanProgress.vue'
import StoryPresetPicker from '~/components/story/StoryPresetPicker.vue'
import StoryStylePicker from '~/components/story/StoryStylePicker.vue'
import StoryReferencePicker from '~/components/story/StoryReferencePicker.vue'
import StoryCostModePicker from '~/components/story/StoryCostModePicker.vue'
import StoryCostSummary from '~/components/story/StoryCostSummary.vue'
import StoryDurationPicker from '~/components/story/StoryDurationPicker.vue'
import StoryPlatformPicker from '~/components/story/StoryPlatformPicker.vue'
import StoryStepper from '~/components/story/StoryStepper.vue'
import StoryErrorAlert from '~/components/story/StoryErrorAlert.vue'
import AppButton from '~/components/ui/AppButton.vue'
import {
  STORY_COPY,
  STORY_COST_PROFILES,
  STORY_DEFAULT_COST_MODE,
  STORY_DEFAULT_DURATION,
  STORY_DEFAULT_MODE,
  STORY_DEFAULT_PLATFORM,
  STORY_DEFAULT_PRESET,
  STORY_DEFAULT_VISUAL_STYLE,
} from '~/data/story'
import type {
  StoryCostMode,
  StoryDurationSeconds,
  StoryJobError,
  StoryMode,
  StoryPlatform,
  StoryPreset,
  StoryVisualStyle,
} from '~/models/story'
import { useStory } from '~/composables/useStory'
import { useStoryApi } from '~/composables/useStoryApi'
import { useStoryReference } from '~/composables/useStoryReference'
import { normalizeStoryText, validateStoryPremise } from '~/utils/story'

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
  title: STORY_COPY.metaTitle,
  description: STORY_COPY.metaDescription,
})

const api = useStoryApi()
const {
  reference,
  uploadState,
  issues: referenceIssues,
  selectFile,
  removeReference,
  retryUpload,
} = useStoryReference({ api })
const {
  state,
  statusMessage,
  createError,
  isOnline,
  createStory,
  clearError,
} = useStory({ api })

const premise = ref('')
const mode = ref<StoryMode>(STORY_DEFAULT_MODE)
const platform = ref<StoryPlatform>(STORY_DEFAULT_PLATFORM)
const costMode = ref<StoryCostMode>(STORY_DEFAULT_COST_MODE)
const targetDurationSeconds = ref<StoryDurationSeconds>(STORY_DEFAULT_DURATION)
const preset = ref<StoryPreset>(STORY_DEFAULT_PRESET)
const visualStyle = ref<StoryVisualStyle>(STORY_DEFAULT_VISUAL_STYLE)
const form = ref<{ focusPremise: () => void } | null>(null)
const premiseIssue = ref<StoryJobError | null>(null)

const isPlanning = computed(() => (
  state.value.status === 'creating' || state.value.status === 'planning'
))
const submitDisabled = computed(() => (
  !isOnline.value
  || uploadState.value === 'uploading'
  || isPlanning.value
  || validateStoryPremise(premise.value) !== null
))
const offlineMessage = computed(() => (
  isOnline.value ? '' : STORY_COPY.offlineCreate
))

async function handleSubmit(): Promise<void> {
  if (!isOnline.value || isPlanning.value) {
    return
  }

  const issue = validateStoryPremise(premise.value)

  if (issue) {
    premiseIssue.value = issue
    await nextTick()
    form.value?.focusPremise()

    return
  }

  premiseIssue.value = null

  const story = await createStory({
    premise: normalizeStoryText(premise.value),
    platform: platform.value,
    costMode: costMode.value,
    targetDurationSeconds: targetDurationSeconds.value,
    maxDurationSeconds: targetDurationSeconds.value,
    preset: preset.value,
    visualStyle: visualStyle.value,
    mode: mode.value,
    referenceUrl: reference.value?.fileUrl ?? null,
    referenceExpiresAt: reference.value?.expiresAt ?? null,
  })

  if (story) {
    await navigateTo(`/story/${story.id}`)
    return
  }

  await nextTick()
  form.value?.focusPremise()
}

function handleCostModeUpdate(value: StoryCostMode): void {
  costMode.value = value
  const durations = STORY_COST_PROFILES
    .filter((profile) => profile.costMode === value)
    .map((profile) => profile.durationSeconds)

  if (!durations.includes(targetDurationSeconds.value)) {
    targetDurationSeconds.value = durations.includes(30)
      ? 30
      : durations[0] ?? 15
  }
}

function handlePremiseUpdate(value: string): void {
  premise.value = value

  if (premiseIssue.value) {
    premiseIssue.value = validateStoryPremise(value)
  }
}

function handleReset(): void {
  clearError()
  premise.value = ''
  mode.value = STORY_DEFAULT_MODE
  platform.value = STORY_DEFAULT_PLATFORM
  costMode.value = STORY_DEFAULT_COST_MODE
  targetDurationSeconds.value = STORY_DEFAULT_DURATION
  preset.value = STORY_DEFAULT_PRESET
  premiseIssue.value = null
  removeReference()
}
</script>

<template>
  <div
    data-testid="story-page"
    class="min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <StoryHeader />

    <main class="mx-auto w-full max-w-3xl overflow-x-clip pb-[calc(env(safe-area-inset-bottom)_+_2rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-8">
      <h1
        data-testid="story-h1"
        class="text-3xl font-semibold leading-tight tracking-tight text-brand-text sm:text-4xl"
      >
        {{ STORY_COPY.h1 }}
      </h1>

      <p
        data-testid="story-intro"
        class="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted sm:text-base"
      >
        {{ STORY_COPY.intro }}
      </p>

      <noscript data-allow-mismatch="children">
        <p
          data-testid="story-nojs-notice"
          class="mt-4 rounded-2xl border border-white/15 bg-brand-surface p-3 text-sm leading-relaxed text-brand-text"
        >
          {{ STORY_COPY.nojsCreate }}
        </p>
      </noscript>

      <StoryStepper current="plan" />

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
        {{ offlineMessage }}
      </p>

      <StoryPlanProgress v-if="isPlanning" status="planning" />

      <StoryErrorAlert
        v-if="createError && !isPlanning"
        :error="createError"
        class="mt-6"
      >
        <AppButton type="button" data-testid="story-start-over" @click="handleReset">
          Empezar de nuevo
        </AppButton>
      </StoryErrorAlert>

      <StoryCreateForm
        v-if="!isPlanning"
        ref="form"
        :premise="premise"
        :issue="premiseIssue"
        :submit-disabled="submitDisabled"
        @update:premise="handlePremiseUpdate"
        @submit="handleSubmit"
      >
        <template #mode>
          <StoryModePicker
            :mode="mode"
            @update:mode="mode = $event"
          />
        </template>

        <template #platform>
          <StoryPlatformPicker
            :platform="platform"
            @update:platform="platform = $event"
          />
        </template>

        <template #costMode>
          <StoryCostModePicker
            :cost-mode="costMode"
            @update:costMode="handleCostModeUpdate"
          />
        </template>

        <template #duration>
          <StoryDurationPicker
            :cost-mode="costMode"
            :target-duration-seconds="targetDurationSeconds"
            @update:targetDurationSeconds="targetDurationSeconds = $event"
          />
        </template>

        <template #costSummary>
          <StoryCostSummary
            :cost-mode="costMode"
            :target-duration-seconds="targetDurationSeconds"
          />
        </template>

        <template #style>
          <StoryStylePicker
            :visual-style="visualStyle"
            @update:visual-style="visualStyle = $event"
          />
        </template>

        <template #preset>
          <StoryPresetPicker
            :preset="preset"
            @update:preset="preset = $event"
          />
        </template>

        <template #reference>
          <StoryReferencePicker
            :reference="reference"
            :upload-state="uploadState"
            :issues="referenceIssues"
            @select="selectFile"
            @remove="removeReference"
            @retry="retryUpload"
          />
        </template>
      </StoryCreateForm>
    </main>
  </div>
</template>
