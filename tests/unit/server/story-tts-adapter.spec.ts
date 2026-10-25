// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { FalHttpClient, FalHttpRequest } from '../../../server/fal/http-client'
import { StoryError } from '../../../server/story/errors'
import { FalTtsAdapter } from '../../../server/story/tts-fal-adapter'
import { providerVoiceFor } from '../../../server/story/tts-capabilities'

/**
 * 014: the adapter talks to a stub, never to a provider. Same rule as the rest
 * of the suite: no real call in CI, no key needed.
 */
function stubClient(response: unknown): { client: FalHttpClient; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn(async (_request: FalHttpRequest) => ({
    status: 200,
    data: response,
    headers: new Headers(),
  }))

  return { client: { request } as unknown as FalHttpClient, request }
}

const VOICE = providerVoiceFor('fal-elevenlabs-turbo-v2-5', 'neutro')

describe('014 · adaptador TTS', () => {
  it('sends the text, the provider voice and the language, and returns a CDN url', async () => {
    const { client, request } = stubClient({
      audio: { url: 'https://v3b.fal.media/files/b/x/y.mp3' },
    })
    const adapter = new FalTtsAdapter({ client, providerId: 'fal-elevenlabs-turbo-v2-5' })

    const result = await adapter.synthesize({
      text: 'Clara entra en el obrador.',
      providerVoiceId: VOICE.providerVoiceId,
      language: VOICE.language,
      speed: 1,
    })

    expect(result.audioUrl).toBe('https://v3b.fal.media/files/b/x/y.mp3')
    expect(result.provider).toBe('fal-elevenlabs-turbo-v2-5')
    expect(result.characters).toBe(26)
    expect(result.costUsd).toBeGreaterThan(0)

    const sent = request.mock.calls[0]![0] as FalHttpRequest
    expect(sent.method).toBe('POST')
    expect((sent.body as { text: string }).text).toBe('Clara entra en el obrador.')
    expect((sent.body as { voice: string }).voice).toBe(VOICE.providerVoiceId)
  })

  it('refuses a url outside the media allowlist instead of handing it upward', async () => {
    const { client } = stubClient({ audio: { url: 'https://evil.example.com/a.mp3' } })
    const adapter = new FalTtsAdapter({ client, providerId: 'fal-elevenlabs-turbo-v2-5' })

    const error = await adapter.synthesize({
      text: 'Hola.',
      providerVoiceId: VOICE.providerVoiceId,
      language: VOICE.language,
      speed: 1,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('audio-invalid')
  })

  it('maps a provider failure to a stable code, never to a raw message', async () => {
    const request = vi.fn(async () => {
      throw new Error('Exhausted balance: user is locked')
    })
    const adapter = new FalTtsAdapter({
      client: { request } as unknown as FalHttpClient,
      providerId: 'fal-elevenlabs-turbo-v2-5',
    })

    const error = await adapter.synthesize({
      text: 'Hola.',
      providerVoiceId: VOICE.providerVoiceId,
      language: VOICE.language,
      speed: 1,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StoryError)
    expect((error as StoryError).code).toBe('audio-unavailable')
  })

  it('rejects an empty line before spending a call', async () => {
    const { client, request } = stubClient({ audio: { url: 'https://v3b.fal.media/x.mp3' } })
    const adapter = new FalTtsAdapter({ client, providerId: 'fal-elevenlabs-turbo-v2-5' })

    const error = await adapter.synthesize({
      text: '   ',
      providerVoiceId: VOICE.providerVoiceId,
      language: VOICE.language,
      speed: 1,
    }).catch((caught: unknown) => caught)

    expect((error as StoryError).code).toBe('audio-invalid')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects a payload with no audio url', async () => {
    const { client } = stubClient({ audio: {} })
    const adapter = new FalTtsAdapter({ client, providerId: 'fal-elevenlabs-turbo-v2-5' })

    const error = await adapter.synthesize({
      text: 'Hola.',
      providerVoiceId: VOICE.providerVoiceId,
      language: VOICE.language,
      speed: 1,
    }).catch((caught: unknown) => caught)

    expect((error as StoryError).code).toBe('audio-invalid')
  })
})

describe('014 · registro de voces', () => {
  it('maps a semantic id to a provider voice without exposing the provider id to the client', () => {
    const mapping = providerVoiceFor('fal-elevenlabs-turbo-v2-5', 'calido')

    expect(mapping.providerVoiceId.length).toBeGreaterThan(0)
    expect(mapping.language).toBe('es-419')
  })

  it('refuses an unknown voice rather than falling back silently', () => {
    expect(() => providerVoiceFor('fal-kokoro', 'inventada' as never)).toThrow(StoryError)
  })
})
