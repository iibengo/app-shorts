import type { CaptionPlan } from './captions-plan'

/**
 * 014: arguments to put the voice and the captions inside the delivered MP4.
 *
 * One encode for everything: the video is re-encoded once with the captions
 * burned in and the narration mixed in, not once per layer. Re-encoding twice
 * degrades the picture twice and doubles the assembly time.
 *
 * Pure: it builds arguments, it does not run something.
 */
export interface MuxAudioInput {
  readonly videoPath: string
  readonly audioPath: string
  readonly outputPath: string
  /** Absolute path to the ASS file, or null to ship without burned captions. */
  readonly captionsPath: string | null
  /** Extra video filters that already exist (015 graphics), applied after captions. */
  readonly extraVideoFilters?: readonly string[]
  /** Target loudness. -14 LUFS is what the platforms normalise towards. */
  readonly loudnessLufs?: number
  readonly truePeakDbtp?: number
}

export const DEFAULT_LOUDNESS_LUFS = -14
export const DEFAULT_TRUE_PEAK_DBTP = -1
export const AUDIO_BITRATE = '96k'
export const AUDIO_SAMPLE_RATE = 48_000

/**
 * Escapes a path for use inside an FFmpeg filter argument.
 *
 * A colon or a backslash in a temp path breaks the filter and, in the worst
 * case, injects a second one. Same lesson as the graphics renderer in 015.
 */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

export interface MuxAudioPlan {
  readonly args: readonly string[]
}

/**
 * Builds the FFmpeg invocation.
 *
 * The narration is normalised in one pass (`loudnorm`) instead of trusting the
 * provider: two providers deliver two different levels and the platform will
 * turn the quiet one down in the end.
 */
export function muxAudioPlan(input: MuxAudioInput): MuxAudioPlan {
  const filters: string[] = []

  if (input.captionsPath !== null) {
    filters.push(`ass=${escapeFilterPath(input.captionsPath)}`)
  }

  filters.push(...(input.extraVideoFilters ?? []))

  const lufs = input.loudnessLufs ?? DEFAULT_LOUDNESS_LUFS
  const peak = input.truePeakDbtp ?? DEFAULT_TRUE_PEAK_DBTP
  const videoFilter = filters.length === 0 ? 'null' : filters.join(',')

  return {
    args: [
      '-nostdin',
      '-y',
      '-i', input.videoPath,
      '-i', input.audioPath,
      '-vf', videoFilter,
      '-af', `loudnorm=I=${lufs}:TP=${peak}:LRA=11`,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-crf', '18',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', AUDIO_BITRATE,
      '-ar', String(AUDIO_SAMPLE_RATE),
      // The audio decides the length: a video stream that ends early is padded,
      // never the reverse.
      '-shortest',
      '-movflags', '+faststart',
      input.outputPath,
    ],
  }
}

/** True when there is something to mux. Without voice the video ships as it is. */
export function hasAudioToMux(captions: CaptionPlan | null, audioPath: string | null): boolean {
  return audioPath !== null && captions !== null
}
