import type { StoryVoiceLanguage } from '~/models/story'
import { assertFalMediaUrl } from '../fal/types'
import type { FalHttpClient } from '../fal/http-client'
import { StoryError } from './errors'
import type { TtsAdapter, TtsSynthesisRequest, TtsSynthesisResult } from './tts-adapter'
import type { StoryTtsProviderId } from './tts-capabilities'
import { billableCharacters, ttsCapacity } from './tts-capabilities'

/**
 * 014: the text-to-speech adapter over Fal.
 *
 * It reuses the audited `FalHttpClient`: the same key, the same allowlist, the
 * same error taxonomy. It does not download, measure or persist something — the
 * service above does that — so it can be tested against a stub client without
 * a provider and without spending.
 *
 * If Fal ever changes a model id, this is the only file that needs to know.
 */
export interface FalTtsAdapterOptions {
  readonly client: FalHttpClient
  readonly providerId: StoryTtsProviderId
  readonly timeoutMs?: number
}

interface TtsPayload {
  readonly audio?: { readonly url?: unknown }
}

const DEFAULT_TIMEOUT_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class FalTtsAdapter implements TtsAdapter {
  readonly id: StoryTtsProviderId
  private readonly client: FalHttpClient
  private readonly timeoutMs: number

  constructor(options: FalTtsAdapterOptions) {
    this.id = options.providerId
    this.client = options.client
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async synthesize(input: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const capacity = ttsCapacity(this.id)
    const text = input.text.replace(/\s+/g, ' ').trim()

    if (text.length === 0) throw new StoryError('audio-invalid')
    if (text.length > capacity.maxCharsPerRequest) throw new StoryError('audio-too-long')

    const characters = billableCharacters(text)
    const response = await this.client
      .request<TtsPayload>({
        url: `${capacity.endpoint}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          text,
          voice: input.providerVoiceId,
          language_code: languageCodeFor(input.language),
          ...(capacity.id === 'fal-minimax-speech-02-hd' ? { speed: input.speed } : {}),
        },
        timeoutMs: this.timeoutMs,
      })
      .catch(() => {
        throw new StoryError('audio-unavailable')
      })

    const payload = isRecord(response.data) ? response.data : null
    const audio = payload !== null && isRecord(payload.audio) ? payload.audio : null
    const url = audio !== null && typeof audio.url === 'string' ? audio.url : null

    if (url === null) throw new StoryError('audio-invalid')

    // The URL leaves here only if it points at the media CDN we accept.
    let safeUrl: string

    try {
      safeUrl = assertFalMediaUrl(url)
    } catch {
      throw new StoryError('audio-invalid')
    }

    return {
      audioUrl: safeUrl,
      contentType: 'audio/mpeg',
      provider: this.id,
      characters,
      costUsd: (characters / 1_000) * capacity.costPerThousandCharsUsd,
    }
  }
}

/**
 * Fal expects a BCP-47 language for some models and a short code for others.
 * Spanish neutral and Spanish from Spain are the only two we offer, and neither
 * changes the voice: the voice register does.
 */
function languageCodeFor(language: StoryVoiceLanguage): string {
  return language === 'es-ES' ? 'es' : 'es'
}

export function createFalTtsAdapter(options: FalTtsAdapterOptions): TtsAdapter {
  return new FalTtsAdapter(options)
}
