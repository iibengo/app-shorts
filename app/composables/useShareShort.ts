import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue'
import type { ShareOutcome, SharePayload, Short } from '~/types/short'
import {
  buildFeedUrl,
  buildSharePayload,
  isAbortError,
  shareOutcomeToMessage,
} from '~/utils/shorts'

export const SHARE_MESSAGE_TIMEOUT_MS = 6000

type ShareCapableNavigator = Navigator & {
  share?: (data: SharePayload) => Promise<void>
}

export interface UseShareShortReturn {
  message: Ref<string | null>
  share: (short: Short) => Promise<ShareOutcome>
  clearMessage: () => void
}

export function useShareShort(): UseShareShortReturn {
  const message = ref<string | null>(null)
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timeoutId === null) return

    clearTimeout(timeoutId)
    timeoutId = null
  }

  function clearMessage(): void {
    clearTimer()
    message.value = null
  }

  function showOutcome(outcome: ShareOutcome): void {
    clearTimer()

    const text = shareOutcomeToMessage(outcome)
    if (!text) {
      // Cancellation is silent and preserves any previous status message.
      return
    }

    message.value = text
    timeoutId = setTimeout(() => {
      message.value = null
      timeoutId = null
    }, SHARE_MESSAGE_TIMEOUT_MS)
  }

  async function copyToClipboard(url: string): Promise<boolean> {
    const nav = navigator as ShareCapableNavigator

    if (!nav.clipboard || typeof nav.clipboard.writeText !== 'function') {
      return false
    }

    try {
      await nav.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }

  async function share(short: Short): Promise<ShareOutcome> {
    if (typeof navigator === 'undefined') {
      showOutcome('unavailable')
      return 'unavailable'
    }

    const origin = typeof window === 'undefined' ? '' : window.location.origin
    const url = buildFeedUrl(origin)
    const nav = navigator as ShareCapableNavigator

    if (typeof nav.share === 'function') {
      try {
        await nav.share(buildSharePayload(short, url))
        showOutcome('shared')
        return 'shared'
      } catch (error) {
        if (isAbortError(error)) {
          return 'cancelled'
        }
      }
    }

    if (await copyToClipboard(url)) {
      showOutcome('copied')
      return 'copied'
    }

    showOutcome('unavailable')
    return 'unavailable'
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(clearTimer)
  }

  return {
    message,
    share,
    clearMessage,
  }
}
