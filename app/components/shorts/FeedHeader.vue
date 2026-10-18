<script setup lang="ts">
import BrandMark from '~/components/ui/BrandMark.vue'

const emit = defineEmits<{
  open: []
}>()

const demoExplanation = 'DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.'
</script>

<template>
  <header
    data-testid="feed-header"
    class="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] sm:px-6 forced-colors:bg-[Canvas]"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark />

        <span
          data-testid="demo-badge"
          role="note"
          :aria-label="demoExplanation"
          class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
        >DEMO</span>
      </div>

      <button
        type="button"
        data-testid="feed-cta"
        aria-haspopup="dialog"
        class="pointer-events-auto ml-auto inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep px-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-fuchsia/20 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 sm:px-4"
        @click="emit('open')"
      >
        Crear short
      </button>
    </div>
  </header>
</template>
