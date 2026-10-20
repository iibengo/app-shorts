<script setup lang="ts">
import { computed, ref } from 'vue'
import ComposerReferenceCard from '~/components/composer/ComposerReferenceCard.vue'
import AppButton from '~/components/ui/AppButton.vue'
import { COMPOSER_FILE_ACCEPT } from '~/data/composer'
import type {
  ComposerReference,
  ComposerValidationIssue,
} from '~/models/composer'

const props = defineProps<{
  reference: ComposerReference | null
  uploadState: 'idle' | 'uploading' | 'error'
  issues: readonly ComposerValidationIssue[]
}>()

const emit = defineEmits<{
  select: [file: File]
  remove: []
  retry: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const isUploading = computed(() => props.uploadState === 'uploading')
const referenceCount = computed(() => (props.reference ? 1 : 0))
const hasError = computed(() => props.issues.length > 0 || props.uploadState === 'error')

function openFilePicker(): void {
  fileInput.value?.click()
}

function handleChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (input) {
    input.value = ''
  }

  if (file) {
    emit('select', file)
  }
}
</script>

<template>
  <section
    data-testid="composer-reference"
    aria-labelledby="composer-reference-heading"
    class="mt-5"
  >
    <h3
      id="composer-reference-heading"
      class="text-sm font-medium tracking-tight text-brand-text"
    >
      Imagen de referencia (opcional)
    </h3>

    <p class="mt-1 text-xs leading-relaxed text-brand-muted">
      Una imagen PNG, JPG o WebP de hasta 8 MB. Se envía a Fal para generar el vídeo y se elimina en 1 hora.
    </p>

    <div class="mt-3">
      <input
        id="composer-reference-input"
        ref="fileInput"
        data-testid="composer-reference-input"
        type="file"
        :accept="COMPOSER_FILE_ACCEPT"
        tabindex="-1"
        aria-label="Añadir imagen"
        class="sr-only"
        @change="handleChange"
      >

      <button
        type="button"
        data-testid="composer-reference-add"
        :disabled="reference !== null || isUploading"
        class="flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
        @click="openFilePicker"
      >
        Añadir imagen
      </button>

      <div class="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p
          data-testid="composer-reference-count"
          class="text-xs tabular-nums text-brand-muted"
        >{{ referenceCount }} de 1</p>

        <p
          v-if="reference"
          class="text-xs leading-relaxed text-brand-muted"
        >
          Máximo 1 imagen. Elimina la actual para cambiarla.
        </p>
      </div>

      <p
        v-if="reference && uploadState === 'idle'"
        role="status"
        aria-live="polite"
        class="sr-only"
      >
        Imagen lista.
      </p>

      <p
        v-if="!reference && !isUploading"
        data-testid="composer-reference-empty"
        class="mt-1 text-xs leading-relaxed text-brand-muted"
      >
        Sin imagen. Puedes generar solo con texto.
      </p>

      <p
        v-if="isUploading"
        data-testid="composer-reference-uploading"
        role="status"
        aria-live="polite"
        class="mt-2 flex items-center gap-2 text-xs text-brand-text"
      >
        <span
          aria-hidden="true"
          class="size-3 rounded-full border-2 border-brand-fuchsia border-t-transparent motion-safe:animate-spin"
        />
        Subiendo imagen…
      </p>

      <div
        v-if="hasError"
        data-testid="composer-reference-error"
        role="alert"
        class="mt-3 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
      >
        <p v-for="issue in issues" :key="issue.code">{{ issue.message }}</p>
        <p v-if="uploadState === 'error'">
          No se pudo subir la imagen. Inténtalo de nuevo.
        </p>

        <div v-if="uploadState === 'error'" class="mt-3">
          <AppButton
            type="button"
            data-testid="composer-reference-retry"
            @click="emit('retry')"
          >
            Reintentar subida
          </AppButton>
        </div>
      </div>

      <ul v-if="reference" class="mt-3">
        <ComposerReferenceCard
          :reference="reference"
          @remove="emit('remove')"
        />
      </ul>
    </div>
  </section>
</template>
