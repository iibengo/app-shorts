// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NanoBananaAdapter } from '../../../server/fal/adapters/nano-banana-adapter'

const adapter = new NanoBananaAdapter()
const REF = 'https://v3.fal.media/files/x/ref.jpeg'

describe('nano-banana adapter', () => {
  it('sends the reference images and forces 9:16', () => {
    const input = adapter.buildInput({ prompt: 'Ionias at a cafe', referenceUrl: REF }) as Record<string, unknown>

    expect(adapter.modelId).toBe('fal-ai/nano-banana/edit')
    expect(input.aspect_ratio).toBe('9:16')
    expect(input.image_urls).toEqual([REF])
    expect(input.limit_generations).toBe(true)
  })

  it('accepts several references', () => {
    const input = adapter.buildInput({
      prompt: 'two characters',
      referenceUrl: null,
      referenceUrls: [REF, 'https://v3.fal.media/files/x/ref2.jpeg'],
    }) as Record<string, unknown>

    expect(input.image_urls).toHaveLength(2)
  })

  it('rejects a request without references', () => {
    expect(() => adapter.buildInput({ prompt: 'x', referenceUrl: null })).toThrow()
  })

  it('parses the image and its size', () => {
    const output = adapter.parseOutput({
      images: [{ url: 'https://v3.fal.media/files/y/out.jpeg', width: 1152, height: 2048 }],
    })

    expect(output.imageUrl).toContain('v3.fal.media')
    expect(output.width).toBe(1152)
  })

  it('rejects a non-vertical answer', () => {
    expect(() => adapter.parseOutput({
      images: [{ url: 'https://v3.fal.media/files/y/out.jpeg', width: 1152, height: 1536 }],
    })).toThrow()
  })
})
