import type { StoryVoiceId, StoryVoiceLanguage } from '~/models/story'
import type { StoryTtsProviderId } from './tts-capabilities'

/**
 * 014: one interface for every text-to-speech provider.
 *
 * The adapter talks to the provider and nothing else: it does not read runtime
 * config, does not download, does not measure and does not know Prisma. The
 * service above it owns the flow; the client below it owns the transport.
 */
export interface TtsSynthesisRequest {
  readonly text: string
  readonly providerVoiceId: string
  readonly language: StoryVoiceLanguage
  /** 1.0 in phase 1. A different value changes what the script asked for. */
  readonly speed: 1
}

export interface TtsSynthesisResult {
  /** Provider URL, validated against the media allowlist before it leaves here. */
  readonly audioUrl: string
  readonly contentType: 'audio/mpeg' | 'audio/wav'
  readonly provider: StoryTtsProviderId
  readonly characters: number
  readonly costUsd: number
}

export interface TtsAdapter {
  readonly id: StoryTtsProviderId
  synthesize(input: TtsSynthesisRequest): Promise<TtsSynthesisResult>
}

/** What the service needs from a provider to plan a story before spending. */
export interface TtsPlanInput {
  readonly voiceId: StoryVoiceId
  readonly language: StoryVoiceLanguage
}
