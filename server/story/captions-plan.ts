import type { StorySpeechSegment } from '~/models/story'

/**
 * 014: from measured speech to caption cues.
 *
 * Pure and deterministic. It never invents a character: every cue is a literal
 * slice of the spoken line, cut on word boundaries. No punctuation added, no
 * forced capitals, no spell correction.
 */
export interface CaptionCue {
  readonly startSeconds: number
  readonly endSeconds: number
  readonly text: string
}

export interface CaptionPlan {
  readonly cues: readonly CaptionCue[]
  /** How the in-scene timing was obtained, so nobody confuses the two. */
  readonly alignment: 'proportional' | 'provider'
  /** Cues dropped because they were too short to read without flicker. */
  readonly dropped: number
}

export const CAPTION_MAX_CHARS_PER_LINE = 32
export const CAPTION_MAX_LINES = 2
export const CAPTION_MAX_WORDS_PER_CUE = 7
export const CAPTION_MAX_CHARS_PER_CUE = CAPTION_MAX_CHARS_PER_LINE * CAPTION_MAX_LINES
export const CAPTION_MAX_CHARS_PER_SECOND = 17
export const CAPTION_MIN_SECONDS = 0.8
export const CAPTION_MIN_GAP_SECONDS = 0.08

interface CueSlice {
  readonly words: readonly string[]
  readonly characters: number
}

/** Splits a line into cues that can be read, in order and without losing text. */
export function splitIntoCaptionCues(text: string): readonly CueSlice[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const cues: CueSlice[] = []
  let current: string[] = []

  const flush = (): void => {
    if (current.length === 0) return

    cues.push({
      words: [...current],
      characters: current.join(' ').length,
    })
    current = []
  }

  for (const word of words) {
    const next = current.length === 0 ? word.length : current.join(' ').length + 1 + word.length

    if (
      current.length > 0
      && (current.length >= CAPTION_MAX_WORDS_PER_CUE || next > CAPTION_MAX_CHARS_PER_CUE)
    ) {
      flush()
    }

    current.push(word)
  }

  flush()

  return cues
}

/**
 * Places the cues of every segment on the final video timeline.
 *
 * A scene's voice starts when the scene starts; whatever silence is left over
 * stays behind it. That is why captions do not drift when the speech comes out
 * shorter than planned.
 */
export function planCaptions(segments: readonly StorySpeechSegment[]): CaptionPlan {
  const cues: CaptionCue[] = []
  let dropped = 0

  for (const segment of segments) {
    if (segment.status !== 'ready') continue

    const slices = splitIntoCaptionCues(segment.text)

    if (slices.length === 0) continue

    const totalCharacters = slices.reduce((total, slice) => total + slice.characters, 0)
    const speechSeconds = Math.max(0, segment.endSeconds - segment.startSeconds)
    let cursor = segment.startSeconds

    for (let index = 0; index < slices.length; index += 1) {
      const slice = slices[index]!
      const share = totalCharacters === 0 ? 0 : slice.characters / totalCharacters
      const isLast = index === slices.length - 1
      const rawSeconds = Math.max(CAPTION_MIN_SECONDS, speechSeconds * share)
      const start = cursor
      // The last cue ends where the voice ends, never past it.
      const end = isLast ? Math.max(start + CAPTION_MIN_SECONDS, segment.endSeconds) : start + rawSeconds
      const capped = Math.min(end, segment.endSeconds)

      // Reading speed is the hard limit: a cue that cannot be read in its slot
      // is dropped rather than flashed.
      const readable = slice.characters / Math.max(0.001, capped - start) <= CAPTION_MAX_CHARS_PER_SECOND

      if (capped - start < CAPTION_MIN_SECONDS || !readable) {
        dropped += 1
        cursor = capped + CAPTION_MIN_GAP_SECONDS

        continue
      }

      cues.push({
        startSeconds: start,
        endSeconds: capped,
        text: slice.words.join(' '),
      })

      cursor = capped + CAPTION_MIN_GAP_SECONDS
    }
  }

  return {
    cues: sortAndSeparate(cues),
    alignment: 'proportional',
    dropped,
  }
}

/** Orders the cues and guarantees the minimum gap between them. */
function sortAndSeparate(cues: readonly CaptionCue[]): readonly CaptionCue[] {
  const sorted = [...cues].sort((a, b) => a.startSeconds - b.startSeconds)
  const result: CaptionCue[] = []

  for (const cue of sorted) {
    const previous = result[result.length - 1]

    if (previous !== undefined) {
      const gap = cue.startSeconds - previous.endSeconds

      if (gap < CAPTION_MIN_GAP_SECONDS) {
        const trimmedEnd = cue.startSeconds - CAPTION_MIN_GAP_SECONDS

        if (trimmedEnd - previous.startSeconds < CAPTION_MIN_SECONDS) continue

        result[result.length - 1] = { ...previous, endSeconds: trimmedEnd }
      }
    }

    result.push(cue)
  }

  return result
}
