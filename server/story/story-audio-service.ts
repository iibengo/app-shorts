import type { StoryAudio, StorySpeechSegment, StoryVoiceId, StoryVoiceLanguage } from '~/models/story'
import { StoryError } from './errors'
import type { CaptionPlan } from './captions-plan'
import { planCaptions } from './captions-plan'
import type { TtsAdapter } from './tts-adapter'
import type { StoryTtsProviderId } from './tts-capabilities'
import { billableCharacters, providerVoiceFor, ttsCostUsd } from './tts-capabilities'
import { estimateSpeechSeconds, speechFits } from './speech-rate'
import type { SceneTimeBudget } from './time-plan'

/**
 * 014: one voice per scene, measured, placed on the video timeline.
 *
 * The service owns the flow: it asks the adapter for audio, the measurer for
 * the real duration, and decides whether the scene fits. It never speeds the
 * voice up and never cuts it: if the line does not fit, that is a failure the
 * caller reports, not a deformation.
 *
 * Every dependency is injected, so the whole flow is testable without a
 * provider and without spending.
 */
export interface SynthesizedScene {
  readonly sceneOrder: number
  readonly text: string
  /** Local file the caller copied the provider audio to. */
  readonly audioPath: string
  readonly availableSeconds: number
}

export interface MeasureAudio {
  (filePath: string): Promise<number>
}

export interface StoryAudioServiceOptions {
  readonly adapter: TtsAdapter
  readonly measure: MeasureAudio
  readonly providerId: StoryTtsProviderId
  /** Copies the provider audio to a local file the muxer can read. */
  readonly fetchAudio: (url: string, targetPath: string) => Promise<void>
  readonly now?: () => number
}

export interface SynthesizeInput {
  readonly voiceId: StoryVoiceId
  readonly language: StoryVoiceLanguage
  readonly scenes: readonly SceneTimeBudget[]
  readonly lines: ReadonlyMap<number, string>
  readonly directory: string
}

export interface SynthesizeResult {
  readonly audio: StoryAudio
  /** Local files to mux, in scene order. Empty when the voice failed. */
  readonly tracks: readonly SynthesizedScene[]
  readonly captions: CaptionPlan | null
}

/** A scene's voice starts when the scene starts, whatever the scene starts at. */
export function sceneStartSeconds(scenes: readonly SceneTimeBudget[], sceneOrder: number): number {
  let total = 0

  for (const scene of scenes) {
    if (scene.sceneOrder === sceneOrder) return total

    total += scene.availableSeconds
  }

  return total
}

/**
 * Synthesises every scene.
 *
 * A failed scene does not fail the story: the video ships without voice and is
 * marked, because a mute video is still a video and a half-voiced one is a lie.
 */
export class StoryAudioService {
  private readonly adapter: TtsAdapter
  private readonly measure: MeasureAudio
  private readonly providerId: StoryTtsProviderId
  private readonly fetchAudio: (url: string, targetPath: string) => Promise<void>

  constructor(options: StoryAudioServiceOptions) {
    this.adapter = options.adapter
    this.measure = options.measure
    this.providerId = options.providerId
    this.fetchAudio = options.fetchAudio
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const voice = providerVoiceFor(this.providerId, input.voiceId)
    const segments: StorySpeechSegment[] = []
    const tracks: SynthesizedScene[] = []
    let totalSeconds = 0
    let characters = 0
    let failure: StoryError | null = null

    for (const scene of input.scenes) {
      const text = input.lines.get(scene.sceneOrder)

      if (text === undefined || text.trim().length === 0) continue

      const estimatedSeconds = estimateSpeechSeconds(text)
      const start = sceneStartSeconds(input.scenes, scene.sceneOrder)
      const audioPath = `${input.directory}/scene-${scene.sceneOrder}.mp3`

      try {
        const synthesized = await this.adapter.synthesize({
          text,
          providerVoiceId: voice.providerVoiceId,
          language: input.language,
          speed: 1,
        })

        await this.fetchAudio(synthesized.audioUrl, audioPath)
        const measured = await this.measure(audioPath)

        if (measured <= 0) throw new StoryError('audio-invalid')

        characters += billableCharacters(text)

        if (!speechFits(measured, scene.availableSeconds)) {
          // The line does not fit. Shortening it is a product decision, not a
          // silent speed-up: the caller gets a code it can act on.
          throw new StoryError('audio-too-long')
        }

        totalSeconds += measured
        segments.push({
          sceneOrder: scene.sceneOrder,
          text,
          startSeconds: start,
          endSeconds: start + measured,
          speechSeconds: measured,
          estimatedSeconds,
          status: 'ready',
        })
        tracks.push({
          sceneOrder: scene.sceneOrder,
          text,
          audioPath,
          availableSeconds: scene.availableSeconds,
        })
      } catch (error) {
        const code = error instanceof StoryError ? error.code : 'audio-failed'

        failure = error instanceof StoryError ? error : new StoryError('audio-failed')
        segments.push({
          sceneOrder: scene.sceneOrder,
          text,
          startSeconds: start,
          endSeconds: start,
          speechSeconds: 0,
          estimatedSeconds,
          status: 'failed',
          errorCode: code,
        })
        break
      }
    }

    const readySegments = segments.filter((segment) => segment.status === 'ready')
    const degraded = failure !== null || readySegments.length === 0
    const captions = degraded ? null : planCaptions(segments)

    return {
      audio: {
        status: degraded ? 'missing' : 'ready',
        voiceId: input.voiceId,
        voiceLanguage: input.language,
        provider: this.providerId,
        speechSeconds: totalSeconds,
        segments,
        audioUrl: null,
        captionsUrl: null,
        captionsMode: 'burned',
        captionsBurned: !degraded,
        captionAlignment: degraded ? null : 'proportional',
        loudnessLufs: null,
        truePeakDbtp: null,
        usedRatio: null,
        degradedReason: degraded ? (failure?.code ?? 'audio-failed') : null,
      },
      tracks: degraded ? [] : tracks,
      captions,
    }
  }
}

/** What the whole narration costs before a single call, so a cap can stop it. */
export function estimateAudioCostUsd(
  providerId: StoryTtsProviderId,
  lines: readonly string[],
): number {
  const characters = lines.reduce((total, line) => total + billableCharacters(line), 0)

  return ttsCostUsd(providerId, characters)
}
