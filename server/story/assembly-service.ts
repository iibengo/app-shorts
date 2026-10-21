import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { MediaStorage } from '../fal/media-storage'
import { StoryError } from './errors'
import {
  FfmpegBinaryMissingError,
  FfmpegTimeoutError,
} from './ffmpeg-runner'
import type { FfmpegRunner } from './ffmpeg-runner'
import type { MediaDownloader, StoryClip } from './media-downloader'

const SCENE_DURATION_SECONDS = 6
const NORMALIZE_TIMEOUT_MS = 60_000
const CONCAT_TIMEOUT_MS = 120_000
const TOTAL_TIMEOUT_MS = 180_000
const MAX_OUTPUT_BYTES = 209_715_200
const LIFECYCLE_SECONDS = 86_400

const NORMALIZE_FILTER = 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=6'

export interface StoryAssemblyInput {
  readonly storyId: string
  readonly clips: readonly StoryClip[]
  readonly signal?: AbortSignal
}

export interface StoryAssemblyResult {
  readonly fileUrl: string
  readonly expiresAt: string
  readonly width: 720
  readonly height: 1280
  readonly durationSeconds: number
}

export interface StoryAssembler {
  assemble(input: StoryAssemblyInput): Promise<StoryAssemblyResult>
}

export interface StoryAssemblerOptions {
  readonly downloader: MediaDownloader
  readonly runner: FfmpegRunner
  readonly mediaStorage: MediaStorage
  readonly ffmpegPath?: string
  readonly ffprobePath?: string
}

export interface StoryAssemblerConfig {
  readonly normalizeTimeoutMs?: number
  readonly concatTimeoutMs?: number
  readonly totalTimeoutMs?: number
  readonly maxOutputBytes?: number
}

interface ProbeStream {
  readonly codec_type?: string
  readonly codec_name?: string
  readonly width?: number
  readonly height?: number
  readonly pix_fmt?: string
  readonly avg_frame_rate?: string
}

interface ProbeFormat {
  readonly duration?: string
}

