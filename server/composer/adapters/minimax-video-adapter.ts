import type { ComposerModelId, ComposerVideoDuration } from '~/models/composer'
import { ComposerError } from '../errors'
import {
  assertFalMediaUrl,
  isRecord,
  readNumber,
  readString,
} from '../fal-types'
import type { VideoAdapter, VideoInput, VideoOutput } from './types'

function parseVideoPayload(
  payload: unknown,
  fallbackWidth: number | null,
  fallbackHeight: number | null,
): VideoOutput {
  if (!isRecord(payload) || !isRecord(payload.video)) {
    throw new ComposerError('provider-invalid-output')
  }

  const video = payload.video
  const rawUrl = readString(video, 'url')

  if (!rawUrl) {
    throw new ComposerError('provider-invalid-output')
  }

  let videoUrl: string

  try {
    videoUrl = assertFalMediaUrl(rawUrl)
  } catch {
    throw new ComposerError('provider-invalid-output')
  }

  const width = readNumber(video, 'width') ?? fallbackWidth
  const height = readNumber(video, 'height') ?? fallbackHeight

  return {
    videoUrl,
    width: width === null ? null : Math.max(0, Math.trunc(width)),
    height: height === null ? null : Math.max(0, Math.trunc(height)),
  }
}

export class MinimaxVideoAdapter implements VideoAdapter {
  readonly modelId: ComposerModelId = 'minimax-hailuo-02'

  buildInput(input: VideoInput): unknown {
    return {
      prompt: input.prompt,
      image_url: input.keyframeUrl,
      duration: input.durationSeconds === 6 ? '6' : '10',
      resolution: '768P',
      prompt_optimizer: false,
    }
  }

  parseOutput(
    payload: unknown,
    _requestedDuration: ComposerVideoDuration,
  ): VideoOutput {
    const root = isRecord(payload) ? payload : {}
    const width = readNumber(root, 'width')
    const height = readNumber(root, 'height')

    return parseVideoPayload(payload, width, height)
  }
}
