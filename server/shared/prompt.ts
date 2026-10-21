/**
 * C0 control characters plus DEL. Tab (\u0009), line feed (\u000A) and
 * carriage return (\u000D) are intentionally excluded.
 */
export const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export type TextValidationError =
  | 'invalid-type'
  | 'empty'
  | 'too-long'
  | 'control-characters'

export type TextValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: TextValidationError }

/**
 * Unicode NFC normalisation plus surrounding whitespace trim.
 */
export function normalizeText(value: string): string {
  return value.normalize('NFC').trim()
}

export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHARACTERS.test(value)
}

/**
 * Generic text validation: type, non-empty, maximum length and control characters.
 * Domain callers map the returned error code to their own error taxonomy.
 */
export function validateText(value: unknown, maxLength: number): TextValidation {
  if (typeof value !== 'string') {
    return { ok: false, error: 'invalid-type' }
  }

  const normalized = normalizeText(value)

  if (normalized.length === 0) {
    return { ok: false, error: 'empty' }
  }

  if (normalized.length > maxLength) {
    return { ok: false, error: 'too-long' }
  }

  if (hasControlCharacters(normalized)) {
    return { ok: false, error: 'control-characters' }
  }

  return { ok: true, value: normalized }
}
