import type {
  ComposerModelId,
  ComposerPreset,
  ComposerVideoDuration,
} from '~/models/composer'
import { ComposerError } from '../shared/errors'
import type { ComposerEndpointId } from '../fal/types'
import { isComposerEndpointId } from '../fal/types'
import { FluxImageAdapter } from '../fal/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../fal/adapters/flux-kontext-adapter'
import { KlingVideoAdapter } from '../fal/adapters/kling-video-adapter'
import { MinimaxVideoAdapter } from '../fal/adapters/minimax-video-adapter'
import type { KeyframeAdapter, VideoAdapter } from '../fal/adapters/types'

export interface VideoModelDefinition {
  readonly preset: ComposerPreset
  readonly modelId: ComposerModelId
  readonly endpointId: ComposerEndpointId
  readonly label: string
  readonly durations: readonly ComposerVideoDuration[]
  readonly defaultDurationSeconds: ComposerVideoDuration
  readonly adapter: VideoAdapter
}

const FLUX_DEV_ENDPOINT: ComposerEndpointId = 'fal-ai/flux/dev'
const FLUX_KONTEXT_ENDPOINT: ComposerEndpointId = 'fal-ai/flux-pro/kontext'

const VIDEO_MODELS: Readonly<Record<ComposerPreset, VideoModelDefinition>> = {
  fast: {
    preset: 'fast',
    modelId: 'minimax-hailuo-02',
    endpointId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    label: 'MiniMax Hailuo 02',
    durations: [6, 10],
    defaultDurationSeconds: 6,
    adapter: new MinimaxVideoAdapter(),
  },
  quality: {
    preset: 'quality',
    modelId: 'kling-2.5-turbo-pro',
    endpointId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    label: 'Kling 2.5 Turbo Pro',
    durations: [5, 10],
    defaultDurationSeconds: 5,
    adapter: new KlingVideoAdapter(),
  },
}

const FLUX_IMAGE_ADAPTER = new FluxImageAdapter()
const FLUX_KONTEXT_ADAPTER = new FluxKontextAdapter()

export class ModelRegistry {
  getVideoModel(preset: ComposerPreset): VideoModelDefinition {
    return VIDEO_MODELS[preset]
  }

  getVideoAdapter(preset: ComposerPreset): VideoAdapter {
    return VIDEO_MODELS[preset].adapter
  }

  getVideoEndpoint(preset: ComposerPreset): ComposerEndpointId {
    return VIDEO_MODELS[preset].endpointId
  }

  getModelId(preset: ComposerPreset): ComposerModelId {
    return VIDEO_MODELS[preset].modelId
  }

  getDurations(preset: ComposerPreset): readonly ComposerVideoDuration[] {
    return VIDEO_MODELS[preset].durations
  }

  getDefaultDuration(preset: ComposerPreset): ComposerVideoDuration {
    return VIDEO_MODELS[preset].defaultDurationSeconds
  }

  isDurationAllowed(
    preset: ComposerPreset,
    durationSeconds: number,
  ): durationSeconds is ComposerVideoDuration {
    return VIDEO_MODELS[preset].durations.includes(
      durationSeconds as ComposerVideoDuration,
    )
  }

  getKeyframeAdapter(hasReference: boolean): KeyframeAdapter {
    return hasReference ? FLUX_KONTEXT_ADAPTER : FLUX_IMAGE_ADAPTER
  }

  getKeyframeEndpoint(hasReference: boolean): ComposerEndpointId {
    return hasReference ? FLUX_KONTEXT_ENDPOINT : FLUX_DEV_ENDPOINT
  }

  assertEndpoint(endpointId: string): asserts endpointId is ComposerEndpointId {
    if (!isComposerEndpointId(endpointId)) {
      throw new ComposerError('invalid-request')
    }

    const known = [
      FLUX_DEV_ENDPOINT,
      FLUX_KONTEXT_ENDPOINT,
      VIDEO_MODELS.fast.endpointId,
      VIDEO_MODELS.quality.endpointId,
    ]

    if (!known.includes(endpointId)) {
      throw new ComposerError('invalid-request')
    }
  }
}

export const modelRegistry = new ModelRegistry()
