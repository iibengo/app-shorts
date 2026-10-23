import { ComposerError } from '../../shared/errors'
import {
  assertFalMediaUrl,
  isRecord,
  readNumber,
  readString,
} from '../types'
import type { KeyframeAdapter, KeyframeInput, KeyframeOutput } from './types'

function parseOutput(payload: unknown): KeyframeOutput {
  if (!isRecord(payload)) {
    throw new ComposerError('provider-invalid-output')
  }

  const nsfw = payload.has_nsfw_concepts

  if (Array.isArray(nsfw) && nsfw.some((value) => value === true)) {
    throw new ComposerError('content-blocked')
  }

  const images = payload.images

  if (!Array.isArray(images) || images.length === 0 || !isRecord(images[0])) {
    throw new ComposerError('provider-invalid-output')
  }

  const image = images[0]
  const rawUrl = readString(image, 'url')

  if (!rawUrl) {
    throw new ComposerError('provider-invalid-output')
  }

  let imageUrl: string

  try {
    imageUrl = assertFalMediaUrl(rawUrl)
  } catch {
    throw new ComposerError('provider-invalid-output')
  }

  const width = readNumber(image, 'width')
  const height = readNumber(image, 'height')

  return {
    imageUrl,
    width: width === null ? null : Math.max(0, Math.trunc(width)),
    height: height === null ? null : Math.max(0, Math.trunc(height)),
  }
}

/**
 * Kontext [max] multi: two or more reference images in `image_urls`. Used when
 * a shot shows more than one character and each has an anchor.
 */
export class FluxKontextMultiAdapter implements KeyframeAdapter {
  readonly modelId = 'fal-ai/flux-pro/kontext/max/multi'

  buildInput(input: KeyframeInput): unknown {
    const referenceUrls = input.referenceUrls ?? []

    if (referenceUrls.length < 2) {
      throw new ComposerError('provider-rejected')
    }

    return {
      prompt: input.prompt,
      image_urls: referenceUrls,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      safety_tolerance: '2',
    }
  }

  parseOutput(payload: unknown): KeyframeOutput {
    return parseOutput(payload)
  }
}
