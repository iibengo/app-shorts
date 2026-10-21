import { ComposerError } from '../../shared/errors'
import {
  assertFalMediaUrl,
  isRecord,
  readNumber,
  readString,
} from '../types'
import type { KeyframeAdapter, KeyframeInput, KeyframeOutput } from './types'

const FLUX_IMAGE_WIDTH = 1152
const FLUX_IMAGE_HEIGHT = 2048

function parseFluxOutput(payload: unknown): KeyframeOutput {
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

export class FluxImageAdapter implements KeyframeAdapter {
  readonly modelId = 'fal-ai/flux/dev'

  buildInput(input: KeyframeInput): unknown {
    return {
      prompt: input.prompt,
      image_size: {
        width: FLUX_IMAGE_WIDTH,
        height: FLUX_IMAGE_HEIGHT,
      },
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    }
  }

  parseOutput(payload: unknown): KeyframeOutput {
    return parseFluxOutput(payload)
  }
}
