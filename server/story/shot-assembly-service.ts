import { randomBytes } from 'node:crypto'
import { mkdtemp, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { MediaStorage } from '../fal/media-storage'
import { StoryError } from './errors'
import { FfmpegBinaryMissingError, FfmpegTimeoutError } from './ffmpeg-runner'
import type { FfmpegRunner } from './ffmpeg-runner'
import type { MediaDownloader } from './media-downloader'

const NORMALIZE_TIMEOUT_MS = 30_000
const CONCAT_TIMEOUT_MS = 240_000
const TOTAL_TIMEOUT_MS = 420_000
const MAX_OUTPUT_BYTES = 209_715_200
const LIFECYCLE_SECONDS = 86_400

export interface ShotAssemblyClip {
  readonly order: number
  readonly url: string
  readonly durationSeconds: number
}

export interface ShotAssemblyInput {
  readonly storyId: string
  readonly clips: readonly ShotAssemblyClip[]
  readonly plannedDurationSeconds: number
  readonly maxDurationSeconds: number
  /** 015: the plan the overlays are derived from, when graphics are enabled. */
  readonly graphicsPlan?: StoryPlan | null
  readonly signal?: AbortSignal
}

export interface ShotAssemblyResult {
  readonly fileUrl: string
  /** 015: overlays actually painted, empty when none or when they failed. */
  readonly graphics: readonly StoryGraphic[]
  readonly expiresAt: string
  readonly width: 720
  readonly height: 1280
  readonly durationSeconds: number
}

export interface ShotAssembler {
  assemble(input: ShotAssemblyInput): Promise<ShotAssemblyResult>
}

/**
 * 015: paints overlays on the assembled video before it is uploaded, so the
 * whole overlay pass costs one encode and no extra download. Optional on
 * purpose: without it the assembler behaves exactly as before.
 */
export interface GraphicsPainter {
  paint(input: {
    readonly inputPath: string
    readonly outputPath: string
    readonly totalDurationSeconds: number
    readonly width: number
    readonly height: number
    readonly plan: StoryPlan | null | undefined
  }): Promise<{ readonly painted: boolean; readonly graphics: readonly StoryGraphic[] }>
}

export interface ShotAssemblerOptions {
  readonly downloader: MediaDownloader
  readonly runner: FfmpegRunner
  readonly mediaStorage: MediaStorage
  readonly ffmpegPath?: string
  readonly ffprobePath?: string
  /** 015: optional overlay pass on the final video. */
  readonly graphics?: GraphicsPainter | null
}

export interface ShotAssemblerConfig {
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

interface ProbePayload {
  readonly streams?: readonly ProbeStream[]
  readonly format?: { readonly duration?: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProbePayload(value: unknown): ProbePayload {
  if (!isRecord(value)) throw new StoryError('assembly-failed')

  return {
    streams: Array.isArray(value.streams)
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
      : undefined,
    format: isRecord(value.format)
      ? { duration: typeof value.format.duration === 'string' ? value.format.duration : undefined }
      : undefined,
  }
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

function normalizeFilter(): string {
  return 'scale=720:1280:force_original_aspect_ratio=increase,'
    + 'crop=720:1280,setsar=1,fps=30'
}

export class NativeShotAssembler implements ShotAssembler {
  private readonly downloader: MediaDownloader
  private readonly runner: FfmpegRunner
  private readonly mediaStorage: MediaStorage
  private readonly ffmpegPath: string
  private readonly ffprobePath: string
  private readonly normalizeTimeoutMs: number
  private readonly concatTimeoutMs: number
  private readonly totalTimeoutMs: number
  private readonly maxOutputBytes: number
  /**
   * 015: declared as an option but never assigned, so overlays were silently
   * skipped on every story. The field existed, the code that used it existed,
   * and the painter was never reached.
   */
  private readonly graphics: GraphicsPainter | null
  /** Which step is running, so a failure can name it. */
  private stage: string = 'start'
  /** Why the overlay pass gave up, kept so the fallback names it. */
  private paintFailure: string | null = null

  constructor(options: ShotAssemblerOptions, config: ShotAssemblerConfig = {}) {
    this.downloader = options.downloader
    this.runner = options.runner
    this.mediaStorage = options.mediaStorage
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.ffprobePath = options.ffprobePath ?? 'ffprobe'
    this.normalizeTimeoutMs = config.normalizeTimeoutMs ?? NORMALIZE_TIMEOUT_MS
    this.concatTimeoutMs = config.concatTimeoutMs ?? CONCAT_TIMEOUT_MS
    this.totalTimeoutMs = config.totalTimeoutMs ?? TOTAL_TIMEOUT_MS
    this.maxOutputBytes = config.maxOutputBytes ?? MAX_OUTPUT_BYTES
    this.graphics = options.graphics ?? null
  }

  async assemble(input: ShotAssemblyInput): Promise<ShotAssemblyResult> {
    const ordered = input.clips.slice().sort((a, b) => a.order - b.order)
    const expectedDuration = ordered.reduce(
      (total, clip) => total + clip.durationSeconds,
      0,
    )

    if (
      ordered.length === 0
      || ordered.some((clip, index) => clip.order !== index + 1)
      || expectedDuration !== input.plannedDurationSeconds
      || expectedDuration > input.maxDurationSeconds
      || ordered.some((clip) => clip.durationSeconds < 2 || clip.durationSeconds > 6)
    ) {
      // A bare "assembly-failed" cost an hour of guessing where the problem
      // was. The code stays stable for the client; the detail goes in the
      // message so it reaches the log.
      throw new StoryError('assembly-failed', {
        detail: ordered.length === 0
          ? 'no-clips'
          : expectedDuration !== input.plannedDurationSeconds
            ? `total-${expectedDuration}-vs-${input.plannedDurationSeconds}`
            : 'clip-out-of-range',
      })
    }

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
      directory = await mkdtemp(join(tmpdir(), 'ai-shorts-shot-'))
      this.stage = 'download'
      const downloaded = await this.downloader.download(
        ordered.map((clip) => ({ order: clip.order, url: clip.url })),
        directory,
        controller.signal,
      )
      this.stage = 'normalize'
      const normalized: string[] = []

      for (const clip of downloaded) {
        const duration = ordered[clip.order - 1]!.durationSeconds
        const output = join(directory, `shot-normalized-${clip.order}.mp4`)

        await this.runFfmpeg([
          '-nostdin',
          '-y',
          '-i',
          clip.path,
          '-t',
          String(duration),
          '-vf',
          normalizeFilter(),
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
        ], directory, this.normalizeTimeoutMs, controller.signal)

        // Per clip the margin stays tight: a normalised clip must land on the
        // duration this pipeline asked for.
        await this.probeAndVerify(output, duration, 0.1)
        await unlink(clip.path).catch(() => undefined)
        normalized.push(output)
      }

      this.stage = 'concat'
      const listPath = join(directory, 'list.txt')
      await writeFile(
        listPath,
        `${normalized.map((file) => `file '${basename(file)}'`).join('\n')}\n`,
        'utf8',
      )
      const finalPath = join(directory, 'story-final.mp4')

      await this.runFfmpeg([
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
      ], directory, this.concatTimeoutMs, controller.signal)

      this.stage = 'verify'
      let outputPath = finalPath
      let paintedGraphics: readonly StoryGraphic[] = []
      // 016: the tolerance grows with the number of clips. A tenth of a second
      // is right for one clip and absurd for twelve: per-clip rounding added up
      // and a valid 30 second video was rejected. Capped so a real mismatch
      // still fails.
      const totalTolerance = Math.min(1, ordered.length * 0.05)
      let duration = await this.probeAndVerify(finalPath, expectedDuration, totalTolerance)

      // 015: overlays are painted here, after concatenation and before upload.
      // A failure of the overlay pass is not a failure of the video: the
      // assembled file is still valid and still gets uploaded.
      if (this.graphics !== null && this.graphics !== undefined) {
        try {
          const painted = await this.graphics.paint({
            inputPath: finalPath,
            outputPath: join(directory, 'story-final-graphics.mp4'),
            totalDurationSeconds: duration,
            width: 720,
            height: 1280,
            plan: input.graphicsPlan,
          })

          // Server-only trace: without it, a painter that silently declines is
          // indistinguishable from one that never runs.
          this.stage = painted.painted ? 'painted' : 'paint-declined'

          if (painted.painted) {
            const paintedPath = join(directory, 'story-final-graphics.mp4')

            duration = await this.probeAndVerify(paintedPath, expectedDuration, totalTolerance)
            outputPath = paintedPath
            paintedGraphics = painted.graphics
          }
        } catch (error) {
          // Declared degradation: the video ships without overlays. The reason
          // is kept and rethrown only if the un-painted file is also bad, so a
          // silent swallow never hides the real cause again.
          this.paintFailure = error instanceof StoryError
            ? `${error.code}${error.detail === undefined ? '' : `:${error.detail}`}`
            : (error instanceof Error ? error.message.slice(0, 120) : 'unknown')
          this.stage = 'paint-degraded'
        }
      }

      const finalStat = await stat(outputPath)

      if (finalStat.size > this.maxOutputBytes) {
        throw new StoryError('assembly-failed', { detail: `too-large-${finalStat.size}` })
      }

      const upload = await this.mediaStorage.uploadFile({
        filePath: outputPath,
        fileName: `story-${sanitizeStoryId(input.storyId)}-${randomBytes(6).toString('hex')}.mp4`,
        contentType: 'video/mp4',
        lifecycleSeconds: LIFECYCLE_SECONDS,
      })

      return {
        fileUrl: upload.fileUrl,
        graphics: paintedGraphics,
        expiresAt: upload.expiresAt,
        width: 720,
        height: 1280,
        durationSeconds: duration,
      }
    } catch (error) {
      if (error instanceof StoryError) throw error
      if (error instanceof FfmpegBinaryMissingError) {
        throw new StoryError('ffmpeg-not-configured')
      }
      if (error instanceof FfmpegTimeoutError || totalTimedOut) {
        throw new StoryError('assembly-timeout')
      }

      const paintNote = this.paintFailure === null ? '' : ` paint=${this.paintFailure}`
      throw new StoryError('assembly-failed', {
        detail: `stage=${this.stage}${paintNote} ${error instanceof Error ? error.message.slice(0, 100) : 'unknown'}`.replace(/\s+/g, ' '),
      })
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', onAbort)

      // Set SHOT_ASSEMBLY_KEEP_DIR=1 to keep the work directory for a manual
      // inspection: the uploaded file is the only thing that survives.
      if (directory && process.env.SHOT_ASSEMBLY_KEEP_DIR !== '1') {
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
    if (signal.aborted) throw new StoryError('assembly-timeout')

    const result = await this.runner.run({
      binary: this.ffmpegPath,
      args,
      cwd,
      timeoutMs,
      signal,
    })

    if (result.code !== 0) {
      // The stderr is the only thing that says what FFmpeg disliked.
      throw new StoryError('assembly-failed', {
        detail: `ffmpeg-${result.code}-${result.stderr.slice(0, 100)}`.replace(/\s+/g, ' '),
      })
    }
  }

  private async probeAndVerify(
    filePath: string,
    expectedDuration: number,
    toleranceSeconds: number,
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
      throw new StoryError('assembly-failed', {
        detail: `${binary}-code-${result.code}`.replace(/\s+/g, '-').slice(0, 80),
      })
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
      throw new StoryError('assembly-failed', {
        detail: `streams-video-${video.length}-extra-${extra.length}${extra.map((stream) => `-${stream.codec_type}`).join('')}`,
      })
    }

    const stream = video[0]!

    if (
      stream.codec_name !== 'h264'
      || stream.width !== 720
      || stream.height !== 1280
      || stream.pix_fmt !== 'yuv420p'
      || Math.abs(parseFrameRate(stream.avg_frame_rate) - 30) > 0.01
    ) {
      throw new StoryError('assembly-failed', {
        detail: `format-${stream.codec_name}-${stream.width}x${stream.height}-${stream.pix_fmt}-${stream.avg_frame_rate}`,
      })
    }

    const duration = Number(probe.format?.duration)

    if (
      !Number.isFinite(duration)
      || Math.abs(duration - expectedDuration) > toleranceSeconds
    ) {
      throw new StoryError('assembly-failed', {
        detail: `duration-${duration}-expected-${expectedDuration}-tol-${toleranceSeconds}`,
      })
    }

    return duration
  }
}

export function createShotAssembler(
  options: ShotAssemblerOptions,
  config: ShotAssemblerConfig = {},
): ShotAssembler {
  return new NativeShotAssembler(options, config)
}
