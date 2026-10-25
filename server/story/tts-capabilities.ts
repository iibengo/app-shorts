import type { StoryVoiceLanguage, StoryVoiceId } from '~/models/story'
import { StoryError } from './errors'

/**
 * 014: what each text-to-speech model can actually do.
 *
 * Same shape as `engine-capabilities.ts` (016): everything a provider
 * constrains lives here, cited from its published page with the date it was
 * read, so the rest of the code asks instead of guessing.
 *
 * Prices are list prices, not a promise. They are confirmed with one paid probe
 * before a hard cap is set on them.
 *
 * Pure: no I/O, no environment.
 */
export type StoryTtsProviderId =
  | 'fal-elevenlabs-turbo-v2-5'
  | 'fal-minimax-speech-02-hd'
  | 'fal-kokoro'

export const STORY_TTS_PROVIDER_IDS: readonly StoryTtsProviderId[] = [
  'fal-elevenlabs-turbo-v2-5',
  'fal-minimax-speech-02-hd',
  'fal-kokoro',
]

export interface TtsCapacity {
  readonly id: StoryTtsProviderId
  readonly label: string
  readonly endpoint: string
  readonly costPerThousandCharsUsd: number
  readonly languages: readonly StoryVoiceLanguage[]
  readonly maxCharsPerRequest: number
  readonly outputFormats: readonly string[]
  readonly returnsWordTimings: boolean
  readonly verifiedAt: string
}

export const TTS_CAPACITIES: Readonly<Record<StoryTtsProviderId, TtsCapacity>> = {
  'fal-elevenlabs-turbo-v2-5': {
    id: 'fal-elevenlabs-turbo-v2-5',
    label: 'ElevenLabs Turbo v2.5',
    endpoint: 'fal-ai/elevenlabs/tts/turbo-v2-5',
    costPerThousandCharsUsd: 0.05,
    languages: ['es-419', 'es-ES'],
    maxCharsPerRequest: 4_000,
    outputFormats: ['mp3', 'wav'],
    returnsWordTimings: false,
    verifiedAt: '2026-10-25',
  },
  'fal-minimax-speech-02-hd': {
    id: 'fal-minimax-speech-02-hd',
    label: 'MiniMax Speech-02 HD',
    endpoint: 'fal-ai/minimax/speech-02-hd',
    costPerThousandCharsUsd: 0.1,
    languages: ['es-419', 'es-ES'],
    maxCharsPerRequest: 3_000,
    outputFormats: ['mp3', 'wav'],
    returnsWordTimings: false,
    verifiedAt: '2026-10-25',
  },
  'fal-kokoro': {
    id: 'fal-kokoro',
    label: 'Kokoro',
    endpoint: 'fal-ai/kokoro/multilingual-v1',
    costPerThousandCharsUsd: 0.02,
    languages: ['es-419', 'es-ES'],
    maxCharsPerRequest: 2_000,
    outputFormats: ['mp3', 'wav'],
    returnsWordTimings: false,
    verifiedAt: '2026-10-25',
  },
}

export function ttsCapacity(id: StoryTtsProviderId): TtsCapacity {
  const capacity = TTS_CAPACITIES[id]

  // A silent fallback would bill a story against the wrong limits.
  if (capacity === undefined) throw new StoryError('audio-not-configured')

  return capacity
}

/**
 * The provider voice for a channel voice id.
 *
 * The client sends a semantic id it can understand; the provider id never
 * leaves the server, and a client cannot ask for an arbitrary voice.
 */
interface VoiceMapping {
  readonly providerVoiceId: string
  readonly language: StoryVoiceLanguage
}

const VOICE_REGISTRY: Readonly<Record<StoryTtsProviderId, Readonly<Record<StoryVoiceId, VoiceMapping>>>> = {
  'fal-elevenlabs-turbo-v2-5': {
    neutro: { providerVoiceId: 'Sarah', language: 'es-419' },
    calido: { providerVoiceId: 'Jessica', language: 'es-419' },
    energico: { providerVoiceId: 'Rachel', language: 'es-419' },
  },
  'fal-minimax-speech-02-hd': {
    neutro: { providerVoiceId: 'Wise_Woman', language: 'es-419' },
    calido: { providerVoiceId: 'Sweet_Girl', language: 'es-419' },
    energico: { providerVoiceId: 'Lively_Girl', language: 'es-419' },
  },
  'fal-kokoro': {
    neutro: { providerVoiceId: 'ef_dora', language: 'es-419' },
    calido: { providerVoiceId: 'ef_dora', language: 'es-419' },
    energico: { providerVoiceId: 'ef_dora', language: 'es-419' },
  },
}

export function providerVoiceFor(
  provider: StoryTtsProviderId,
  voice: StoryVoiceId,
): VoiceMapping {
  const mapping = VOICE_REGISTRY[provider]?.[voice]

  if (mapping === undefined) throw new StoryError('invalid-voice')

  return mapping
}

/** List price for a synthesis, so the estimate matches what will be charged. */
export function ttsCostUsd(provider: StoryTtsProviderId, characters: number): number {
  const capacity = ttsCapacity(provider)

  return (Math.max(0, characters) / 1_000) * capacity.costPerThousandCharsUsd
}

/** Characters billed for a line, after the same normalisation the adapter applies. */
export function billableCharacters(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length
}
