<script setup lang="ts">
import ModalDialog from '~/components/ui/ModalDialog.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <ModalDialog
    :open="open"
    labelledby="notice-heading"
    describedby="notice-body"
    overlay-test-id="notice-overlay"
    panel-test-id="create-short-notice"
    return-focus-selector='[data-testid="feed-cta"]'
    @close="emit('close')"
  >
    <h2
      id="notice-heading"
      data-testid="notice-heading"
      class="text-xl font-semibold tracking-tight text-brand-text"
    >
      Próximamente
    </h2>

    <p
      id="notice-body"
      data-testid="notice-body"
      class="mt-3 text-sm leading-relaxed text-brand-muted"
    >
      La creación de shorts con IA todavía no está disponible. Esta demo usa datos ficticios y no genera videos reales.
    </p>

    <button
      type="button"
      data-testid="notice-close"
      data-autofocus
      class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/[0.15] bg-white/5 px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
      @click="emit('close')"
    >
      Cerrar
    </button>
  </ModalDialog>
</template>
