<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { GeneratedShortPreview } from '~/models/composer'
import { formatReferenceCount } from '~/utils/composer'
import { formatDuration } from '~/utils/shorts'

defineProps<{
  preview: GeneratedShortPreview
}>()

const emit = defineEmits<{
  regenerate: []
  edit: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section data-testid="composer-preview" class="mt-6">
    <div class="flex flex-wrap items-center gap-2">
      <span
        data-testid="composer-preview-badge"
        class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
      >
        SIMULACIÓN
      </span>

      <h2
        ref="heading"
        data-testid="composer-preview-heading"
        tabindex="-1"
        class="text-xl font-semibold tracking-tight text-brand-text sm:text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink"
      >
        Vista previa simulada
      </h2>
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-6">
      <div class="flex justify-center md:justify-start">
        <img
          data-testid="composer-preview-poster"
          :src="preview.poster.src"
          :alt="preview.poster.alt"
          :width="preview.poster.width"
          :height="preview.poster.height"
          loading="eager"
          decoding="async"
          class="aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 object-cover forced-colors:border forced-colors:border-[ButtonText]"
        >
      </div>

      <div class="rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6">
        <h3
          data-testid="composer-preview-title"
          class="text-xl font-semibold leading-tight tracking-tight text-brand-text sm:text-2xl"
        >
          {{ preview.title }}
        </h3>

        <dl class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Duración
            </dt>
            <dd
              data-testid="composer-preview-duration"
              :aria-label="`Duración: ${preview.durationSeconds} segundos`"
              class="mt-0.5 font-medium tabular-nums text-brand-text"
            >
              {{ formatDuration(preview.durationSeconds) }}
            </dd>
          </div>

          <div>
            <dt class="text-xs uppercase tracking-[0.12em] text-brand-muted">
              Referencias
            </dt>
            <dd
              data-testid="composer-preview-references"
              class="mt-0.5 font-medium text-brand-text"
            >
              {{ formatReferenceCount(preview.referenceCount) }}
            </dd>
          </div>
        </dl>

        <p
          data-testid="composer-preview-attempt"
          class="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-brand-muted"
        >
          Intento {{ preview.attempt }}
        </p>

        <div class="mt-4">
          <p class="text-xs uppercase tracking-[0.12em] text-brand-muted">
            Idea original
          </p>
          <p
            data-testid="composer-preview-prompt"
            class="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-brand-text"
          >{{ preview.prompt }}</p>
        </div>

        <p
          data-testid="composer-preview-note"
          class="mt-4 rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs leading-relaxed text-brand-muted"
        >
          Esta vista previa es ficticia. No se ha generado ningún vídeo, no se ha subido ningún archivo y no se ha publicado nada en el feed.
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
