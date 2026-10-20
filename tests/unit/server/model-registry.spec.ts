// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ModelRegistry } from '../../../server/composer/model-registry'
import { FluxImageAdapter } from '../../../server/composer/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../../../server/composer/adapters/flux-kontext-adapter'
import { MinimaxVideoAdapter } from '../../../server/composer/adapters/minimax-video-adapter'
import { KlingVideoAdapter } from '../../../server/composer/adapters/kling-video-adapter'
import {
  COMPOSER_DEFAULT_DURATION_SECONDS,
  COMPOSER_DEFAULT_PRESET,
  COMPOSER_MODELS,
  COMPOSER_PRESETS,
} from '../../../app/data/composer'

const registry = new ModelRegistry()

describe('ModelRegistry video allowlist', () => {
  it('resolves the exact fast endpoint, model and durations', () => {
    expect(registry.getVideoEndpoint('fast')).toBe(
      'fal-ai/minimax/hailuo-02/standard/image-to-video',
    )
    expect(registry.getModelId('fast')).toBe('minimax-hailuo-02')
    expect(registry.getDurations('fast')).toEqual([6, 10])
    expect(registry.getDefaultDuration('fast')).toBe(6)
    expect(registry.getVideoAdapter('fast')).toBeInstanceOf(MinimaxVideoAdapter)
    expect(registry.getVideoModel('fast').label).toBe('MiniMax Hailuo 02')
  })

  it('resolves the exact quality endpoint, model and durations', () => {
    expect(registry.getVideoEndpoint('quality')).toBe(
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    )
    expect(registry.getModelId('quality')).toBe('kling-2.5-turbo-pro')
    expect(registry.getDurations('quality')).toEqual([5, 10])
    expect(registry.getDefaultDuration('quality')).toBe(5)
    expect(registry.getVideoAdapter('quality')).toBeInstanceOf(KlingVideoAdapter)
    expect(registry.getVideoModel('quality').label).toBe('Kling 2.5 Turbo Pro')
  })

  it('validates preset durations', () => {
    expect(registry.isDurationAllowed('fast', 6)).toBe(true)
    expect(registry.isDurationAllowed('fast', 10)).toBe(true)
    expect(registry.isDurationAllowed('fast', 5)).toBe(false)
    expect(registry.isDurationAllowed('quality', 5)).toBe(true)
    expect(registry.isDurationAllowed('quality', 10)).toBe(true)
    expect(registry.isDurationAllowed('quality', 6)).toBe(false)
  })
})

describe('ModelRegistry keyframe allowlist', () => {
  it('selects FLUX dev without a reference and Kontext with one', () => {
    expect(registry.getKeyframeEndpoint(false)).toBe('fal-ai/flux/dev')
    expect(registry.getKeyframeEndpoint(true)).toBe('fal-ai/flux-pro/kontext')
    expect(registry.getKeyframeAdapter(false)).toBeInstanceOf(FluxImageAdapter)
    expect(registry.getKeyframeAdapter(true)).toBeInstanceOf(FluxKontextAdapter)
  })
})

describe('ModelRegistry.assertEndpoint', () => {
  it('accepts the four allowlisted endpoints', () => {
    for (const endpointId of [
      'fal-ai/flux/dev',
      'fal-ai/flux-pro/kontext',
      'fal-ai/minimax/hailuo-02/standard/image-to-video',
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    ] as const) {
      expect(() => registry.assertEndpoint(endpointId)).not.toThrow()
    }
  })

  it('rejects client supplied endpoints that are not allowlisted', () => {
    for (const endpointId of [
      'fal-ai/flux/schnell',
      'fal-ai/veo3',
      'owner/app',
      '',
    ]) {
      expect(() => registry.assertEndpoint(endpointId), endpointId).toThrowError(
        expect.objectContaining({ code: 'invalid-request' }),
      )
    }
  })
})

describe('client/server preset parity', () => {
  it('matches presets, models, durations and defaults with app/data/composer', () => {
    expect(COMPOSER_DEFAULT_PRESET).toBe('fast')
    expect(COMPOSER_DEFAULT_DURATION_SECONDS).toBe(6)
    expect(COMPOSER_PRESETS.map((preset) => preset.preset)).toEqual(['fast', 'quality'])

    for (const preset of COMPOSER_PRESETS) {
      const serverModel = registry.getVideoModel(preset.preset)

      expect(serverModel.modelId).toBe(preset.modelId)
      expect(serverModel.durations).toEqual(preset.durations)
      expect(serverModel.defaultDurationSeconds).toBe(preset.defaultDurationSeconds)

      const clientModel = COMPOSER_MODELS.find((model) => model.preset === preset.preset)
      expect(serverModel.label).toBe(clientModel?.label)
      expect(clientModel).toMatchObject({
        id: preset.modelId,
        durations: preset.durations,
        defaultDurationSeconds: preset.defaultDurationSeconds,
        supportsImageReference: true,
        maxReferenceCount: 1,
        estimatedCostUsd: null,
      })
    }
  })
})
