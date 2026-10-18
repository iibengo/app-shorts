<script setup lang="ts">
import { computed } from 'vue'

type ActionTone = 'like' | 'save' | 'neutral'

const props = withDefaults(
  defineProps<{
    label: string
    pressed?: boolean
    describedBy?: string
    tone?: ActionTone
  }>(),
  {
    tone: 'neutral',
  },
)

const emit = defineEmits<{
  click: []
}>()

const isToggle = computed(() => props.pressed !== undefined)

const activeToneClass = computed(() => {
  if (!props.pressed) return ''

  if (props.tone === 'like') return 'border-brand-fuchsia/70 text-brand-fuchsia'
  if (props.tone === 'save') return 'border-brand-violet/70 text-brand-violet'

  return 'border-brand-fuchsia/70 text-brand-fuchsia'
})
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :aria-pressed="isToggle ? pressed : undefined"
    :aria-describedby="describedBy"
    class="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/[0.45] text-white motion-safe:transition-colors hover:border-white/35 hover:bg-black/[0.6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-ink motion-safe:duration-150 motion-safe:ease-out forced-colors:border forced-colors:border-[ButtonText] forced-colors:focus-visible:outline forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2"
    :class="activeToneClass"
    @click="emit('click')"
  >
    <slot />
  </button>
</template>
