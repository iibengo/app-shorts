import type { CaptionPlan } from './captions-plan'
import {
  CAPTION_MAX_CHARS_PER_LINE,
  CAPTION_MAX_LINES,
} from './captions-plan'

/**
 * 014: renders a caption plan as ASS and as SRT.
 *
 * Pure and deterministic: no I/O, no fonts read here. libass does the painting,
 * so the styling lives in the header and never in a filter string that a colon
 * or an apostrophe could break.
 *
 * Every line is a literal slice of what was synthesised. Nothing is corrected,
 * capitalised or punctuated here.
 */
export interface AssRenderOptions {
  readonly width: 720
  readonly height: 1280
  /** Font family name available to libass on the server. */
  readonly fontName: string
  readonly fontSize?: number
  readonly marginVertical?: number
  readonly marginSide?: number
}

const DEFAULT_FONT_SIZE = 44
const DEFAULT_MARGIN_VERTICAL = 154
const DEFAULT_MARGIN_SIDE = 58
/** &H80 alpha is ~50 % opaque black; a shadow alone disappears on light frames. */
const BACK_COLOUR = '&H80000000&'
const PRIMARY_COLOUR = '&H00FFFFFF&'

function pad(value: number, size = 2): string {
  return String(Math.floor(value)).padStart(size, '0')
}

/** ASS timestamps are H:MM:SS.cc with centiseconds. */
function assTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const wholeSeconds = Math.floor(safe % 60)
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100)

  return `${hours}:${pad(minutes)}:${pad(wholeSeconds)}.${pad(centiseconds)}`
}

/** SRT timestamps are HH:MM:SS,mmm with milliseconds. */
function srtTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const wholeSeconds = Math.floor(safe % 60)
  const milliseconds = Math.round((safe - Math.floor(safe)) * 1000)

  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)},${pad(milliseconds, 3)}`
}

/** Breaks a cue into at most two readable lines on word boundaries. */
export function wrapCaptionText(text: string): readonly string[] {
  if (text.length <= CAPTION_MAX_CHARS_PER_LINE) return [text]

  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`

    if (candidate.length > CAPTION_MAX_CHARS_PER_LINE && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current.length > 0) lines.push(current)

  return lines.slice(0, CAPTION_MAX_LINES)
}

export function renderAss(plan: CaptionPlan, options: AssRenderOptions): string {
  const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
  const marginVertical = options.marginVertical ?? DEFAULT_MARGIN_VERTICAL
  const marginSide = options.marginSide ?? DEFAULT_MARGIN_SIDE

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${options.width}`,
    `PlayResY: ${options.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, '
      + 'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, '
      + 'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${options.fontName},${fontSize},${PRIMARY_COLOUR},${PRIMARY_COLOUR},`
      + `&H00000000&,${BACK_COLOUR},`
      + `-1,0,0,0,100,100,0,0,3,0,0,2,${marginSide},${marginSide},${marginVertical},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  const events = plan.cues.map((cue) => {
    const text = wrapCaptionText(cue.text).join('\\N')

    return `Dialogue: 0,${assTime(cue.startSeconds)},${assTime(cue.endSeconds)},Caption,,0,0,0,,${text}`
  })

  return [...header, ...events, ''].join('\n')
}

export function renderSrt(plan: CaptionPlan): string {
  const blocks = plan.cues.map((cue, index) => {
    const lines = wrapCaptionText(cue.text)

    return [
      String(index + 1),
      `${srtTime(cue.startSeconds)} --> ${srtTime(cue.endSeconds)}`,
      ...lines,
    ].join('\n')
  })

  return blocks.length === 0 ? '' : `${blocks.join('\n\n')}\n`
}
