// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { FalHttpClient } from '../../../server/fal/http-client'
import { StoryError } from '../../../server/story/errors'
import { FalTtsAdapter } from '../../../server/story/tts-fal-adapter'
import { StoryAudioService, estimateAudioCostUsd, sceneStartSeconds } from '../../../server/story/story-audio-service'
import type { SceneTimeBudget } from '../../../server/story/time-plan'

/**
 * 014: the whole voice flow, against a stub provider and a stub measurer.
 *
 * No key, no network, no cost. What is proved here is the ordering: the line is
 * synthesised, the audio is measured, and a scene that does not fit fails with
 * a code instead of being sped up.
 */
const SCENES: readonly SceneTimeBudget[] = [
  { sceneOrder: 1, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
  { sceneOrder: 2, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
]

function adapter(): { adapter: FalTtsAdapter; calls: ReturnType<typeof vi.fn> } {
  const request = vi.fn(async () => ({
    status: 200,
    data: { audio: { url: 'https://v3b.fal.media/files/b/x/y.mp3' } },
    headers: new Headers(),
  }))

  return {
    adapter: new FalTtsAdapter({
      client: { request } as unknown as FalHttpClient,
      providerId: 'fal-elevenlabs-turbo-v2-5',
    }),
    calls: request,
  }
}

function service(options: {
  readonly measured?: readonly number[]
  readonly failFetch?: boolean
}) {
  const durations = [...(options.measured ?? [4, 4])]
  let index = 0
  const fetched: string[] = []

  return new StoryAudioService({
    adapter: adapter().adapter,
    measure: async () => durations[index++] ?? 4,
    providerId: 'fal-elevenlabs-turbo-v2-5',
    fetchAudio: async (url, target) => {
      if (options.failFetch) throw new Error('network down')
      fetched.push(`${url}->${target}`)
    },
  })
}

const LINES = new Map<number, string>([
  [1, 'Clara encuentra una figura dibujada en el merengue.'],
  [2, 'La figura se mueve cuando nadie mira el obrador.'],
])

describe('014 · flujo completo de la voz', () => {
  it('synthesises, measures and places each scene on the timeline', async () => {
    const result = await service({}).synthesize({
      voiceId: 'neutro',
      language: 'es-419',
      scenes: SCENES,
      lines: LINES,
      directory: '/tmp/s',
    })

    expect(result.audio.status).toBe('ready')
    expect(result.audio.segments).toHaveLength(2)
    expect(result.audio.segments[0]?.startSeconds).toBe(0)
    // The second scene starts after the first scene's time, not after its voice.
    expect(result.audio.segments[1]?.startSeconds).toBe(10)
    expect(result.tracks).toHaveLength(2)
    expect(result.captions?.cues.length).toBeGreaterThan(0)
  })

  it('fails the scene whose voice does not fit, instead of speeding it up', async () => {
    // The second scene's audio takes 30 s and it only has 10.
    const result = await service({ measured: [4, 30] }).synthesize({
      voiceId: 'neutro',
      language: 'es-419',
      scenes: SCENES,
      lines: LINES,
      directory: '/tmp/s',
    })

    expect(result.audio.status).toBe('missing')
    expect(result.audio.degradedReason).toBe('audio-too-long')
    expect(result.tracks).toHaveLength(0)
    expect(result.captions).toBeNull()
  })

  it('ships the video without voice when the download fails, and says why', async () => {
    const result = await service({ failFetch: true }).synthesize({
      voiceId: 'neutro',
      language: 'es-419',
      scenes: SCENES,
      lines: LINES,
      directory: '/tmp/s',
    })

    expect(result.audio.status).toBe('missing')
    expect(result.audio.degradedReason).toBe('audio-failed')
    // A mute video is still a video; it is not a failed story.
    expect(result.audio.segments[0]?.status).toBe('failed')
  })

  it('never produces captions for a voice nobody will hear', async () => {
    const result = await service({ measured: [40] }).synthesize({
      voiceId: 'neutro',
      language: 'es-419',
      scenes: SCENES,
      lines: LINES,
      directory: '/tmp/s',
    })

    expect(result.captions).toBeNull()
  })

  it('places scene three after the real time of one and two', () => {
    const scenes: readonly SceneTimeBudget[] = [
      { sceneOrder: 1, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
      { sceneOrder: 2, clipSeconds: [6], availableSeconds: 6, wordBudget: 14 },
      { sceneOrder: 3, clipSeconds: [10], availableSeconds: 10, wordBudget: 24 },
    ]

    expect(sceneStartSeconds(scenes, 3)).toBe(16)
  })

  it('estimates the cost of a whole narration before spending', () => {
    const cost = estimateAudioCostUsd('fal-elevenlabs-turbo-v2-5', [...LINES.values()])

    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(0.05)
  })

  it('refuses an unknown voice before calling the provider', async () => {
    const error = await service({}).synthesize({
      voiceId: 'inventada' as never,
      language: 'es-419',
      scenes: SCENES,
      lines: LINES,
      directory: '/tmp/s',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('invalid-voice')
  })
})
