/**
 * A keyframe must be one continuous frame. Image models sometimes return two or
 * more stacked panels when the reference looks like a grid; animating that
 * produces a split screen, so the layout is rejected before the video is paid.
 *
 * Signature of a stacked diptych in a greyscale sample: a horizontal band near
 * the middle made of rows that are almost uniform in colour (the gap between
 * panels), while the frame as a whole is textured. A continuous image has
 * detail across the middle, so its rows there are not uniform.
 */
export interface PixelSample {
  readonly width: number
  readonly height: number
  /** Luma 0..255 per pixel, row-major. */
  readonly luma: readonly number[]
}

const SEAM_BAND_START = 0.35
const SEAM_BAND_END = 0.65
/** A row counts as a seam row with at most this many sharp changes. */
const FLAT_ROW_CHANGES = 2
/** A textured row has at least this many sharp changes across its width. */
const TEXTURED_ROW_CHANGES = 6
/** Luma jump that counts as a sharp change between neighbours. */
const CHANGE_THRESHOLD = 8

export function looksLikeStackedPanels(sample: PixelSample): boolean {
  const { width, height, luma } = sample

  if (width < 4 || height < 16 || luma.length < width * height) return false

  const bandTop = Math.floor(height * SEAM_BAND_START)
  const bandBottom = Math.floor(height * SEAM_BAND_END)

  if (bandBottom - bandTop < 3) return false

  const spread = (y: number): number => {
    // Neighbour differences instead of min/max: a panel border is a narrow
    // hard edge, so min/max would make a seam row look textured.
    let changes = 0
    let previous = luma[y * width] ?? 0

    for (let x = 1; x < width; x += 1) {
      const value = luma[y * width + x] ?? 0

      if (Math.abs(value - previous) > CHANGE_THRESHOLD) changes += 1
      previous = value
    }

    return changes
  }

  let seamRows = 0
  let texturedRows = 0

  for (let y = bandTop; y < bandBottom; y += 1) {
    const rowSpread = spread(y)

    if (rowSpread <= FLAT_ROW_CHANGES) seamRows += 1
    if (rowSpread >= TEXTURED_ROW_CHANGES) texturedRows += 1
  }

  const bandHeight = bandBottom - bandTop

  // The gap must be a real line, not the whole band, and the panels themselves
  // must carry detail: a plain wall is not a diptych.
  return seamRows >= 1 && seamRows < bandHeight && texturedRows >= Math.ceil(bandHeight * 0.4)
}

/** Mean luma per row, used by callers that need a cheap profile. */
export function rowMeans(sample: PixelSample): readonly number[] {
  const { width, height, luma } = sample
  const means: number[] = []

  for (let y = 0; y < height; y += 1) {
    let total = 0

    for (let x = 0; x < width; x += 1) total += luma[y * width + x] ?? 0

    means.push(total / width)
  }

  return means
}
