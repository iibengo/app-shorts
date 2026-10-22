// @vitest-environment node
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FfmpegBinaryMissingError } from '../../../server/story/ffmpeg-runner'
import type { FfmpegRunOptions, FfmpegRunner } from '../../../server/story/ffmpeg-runner'
import {
  NativeStoryFrameExtractor,
  QCFramesGlobalError,
  frameTimestamps,
  verifyClipTechnical,
} from '../../../server/story/qc-frames'
import type { MediaDownloader } from '../../../server/story/media-downloader'
import type { MediaStorage, MediaStorageUploadInput } from '../../../server/fal/media-storage'

const CLIPS = [
  { sceneId: 'scene-1', order: 1, url: 'https://v3.fal.media/files/test/clip-1.mp4' },
  { sceneId: 'scene-2', order: 2, url: 'https://v3.fal.media/files/test/clip-2.mp4' },
]

function probePayload(overrides: {
  readonly duration?: string
  readonly width?: number
  readonly height?: number
  readonly codec?: string
  readonly audio?: boolean
} = {}): string {
  return JSON.stringify({
    streams: [
      {
        codec_type: 'video',
        codec_name: overrides.codec ?? 'h264',
        width: overrides.width ?? 720,
        height: overrides.height ?? 1280,
      },
      ...(overrides.audio
        ? [{ codec_type: 'audio', codec_name: 'aac' }]
        : []),
    ],
    format: { duration: overrides.duration ?? '6.0' },
  })
}

function runner(options: {
  readonly probe?: string
  readonly ffmpegCode?: number
  readonly throwBinary?: boolean
} = {}) {
  const calls: FfmpegRunOptions[] = []

  const run = async (input: FfmpegRunOptions) => {
    calls.push(input)

    if (options.throwBinary) throw new FfmpegBinaryMissingError(input.binary)

    if (input.binary === 'ffprobe') {
      return { code: 0, stdout: options.probe ?? probePayload(), stderr: '' }
    }

    return { code: options.ffmpegCode ?? 0, stdout: '', stderr: '' }
  }

  return { runner: { run } satisfies FfmpegRunner, calls }
}

function downloader(): MediaDownloader {
  return {
    async download(clips, directory) {
      return Promise.all(clips.map(async (clip) => {
        const path = join(directory, `scene-${clip.order}.mp4`)
        await writeFile(path, 'clip')

        return { order: clip.order, path }
      }))
    },
  }
}

function storage() {
  const uploads: MediaStorageUploadInput[] = []

  const mediaStorage: MediaStorage = {
    async uploadFile(input) {
      uploads.push(input)

      return {
        fileUrl: `https://v3.fal.media/files/test/story-qc-${uploads.length}.jpg`,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }
    },
  }

  return { mediaStorage, uploads }
}

function extractor(
  harness: ReturnType<typeof runner>,
  mediaStorage: MediaStorage,
): NativeStoryFrameExtractor {
  return new NativeStoryFrameExtractor({
    downloader: downloader(),
    runner: harness.runner,
    mediaStorage,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
  })
}

describe('qc-frames: timestamps and technical checks', () => {
  it('computes the three normative timestamps', () => {
    expect(frameTimestamps(6)).toEqual([0, 2.9, 5.85])
    expect(frameTimestamps(5.5)).toEqual([0, 2.75, 5.35])
  })

  it('accepts a 9:16 h264 clip with no audio', () => {
    expect(verifyClipTechnical({
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 }],
      durationSeconds: 6,
    })).toEqual([])
  })

  it('accepts a 768x1422 near-vertical clip because the assembler normalizes it', () => {
    expect(verifyClipTechnical({
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 768, height: 1422 }],
      durationSeconds: 5.875,
    })).toEqual([])
  })

  it.each([
    [1920, 1080],
    [1080, 1080],
  ])('rejects a clearly non-vertical %ix%i clip', (width, height) => {
    expect(verifyClipTechnical({
      streams: [{ codec_type: 'video', codec_name: 'h264', width, height }],
      durationSeconds: 6,
    })).toContain('technical-aspect')
  })

  it.each([
    ['technical-duration', {
      durationSeconds: 5.4,
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 }],
    }],
    ['technical-streams', {
      durationSeconds: 6,
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    }],
    ['technical-aspect', {
      durationSeconds: 6,
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }],
    }],
    ['technical-resolution', {
      durationSeconds: 6,
      streams: [{ codec_type: 'video', codec_name: 'h264', width: 360, height: 640 }],
    }],
  ])('emits %s', (code, input) => {
    expect(verifyClipTechnical(input)).toContain(code)
  })
})

