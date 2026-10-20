<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { ComposerGenerationStage } from '~/models/composer'
import { composerStageLabel } from '~/utils/composer'

const props = defineProps<{
  stage: ComposerGenerationStage
  progress: number
  attempt: number
}>()

const emit = defineEmits<{
  cancel: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

const stageLabel = computed(() => composerStageLabel(props.stage))
const announcement = computed(() => `${stageLabel.value}. ${props.progress} % completado.`)

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
      class="text-lg font-semibold tracking-tight text-brand-text sm:text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface"
    >
      Generando tu short simulado
    </h2>

    <p data-testid="composer-generation-note" class="mt-2 text-sm leading-relaxed text-brand-muted">
      Esto es una simulación: no se está creando ningún vídeo real.
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
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress"
      :aria-valuetext="`${progress} % completado`"
      class="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10 forced-colors:border forced-colors:border-[ButtonText]"
    >
      <div
        class="h-full rounded-full bg-gradient-to-r from-brand-violet to-brand-fuchsia motion-safe:transition-[width] motion-safe:duration-[400ms] motion-safe:ease-out"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <p
      data-testid="composer-generation-percent"
      aria-hidden="true"
      class="mt-2 text-xs tabular-nums text-brand-muted"
    >
      {{ progress }} %
    </p>

    <p role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ announcement }}
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
