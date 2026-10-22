import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StoryQCErrorCode, StoryQCIssueCode } from '~/models/story'
import type { MediaStorage } from '../fal/media-storage'
import { assertFalMediaUrl } from '../fal/types'
import {
  FfmpegBinaryMissingError,
  FfmpegTimeoutError,
} from './ffmpeg-runner'
import type { FfmpegRunner } from './ffmpeg-runner'
import type { MediaDownloader } from './media-downloader'
import type { QCFrameStrip, StoryFrameExtractor } from './qc-types'

const SCENE_FRAME_WIDTH = 360
const SCENE_FRAME_HEIGHT = 640
const STRIP_LIFECYCLE_SECONDS = 86_400
const EXTRACTION_TIMEOUT_MS = 20_000
const PROBE_TIMEOUT_MS = 15_000
const MIN_CLIP_DURATION_SECONDS = 5.5
const MIN_CLIP_HEIGHT = 720
const ASPECT_RATIO = 9 / 16
// The assembler normalizes with scale+crop, so near-vertical provider outputs
// such as 768x1422 (ratio 0.5399) are usable. Keep blocking only for clearly
// non-vertical clips (horizontal or square).
const ASPECT_TOLERANCE = 0.06

export class QCFramesGlobalError extends Error {
  readonly code: Extract<StoryQCErrorCode, 'qc-frames-failed' | 'ffmpeg-not-configured'>

  constructor(code: Extract<StoryQCErrorCode, 'qc-frames-failed' | 'ffmpeg-not-configured'>) {
    super(code)
    this.name = 'QCFramesGlobalError'
    this.code = code
  }
}

export interface StoryFrameExtractorOptions {
  readonly downloader: MediaDownloader
  readonly runner: FfmpegRunner
  readonly mediaStorage: MediaStorage
  readonly ffmpegPath?: string
  readonly ffprobePath?: string
  readonly now?: () => number
}

interface ProbeStream {
  readonly codec_type?: string
  readonly codec_name?: string
  readonly width?: number
  readonly height?: number
}

