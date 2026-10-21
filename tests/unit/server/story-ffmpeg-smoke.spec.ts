// @vitest-environment node
/**
 * Opt-in FFmpeg smoke test with synthetic local clips only.
 *
 *   RUN_FFMPEG_SMOKE=1 npx vitest run tests/unit/server/story-ffmpeg-smoke.spec.ts
 *
 * Uses the system ffmpeg/ffprobe (FFMPEG_PATH/FFPROBE_PATH) and never touches
 * provider media. Skipped by default and in CI.
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createStoryAssembler,
  hasFfmpegBinary,
} from '../../../server/story/assembly-service'
import type { MediaStorage, MediaStorageUploadInput } from '../../../server/fal/media-storage'
import type { DownloadedClip, MediaDownloader, StoryClip } from '../../../server/story/media-downloader'
import { createFfmpegRunner } from '../../../server/story/ffmpeg-runner'
import { createStoryFrameExtractor } from '../../../server/story/qc-frames'

const run = promisify(execFile)
const ffmpegPath = process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
const ffprobePath = process.env.FFPROBE_PATH?.trim() || 'ffprobe'
const enabled = process.env.RUN_FFMPEG_SMOKE === '1'
  && hasFfmpegBinary(ffmpegPath)
  && hasFfmpegBinary(ffprobePath)

const directories: string[] = []

class LocalFileDownloader implements MediaDownloader {
  constructor(private readonly sourceDir: string) {}

  async download(
    clips: readonly StoryClip[],
    directory: string,
  ): Promise<readonly DownloadedClip[]> {
    const downloaded: DownloadedClip[] = []

    for (const clip of clips) {
      const destination = join(directory, `scene-${clip.order}.mp4`)

      await run(ffmpegPath, [
        '-nostdin',
        '-y',
        '-i',
        join(this.sourceDir, `source-${clip.order}.mp4`),
        '-c',
        'copy',
        destination,
      ])

      downloaded.push({ order: clip.order, path: destination })
    }

    return downloaded
  }
}

class MemoryStorage implements MediaStorage {
  upload: MediaStorageUploadInput | null = null
  bytes: Buffer | null = null

  async uploadFile(input: MediaStorageUploadInput) {
    this.upload = input
    this.bytes = readFileSync(input.filePath)

    return {
      fileUrl: 'https://v3.fal.media/files/test/smoke-final.mp4',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    }
  }
}

async function makeClip(
  path: string,
  color: string,
  seconds: number,
  size = '640x360',
): Promise<void> {
  await run(ffmpegPath, [
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:s=${size}:d=${seconds}:r=30`,
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    path,
  ])
}

describe.skipIf(!enabled)('FFmpeg assembly smoke (RUN_FFMPEG_SMOKE=1)', () => {
  let sourceDir = ''

  beforeAll(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), 'story-ffmpeg-smoke-'))
    directories.push(sourceDir)

    await makeClip(join(sourceDir, 'source-1.mp4'), 'red', 3)
    await makeClip(join(sourceDir, 'source-2.mp4'), 'blue', 3)
    // Vertical 9:16 clip for the QC strip extraction (720x1280, 6 s).
    await makeClip(join(sourceDir, 'source-3.mp4'), 'green', 6, '720x1280')
  })

  afterAll(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    )
  })

  it('normalizes, concatenates and verifies a 12 second MP4', async () => {
    const storage = new MemoryStorage()
    const assembler = createStoryAssembler({
      downloader: new LocalFileDownloader(sourceDir),
      runner: createFfmpegRunner(),
      mediaStorage: storage,
      ffmpegPath,
      ffprobePath,
    })

    const result = await assembler.assemble({
      storyId: 'smoke-story',
      clips: [
        { order: 1, url: 'https://v3.fal.media/files/test/source-1.mp4' },
        { order: 2, url: 'https://v3.fal.media/files/test/source-2.mp4' },
      ],
    })

    expect(result).toMatchObject({
      width: 720,
      height: 1280,
      durationSeconds: expect.any(Number),
    })
    expect(Math.abs(result.durationSeconds - 12)).toBeLessThanOrEqual(0.3)
    expect(storage.upload?.contentType).toBe('video/mp4')
    expect(storage.upload?.lifecycleSeconds).toBe(86_400)

    const output = join(sourceDir, 'final.mp4')

    writeFileSync(output, storage.bytes!)

    const probe = await run(ffprobePath, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      output,
    ])
    const payload = JSON.parse(probe.stdout) as {
      streams: { codec_type: string; codec_name: string; width: number; height: number; pix_fmt: string; avg_frame_rate: string }[]
    }

    expect(payload.streams).toHaveLength(1)
    expect(payload.streams[0]).toMatchObject({
      codec_type: 'video',
      codec_name: 'h264',
      width: 720,
      height: 1280,
      pix_fmt: 'yuv420p',
      avg_frame_rate: '30/1',
    })

    const bytes = storage.bytes!

    expect(bytes.indexOf('moov')).toBeGreaterThan(0)
    expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'))
    expect(existsSync(output)).toBe(true)
  }, 120_000)

  it('extracts and uploads a 1080x640 JPEG QC strip', async () => {
    const storage = new MemoryStorage()
    const extractor = createStoryFrameExtractor({
      downloader: new LocalFileDownloader(sourceDir),
      runner: createFfmpegRunner(),
      mediaStorage: storage,
      ffmpegPath,
      ffprobePath,
    })

    const strips = await extractor.extract({
      storyId: 'smoke-story',
      clips: [{
        sceneId: 'smoke-scene',
        order: 3,
        url: 'https://v3.fal.media/files/test/source-3.mp4',
      }],
    })

    expect(strips).toHaveLength(1)
    expect(strips[0]).toMatchObject({
      sceneId: 'smoke-scene',
      order: 3,
      technical: [],
      durationSeconds: expect.any(Number),
    })
    expect(strips[0]?.framesUrl).toMatch(/^https:\/\/v3\.fal\.media\//)
    expect(storage.upload).toMatchObject({
      contentType: 'image/jpeg',
      lifecycleSeconds: 86_400,
    })
    expect(storage.upload?.fileName).toMatch(/^story-qc-.*\.jpg$/)

    const bytes = storage.bytes!

    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xd8)

    const stripPath = join(sourceDir, 'qc-strip.jpg')

    writeFileSync(stripPath, bytes)

    const probe = await run(ffprobePath, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      stripPath,
    ])
    const payload = JSON.parse(probe.stdout) as {
      streams: { codec_type: string; codec_name: string; width: number; height: number }[]
    }

    expect(payload.streams).toHaveLength(1)
    expect(payload.streams[0]).toMatchObject({
      codec_type: 'video',
      codec_name: 'mjpeg',
      width: 1_080,
      height: 640,
    })
  }, 120_000)
})
