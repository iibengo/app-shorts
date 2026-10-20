import { getCurrentInstance, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { ShortId } from '~/models/short'

export const ACTIVE_SHORT_THRESHOLD = 0.6

const ACTIVE_SHORT_SELECTOR = '[data-short-id]'

export interface UseActiveShortOptions {
  container: Ref<HTMLElement | null>
  initialId: ShortId
}

export interface UseActiveShortReturn {
  activeShortId: Ref<ShortId>
}

interface Candidate {
  id: ShortId
  index: number
  ratio: number
}

function readShortId(element: Element): ShortId | null {
  const id = element.getAttribute('data-short-id')

  return id ? (id as ShortId) : null
}

function pickCandidate(candidates: readonly Candidate[]): Candidate | null {
  if (candidates.length === 0) return null

  return [...candidates].sort(
    (left, right) => right.ratio - left.ratio || left.index - right.index,
  )[0] ?? null
}

export function useActiveShort(options: UseActiveShortOptions): UseActiveShortReturn {
  const activeShortId = ref<ShortId>(options.initialId)
  let observer: IntersectionObserver | null = null

  function disconnect(): void {
    observer?.disconnect()
    observer = null
  }

  function observe(): void {
    const root = options.container.value
    if (!root) return
    if (typeof IntersectionObserver === 'undefined') return

    const elements = Array.from(root.querySelectorAll<HTMLElement>(ACTIVE_SHORT_SELECTOR))
    if (elements.length === 0) return

    const ratios = new Map<Element, number>()

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target, entry.intersectionRatio)
        }

        const candidates = elements.flatMap((element, index) => {
          const id = readShortId(element)
          const ratio = ratios.get(element) ?? 0

          if (!id || ratio < ACTIVE_SHORT_THRESHOLD) return []

          return [{ id, index, ratio }]
        })

        // Keep the previous active short when nothing reaches the threshold.
        const candidate = pickCandidate(candidates)
        if (!candidate) return

        activeShortId.value = candidate.id
      },
      {
        root,
        threshold: ACTIVE_SHORT_THRESHOLD,
      },
    )

    for (const element of elements) {
      observer.observe(element)
    }
  }

  if (getCurrentInstance()) {
    onMounted(observe)
    onBeforeUnmount(disconnect)
  }

  return {
    activeShortId,
  }
}
