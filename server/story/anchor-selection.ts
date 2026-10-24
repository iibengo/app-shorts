/**
 * Chooses the keyframe provider from the evidence we have (012):
 * - one reference per character present, in scene order, maximum 3;
 * - the protagonist's own image is its reference, so it wins over anchors;
 * - anchors stay as a legacy fallback for stories created before 012;
 * - with no character at all, the user image is sent as a style reference and
 *   the body is told not to include that person;
 * - otherwise FLUX text-to-image with the style block.
 *
 * A character sheet is never sent: the model copies the grid of a 2x2 sheet and
 * returns stacked panels, which the video stage would animate as a split screen.
 *
 * Pure function: no I/O, no clock.
 */
export type KeyframeProvider =
  | { readonly kind: 'flux' }
  | { readonly kind: 'kontext'; readonly referenceUrl: string }
  | { readonly kind: 'kontext-multi'; readonly referenceUrls: readonly string[] }
  | {
      readonly kind: 'nano-banana'
      readonly referenceUrls: readonly string[]
      /** True when the image is only a look reference, not a character. */
      readonly styleOnly?: boolean
    }

export interface KeyframeProviderInput {
  readonly userReferenceUrl: string | null
  /** Scene order, deduplicated by the caller or here. */
  readonly presentCharacterIds: readonly string[]
  /** Character reference image per character, as stored by 012. */
  readonly characterRefs?: Readonly<Record<string, string>> | null
  readonly anchors: Readonly<Record<string, string>>
  /** `nano-banana` keeps identity and style better and costs less per image. */
  readonly preferred?: 'flux' | 'nano-banana'
}

/** More references than this degrade the output and raise the collage risk. */
export const MAX_KEYFRAME_REFERENCES = 3

export function selectKeyframeProvider(input: KeyframeProviderInput): KeyframeProvider {
  const present = [...new Set(input.presentCharacterIds)]
  const urls: string[] = []

  for (const id of present) {
    const own = input.characterRefs?.[id]

    if (own !== undefined && own.length > 0) {
      urls.push(own)
      continue
    }

    // Legacy path: a story created before character references existed still
    // has an anchor per character, taken from its first keyframe with a face.
    const anchor = input.anchors[id]

    if (anchor !== undefined && anchor.length > 0) urls.push(anchor)
  }

  if (urls.length > 0) {
    const references = urls.slice(0, MAX_KEYFRAME_REFERENCES)

    if (references.length === 1) {
      return input.preferred === 'nano-banana'
        ? { kind: 'nano-banana', referenceUrls: references }
        : { kind: 'kontext', referenceUrl: references[0]! }
    }

    return input.preferred === 'nano-banana'
      ? { kind: 'nano-banana', referenceUrls: references }
      : { kind: 'kontext-multi', referenceUrls: references }
  }

  // No character in the frame: the uploaded image is useful only for its look.
  if (input.userReferenceUrl !== null && input.userReferenceUrl.length > 0) {
    return {
      kind: 'nano-banana',
      referenceUrls: [input.userReferenceUrl],
      styleOnly: true,
    }
  }

  return { kind: 'flux' }
}
