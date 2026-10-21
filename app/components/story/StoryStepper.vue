<script setup lang="ts">
import { computed } from 'vue'
import { STORY_STEPS, type StoryStepId } from '~/data/story'

type StepState = 'complete' | 'current' | 'upcoming'

const props = defineProps<{
  current: StoryStepId
}>()

const currentIndex = computed(() => {
  const index = STORY_STEPS.findIndex((step) => step.id === props.current)

  return index < 0 ? 0 : index
})

function stateFor(index: number): StepState {
  if (index < currentIndex.value) return 'complete'
  if (index === currentIndex.value) return 'current'

  return 'upcoming'
}

function stateLabel(index: number): string {
  const state = stateFor(index)

  if (state === 'complete') return 'completado'
  if (state === 'current') return 'actual'

  return 'pendiente'
}

function stepLabel(index: number): string {
  const step = STORY_STEPS[index]

  if (!step) return ''

  return `Paso ${index + 1} de 4: ${step.label}, ${stateLabel(index)}`
}

function circleClass(index: number): string {
  const state = stateFor(index)

  if (state === 'current') {
    return 'border border-transparent bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep text-white'
  }

  if (state === 'complete') {
    return 'border border-brand-violet text-brand-violet'
  }

  return 'border border-white/15 text-brand-muted'
}

function labelClass(index: number): string {
  return stateFor(index) === 'current' ? 'text-brand-text' : 'text-brand-muted'
}
</script>

<template>
  <nav aria-label="Progreso de la historia" class="mt-6">
    <ol data-testid="story-stepper" class="flex items-start gap-2">
      <li
        v-for="(step, index) in STORY_STEPS"
        :key="step.id"
        data-testid="story-step"
        :data-step="step.id"
        :data-state="stateFor(index)"
        :aria-label="stepLabel(index)"
        :aria-current="stateFor(index) === 'current' ? 'step' : undefined"
        class="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
      >
        <span
          aria-hidden="true"
          class="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums forced-colors:border forced-colors:border-[ButtonText]"
          :class="circleClass(index)"
        >{{ index + 1 }}</span>

        <span
          aria-hidden="true"
          class="text-[10px] font-medium leading-tight tracking-tight sm:text-xs"
          :class="labelClass(index)"
        >{{ step.label }}</span>
      </li>
    </ol>
  </nav>
</template>
