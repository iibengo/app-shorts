import { FfmpegBinaryMissingError, FfmpegTimeoutError, type FfmpegRunner } from './ffmpeg-runner'
import { looksLikeStackedPanels, type PixelSample } from './frame-layout'

/** Small enough to decode in milliseconds, big enough to see a seam. */
const SAMPLE_WIDTH = 32
const SAMPLE_HEIGHT = 96
const SAMPLE_TIMEOUT_MS = 8_000
const EXPECTED_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT

/**
 * Reports whether a keyframe is a single frame or several stacked panels. A
 * split frame is unusable because the video stage would animate every panel.
 *
 * Fails open on purpose: an undecodable image or a missing ffmpeg accepts the
 * keyframe, because rejecting a paid image by mistake costs more than the rare
 * split frame that slips through.
 */
export interface KeyframeLayoutInspector {
  isSplitFrame(keyframeUrl: string): Promise<boolean>
}

export class FfmpegKeyframeLayoutInspector implements KeyframeLayoutInspector {
  constructor(
    private readonly runner: FfmpegRunner,
    private readonly ffmpegPath: string,
    private readonly workdir: string,
  ) {}

  async isSplitFrame(keyframeUrl: string): Promise<boolean> {
    try {
      const sample = await this.sample(keyframeUrl)

      return sample === null ? false : looksLikeStackedPanels(sample)
    } catch (error) {
      if (error instanceof FfmpegBinaryMissingError || error instanceof FfmpegTimeoutError) {
        return false
      }

      return false
    }
  }

  private async sample(keyframeUrl: string): Promise<PixelSample | null> {
    // A temp file is written instead of piping: the runner collects stdout as
    // UTF-8 text, and raw luma bytes are not text-safe.
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(join(tmpdir(), 'keyframe-layout-'))

    try {
      const output = join(directory, 'sample.gray')
      const result = await this.runner.run({
        binary: this.ffmpegPath,
        args: [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          keyframeUrl,
          '-frames:v',
          '1',
          '-vf',
          `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT},format=gray`,
          '-f',
          'rawvideo',
          output,
        ],
        cwd: directory,
        timeoutMs: SAMPLE_TIMEOUT_MS,
      })

      if (result.code !== 0) return null

      const buffer = await readFile(output)

      if (buffer.length < EXPECTED_BYTES) return null

      const luma: number[] = []

      for (let index = 0; index < EXPECTED_BYTES; index += 1) luma.push(buffer[index] ?? 0)

      return { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, luma }
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
