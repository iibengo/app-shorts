<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CreateShortNotice from '~/components/shorts/CreateShortNotice.vue'
import FeedHeader from '~/components/shorts/FeedHeader.vue'
import ShortsFeed from '~/components/shorts/ShortsFeed.vue'
import { useShareShort } from '~/composables/useShareShort'
import { shorts } from '~/data/shorts'
import type { Short } from '~/types/short'

let previousScrollRestoration: ScrollRestoration | null = null

onMounted(() => {
  if (typeof history === 'undefined' || !('scrollRestoration' in history)) return

  previousScrollRestoration = history.scrollRestoration
  history.scrollRestoration = 'manual'
})

onBeforeUnmount(() => {
  if (previousScrollRestoration === null) return

  history.scrollRestoration = previousScrollRestoration
  previousScrollRestoration = null
})

useHead({
  htmlAttrs: {
    lang: 'es',
    class: 'bg-brand-ink',
  },
  bodyAttrs: {
    class: 'bg-brand-ink',
  },
  meta: [
    { name: 'color-scheme', content: 'dark' },
    { name: 'theme-color', content: '#09090b' },
    { name: 'robots', content: 'noindex, nofollow' },
  ],
})

useSeoMeta({
  title: 'AI Shorts — Feed de prueba',
  description:
    'Feed de demostración de AI Shorts con seis shorts ficticios. La creación de videos con IA estará disponible próximamente.',
})

const isNoticeOpen = ref(false)
const noticeMounted = ref(false)

const { message: shareMessage, share } = useShareShort()

function openNotice(): void {
  noticeMounted.value = true
  isNoticeOpen.value = true
}

function closeNotice(): void {
  isNoticeOpen.value = false
}

function handleShare(short: Short): void {
  void share(short)
}
</script>

<template>
  <div
    data-testid="feed-page"
    :inert="isNoticeOpen"
    class="relative h-svh overflow-hidden bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <FeedHeader @open="openNotice" />

    <ShortsFeed :shorts="shorts" @share="handleShare" />

    <noscript data-allow-mismatch="children">
      <p
        data-testid="nojs-notice"
        class="fixed inset-x-4 top-[calc(env(safe-area-inset-top)_+_7.5rem)] z-40 rounded-2xl border border-white/15 bg-brand-surface p-3 text-sm leading-relaxed text-brand-text shadow-lg sm:top-[calc(env(safe-area-inset-top)_+_4.5rem)]"
      >
        La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. La creación de shorts con IA todavía no está disponible.
      </p>
    </noscript>

    <div
      class="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)_+_7.5rem)] z-[45] flex justify-center px-4 sm:top-[calc(env(safe-area-inset-top)_+_4.5rem)]"
    >
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="share-status"
        class="text-center text-sm text-white"
        :class="shareMessage
          ? 'rounded-full border border-white/10 bg-black/[0.75] px-4 py-2 shadow-lg'
          : 'sr-only'"
      >
        {{ shareMessage }}
      </p>
    </div>

    <CreateShortNotice
      v-if="noticeMounted"
      :open="isNoticeOpen"
      @close="closeNotice"
    />
  </div>
</template>
