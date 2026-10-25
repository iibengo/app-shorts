import { StoryError } from './errors'

/**
 * 014: how long an audio file really is.
 *
 * The estimate only writes the script. This measurement is what decides the
 * cut, and it comes from the file the provider actually produced, not from a
 * number in a response body.
 */
export interface AudioProbe {
  readonly durationSeconds: number
  readonly codecName: string | null
  readonly channels: number | null
}

interface ProbeStream {
  readonly codec_type?: string
  readonly codec_name?: string
  readonly channels?: number
}

interface ProbePayload {
  readonly streams?: readonly ProbeStream[]
  readonly format?: { readonly duration?: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the duration out of an ffprobe JSON payload.
 *
 * A missing or non-numeric duration is a failed synthesis, never a zero: a
 * zero-second segment would produce a cue that flashes and a video that claims
 * to have voice.
 */
export function parseAudioProbe(payload: unknown): AudioProbe {
  if (!isRecord(payload)) throw new StoryError('audio-invalid')

  const value = payload as ProbePayload
  const duration = Number(value.format?.duration)

  if (!Number.isFinite(duration) || duration <= 0) throw new StoryError('audio-invalid')

  const audioStream = value.streams?.find((stream) => stream.codec_type === 'audio') ?? null

  if (value.streams !== undefined && value.streams.length > 0 && audioStream === null) {
    // A file with streams but no audio track is not a narration track.
    throw new StoryError('audio-invalid')
  }

  return {
    durationSeconds: duration,
    codecName: audioStream?.codec_name ?? null,
    channels: typeof audioStream?.channels === 'number' ? audioStream.channels : null,
  }
}

/** Arguments for reading a duration. Kept here so the caller never rebuilds them. */
export function audioProbeArgs(filePath: string): readonly string[] {
  return [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,codec_name,channels',
    '-of', 'json',
    filePath,
  ]
}
