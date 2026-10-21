<script setup lang="ts">
import BrandMark from '~/components/ui/BrandMark.vue'
import { STORY_COPY } from '~/data/story'
</script>

<template>
  <header
    data-testid="story-header"
    class="relative z-10 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)_+_0.75rem)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <BrandMark />

        <span
          data-testid="story-beta-badge"
          role="note"
          :aria-label="STORY_COPY.betaExplanation"
          class="rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia"
        >{{ STORY_COPY.beta }}</span>
      </div>

      <NuxtLink
        to="/feed"
        data-testid="story-back-link"
        class="ml-auto inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/5 px-4 text-sm font-semibold text-brand-text motion-safe:transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
      >
        {{ STORY_COPY.back }}
      </NuxtLink>
    </div>
  </header>
</template>
