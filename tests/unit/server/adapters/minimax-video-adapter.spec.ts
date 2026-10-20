// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MinimaxVideoAdapter } from '../../../../server/composer/adapters/minimax-video-adapter'
import minimax from '../../../fixtures/fal/minimax-result.json'

const adapter = new MinimaxVideoAdapter()
const KEYFRAME = 'https://v3.fal.media/files/test/keyframe.jpeg'

describe('MinimaxVideoAdapter', () => {
  it('builds the exact 6 second input', () => {
    expect(adapter.modelId).toBe('minimax-hailuo-02')
    expect(adapter.buildInput({
      prompt: 'Video prompt',
      keyframeUrl: KEYFRAME,
      durationSeconds: 6,
    })).toEqual({
      prompt: 'Video prompt',
      image_url: KEYFRAME,
      duration: '6',
      resolution: '768P',
      prompt_optimizer: false,
    })
  })

  it('maps 10 seconds to the provider string', () => {
    expect(adapter.buildInput({
      prompt: 'Video prompt',
      keyframeUrl: KEYFRAME,
      durationSeconds: 10,
    })).toMatchObject({ duration: '10' })
  })

  it('parses video.url and provider dimensions', () => {
    expect(adapter.parseOutput(minimax, 6)).toEqual({
      videoUrl: 'https://v3.fal.media/files/test/minimax-video.mp4',
      width: 1080,
      height: 1920,
    })
  })

  it('returns null dimensions when absent', () => {
    expect(adapter.parseOutput({
      video: { url: 'https://v3.fal.media/files/test/video.mp4' },
    }, 6)).toEqual({
      videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      width: null,
      height: null,
    })
  })

  it('rejects invalid outputs', () => {
    for (const payload of [
      null,
      {},
      { video: {} },
      { video: { url: 'https://evil.example/video.mp4' } },
      { video: { url: 'http://v3.fal.media/files/test/video.mp4' } },
    ]) {
      expect(() => adapter.parseOutput(payload, 6), JSON.stringify(payload)).toThrowError(
        expect.objectContaining({ code: 'provider-invalid-output' }),
      )
    }
  })
})
