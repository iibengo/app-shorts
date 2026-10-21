// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { KlingVideoAdapter } from '../../../server/fal/adapters/kling-video-adapter'

const INPUT = {
  prompt: 'Una escena vertical.',
  keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
  durationSeconds: 6 as const,
}

describe('KlingVideoAdapter negative override', () => {
  it('keeps the byte-identical 004 negative prompt when the field is absent', () => {
    const body = new KlingVideoAdapter().buildInput(INPUT) as Record<string, unknown>

    expect(body.negative_prompt).toBe(
      'blur, distortion, flicker, text, watermark, logo, low quality, deformed hands',
    )
  })

  it('uses the derived negative prompt when present', () => {
    const body = new KlingVideoAdapter().buildInput({
      ...INPUT,
      negativePrompt: 'bicycle, rain, night',
    }) as Record<string, unknown>

    expect(body.negative_prompt).toBe('bicycle, rain, night')
  })

  it('does not add the negative to the positive prompt', () => {
    const body = new KlingVideoAdapter().buildInput({
      ...INPUT,
      negativePrompt: 'bicycle, rain, night',
    }) as Record<string, unknown>

    expect(body.prompt).toBe(INPUT.prompt)
    expect(body.prompt).not.toContain('Avoid:')
  })
})
