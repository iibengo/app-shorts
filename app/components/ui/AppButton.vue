<script setup lang="ts">
import { computed } from 'vue'

type AppButtonVariant = 'primary' | 'secondary' | 'quiet'

const props = withDefaults(
  defineProps<{
    variant?: AppButtonVariant
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
  },
)

const variantClass = computed(() => {
  if (props.variant === 'secondary') {
    return 'border border-white/15 bg-white/5 text-brand-text hover:bg-white/10'
  }

  if (props.variant === 'quiet') {
    return 'bg-transparent text-brand-muted hover:bg-white/5 hover:text-brand-text'
  }

  return 'bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep text-white shadow-lg shadow-brand-fuchsia/20'
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full px-4 text-base font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
    :class="variantClass"
  >
    <slot />
  </button>
</template>