describe('qc-frames: extraction', () => {
  it('extracts a 3x360 strip with a single ffmpeg and uploads it as image/jpeg', async () => {
    const harness = runner()
    const { mediaStorage, uploads } = storage()

    const strips = await extractor(harness, mediaStorage).extract({
      storyId: 'story-1',
      clips: CLIPS,
    })

    expect(strips).toHaveLength(2)
    expect(strips[0]).toMatchObject({
      sceneId: 'scene-1',
      order: 1,
      technical: [],
      framesUrl: 'https://v3.fal.media/files/test/story-qc-1.jpg',
    })

    const ffmpegCalls = harness.calls.filter((call) => call.binary === 'ffmpeg')

    expect(ffmpegCalls).toHaveLength(2)

    const args = ffmpegCalls[0]!.args

    expect(args).toContain('-nostdin')
    expect(args.join(' ')).toContain('-ss 0 -i')
    expect(args.join(' ')).toContain('hstack=inputs=3')
    expect(args.join(' ')).toContain('scale=360:640')
    expect(ffmpegCalls[0]!.cwd).toBeTruthy()

    expect(uploads).toHaveLength(2)
    expect(uploads[0]!.fileName).toMatch(/^story-qc-/)
    expect(uploads[0]!.contentType).toBe('image/jpeg')
    expect(uploads[0]!.lifecycleSeconds).toBe(86_400)
  })

  it('returns the global frames error when no strip is produced', async () => {
    const harness = runner({ ffmpegCode: 1 })
    const { mediaStorage } = storage()

    await expect(extractor(harness, mediaStorage).extract({
      storyId: 'story-1',
      clips: CLIPS,
    })).rejects.toBeInstanceOf(QCFramesGlobalError)
  })

  it('fails with ffmpeg-not-configured when the binary is missing', async () => {
    const harness = runner({ throwBinary: true })
    const { mediaStorage } = storage()

    await expect(extractor(harness, mediaStorage).extract({
      storyId: 'story-1',
      clips: CLIPS,
    })).rejects.toMatchObject({ code: 'ffmpeg-not-configured' })
  })

  it('marks a non-first download failure as blocking technical streams', async () => {
    const harness = runner()
    const { mediaStorage } = storage()
    let calls = 0
    const failingDownloader: MediaDownloader = {
      async download(clips, directory) {
        calls += 1
        if (calls === 2) throw new Error('download failed')

        const first = clips[0]!
        const path = join(directory, `scene-${first.order}.mp4`)
        await writeFile(path, 'clip')

        return [{ order: first.order, path }]
      },
    }
    const extractorUnderTest = new NativeStoryFrameExtractor({
      downloader: failingDownloader,
      runner: harness.runner,
      mediaStorage,
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
    })

    const strips = await extractorUnderTest.extract({
      storyId: 'story-1',
      clips: CLIPS,
    })

    expect(strips[1]?.technical).toContain('technical-streams')
    expect(strips[1]?.framesUrl).toBeNull()
  })

  it('returns frames-unavailable without a global failure when only the upload fails', async () => {
    const harness = runner()
    const failingStorage = {
      async uploadFile() {
        throw new Error('upload failed')
      },
    }

    const strips = await extractor(harness, failingStorage).extract({
      storyId: 'story-1',
      clips: [CLIPS[0]!],
    })

    expect(strips).toHaveLength(1)
    expect(strips[0]?.framesUrl).toBeNull()
    expect(strips[0]?.technical).toEqual([])
  })

  it('emits technical issues without extracting frames', async () => {
    const harness = runner({ probe: probePayload({ duration: '5.4' }) })
    const { mediaStorage, uploads } = storage()

    const strips = await extractor(harness, mediaStorage).extract({
      storyId: 'story-1',
      clips: [CLIPS[0]!],
    })

    expect(strips[0]?.technical).toContain('technical-duration')
    expect(strips[0]?.framesUrl).toBeNull()
    expect(uploads).toHaveLength(0)
  })
})
