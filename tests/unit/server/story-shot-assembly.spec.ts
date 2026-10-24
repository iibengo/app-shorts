// @vitest-environment node
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MediaDownloader, DownloadedClip } from '../../../server/story/media-downloader'
import type { FfmpegRunOptions, FfmpegRunResult, FfmpegRunner } from '../../../server/story/ffmpeg-runner'
import type { MediaStorage, MediaStorageUploadInput } from '../../../server/fal/media-storage'
import { NativeShotAssembler } from '../../../server/story/shot-assembly-service'

class Runner implements FfmpegRunner {
  readonly calls: FfmpegRunOptions[] = []
  probeDuration = 15
  normalizedDurations: readonly number[] = [3, 2, 4, 6]

  async run(options: FfmpegRunOptions): Promise<FfmpegRunResult> {
    this.calls.push(options)

    if (options.binary === 'ffprobe') {
      const file = options.args[options.args.length - 1] ?? ''
      const match = file.match(/shot-normalized-(\d+)\.mp4$/)
      const duration = match
        ? this.normalizedDurations[Number(match[1]) - 1] ?? this.probeDuration
        : this.probeDuration

      return {
        code: 0,
        stdout: JSON.stringify({
          streams: [{
            codec_type: 'video',
            codec_name: 'h264',
            width: 720,
            height: 1280,
            pix_fmt: 'yuv420p',
            avg_frame_rate: '30/1',
          }],
          format: { duration: String(duration) },
        }),
        stderr: '',
      }
    }

    const output = options.args[options.args.length - 1]!
    await writeFile(output, Buffer.alloc(16, 1))
    return { code: 0, stdout: '', stderr: '' }
  }
}

class Downloader implements MediaDownloader {
  async download(
    clips: readonly { readonly order: number; readonly url: string }[],
    directory: string,
  ): Promise<readonly DownloadedClip[]> {
    return Promise.all(clips.map(async (clip) => {
      const path = join(directory, `scene-${clip.order}.mp4`)
      await writeFile(path, 'clip')
      return { order: clip.order, path }
    }))
  }
}

function storage(): { readonly storage: MediaStorage; readonly uploads: MediaStorageUploadInput[] } {
  const uploads: MediaStorageUploadInput[] = []

  return {
    uploads,
    storage: {
      async uploadFile(input) {
        uploads.push(input)
        return {
          fileUrl: 'https://v3.fal.media/files/test/shot-final.mp4',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }
      },
    },
  }
}

function setup() {
  const runner = new Runner()
  const media = storage()
  const assembler = new NativeShotAssembler({
    downloader: new Downloader(),
    runner,
    mediaStorage: media.storage,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
  })

  return { runner, media, assembler }
}

