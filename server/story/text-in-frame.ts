/**
 * Text detection for keyframes.
 *
 * Image models add captions, headlines and speech bubbles nobody asked for, and
 * a banned word in the prompt makes it worse: Nano Banana has no negative
 * channel and Google's own guide says to describe what you want, not what you
 * do not. The prompt is fixed separately; this is the safety net, the same way
 * the split-frame inspector protects against grids.
 *
 * Signature in a greyscale sample: rows with many sharp luminance changes, the
 * way a line of glyphs looks. A low-poly render also has hard edges, so the
 * sample must be large enough to separate a few facet edges from a row of
 * letters: at 32x96 everything looks like text, at 128x384 it does not.
 *
 * Calibrated on real output (2026-10-24): a clean low-poly scene and the cat
 * render give 0 dense rows; two keyframes with invented text give 4 and 10.
 */
export interface PixelSample {
  readonly width: number
  readonly height: number
  /** Luma 0..255 per pixel, row-major. */
  readonly luma: readonly number[]
}

/** A neighbour pair this far apart counts as a hard transition. */
const EDGE_THRESHOLD = 60
/** Hard transitions in one row before it looks like glyphs at 128 px wide. */
const TEXT_ROW_EDGES = 14
/** Density rows needed before the frame is considered captioned. */
const TEXT_ROWS = 3

export function looksLikeTextInFrame(sample: PixelSample): boolean {
  const { width, height, luma } = sample

  if (width < 32 || height < 32 || luma.length < width * height) return false

  // The threshold is calibrated at 128 px wide; scale it for other widths so
  // the same picture gives the same answer.
  const needed = Math.max(6, Math.round((TEXT_ROW_EDGES * width) / 128))
  let dense = 0

  for (let y = 0; y < height; y += 1) {
    let edges = 0
    let previous = luma[y * width] ?? 0

    for (let x = 1; x < width; x += 1) {
      const value = luma[y * width + x] ?? 0

      if (Math.abs(value - previous) >= EDGE_THRESHOLD) edges += 1
      previous = value
    }

    if (edges >= needed) {
      dense += 1

      if (dense >= TEXT_ROWS) return true
    }
  }

  return false
}
