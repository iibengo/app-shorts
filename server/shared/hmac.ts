import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Encodes a UTF-8 string as base64url without padding.
 */
export function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

/**
 * Decodes a base64url string as UTF-8. Malformed input yields an empty string.
 */
export function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

/**
 * Signs the exact `payload` string with HMAC-SHA-256 and returns base64url.
 */
export function signHmacBase64Url(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * Constant-time comparison between the expected and the received signature.
 */
export function verifyHmacBase64Url(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signHmacBase64Url(secret, payload), 'base64url')
  const received = Buffer.from(signature, 'base64url')

  return expected.length === received.length && timingSafeEqual(expected, received)
}
