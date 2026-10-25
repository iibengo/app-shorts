/**
 * 014: how long a line takes to say.
 *
 * Pure: no I/O, no environment. Used to write a script that fits, never to cut
 * real audio. The measurement always wins.
 */
export const SPEECH_WORDS_PER_SECOND = 2.6
export const SPEECH_SENTENCE_PAUSE = 0.25
export const SPEECH_CLAUSE_PAUSE = 0.12
export const SPEECH_MIN_SECONDS = 0.8
/** Airtime reserved at the end of a scene so the voice does not butt against the cut. */
export const SPEECH_TAIL_SECONDS = 0.4

/**
 * The rate has not been measured with this pipeline yet. It is a declared
 * estimate until a real audio calibrates it; the real measurement then decides,
 * so a wrong constant costs a re-write, never a cut voice.
 */
export const SPEECH_RATE_VERIFIED_AT = 'unverified'

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const sentences = (text.match(/[.!?…]+/g) ?? []).length
  const clauses = (text.match(/[,;:]/g) ?? []).length

  return Math.max(
    SPEECH_MIN_SECONDS,
    words / SPEECH_WORDS_PER_SECOND
      + sentences * SPEECH_SENTENCE_PAUSE
      + clauses * SPEECH_CLAUSE_PAUSE,
  )
}

/** How many words fit in a scene once the tail is reserved. */
export function wordsForSeconds(seconds: number): number {
  return Math.max(1, Math.floor((seconds - SPEECH_TAIL_SECONDS) * SPEECH_WORDS_PER_SECOND))
}

/** Rough character count for an estimate, so a line can be rejected before paying. */
export function charactersForSeconds(seconds: number): number {
  return Math.max(1, Math.floor((seconds - SPEECH_TAIL_SECONDS) * SPEECH_WORDS_PER_SECOND * 6))
}

/**
 * True when the delivered audio fits the time the scene actually has.
 *
 * The tolerance absorbs a few milliseconds of container padding without letting
 * a genuinely long line pass.
 */
export function speechFits(speechSeconds: number, availableSeconds: number): boolean {
  return speechSeconds <= availableSeconds + 0.05
}
