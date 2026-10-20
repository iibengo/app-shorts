<script setup lang="ts">
import BrandMark from '~/components/ui/BrandMark.vue'

const demoExplanation =
  'DEMO. El estudio de creación es una simulación: no se crea ni se publica ningún vídeo real y los archivos no se suben.'
</script>

<template>
  <header
    data-testid="composer-header"
    class="relative z-10 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)_+_0.75rem)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark />

        <span
          data-testid="composer-demo-badge"
          role="note"
          :aria-label="demoExplanation"
          class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
        >DEMO</span>
      </div>

      <NuxtLink
        to="/feed"
        data-testid="composer-back-link"
        class="ml-auto inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
      >
        Volver al feed
      </NuxtLink>
    </div>
  </header>
</template>
