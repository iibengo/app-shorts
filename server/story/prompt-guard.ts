export const NARRATION_COPY_MIN_LENGTH = 20

export function normalizePromptText(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Rejects a visual prompt that reproduces the narration verbatim or contains
 * a literal run of at least `minLength` consecutive characters from it.
 * Common single words or short phrases below the threshold are allowed.
 */
export function hasSignificantNarrationCopy(
  visualPrompt: string,
  narration: string,
  minLength = NARRATION_COPY_MIN_LENGTH,
): boolean {
  const prompt = normalizePromptText(visualPrompt)
  const text = normalizePromptText(narration)

  if (text.length === 0) return false
  if (prompt.includes(text)) return true
  if (text.length < minLength) return false

  for (let index = 0; index <= text.length - minLength; index += 1) {
    if (prompt.includes(text.slice(index, index + minLength))) return true
  }

  return false
}
