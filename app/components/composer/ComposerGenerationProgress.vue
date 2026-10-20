<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { ComposerJobStage } from '~/models/composer'
import {
  COMPOSER_JOB_STAGES,
  composerStageLabel,
  formatElapsedSeconds,
} from '~/utils/composer'

const props = defineProps<{
  stage: ComposerJobStage
  queuePosition: number | null
  elapsedSeconds: number
  isSlow: boolean
  attempt: number
}>()

const emit = defineEmits<{
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const currentIndex = computed(() => COMPOSER_JOB_STAGES.indexOf(props.stage))
const stageLabel = computed(() => composerStageLabel(props.stage))
const elapsedLabel = computed(() => formatElapsedSeconds(props.elapsedSeconds))

function stateFor(index: number): 'complete' | 'current' | 'upcoming' {
  if (index < currentIndex.value) return 'complete'
  if (index === currentIndex.value) return 'current'

  return 'upcoming'
}

function dotClass(index: number): string {
  const state = stateFor(index)

  if (state === 'current') {
    return 'border border-transparent bg-gradient-to-r from-brand-violet to-brand-fuchsia'
  }

  if (state === 'complete') {
    return 'border border-brand-violet bg-brand-violet/20'
  }

  return 'border border-white/15 bg-transparent'
}

function textClass(index: number): string {
  return stateFor(index) === 'upcoming' ? 'text-brand-muted' : 'text-brand-text'
}

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    data-testid="composer-generation"
    aria-busy="true"
    :data-attempt="attempt"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      data-testid="composer-generation-heading"
      tabindex="-1"
      class="text-lg font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-xl"
    >
      Generando tu vídeo
    </h2>

    <p class="mt-2 text-sm leading-relaxed text-brand-muted">
      La generación es real y puede tardar varios minutos. Si sales de esta página, perderás el progreso.
    </p>

    <p
      data-testid="composer-generation-stage"
      class="mt-4 text-sm font-medium text-brand-text"
    >
      {{ stageLabel }}
    </p>

    <div
      data-testid="composer-generation-progress"
      role="progressbar"
      aria-label="Progreso de generación"
      class="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10 forced-colors:border forced-colors:border-[ButtonText]"
    >
      <div class="composer-progress-bar h-full w-2/5 rounded-full bg-gradient-to-r from-brand-violet to-brand-fuchsia" />
    </div>

    <ol data-testid="composer-generation-stages" class="mt-5 flex flex-col gap-2">
      <li
        v-for="(item, index) in COMPOSER_JOB_STAGES"
        :key="item"
        :data-state="stateFor(index)"
        class="flex min-h-8 items-center gap-2 text-sm"
      >
        <span
          aria-hidden="true"
          class="size-2.5 shrink-0 rounded-full"
          :class="dotClass(index)"
        />
        <span :class="textClass(index)">{{ composerStageLabel(item) }}</span>
      </li>
    </ol>

    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-muted">
      <p data-testid="composer-generation-elapsed" class="tabular-nums">
        Tiempo transcurrido: {{ elapsedLabel }}
      </p>

      <p
        v-if="queuePosition !== null"
        data-testid="composer-generation-queue"
        class="tabular-nums"
      >
        Posición {{ queuePosition }} en la cola
      </p>
    </div>

    <p
      v-if="isSlow"
      data-testid="composer-generation-slow"
      class="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text"
    >
      Está tardando más de lo habitual. Puedes seguir esperando o cancelar.
    </p>

    <AppButton
      type="button"
      variant="secondary"
      data-testid="composer-cancel"
      class="mt-4 w-full sm:w-auto"
      @click="emit('cancel')"
    >
      Cancelar
    </AppButton>
  </section>
</template>

<style scoped>
.composer-progress-bar {
  width: 40%;
}

@media (prefers-reduced-motion: no-preference) {
  .composer-progress-bar {
    animation: composer-indeterminate 1.4s ease-in-out infinite;
  }
}

@keyframes composer-indeterminate {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
