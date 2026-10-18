<script setup lang="ts">
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
  ],
})

useSeoMeta({
  title: 'AI Shorts — Próximamente',
  description:
    'Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.',
  ogTitle: 'AI Shorts — Próximamente',
  ogDescription:
    'Estamos construyendo AI Shorts, la forma más rápida de convertir tus ideas en videos cortos con IA. Muy pronto.',
  ogType: 'website',
  ogLocale: 'es_ES',
  twitterCard: 'summary',
})
</script>

<template>
  <div
    data-testid="landing-page"
    class="relative min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white"
  >
    <!-- Decorative ambient background -->
    <div
      class="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      data-testid="decorative-glow"
    >
      <div class="absolute left-1/2 top-0 -translate-x-1/2">
        <div class="h-[34rem] w-[34rem] rounded-full bg-brand-violet-deep/20 blur-3xl motion-safe:animate-brand-glow" />
      </div>
      <div class="absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-fuchsia-deep/10 blur-3xl" />
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_45%)]" />
    </div>

    <div class="relative flex min-h-svh flex-col">
      <header class="mx-auto flex w-full max-w-6xl items-center px-6 py-6 sm:px-8 sm:py-8">
        <div data-testid="brand-mark" class="flex items-center gap-3">
          <div
            class="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-violet-deep to-brand-fuchsia-deep shadow-lg shadow-brand-fuchsia/20"
            aria-hidden="true"
          >
            <svg
              class="size-4 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
            </svg>
          </div>
          <span class="text-sm font-semibold uppercase tracking-[0.18em] text-brand-text">AI Shorts</span>
        </div>
      </header>

      <main class="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-16 sm:px-8 sm:py-24 lg:py-28">
        <div class="max-w-3xl">
          <p
            data-testid="construction-badge"
            class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-300"
          ><span class="size-1.5 rounded-full bg-gradient-to-r from-brand-violet to-brand-fuchsia" aria-hidden="true" />EN CONSTRUCCIÓN</p>

          <h1
            data-testid="hero-heading"
            class="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-brand-text sm:text-6xl lg:text-7xl"
          >Tus ideas, convertidas en <span class="bg-gradient-to-r from-brand-violet via-brand-fuchsia to-brand-fuchsia bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]">shorts</span>.</h1>

          <p
            data-testid="value-proposition"
            class="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-brand-muted sm:text-lg"
          >Estamos construyendo la forma más rápida de convertir tus ideas en videos cortos con IA: del concepto al guion, y del guion al video, en minutos.</p>

          <ul data-testid="feature-list" class="mt-10 grid gap-3 sm:grid-cols-3">
            <li class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-snug text-zinc-300">Idea → guion → video</li>
            <li class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-snug text-zinc-300">Edición automática</li>
            <li class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-snug text-zinc-300">Publica en minutos</li>
          </ul>

          <div class="mt-10 flex flex-col items-start gap-3">
            <button
              type="button"
              data-testid="primary-cta"
              disabled
              aria-disabled="true"
              aria-describedby="cta-helper"
              class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-fuchsia/20 disabled:cursor-not-allowed disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink"
            >Avísame del lanzamiento</button>
            <p id="cta-helper" data-testid="cta-helper" class="text-xs text-brand-muted">Próximamente. Abriremos la lista de espera el día del lanzamiento.</p>
          </div>
        </div>
      </main>

      <footer data-testid="site-footer" class="mx-auto w-full max-w-6xl px-6 sm:px-8">
        <div class="border-t border-white/10 pt-6 pb-8">
          <p class="text-xs text-brand-muted">© 2026 AI Shorts · Hecho para creadores.</p>
        </div>
      </footer>
    </div>
  </div>
</template>
