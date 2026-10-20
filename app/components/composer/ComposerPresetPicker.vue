<script setup lang="ts">
import { COMPOSER_PRESETS } from '~/data/composer'
import type { ComposerPreset } from '~/models/composer'
import { getComposerModel } from '~/utils/composer'

defineProps<{
  preset: ComposerPreset
}>()

const emit = defineEmits<{
  'update:preset': [value: ComposerPreset]
}>()

function handleChange(event: Event, value: ComposerPreset): void {
  const target = event.target as HTMLInputElement | null

  if (target?.checked) {
    emit('update:preset', value)
  }
}
</script>

<template>
  <fieldset data-testid="composer-preset-group" class="mt-5">
    <legend id="composer-preset-legend" class="text-sm font-medium text-brand-text">
      Calidad de generación
    </legend>

    <div
      role="radiogroup"
      aria-labelledby="composer-preset-legend"
      class="mt-2 grid gap-2 sm:grid-cols-2"
    >
      <label
        v-for="item in COMPOSER_PRESETS"
        :key="item.preset"
        class="relative block cursor-pointer"
      >
        <input
          :id="`composer-preset-${item.preset}`"
          :data-testid="`composer-preset-${item.preset}`"
          type="radio"
          name="composer-preset"
          :value="item.preset"
          :checked="preset === item.preset"
          class="peer sr-only"
          @change="handleChange($event, item.preset)"
        >

        <span
          class="flex min-h-11 flex-col gap-1 rounded-2xl border border-white/15 bg-brand-ink p-3 text-brand-text motion-safe:transition-colors peer-checked:border-brand-fuchsia peer-checked:bg-brand-fuchsia/10 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-fuchsia peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText]"
        >
          <span class="text-sm font-semibold">{{ item.label }}</span>
          <span class="text-xs leading-relaxed text-brand-muted">{{ item.description }}</span>
          <span class="text-xs font-medium text-brand-text">
            {{ getComposerModel(item.preset).label }}
          </span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
