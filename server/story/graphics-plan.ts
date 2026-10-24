import type {
  StoryGraphic,
  StoryGraphicsPlan,
  StoryPlan,
} from '~/models/story'

/**
 * Turns a story plan into the overlays that will be drawn on the final video.
 *
 * The point of this module is that nobody invents text: every line comes from
 * the script. The video model kept writing headlines it was never asked for,
 * because drawing a readable screen is something it cannot do reliably. Here
 * the text is data, and FFmpeg paints it.
 *
 * Pure and deterministic: no clock, no randomness, no I/O.
 */

/** Vertical safe area: a title inside it never collides with platform chrome. */
export const SAFE_TOP_RATIO = 0.12
export const SAFE_BOTTOM_RATIO = 0.12
export const SAFE_SIDE_RATIO = 0.08

/** drawtext breaks on newlines; more than this per graphic becomes noise. */
export const MAX_LINES = 4
export const MAX_LINE_CHARS = 90

/** Opening and closing title, never one per scene: 15 s does not carry more. */
export const TITLE_SECONDS = 2.5
/**
 * A terminal over ten seconds turns into wallpaper and covers the character.
 * Measured on a real video: four seconds reads as a detail, longer reads as a
 * mistake.
 */
export const TERMINAL_SECONDS = 4

export interface GraphicsPlanInput {
  readonly plan: StoryPlan
  /** Length of the assembled video, so the closing title lands at the end. */
  readonly totalDurationSeconds: number
  readonly width: number
  readonly height: number
  /** Channel tag drawn once. Empty disables the badge. */
  readonly badgeText?: string
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Splits a script paragraph into drawable lines. It never adds words: it wraps
 * what is already there and drops what does not fit.
 */
export function wrapText(value: string, maxChars = MAX_LINE_CHARS): readonly string[] {
  const words = clean(value).split(' ').filter((word) => word.length > 0)

  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`

    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }

    if (current.length > 0) lines.push(current)
    current = word.length <= maxChars ? word : word.slice(0, maxChars)

    if (lines.length >= MAX_LINES) return lines
  }

  if (current.length > 0 && lines.length < MAX_LINES) lines.push(current)

  return lines
}

function clampSeconds(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum

  return Math.min(Math.max(value, minimum), maximum)
}

/**
 * Only a scene that actually shows a screen gets a terminal, and its content is
 * the scene's own narration. No screen, no terminal: a floating code window on
 * a rooftop would be a lie.
 */
function terminalFor(plan: StoryPlan): StoryGraphic | null {
  const scene = plan.scenes.find((item) => {
    const prompt = clean(item.narration).toLowerCase()

    return item.props.some((prop) => /laptop|monitor|screen|ordenador|portatil|pantalla/.test(prop))
      || /laptop|monitor|screen|pantalla/.test(prompt)
  })

  if (scene === undefined) return null

  const lines = wrapText(scene.narration, 46)

  if (lines.length === 0) return null

  return {
    kind: 'terminal',
    text: lines,
    // The terminal lives inside its own scene, not the whole video.
    startSeconds: 0,
    endSeconds: 0,
  }
}

export function buildGraphicsPlan(input: GraphicsPlanInput): StoryGraphicsPlan {
  const total = Number.isFinite(input.totalDurationSeconds)
    ? Math.max(0, input.totalDurationSeconds)
    : 0
  // A video with no duration gets no overlays: drawing on an empty timeline
  // produced graphics that ran from 0 to 0.
  if (total === 0) return { width: input.width, height: input.height, graphics: [] }

  const graphics: StoryGraphic[] = []
  const title = wrapText(input.plan.title, 28)
  const closing = Math.max(TITLE_SECONDS, total - TITLE_SECONDS)

  if (title.length > 0) {
    graphics.push({
      kind: 'title',
      text: title,
      startSeconds: 0,
      endSeconds: clampSeconds(TITLE_SECONDS, 0, total),
    })
    graphics.push({
      kind: 'title',
      text: title,
      startSeconds: clampSeconds(closing, 0, total),
      endSeconds: total,
    })
  }

  const terminal = terminalFor(input.plan)

  if (terminal !== null) {
    const start = clampSeconds(TITLE_SECONDS, 0, total)
    const end = clampSeconds(start + TERMINAL_SECONDS, 0, Math.max(0, total - TITLE_SECONDS))

    graphics.push({ ...terminal, startSeconds: start, endSeconds: end })
  }

  const badge = wrapText(input.badgeText ?? '', 32)

  if (badge.length > 0) {
    const start = clampSeconds(total - TITLE_SECONDS, 0, total)

    graphics.push({
      kind: 'badge',
      text: badge,
      startSeconds: start,
      endSeconds: total,
    })
  }

  return { width: input.width, height: input.height, graphics }
}