interface ProbePayload {
  readonly streams?: readonly ProbeStream[]
  readonly format?: { readonly duration?: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProbe(value: unknown): ProbePayload {
  if (!isRecord(value)) return {}

  const streams = Array.isArray(value.streams)
    ? value.streams.filter(isRecord).map((stream) => ({
        codec_type: typeof stream.codec_type === 'string' ? stream.codec_type : undefined,
        codec_name: typeof stream.codec_name === 'string' ? stream.codec_name : undefined,
        width: typeof stream.width === 'number' ? stream.width : undefined,
        height: typeof stream.height === 'number' ? stream.height : undefined,
      }))
    : undefined

  const format = isRecord(value.format)
    ? {
        duration: typeof value.format.duration === 'string'
          ? value.format.duration
          : undefined,
      }
    : undefined

  return { streams, format }
}

function sanitizeStoryId(storyId: string): string {
  const cleaned = storyId.replace(/[^A-Za-z0-9]/g, '')

  return cleaned.length > 0 ? cleaned.slice(0, 32) : 'unknown'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function frameTimestamps(durationSeconds: number): readonly [number, number, number] {
  return [
    0,
    round2(Math.min(2.9, durationSeconds / 2)),
    round2(Math.max(0, Math.min(5.9, durationSeconds - 0.15))),
  ]
}

export function verifyClipTechnical(input: {
  readonly streams: readonly ProbeStream[]
  readonly durationSeconds: number
}): readonly StoryQCIssueCode[] {
  const issues: StoryQCIssueCode[] = []
  const streams = input.streams ?? []
  const videos = streams.filter((stream) => stream.codec_type === 'video')
  const audio = streams.filter((stream) => stream.codec_type === 'audio')
  const subtitles = streams.filter((stream) => stream.codec_type === 'subtitle')

  if (
    videos.length !== 1
    || audio.length > 0
    || subtitles.length > 0
    || !['h264', 'hevc'].includes(videos[0]?.codec_name ?? '')
  ) {
    issues.push('technical-streams')
  }

  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < MIN_CLIP_DURATION_SECONDS) {
    issues.push('technical-duration')
  }

  const video = videos[0]

  if (video && (video.width === undefined || video.height === undefined)) {
    issues.push('technical-resolution')
  } else if (video) {
    if ((video.height ?? 0) < MIN_CLIP_HEIGHT) {
      issues.push('technical-resolution')
    }

    const ratio = (video.width ?? 0) / (video.height ?? 1)

    if (Math.abs(ratio - ASPECT_RATIO) > ASPECT_RATIO * ASPECT_TOLERANCE) {
      issues.push('technical-aspect')
    }
  }

  return issues
}

export class NativeStoryFrameExtractor implements StoryFrameExtractor {
  private readonly downloader: MediaDownloader
  private readonly runner: FfmpegRunner
  private readonly mediaStorage: MediaStorage
  private readonly ffmpegPath: string
  private readonly ffprobePath: string
  private readonly now: () => number

  constructor(options: StoryFrameExtractorOptions) {
    this.downloader = options.downloader
    this.runner = options.runner
    this.mediaStorage = options.mediaStorage
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.ffprobePath = options.ffprobePath ?? 'ffprobe'
    this.now = options.now ?? Date.now
  }

  async extract(input: Parameters<StoryFrameExtractor['extract']>[0]): Promise<readonly QCFrameStrip[]> {
    const signal = input.signal
    let directory: string

    try {
      directory = await mkdtemp(join(tmpdir(), 'ai-shorts-story-qc-'))
    } catch {
      throw new QCFramesGlobalError('qc-frames-failed')
    }

    try {
      const strips: QCFrameStrip[] = []
      let technicallyPassing = 0
      let produced = 0
      const ordered = input.clips.slice().sort((a, b) => a.order - b.order)

      for (const [index, clip] of ordered.entries()) {
        if (signal?.aborted) {
          throw new QCFramesGlobalError('qc-frames-failed')
        }

        let filePath: string | null = null

        try {
          try {
            const downloaded = await this.downloader.download(
              [{ order: clip.order, url: clip.url }],
              directory,
              signal,
            )
            filePath = downloaded[0]?.path ?? null
          } catch {
            if (index === 0) {
              throw new QCFramesGlobalError('qc-frames-failed')
            }

            strips.push({
              sceneId: clip.sceneId,
              order: clip.order,
              filePath: '',
              durationSeconds: 0,
              technical: [],
              framesUrl: null,
            })
            continue
          }

          if (filePath === null) {
            strips.push({
              sceneId: clip.sceneId,
              order: clip.order,
              filePath: '',
              durationSeconds: 0,
              technical: [],
              framesUrl: null,
            })
            continue
          }

          const probe = await this.probe(filePath, directory, signal)
          const technical = verifyClipTechnical(probe)

          if (technical.length > 0) {
            strips.push({
              sceneId: clip.sceneId,
              order: clip.order,
              filePath,
              durationSeconds: probe.durationSeconds,
              technical,
              framesUrl: null,
            })
            continue
          }

          technicallyPassing += 1

          const strip = await this.extractStrip(
            clip,
            filePath,
            directory,
            probe.durationSeconds,
            signal,
          )

          if (strip === null) {
            strips.push({
              sceneId: clip.sceneId,
              order: clip.order,
              filePath,
              durationSeconds: probe.durationSeconds,
              technical: [],
              framesUrl: null,
            })
            continue
          }

          produced += 1
          strips.push({
            sceneId: clip.sceneId,
            order: clip.order,
            filePath: strip.filePath,
            durationSeconds: probe.durationSeconds,
            technical: [],
            framesUrl: strip.framesUrl,
          })
        } catch (error) {
          if (error instanceof QCFramesGlobalError) {
            throw error
          }

          if (error instanceof FfmpegBinaryMissingError) {
            throw new QCFramesGlobalError('ffmpeg-not-configured')
          }

          strips.push({
            sceneId: clip.sceneId,
            order: clip.order,
            filePath: filePath ?? '',
            durationSeconds: 0,
            technical: [],
            framesUrl: null,
          })
        } finally {
          if (filePath !== null) {
            await unlink(filePath).catch(() => undefined)
          }
        }
      }

      if (technicallyPassing > 0 && produced === 0) {
        throw new QCFramesGlobalError('qc-frames-failed')
      }

      return strips
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async probe(
    filePath: string,
    directory: string,
    signal?: AbortSignal,
  ): Promise<{ readonly streams: readonly ProbeStream[]; readonly durationSeconds: number }> {
    const result = await this.runner.run({
      binary: this.ffprobePath,
      args: [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        filePath,
      ],
      cwd: directory,
      timeoutMs: PROBE_TIMEOUT_MS,
      ...(signal === undefined ? {} : { signal }),
    })

    if (result.code !== 0) {
      throw new Error('probe-failed')
    }

    let payload: unknown

    try {
      payload = JSON.parse(result.stdout.length > 0 ? result.stdout : '{}')
    } catch {
      throw new Error('probe-failed')
    }

    const probe = parseProbe(payload)
    const rawDuration = Number(probe.format?.duration)

    return {
      streams: probe.streams ?? [],
      durationSeconds: Number.isFinite(rawDuration) ? rawDuration : 0,
    }
  }

  private async extractStrip(
    clip: { readonly sceneId: string; readonly order: number },
    clipPath: string,
    directory: string,
    durationSeconds: number,
    signal?: AbortSignal,
  ): Promise<{ readonly filePath: string; readonly framesUrl: string | null } | null> {
    const timestamps = frameTimestamps(durationSeconds)
    const stripPath = join(directory, `scene-qc-${clip.order}.jpg`)
    const scale = (index: number): string =>
      `[${index}:v]scale=${SCENE_FRAME_WIDTH}:${SCENE_FRAME_HEIGHT}:`
      + `force_original_aspect_ratio=increase,`
      + `crop=${SCENE_FRAME_WIDTH}:${SCENE_FRAME_HEIGHT},setsar=1[v${index}]`
    const filter = [
      scale(0),
      scale(1),
      scale(2),
      '[v0][v1][v2]hstack=inputs=3[out]',
    ].join(';')

    let result

    try {
      result = await this.runner.run({
        binary: this.ffmpegPath,
        args: [
          '-nostdin',
          '-y',
          '-ss',
          String(timestamps[0]),
          '-i',
          clipPath,
          '-ss',
          String(timestamps[1]),
          '-i',
          clipPath,
          '-ss',
          String(timestamps[2]),
          '-i',
          clipPath,
          '-filter_complex',
          filter,
          '-map',
          '[out]',
          '-frames:v',
          '1',
          '-q:v',
          '3',
          '-an',
          stripPath,
        ],
        cwd: directory,
        timeoutMs: EXTRACTION_TIMEOUT_MS,
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (error instanceof FfmpegBinaryMissingError) throw error
      if (error instanceof FfmpegTimeoutError) return null

      return null
    }

    if (result.code !== 0) return null

    try {
      const upload = await this.mediaStorage.uploadFile({
        filePath: stripPath,
        fileName: `story-qc-${sanitizeStoryId(clip.sceneId)}-${clip.order}-${randomBytes(6).toString('hex')}.jpg`,
        contentType: 'image/jpeg',
        lifecycleSeconds: STRIP_LIFECYCLE_SECONDS,
      })

      return { filePath: stripPath, framesUrl: assertFalMediaUrl(upload.fileUrl) }
    } catch {
      return { filePath: stripPath, framesUrl: null }
    }
  }
}

export function createStoryFrameExtractor(
  options: StoryFrameExtractorOptions,
): StoryFrameExtractor {
  return new NativeStoryFrameExtractor(options)
}
