import { FfmpegBinaryMissingError, FfmpegTimeoutError, type FfmpegRunner } from './ffmpeg-runner'
import { looksLikeTextInFrame, type PixelSample } from './text-in-frame'

/**
 * 128x384, not the 32x96 used for the split-frame check: at that size every
 * facet edge of a low-poly render reads as a glyph and the detector marks clean
 * scenes as captioned. Measured on real output before choosing this size.
 */
const SAMPLE_WIDTH = 128
const SAMPLE_HEIGHT = 384
const SAMPLE_TIMEOUT_MS = 8_000
const EXPECTED_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT

/**
 * Reports whether a keyframe carries legible text. A caption or a headline is
 * burned into the frame and the video would animate it, so it is rejected
 * before the video is paid, exactly like a split frame.
 *
 * Fails open: an undecodable image or a missing ffmpeg accepts the keyframe,
 * because discarding a paid image by mistake is worse than a missed caption.
 */
export interface KeyframeTextInspector {
  readonly hasText: (keyframeUrl: string) => Promise<boolean>
}

export class FfmpegKeyframeTextInspector implements KeyframeTextInspector {
  constructor(
    private readonly runner: FfmpegRunner,
    private readonly ffmpegPath: string,
  ) {}

  async hasText(keyframeUrl: string): Promise<boolean> {
    try {
      const sample = await this.sample(keyframeUrl)

      return sample === null ? false : looksLikeTextInFrame(sample)
    } catch (error) {
      if (error instanceof FfmpegBinaryMissingError || error instanceof FfmpegTimeoutError) {
        return false
      }

      return false
    }
  }

  private async sample(keyframeUrl: string): Promise<PixelSample | null> {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(join(tmpdir(), 'keyframe-text-'))

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
