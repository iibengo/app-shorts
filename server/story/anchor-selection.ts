/**
 * Chooses the keyframe provider from the evidence we have:
 * - a user-uploaded reference wins, as in 006–008;
 * - two or more characters with an anchor → Kontext multi;
 * - one character with an anchor → Kontext;
 * - otherwise FLUX text-to-image with the style block.
 *
 * Pure function: no I/O, no clock.
 */
export type KeyframeProvider =
  | { readonly kind: 'flux' }
  | { readonly kind: 'kontext'; readonly referenceUrl: string }
  | { readonly kind: 'kontext-multi'; readonly referenceUrls: readonly string[] }
  | { readonly kind: 'nano-banana'; readonly referenceUrls: readonly string[] }

export interface KeyframeProviderInput {
  /** Sheet views. Only used when there is no user reference at all. */
  readonly characterSheet?: readonly string[] | null
  readonly userReferenceUrl: string | null
  /**
   * Stored sheet front view. It is a last resort before the anchors: a photo
   * that still needs style conversion. A 4-view grid is never sent.
   */
  readonly sheetFallback?: readonly string[] | null
  readonly presentCharacterIds: readonly string[]
  readonly anchors: Readonly<Record<string, string>>
  /** `nano-banana` keeps identity and style better and costs less per image. */
  readonly preferred?: 'flux' | 'nano-banana'
}

export function selectKeyframeProvider(input: KeyframeProviderInput): KeyframeProvider {
  // Exactly one reference image per shot. Several views, and above all a 2x2
  // sheet, make the model copy the grid into the frame, which is unusable as a
  // keyframe because the video would animate every panel.
  if (input.userReferenceUrl !== null && input.userReferenceUrl.length > 0) {
    return { kind: 'nano-banana', referenceUrls: [input.userReferenceUrl] }
  }

  if (input.characterSheet !== undefined && input.characterSheet !== null && input.characterSheet.length > 0) {
    return { kind: 'nano-banana', referenceUrls: input.characterSheet.slice(0, 1) }
  }

  if (input.sheetFallback !== undefined && input.sheetFallback !== null && input.sheetFallback.length > 0) {
    return { kind: 'nano-banana', referenceUrls: input.sheetFallback.slice(0, 1) }
  }

  const urls: string[] = []

  for (const id of new Set(input.presentCharacterIds)) {
    const url = input.anchors[id]

    if (url !== undefined && url.length > 0) urls.push(url)
  }

  if (urls.length >= 1 && input.preferred === 'nano-banana') {
    return { kind: 'nano-banana', referenceUrls: urls.slice(0, 2) }
  }

  if (urls.length >= 2) {
    return { kind: 'kontext-multi', referenceUrls: urls.slice(0, 2) }
  }

  if (urls.length === 1) {
    return { kind: 'kontext', referenceUrl: urls[0]! }
  }

  return { kind: 'flux' }
}
