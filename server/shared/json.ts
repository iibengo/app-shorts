import { Buffer } from 'node:buffer'

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{8,128}$/

/**
 * Returns true for `application/json` with an optional charset or parameter list.
 */
export function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false

  const normalized = contentType.split(';')[0]?.trim().toLowerCase()

  return normalized === 'application/json'
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses a JSON object from a string or byte buffer.
 * Returns null for empty, malformed or non-object payloads.
 */
export function parseJsonObject(
  raw: string | Uint8Array,
): Record<string, unknown> | null {
  const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8')

  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  return isJsonObject(parsed) ? parsed : null
}

/**
 * Returns the first field not present in the allowlist, or null when all match.
 */
export function findUnknownField(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  return Object.keys(payload).find((key) => !allowed.includes(key)) ?? null
}

/**
 * Boolean variant for callers that do not need the offending field name.
 */
export function hasOnlyFields(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return findUnknownField(payload, allowed) === null
}

export function isIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value)
}