interface ProbePayload {
  readonly streams?: readonly ProbeStream[]
  readonly format?: ProbeFormat
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProbePayload(value: unknown): ProbePayload {
  if (!isRecord(value)) {
    throw new StoryError('assembly-failed')
  }

  const streams = Array.isArray(value.streams)
    ? value.streams.filter(isRecord).map((stream) => ({
        codec_type: typeof stream.codec_type === 'string' ? stream.codec_type : undefined,
        codec_name: typeof stream.codec_name === 'string' ? stream.codec_name : undefined,
        width: typeof stream.width === 'number' ? stream.width : undefined,
        height: typeof stream.height === 'number' ? stream.height : undefined,
        pix_fmt: typeof stream.pix_fmt === 'string' ? stream.pix_fmt : undefined,
        avg_frame_rate: typeof stream.avg_frame_rate === 'string'
          ? stream.avg_frame_rate
          : undefined,
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

function parseFrameRate(value: string | undefined): number {
  if (!value) return 0

  const [numerator, denominator] = value.split('/').map(Number)

  if (!denominator) return Number(value)

  return numerator / denominator
}

function sanitizeStoryId(storyId: string): string {
  const cleaned = storyId.replace(/[^A-Za-z0-9]/g, '')

  return cleaned.length > 0 ? cleaned.slice(0, 32) : 'unknown'
}

export function hasFfmpegBinary(path: string | undefined): boolean {
  if (!path) return false
  if (path.includes('/') || path.includes('\\')) return existsSync(path)

  const pathValue = process.env.PATH

  if (!pathValue) return false

  return pathValue
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((directory) => directory.length > 0)
    .some((directory) => existsSync(join(directory, path)))
}

export class NativeStoryAssembler implements StoryAssembler {
  private readonly downloader: MediaDownloader
  private readonly runner: FfmpegRunner
  private readonly mediaStorage: MediaStorage
  private readonly ffmpegPath: string
  private readonly ffprobePath: string
  private readonly normalizeTimeoutMs: number
  private readonly concatTimeoutMs: number
  private readonly totalTimeoutMs: number
  private readonly maxOutputBytes: number

  constructor(options: StoryAssemblerOptions, config: StoryAssemblerConfig = {}) {
    this.downloader = options.downloader
    this.runner = options.runner
    this.mediaStorage = options.mediaStorage
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.ffprobePath = options.ffprobePath ?? 'ffprobe'
    this.normalizeTimeoutMs = config.normalizeTimeoutMs ?? NORMALIZE_TIMEOUT_MS
    this.concatTimeoutMs = config.concatTimeoutMs ?? CONCAT_TIMEOUT_MS
    this.totalTimeoutMs = config.totalTimeoutMs ?? TOTAL_TIMEOUT_MS
    this.maxOutputBytes = config.maxOutputBytes ?? MAX_OUTPUT_BYTES
  }

  async assemble(input: StoryAssemblyInput): Promise<StoryAssemblyResult> {
    const expectedDuration = input.clips.length * SCENE_DURATION_SECONDS
    const controller = new AbortController()
    let totalTimedOut = false
    const timer = setTimeout(() => {
      totalTimedOut = true
      controller.abort()
    }, this.totalTimeoutMs)
    const onAbort = (): void => controller.abort()

    input.signal?.addEventListener('abort', onAbort, { once: true })

    let directory: string | null = null

    try {
      directory = await mkdtemp(join(tmpdir(), 'ai-shorts-story-'))
      const ordered = input.clips
        .slice()
        .sort((a, b) => a.order - b.order)

      if (
        ordered.length === 0
        || ordered.some((clip, index) => clip.order !== index + 1)
      ) {
        throw new StoryError('assembly-failed')
      }

      const downloaded = await this.downloader.download(
        ordered,
        directory,
        controller.signal,
      )
      const normalized: string[] = []

      for (const clip of downloaded) {
        const output = join(directory, `scene-normalized-${clip.order}.mp4`)

        await this.runFfmpeg(
          [
            '-nostdin',
            '-y',
            '-i',
            clip.path,
            '-t',
            String(SCENE_DURATION_SECONDS),
            '-vf',
            NORMALIZE_FILTER,
            '-an',
            '-c:v',
            'libx264',
            '-crf',
            '20',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-map_metadata',
            '-1',
            '-movflags',
            '+faststart',
            output,
          ],
          directory,
          this.normalizeTimeoutMs,
          controller.signal,
        )

        await unlink(clip.path).catch(() => undefined)
        normalized.push(output)
      }

      const listPath = join(directory, 'list.txt')
      const listContent = normalized
        .map((file) => `file '${basename(file)}'`)
        .join('\n')

      await writeFile(listPath, `${listContent}\n`, 'utf8')

      const finalPath = join(directory, 'story-final.mp4')

      await this.runFfmpeg(
        [
          '-nostdin',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          finalPath,
        ],
        directory,
        this.concatTimeoutMs,
        controller.signal,
      )

      const duration = await this.probeAndVerify(finalPath, expectedDuration)
      const finalStat = await stat(finalPath)

      if (finalStat.size > this.maxOutputBytes) {
        throw new StoryError('assembly-failed')
      }

      const upload = await this.mediaStorage.uploadFile({
        filePath: finalPath,
        fileName: `story-${sanitizeStoryId(input.storyId)}-${randomBytes(6).toString('hex')}.mp4`,
        contentType: 'video/mp4',
        lifecycleSeconds: LIFECYCLE_SECONDS,
      })

      return {
        fileUrl: upload.fileUrl,
        expiresAt: upload.expiresAt,
        width: 720,
        height: 1280,
        durationSeconds: duration,
      }
    } catch (error) {
      if (error instanceof StoryError) {
        throw error
      }

      if (error instanceof FfmpegBinaryMissingError) {
        throw new StoryError('ffmpeg-not-configured')
      }

      if (error instanceof FfmpegTimeoutError || totalTimedOut) {
        throw new StoryError('assembly-timeout')
      }

      throw new StoryError('assembly-failed')
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', onAbort)

      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  private async runFfmpeg(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      throw new StoryError('assembly-timeout')
    }

    const result = await this.runner.run({
      binary: this.ffmpegPath,
      args,
      cwd,
      timeoutMs,
      signal,
    })

    if (result.code !== 0) {
      throw new StoryError('assembly-failed')
    }
  }

  private async probeAndVerify(
    filePath: string,
    expectedDuration: number,
  ): Promise<number> {
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
      cwd: dirname(filePath),
      timeoutMs: 30_000,
    })

    if (result.code !== 0) {
      throw new StoryError('assembly-failed')
    }

    let payload: unknown

    try {
      payload = JSON.parse(result.stdout.length > 0 ? result.stdout : '{}')
    } catch {
      throw new StoryError('assembly-failed')
    }

    const probe = parseProbePayload(payload)
    const streams = probe.streams ?? []
    const video = streams.filter((stream) => stream.codec_type === 'video')
    const extra = streams.filter((stream) => stream.codec_type !== 'video')

    if (video.length !== 1 || extra.length > 0) {
      throw new StoryError('assembly-failed')
    }

    const stream = video[0]!

    if (
      stream.codec_name !== 'h264'
      || stream.width !== 720
      || stream.height !== 1280
      || stream.pix_fmt !== 'yuv420p'
      || Math.abs(parseFrameRate(stream.avg_frame_rate) - 30) > 0.01
    ) {
      throw new StoryError('assembly-failed')
    }

    const duration = Number(probe.format?.duration)

    if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.3) {
      throw new StoryError('assembly-failed')
    }

    return duration
  }
}

export function createStoryAssembler(
  options: StoryAssemblerOptions,
  config: StoryAssemblerConfig = {},
): StoryAssembler {
  return new NativeStoryAssembler(options, config)
}

export type { StoryClip }