describe('shot assembly', () => {
  it('normalizes every clip to its own duration and concatenates to the planned total', async () => {
    const { runner, media, assembler } = setup()
    const result = await assembler.assemble({
      storyId: 'story-1',
      clips: [
        { order: 1, url: 'https://v3.fal.media/files/test/1.mp4', durationSeconds: 3 },
        { order: 2, url: 'https://v3.fal.media/files/test/2.mp4', durationSeconds: 2 },
        { order: 3, url: 'https://v3.fal.media/files/test/3.mp4', durationSeconds: 4 },
        { order: 4, url: 'https://v3.fal.media/files/test/4.mp4', durationSeconds: 6 },
      ],
      plannedDurationSeconds: 15,
      maxDurationSeconds: 15,
    })

    expect(result).toMatchObject({
      fileUrl: 'https://v3.fal.media/files/test/shot-final.mp4',
      width: 720,
      height: 1280,
      durationSeconds: 15,
    })
    const normalizeCalls = runner.calls.filter((call) => call.binary === 'ffmpeg')
    expect(normalizeCalls).toHaveLength(5)
    expect(normalizeCalls[0]?.args.join(' ')).toContain('-t 3')
    expect(normalizeCalls[0]?.args.join(' ')).not.toContain('tpad')
    expect(normalizeCalls[1]?.args.join(' ')).toContain('-t 2')
    expect(normalizeCalls[3]?.args.join(' ')).toContain('-t 6')
    expect(normalizeCalls[0]?.args).toContain('-an')
    expect(normalizeCalls[4]?.args).toContain('concat')
    expect(normalizeCalls[0]?.timeoutMs).toBe(30_000)
    expect(normalizeCalls[4]?.timeoutMs).toBe(240_000)
    expect(media.uploads).toHaveLength(1)
    expect(media.uploads[0]?.contentType).toBe('video/mp4')
  })

  it('rejects a plan over the max before downloading or running FFmpeg', async () => {
    const { runner, assembler } = setup()

    await expect(assembler.assemble({
      storyId: 'story-1',
      clips: [
        { order: 1, url: 'https://v3.fal.media/files/test/1.mp4', durationSeconds: 3 },
        { order: 2, url: 'https://v3.fal.media/files/test/2.mp4', durationSeconds: 3 },
      ],
      plannedDurationSeconds: 6,
      maxDurationSeconds: 5,
    })).rejects.toMatchObject({ code: 'assembly-failed' })

    expect(runner.calls).toHaveLength(0)
  })

  it('rejects a normalized clip outside ±0.1 s before concatenating', async () => {
    const { runner, assembler } = setup()
    runner.normalizedDurations = [3.2, 2, 4, 6]

    await expect(assembler.assemble({
      storyId: 'story-1',
      clips: [
        { order: 1, url: 'https://v3.fal.media/files/test/1.mp4', durationSeconds: 3 },
        { order: 2, url: 'https://v3.fal.media/files/test/2.mp4', durationSeconds: 2 },
        { order: 3, url: 'https://v3.fal.media/files/test/3.mp4', durationSeconds: 4 },
        { order: 4, url: 'https://v3.fal.media/files/test/4.mp4', durationSeconds: 6 },
      ],
      plannedDurationSeconds: 15,
      maxDurationSeconds: 15,
    })).rejects.toMatchObject({ code: 'assembly-failed' })

    expect(runner.calls.some((call) => call.args.includes('concat'))).toBe(false)
  })

  it('rejects a final duration outside ±0.3 s', async () => {
    const { runner, assembler } = setup()
    runner.probeDuration = 10

    await expect(assembler.assemble({
      storyId: 'story-1',
      clips: [
        { order: 1, url: 'https://v3.fal.media/files/test/1.mp4', durationSeconds: 3 },
        { order: 2, url: 'https://v3.fal.media/files/test/2.mp4', durationSeconds: 2 },
      ],
      plannedDurationSeconds: 5,
      maxDurationSeconds: 5,
    })).rejects.toMatchObject({ code: 'assembly-failed' })
  })
})

describe('tolerance grows with the clip count', () => {
  it('accepts twelve clips whose rounding adds up', async () => {
    // Measured on a real 30 second story: twelve clips trimmed to 2 and 3
    // seconds came out slightly off in total, and a fixed 0.1 s margin rejected
    // a video that was perfectly valid.
    const runner = new Runner()
    const media = storage()
    const clips = Array.from({ length: 12 }, (_value, index) => ({
      order: index + 1,
      url: `https://v3.fal.media/files/test/${index + 1}.mp4`,
      durationSeconds: (index < 6 ? 3 : 2) as 2 | 3,
    }))

    // Each clip lands 0.04 s over, so the total is 0.48 s off: inside the margin
    // this fix allows for twelve clips, far outside the old one.
    runner.normalizedDurations = clips.map((clip) => clip.durationSeconds + 0.04)
    runner.probeDuration = 30.48

    const assembler = new NativeShotAssembler({
      downloader: new Downloader(),
      runner,
      mediaStorage: media.storage,
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
    })

    const result = await assembler.assemble({
      storyId: 'twelve-clips',
      clips,
      plannedDurationSeconds: 30,
      maxDurationSeconds: 30,
    })

    expect(result.durationSeconds).toBeCloseTo(30.48, 2)
  })
})
