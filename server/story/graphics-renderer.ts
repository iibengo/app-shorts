import type { StoryGraphic, StoryGraphicsPlan } from '~/models/story'
import { SAFE_BOTTOM_RATIO, SAFE_SIDE_RATIO, SAFE_TOP_RATIO } from './graphics-plan'

/**
 * Builds the FFmpeg arguments that paint overlays on the assembled video.
 *
 * The renderer does not execute anything: it hands arguments to the runner the
 * caller provides, so tests never spawn a process. All text is escaped here,
 * because a colon or an apostrophe in a script would otherwise break the filter
 * and, in the worst case, inject a second filter.
 *
 * Fail open by design: a missing font or a failed encode leaves the video
 * without graphics. A mute video with no overlays is still a valid video.
 */
export interface GraphicsRenderInput {
  readonly plan: StoryGraphicsPlan
  readonly inputPath: string
  readonly outputPath: string
  /** Resolved on the server against a fixed list, never from the client. */
  readonly fontFile: string | null
  readonly monoFontFile?: string | null
}

/**
 * Characters that end a filter argument early, start a variable, or split one
 * filter into two. The comma matters most: unescaped, a script line containing
 * `,drawtext=` would inject a second filter.
 */
export function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, ' ')
}

interface Geometry {
  readonly x: string
  readonly y: string
  readonly size: number
}

/**
 * Positions sit inside the vertical safe area: on a phone, a title under the
 * status bar is a title nobody reads.
 */
export function geometryFor(
  kind: StoryGraphic['kind'],
  width: number,
  height: number,
): Geometry {
  const side = Math.round(width * SAFE_SIDE_RATIO)
  const top = Math.round(height * SAFE_TOP_RATIO)
  const bottom = Math.round(height * (1 - SAFE_BOTTOM_RATIO))

  switch (kind) {
    case 'title':
      return {
        x: `${Math.round(width / 2)}-text_w/2`,
        y: String(top),
        size: Math.round(height * 0.05),
      }
    case 'terminal':
      return { x: String(side), y: String(Math.round(height * 0.34)), size: Math.round(height * 0.027) }
    default:
      return { x: `${Math.round(width / 2)}-text_w/2`, y: `${bottom}-text_h`, size: Math.round(height * 0.024) }
  }
}

function textFilter(
  graphic: StoryGraphic,
  plan: StoryGraphicsPlan,
  fontFile: string,
): string {
  const geometry = geometryFor(graphic.kind, plan.width, plan.height)
  const body = graphic.text.map(escapeDrawText).join('\\n')
  const enable = `between(t,${graphic.startSeconds.toFixed(2)},${graphic.endSeconds.toFixed(2)})`
  // A shadow, not a box: it keeps the frame readable over any background
  // without hiding the picture behind a plate.
  const shadow = graphic.kind === 'terminal' ? 0 : 2

  return [
    `drawtext=fontfile='${fontFile}'`,
    `text='${body}'`,
    `fontsize=${geometry.size}`,
    'fontcolor=white',
    'shadowcolor=black@0.75',
    `shadowx=${shadow}`,
    `shadowy=${shadow}`,
    `x=${geometry.x}`,
    `y=${geometry.y}`,
    `line_spacing=${Math.round(geometry.size * 0.25)}`,
    `enable='${enable}'`,
  ].join(':')
}

/**
 * Returns null when there is nothing to draw or no font, so the caller can skip
 * the encode entirely instead of running FFmpeg for a no-op.
 */
export function buildGraphicsArgs(input: GraphicsRenderInput): readonly string[] | null {
  if (input.plan.graphics.length === 0) return null
  if (input.fontFile === null || input.fontFile.trim().length === 0) return null

  const fonts = input.plan.graphics.map((graphic) => {
    if (graphic.kind !== 'terminal') return input.fontFile as string

    return input.monoFontFile !== null && input.monoFontFile !== undefined && input.monoFontFile.length > 0
      ? input.monoFontFile
      : input.fontFile as string
  })

  const filters = input.plan.graphics
    .map((graphic, index) => textFilter(graphic, input.plan, fonts[index]!))
    .join(',')

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input.inputPath,
    '-vf',
    `${filters},format=yuv420p`,
    // One encode for the whole video, close to lossless so the overlay pass
    // does not visibly degrade what the provider delivered.
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'veryfast',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]
}
