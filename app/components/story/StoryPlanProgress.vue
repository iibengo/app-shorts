<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import { STORY_COPY } from '~/data/story'

const props = defineProps<{
  status: 'planning' | 'keyframes'
}>()

const emit = defineEmits<{
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const isPlanning = computed(() => props.status === 'planning')
const title = computed(() => (
  isPlanning.value ? STORY_COPY.planning : STORY_COPY.keyframes
))
const note = computed(() => (
  isPlanning.value ? STORY_COPY.planningNote : STORY_COPY.keyframesNote
))

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    :data-testid="isPlanning ? 'story-planning' : 'story-keyframes'"
    aria-busy="true"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      {{ title }}
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      {{ note }}
    </p>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div
        role="status"
        aria-live="polite"
        class="flex items-center gap-2 text-sm text-brand-text"
      >
        <span
          aria-hidden="true"
          class="size-3 rounded-full border-2 border-brand-fuchsia border-t-transparent motion-safe:animate-spin"
        />
        <span>{{ title }}</span>
      </div>

      <AppButton
        v-if="status === 'keyframes'"
        type="button"
        variant="secondary"
        data-testid="story-keyframes-cancel"
        class="min-h-11"
        @click="emit('cancel')"
      >
        {{ STORY_COPY.cancel }}
      </AppButton>
    </div>
  </section>
</template>
