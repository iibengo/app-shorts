import { StoryError } from './errors'

/** Vertical 9:16 target. The whole pipeline renders to this ratio. */
export const VERTICAL_ASPECT = 9 / 16
/** The technical QC tolerates ±3 %, as in 006. */
export const ASPECT_TOLERANCE = 0.03

/**
 * A provider may answer with a different ratio than the one requested (Kontext
 * inherits the reference size, and video models inherit the keyframe). These
 * helpers are the single gate so a non-vertical frame never reaches the next
 * stage.
 */
export function isVerticalAspect(width: number | null, height: number | null): boolean {
  if (width === null || height === null || width <= 0 || height <= 0) return false

  const ratio = width / height

  return Math.abs(ratio - VERTICAL_ASPECT) <= VERTICAL_ASPECT * ASPECT_TOLERANCE
}

export function assertVerticalAspect(
  width: number | null,
  height: number | null,
  code: 'provider-invalid-output',
): void {
  if (!isVerticalAspect(width, height)) {
    throw new StoryError(code)
  }
}
