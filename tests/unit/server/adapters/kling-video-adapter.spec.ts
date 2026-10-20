// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { KlingVideoAdapter } from '../../../../server/composer/adapters/kling-video-adapter'
import kling from '../../../fixtures/fal/kling-result.json'

const adapter = new KlingVideoAdapter()
const KEYFRAME = 'https://v3.fal.media/files/test/keyframe.jpeg'
const NEGATIVE_PROMPT =
  'blur, distortion, flicker, text, watermark, logo, low quality, deformed hands'

describe('KlingVideoAdapter', () => {
  it('builds the exact 5 second input', () => {
    expect(adapter.modelId).toBe('kling-2.5-turbo-pro')
    expect(adapter.buildInput({
      prompt: 'Video prompt',
      keyframeUrl: KEYFRAME,
      durationSeconds: 5,
    })).toEqual({
      prompt: 'Video prompt',
      image_url: KEYFRAME,
      duration: '5',
      negative_prompt: NEGATIVE_PROMPT,
      cfg_scale: 0.5,
    })
  })

  it('maps 10 seconds to the provider string', () => {
    expect(adapter.buildInput({
      prompt: 'Video prompt',
      keyframeUrl: KEYFRAME,
      durationSeconds: 10,
    })).toMatchObject({ duration: '10' })
  })

  it('parses video.url and dimensions', () => {
    expect(adapter.parseOutput(kling, 5)).toEqual({
      videoUrl: 'https://v3.fal.media/files/test/kling-video.mp4',
      width: null,
      height: null,
    })

    expect(adapter.parseOutput({
      video: {
        url: 'https://v3.fal.media/files/test/video.mp4',
        width: 720,
        height: 1280,
      },
      width: 1080,
      height: 1920,
    }, 5)).toEqual({
      videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      width: 720,
      height: 1280,
    })
  })

  it('rejects invalid outputs', () => {
    for (const payload of [
      null,
      {},
      { video: {} },
      { video: { url: 'https://evil.example/video.mp4' } },
      { video: { url: 'https://v3.fal.media:444/video.mp4' } },
    ]) {
      expect(() => adapter.parseOutput(payload, 5), JSON.stringify(payload)).toThrowError(
        expect.objectContaining({ code: 'provider-invalid-output' }),
      )
    }
  })
})
