<script setup lang="ts">
import { computed, ref } from 'vue'
import ComposerReferenceCard from '~/components/composer/ComposerReferenceCard.vue'
import { COMPOSER_FILE_ACCEPT } from '~/data/composer'
import type {
  ComposerReference,
  ComposerReferenceId,
  ComposerValidationIssue,
} from '~/models/composer'

const props = defineProps<{
  references: readonly ComposerReference[]
  maxReferences: number
  issues: readonly ComposerValidationIssue[]
}>()

const emit = defineEmits<{
  add: [files: File[]]
  remove: [id: ComposerReferenceId]
}>()

const fileInput = ref<HTMLInputElement | null>(null)

const canAddMore = computed(() => props.references.length < props.maxReferences)
const hasReachedLimit = computed(() => !canAddMore.value)

function openFilePicker(): void {
  fileInput.value?.click()
}

function handleChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const files = Array.from(input?.files ?? [])

  if (input) {
    input.value = ''
  }

  if (files.length > 0) {
    emit('add', files)
  }
}
</script>

<template>
  <section
    data-testid="composer-references"
    aria-labelledby="composer-references-heading"
    class="mt-6"
  >
    <h3
      id="composer-references-heading"
      class="text-base font-semibold tracking-tight text-brand-text"
    >
      Referencias (opcional)
    </h3>

    <p class="mt-1 text-xs leading-relaxed text-brand-muted">
      Hasta 3 imágenes o vídeos. Se quedan en tu navegador y no se suben.
    </p>

    <div data-testid="composer-reference-picker" class="mt-3">
      <input
        ref="fileInput"
        data-testid="composer-reference-input"
        type="file"
        :accept="COMPOSER_FILE_ACCEPT"
        multiple
        tabindex="-1"
        aria-label="Añadir referencia"
        class="sr-only"
        @change="handleChange"
      >

      <button
        type="button"
        data-testid="composer-reference-add"
        :disabled="hasReachedLimit"
        class="flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
        @click="openFilePicker"
      >
        Añadir referencia
      </button>

      <p
        data-testid="composer-reference-count"
        class="mt-2 text-xs tabular-nums text-brand-muted"
      >{{ references.length }} de {{ maxReferences }}</p>

      <p
        v-if="references.length === 0"
        data-testid="composer-reference-empty"
        class="mt-1 text-xs leading-relaxed text-brand-muted"
      >
        Sin referencias. Puedes generar solo con texto.
      </p>

      <p
        v-if="hasReachedLimit"
        class="mt-1 text-xs leading-relaxed text-brand-muted"
      >
        Máximo 3 referencias. Elimina una para añadir otra.
      </p>

      <div
        v-if="issues.length > 0"
        data-testid="composer-reference-error"
        role="alert"
        aria-live="assertive"
        class="mt-3 rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text"
      >
        <p v-for="issue in issues" :key="issue.code">{{ issue.message }}</p>
      </div>

      <ul
        v-if="references.length > 0"
        class="mt-3 flex flex-col gap-2 sm:grid sm:grid-cols-2"
      >
        <ComposerReferenceCard
          v-for="reference in references"
          :key="reference.id"
          :reference="reference"
          @remove="emit('remove', $event)"
        />
      </ul>
    </div>
  </section>
</template>
