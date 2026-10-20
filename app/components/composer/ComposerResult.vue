<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { ComposerJob } from '~/models/composer'
import {
  formatComposerDuration,
  formatComposerReference,
  getComposerModel,
} from '~/utils/composer'

const props = defineProps<{
  job: Extract<ComposerJob, { status: 'succeeded' }>
  referenceCount: 0 | 1
  attempt: number
}>()

const emit = defineEmits<{
  regenerate: []
  edit: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)
const videoFailed = ref(false)

const modelLabel = computed(() => getComposerModel(props.job.preset).label)
const durationLabel = computed(() => (
  formatComposerDuration(props.job.output.durationSeconds)
))
const referenceLabel = computed(() => (
  formatComposerReference(props.referenceCount)
))

function handleVideoError(): void {
  videoFailed.value = true
}

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section data-testid="composer-result" class="mt-6">
    <div class="flex flex-wrap items-center gap-2">
      <span
        data-testid="composer-result-badge"
        class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
      >
        IA
      </span>

      <h2
        ref="heading"
        data-testid="composer-result-heading"
        tabindex="-1"
        class="text-xl font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink sm:text-2xl"
      >
        Tu short
      </h2>
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-6">
      <div class="flex flex-col items-center gap-2 md:items-start">
        <video
          data-testid="composer-video"
          controls
          controlslist="nodownload"
          disablepictureinpicture
          playsinline
          preload="metadata"
          :src="job.output.videoUrl"
          :poster="job.output.posterUrl"
          aria-label="Vídeo generado con IA"
          class="aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 bg-black object-cover forced-colors:border forced-colors:border-[ButtonText]"
          @error="handleVideoError"
        />

        <p
          v-if="videoFailed"
          role="alert"
          class="w-full max-w-[20rem] rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
        >
          No se pudo cargar el vídeo. Puede que el enlace haya caducado.
        </p>
      </div>

      <div class="rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6">
        <dl class="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Modelo
            </dt>
            <dd
              data-testid="composer-result-model"
              class="mt-0.5 font-medium text-brand-text"
            >
              {{ modelLabel }}
            </dd>
          </div>

          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Duración
            </dt>
            <dd
              data-testid="composer-result-duration"
              class="mt-0.5 font-medium tabular-nums text-brand-text"
            >
              {{ durationLabel }}
            </dd>
          </div>

          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Formato
            </dt>
            <dd
              data-testid="composer-result-format"
              class="mt-0.5 font-medium text-brand-text"
            >
              9:16
            </dd>
          </div>

          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Referencia
            </dt>
            <dd
              data-testid="composer-result-reference"
              class="mt-0.5 font-medium text-brand-text"
            >
              {{ referenceLabel }}
            </dd>
          </div>
        </dl>

        <p
          data-testid="composer-result-attempt"
          class="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-brand-muted"
        >
          Intento {{ attempt }}
        </p>

        <p
          data-testid="composer-result-note"
          class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
        >
          Generado con IA. Puede contener errores. No se ha publicado en el feed. El enlace del vídeo es temporal.
        </p>

        <div class="mt-5 flex flex-col gap-2 sm:flex-row">
          <AppButton
            type="button"
            data-testid="composer-regenerate"
            class="w-full sm:w-auto"
            @click="emit('regenerate')"
          >
            Regenerar
          </AppButton>

          <AppButton
            type="button"
            variant="secondary"
            data-testid="composer-edit"
            class="w-full sm:w-auto"
            @click="emit('edit')"
          >
            Editar idea
          </AppButton>
        </div>
      </div>
    </div>
  </section>
</template>
