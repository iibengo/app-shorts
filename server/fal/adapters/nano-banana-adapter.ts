import { ComposerError } from '../../shared/errors'
import {
  assertFalMediaUrl,
  isRecord,
  readNumber,
  readString,
} from '../types'
import type { KeyframeAdapter, KeyframeInput, KeyframeOutput } from './types'
import { isVerticalAspect } from '../../story/aspect-ratio'

function parseOutput(payload: unknown): KeyframeOutput {
  if (!isRecord(payload) || !Array.isArray(payload.images) || payload.images.length === 0) {
    throw new ComposerError('provider-invalid-output')
  }

  const image = payload.images[0]

  if (!isRecord(image)) {
    throw new ComposerError('provider-invalid-output')
  }

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
  const safeWidth = width === null ? null : Math.max(0, Math.trunc(width))
  const safeHeight = height === null ? null : Math.max(0, Math.trunc(height))

  // Nano Banana honours aspect_ratio, so a non-vertical answer means the request
  // changed: reject it here instead of failing in the video stage.
  if (safeWidth !== null && safeHeight !== null && !isVerticalAspect(safeWidth, safeHeight)) {
    throw new ComposerError('provider-invalid-output')
  }

  return { imageUrl, width: safeWidth, height: safeHeight }
}

/**
 * Nano Banana edit: identity from reference images, strong style adherence and
 * explicit aspect ratio. Same Fal key, no new provider credentials.
 */
export class NanoBananaAdapter implements KeyframeAdapter {
  readonly modelId = 'fal-ai/nano-banana/edit'

  buildInput(input: KeyframeInput): unknown {
    const references = input.referenceUrls
      ?? (input.referenceUrl === null ? [] : [input.referenceUrl])

    if (references.length === 0) {
      throw new ComposerError('provider-rejected')
    }

    return {
      prompt: input.prompt,
      image_urls: references,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      num_images: 1,
      limit_generations: true,
    }
  }

  parseOutput(payload: unknown): KeyframeOutput {
    return parseOutput(payload)
  }
}
