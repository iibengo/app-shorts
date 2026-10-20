// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FluxKontextAdapter } from '../../../../server/composer/adapters/flux-kontext-adapter'
import fluxKontext from '../../../fixtures/fal/flux-kontext-result.json'

const adapter = new FluxKontextAdapter()
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

describe('FluxKontextAdapter', () => {
  it('builds the exact Kontext input with the reference image', () => {
    expect(adapter.modelId).toBe('fal-ai/flux-pro/kontext')
    expect(adapter.buildInput({
      prompt: 'Cinematic keyframe',
      referenceUrl: REFERENCE,
    })).toEqual({
      prompt: 'Cinematic keyframe',
      image_url: REFERENCE,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      safety_tolerance: '2',
    })
  })

  it('rejects a missing reference instead of calling the provider', () => {
    expect(() => adapter.buildInput({
      prompt: 'Cinematic keyframe',
      referenceUrl: null,
    })).toThrowError(expect.objectContaining({ code: 'provider-rejected' }))
  })

  it('parses the Kontext image output', () => {
    expect(adapter.parseOutput(fluxKontext)).toEqual({
      imageUrl: 'https://v3.fal.media/files/test/keyframe-kontext.jpeg',
      width: 1080,
      height: 1920,
    })
  })

  it('maps NSFW and malformed outputs', () => {
    expect(() => adapter.parseOutput({
      images: [{ url: 'https://v3.fal.media/files/test/a.jpeg' }],
      has_nsfw_concepts: [true],
    })).toThrowError(expect.objectContaining({ code: 'content-blocked' }))

    expect(() => adapter.parseOutput({ images: [] })).toThrowError(
      expect.objectContaining({ code: 'provider-invalid-output' }),
    )
  })
})
