// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  AUDIO_SAMPLE_RATE,
  DEFAULT_LOUDNESS_LUFS,
  escapeFilterPath,
  hasAudioToMux,
  muxAudioPlan,
} from '../../../server/story/audio-mux'
import { planCaptions } from '../../../server/story/captions-plan'

const BASE = {
  videoPath: '/tmp/v.mp4',
  audioPath: '/tmp/a.mp3',
  outputPath: '/tmp/out.mp4',
  captionsPath: '/tmp/c.ass',
}

describe('014 · el audio entra en un solo pase', () => {
  it('burns the captions and mixes the voice in the same encode', () => {
    const { args } = muxAudioPlan(BASE)
    const joined = args.join(' ')

    // One video encode, not one per layer.
    expect(args.filter((value) => value === 'libx264')).toHaveLength(1)
    expect(joined).toContain('ass=/tmp/c.ass')
    expect(joined).toContain('-c:a aac')
    expect(joined).toContain(String(AUDIO_SAMPLE_RATE))
  })

  it('normalises loudness instead of trusting the provider level', () => {
    const { args } = muxAudioPlan(BASE)
    const filter = args[args.indexOf('-af') + 1]

    expect(filter).toContain(`I=${DEFAULT_LOUDNESS_LUFS}`)
    expect(filter).toContain('TP=-1')
  })

  it('takes the video from the first input and the voice from the second', () => {
    const { args } = muxAudioPlan(BASE)

    expect(args[args.indexOf('-map') + 1]).toBe('0:v:0')
    expect(args[args.indexOf('-map', args.indexOf('-map') + 1) + 1]).toBe('1:a:0')
  })

  it('escapes a colon in the path so it cannot break the filter', () => {
    // A temp path with a colon would end the filter argument early.
    expect(escapeFilterPath('/tmp/a:b/c.ass')).toBe('/tmp/a\\:b/c.ass')
  })

  it('applies the 015 graphics after the captions, in the same pass', () => {
    const { args } = muxAudioPlan({
      ...BASE,
      extraVideoFilters: ['drawtext=fontfile=/f.ttf:text=Hola'],
    })
    const filter = args[args.indexOf('-vf') + 1]

    expect(filter?.indexOf('ass=')).toBeLessThan(filter?.indexOf('drawtext=') ?? -1)
  })

  it('ships the video untouched when there is no voice', () => {
    const captions = planCaptions([])

    expect(hasAudioToMux(null, '/tmp/a.mp3')).toBe(false)
    expect(hasAudioToMux(captions, null)).toBe(false)
  })
})
