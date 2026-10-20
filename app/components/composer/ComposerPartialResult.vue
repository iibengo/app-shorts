<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { ComposerJobError } from '~/models/composer'

defineProps<{
  posterUrl: string
  error: ComposerJobError
}>()

const emit = defineEmits<{
  retry: []
  edit: []
}>()

const heading = ref<HTMLHeadingElement | null>(null)

onMounted(() => {
  heading.value?.focus()
})
</script>

<template>
  <section
    data-testid="composer-partial"
    :data-error-code="error.code"
    class="mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6"
  >
    <h2
      ref="heading"
      tabindex="-1"
      class="text-xl font-semibold tracking-tight text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface sm:text-2xl"
    >
      Fotograma base listo
    </h2>

    <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-6">
      <img
        data-testid="composer-video-poster"
        :src="posterUrl"
        alt="Fotograma base generado por IA"
        class="aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 object-cover forced-colors:border forced-colors:border-[ButtonText]"
      >

      <div class="flex flex-col justify-center">
        <p class="text-sm leading-relaxed text-brand-text">
          No se pudo generar el vídeo, pero conservamos el fotograma base.
        </p>

        <p
          v-if="error.message"
          class="mt-2 text-sm leading-relaxed text-brand-muted"
        >
          {{ error.message }}
        </p>

        <div class="mt-5 flex flex-col gap-2 sm:flex-row">
          <AppButton
            v-if="error.retryable"
            type="button"
            data-testid="composer-retry"
            class="w-full sm:w-auto"
            @click="emit('retry')"
          >
            Reintentar
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
