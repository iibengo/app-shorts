import type { ShareOutcome, SharePayload, Short } from '~/models/short'

export const SHARE_MESSAGES: Readonly<Record<Exclude<ShareOutcome, 'cancelled'>, string>> = {
  shared: 'Enlace compartido.',
  copied: 'Enlace copiado al portapapeles.',
  unavailable: 'No se pudo compartir. Copia la dirección del navegador.',
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.trunc(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatCount(value: number): string {
  return String(Math.max(0, Math.trunc(value)))
}

export function buildFeedUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/feed`
}

export function buildSharePayload(short: Short, url: string): SharePayload {
  return {
    title: short.title,
    text: `${short.title} — AI Shorts (demo)`,
    url,
  }
}

export function shareOutcomeToMessage(outcome: ShareOutcome): string | null {
  if (outcome === 'cancelled') return null

  return SHARE_MESSAGES[outcome]
}

export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  return 'name' in error && (error as { name?: unknown }).name === 'AbortError'
}
