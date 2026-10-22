export interface SimilarShotAdvisory {
  readonly previousShotOrder: number
  readonly shotOrder: number
  readonly distance: number
  readonly similar: boolean
}

const STOP_WORDS = new Set([
  'con', 'para', 'desde', 'hacia', 'sobre', 'entre', 'mientras', 'donde',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del',
  'en', 'y', 'o', 'que', 'por', 'al', 'se', 'su', 'sus', 'lo', 'le',
])

function tokens(prompt: string): readonly string[] {
  return prompt
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
}

function similarity(a: string, b: string): number {
  const left = new Set(tokens(a))
  const right = new Set(tokens(b))

  if (left.size === 0 || right.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  }

  let intersection = 0

  for (const token of left) {
    if (right.has(token)) intersection += 1
  }

  const union = left.size + right.size - intersection

  return union === 0 ? 1 : intersection / union
}

/**
 * Textual, advisory-only variety check. It never blocks a plan; the visual
 * `similar-shots` check with dHash belongs to the QC pass.
 */
export function detectSimilarShotPrompts(
  shots: readonly {
    readonly order: number
    readonly visualPrompt: string
  }[],
): readonly SimilarShotAdvisory[] {
  const advisories: SimilarShotAdvisory[] = []

  for (let index = 1; index < shots.length; index += 1) {
    const previous = shots[index - 1]!
    const current = shots[index]!
    const score = similarity(previous.visualPrompt, current.visualPrompt)

    if (score >= 0.8) {
      advisories.push({
        previousShotOrder: previous.order,
        shotOrder: current.order,
        distance: Number((1 - score).toFixed(3)),
        similar: true,
      })
    }
  }

  return advisories
}
