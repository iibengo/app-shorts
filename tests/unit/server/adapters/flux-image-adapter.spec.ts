// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FluxImageAdapter } from '../../../../server/composer/adapters/flux-image-adapter'
import fluxDev from '../../../fixtures/fal/flux-dev-result.json'

const adapter = new FluxImageAdapter()

describe('FluxImageAdapter', () => {
  it('builds the exact FLUX dev input', () => {
    expect(adapter.modelId).toBe('fal-ai/flux/dev')
    expect(adapter.buildInput({
      prompt: 'Cinematic keyframe',
      referenceUrl: null,
    })).toEqual({
      prompt: 'Cinematic keyframe',
      image_size: { width: 1152, height: 2048 },
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    })
  })

  it('parses images[0].url and optional dimensions', () => {
    expect(adapter.parseOutput(fluxDev)).toEqual({
      imageUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      width: 1152,
      height: 2048,
    })
  })

  it('returns null dimensions when the provider omits them', () => {
    expect(adapter.parseOutput({
      images: [{ url: 'https://v3.fal.media/files/test/keyframe.jpeg' }],
    })).toEqual({
      imageUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      width: null,
      height: null,
    })
  })

  it('maps NSFW results to content-blocked', () => {
    expect(() => adapter.parseOutput({
      images: [{ url: 'https://v3.fal.media/files/test/keyframe.jpeg' }],
      has_nsfw_concepts: [true],
    })).toThrowError(expect.objectContaining({ code: 'content-blocked' }))
  })

  it('rejects invalid outputs', () => {
    for (const payload of [
      null,
      {},
      { images: [] },
      { images: [{}] },
      { images: [{ url: 'https://evil.example/keyframe.jpeg' }] },
      { images: [{ url: 'http://v3.fal.media/keyframe.jpeg' }] },
    ]) {
      expect(() => adapter.parseOutput(payload), JSON.stringify(payload)).toThrowError(
        expect.objectContaining({ code: 'provider-invalid-output' }),
      )
    }
  })
})
