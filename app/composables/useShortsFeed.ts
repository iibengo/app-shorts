import { reactive } from 'vue'
import { shorts as defaultShorts } from '~/data/shorts'
import type { Short, ShortId, ShortInteractionState } from '~/models/short'

function createInitialStates(source: readonly Short[]): Record<ShortId, ShortInteractionState> {
  const entries = source.map(
    (short) => [short.id, { ...short.initialState }] as const,
  )

  return Object.fromEntries(entries) as Record<ShortId, ShortInteractionState>
}

export interface UseShortsFeedReturn {
  states: Record<ShortId, ShortInteractionState>
  toggleLike: (id: ShortId) => void
  toggleSave: (id: ShortId) => void
}

export function useShortsFeed(source: readonly Short[] = defaultShorts): UseShortsFeedReturn {
  const states = reactive(createInitialStates(source))

  function toggleLike(id: ShortId): void {
    const state = states[id]
    if (!state) return

    state.isLiked = !state.isLiked
  }

  function toggleSave(id: ShortId): void {
    const state = states[id]
    if (!state) return

    state.isSaved = !state.isSaved
  }

  return {
    states,
    toggleLike,
    toggleSave,
  }
}
