// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
    '@nuxt/icon',
    '@nuxt/fonts',
  ],

  runtimeConfig: {
    falKey: '',
    composer: {
      jobSecret: '',
      generateLimit: 3,
      generateWindowMs: 600_000,
      uploadLimit: 5,
      uploadWindowMs: 600_000,
      maxActiveJobs: 1,
      maxGlobalJobs: 3,
      dailyGenerationBudget: 50,
      jobTtlMs: 3_600_000,
      keyframeTimeoutMs: 45_000,
      pollAfterMs: 2_000,
      falQueueBaseUrl: 'https://queue.fal.run',
      falRunBaseUrl: 'https://fal.run',
      falStorageBaseUrl: 'https://rest.fal.ai',
    },
  },

  pwa: {
    workbox: {
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          urlPattern: /\/api\/.*/,
          handler: 'NetworkOnly' as const,
        },
        {
          urlPattern: /^https:\/\/(?:[^/]+\.)?fal\.media\/.*/,
          handler: 'NetworkOnly' as const,
        },
        {
          urlPattern: /^https:\/\/(?:queue|rest)?\.?fal\.(?:run|ai)\/.*/,
          handler: 'NetworkOnly' as const,
        },
      ],
    },
  },
})
