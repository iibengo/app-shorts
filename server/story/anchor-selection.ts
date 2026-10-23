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
  /** Sheet views first: they give the model every angle of the character. */
  readonly characterSheet?: readonly string[] | null
  readonly userReferenceUrl: string | null
  readonly presentCharacterIds: readonly string[]
  readonly anchors: Readonly<Record<string, string>>
  /** `nano-banana` keeps identity and style better and costs less per image. */
  readonly preferred?: 'flux' | 'nano-banana'
}

export function selectKeyframeProvider(input: KeyframeProviderInput): KeyframeProvider {
  // The sheet is the richest identity available, but a multi-paragraph prompt
  // plus four references is more than Nano Banana handles for a two-character
  // shot: those fall back to the single front view.
  if (input.characterSheet !== undefined && input.characterSheet !== null && input.characterSheet.length > 0) {
    const multi = new Set(input.presentCharacterIds).size > 1
    const urls = multi ? input.characterSheet.slice(0, 1) : input.characterSheet.slice(0, 4)

    return { kind: 'nano-banana', referenceUrls: urls }
  }

  if (input.userReferenceUrl !== null) {
    return { kind: 'kontext', referenceUrl: input.userReferenceUrl }
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
