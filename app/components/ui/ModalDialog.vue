<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const props = withDefaults(
  defineProps<{
    open: boolean
    labelledby: string
    describedby: string
    overlayTestId?: string
    panelTestId?: string
    returnFocusSelector?: string
  }>(),
  {
    overlayTestId: 'notice-overlay',
    panelTestId: 'create-short-notice',
  },
)

const emit = defineEmits<{
  close: []
}>()

const overlayRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

let isActive = false
let previouslyFocused: HTMLElement | null = null
let bodyOverflow = ''
let htmlOverflow = ''
let inertedElements: HTMLElement[] = []

const lockedScrollElements: Array<{
  element: HTMLElement
  overflow: string
  overflowY: string
  scrollTop: number
}> = []

function getFocusableElements(): HTMLElement[] {
  const panel = panelRef.value
  if (!panel) return []

  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

function focusInitial(): void {
  const panel = panelRef.value
  if (!panel) return

  const target = panel.querySelector<HTMLElement>('[data-autofocus]')
    ?? getFocusableElements()[0]
    ?? panel

  target.focus()
}

function setBackgroundInert(active: boolean): void {
  if (typeof document === 'undefined') return

  if (active) {
    inertedElements = []
    const overlay = overlayRef.value

    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child === overlay || (overlay !== null && child.contains(overlay))) continue

      const tagName = child.tagName
      if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'LINK') continue
      if (child.hasAttribute('inert')) continue

      child.setAttribute('inert', '')
      inertedElements.push(child)
    }

    return
  }

  for (const element of inertedElements) {
    element.removeAttribute('inert')
  }
  inertedElements = []
}

function lockBackgroundScroll(): void {
  if (typeof document === 'undefined') return

  bodyOverflow = document.body.style.overflow
  htmlOverflow = document.documentElement.style.overflow
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'

  for (const element of Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-lock]'))) {
    lockedScrollElements.push({
      element,
      overflow: element.style.overflow,
      overflowY: element.style.overflowY,
      scrollTop: element.scrollTop,
    })
    element.style.overflow = 'hidden'
  }
}

function unlockBackgroundScroll(): void {
  if (typeof document === 'undefined') return

  document.body.style.overflow = bodyOverflow
  document.documentElement.style.overflow = htmlOverflow

  for (const entry of lockedScrollElements) {
    entry.element.style.overflow = entry.overflow
    entry.element.style.overflowY = entry.overflowY
    entry.element.scrollTop = entry.scrollTop
  }
  lockedScrollElements.length = 0
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key !== 'Tab') return

  const panel = panelRef.value
  if (!panel) return

  const focusable = getFocusableElements()

  if (focusable.length === 0) {
    event.preventDefault()
    panel.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const activeElement = document.activeElement
  const focusIsInside = activeElement instanceof Node && panel.contains(activeElement)

  if (event.shiftKey) {
    if (!focusIsInside || activeElement === first) {
      event.preventDefault()
      last?.focus()
    }
    return
  }

  if (!focusIsInside || activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

function activate(): void {
  if (isActive || typeof document === 'undefined') return

  isActive = true
  previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null

  lockBackgroundScroll()
  document.addEventListener('keydown', onKeydown, true)

  setBackgroundInert(true)
  focusInitial()
}

function deactivate(): void {
  if (!isActive) return

  isActive = false
  document.removeEventListener('keydown', onKeydown, true)
  setBackgroundInert(false)
  unlockBackgroundScroll()

  const selector = props.returnFocusSelector
  const target = selector
    ? document.querySelector<HTMLElement>(selector)
    : previouslyFocused
  previouslyFocused = null

  target?.focus()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      activate()
      return
    }

    deactivate()
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  setBackgroundInert(false)
  unlockBackgroundScroll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="overlayRef"
      :data-testid="overlayTestId"
      class="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(9,9,11,0.72)] sm:items-center"
      @click.self="emit('close')"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledby"
        :aria-describedby="describedby"
        :data-testid="panelTestId"
        tabindex="-1"
        class="notice-panel w-full max-w-md rounded-t-3xl border border-white/10 bg-brand-surface p-6 pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] text-brand-text shadow-2xl shadow-black/60 focus-visible:outline-none sm:rounded-3xl sm:pb-6"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .notice-panel {
    animation: notice-panel-in 180ms ease-out both;
  }
}

@keyframes notice-panel-in {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
