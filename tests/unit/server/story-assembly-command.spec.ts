// @vitest-environment node
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import {
  FfmpegTimeoutError,
} from '../../../server/story/ffmpeg-runner'
import type { FfmpegRunOptions, FfmpegRunResult, FfmpegRunner } from '../../../server/story/ffmpeg-runner'
import {
  hasFfmpegBinary,
  NativeStoryAssembler,
  createStoryAssembler,
} from '../../../server/story/assembly-service'
import type { MediaDownloader, DownloadedClip, StoryClip } from '../../../server/story/media-downloader'
import type { MediaStorage, MediaStorageUploadInput } from '../../../server/fal/media-storage'

const NORMALIZE_FILTER =
  'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=6'

interface RunnerCall extends FfmpegRunOptions {
  readonly callIndex: number
}

class FakeRunner implements FfmpegRunner {
  readonly calls: RunnerCall[] = []
  readonly written: { path: string; bytes: number }[] = []
  readonly listContents: string[] = []
  probeDuration = 12
  probePayload: unknown | null = null
  failStage: 'normalize' | 'concat' | 'probe' | null = null
  hang = false
  outputBytes = 16

  async run(options: FfmpegRunOptions): Promise<FfmpegRunResult> {
    const callIndex = this.calls.length
    this.calls.push({ ...options, callIndex })

    if (this.hang) {
      if (options.signal?.aborted) {
        throw new FfmpegTimeoutError()
      }

      return new Promise<FfmpegRunResult>((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new FfmpegTimeoutError()), {
          once: true,
        })
      })
    }

    if (options.binary.endsWith('ffprobe')) {
      if (this.failStage === 'probe') {
        return { code: 1, stdout: '', stderr: 'probe failed' }
      }

      return {
        code: 0,
        stdout: JSON.stringify(this.probePayload ?? {
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 720,
              height: 1280,
              pix_fmt: 'yuv420p',
              avg_frame_rate: '30/1',
            },
          ],
          format: { duration: String(this.probeDuration) },
        }),
        stderr: '',
      }
    }

    const isConcat = options.args.includes('concat')

    if (isConcat && this.failStage === 'concat') {
      return { code: 1, stdout: '', stderr: 'concat failed' }
    }

    if (!isConcat && this.failStage === 'normalize') {
      return { code: 1, stdout: '', stderr: 'normalize failed' }
    }

    if (isConcat) {
      const listPath = options.args[options.args.indexOf('-i') + 1]!

      this.listContents.push(await readFile(listPath, 'utf8'))
    }

    const output = options.args[options.args.length - 1]!

    await writeFile(output, Buffer.alloc(this.outputBytes, 1))
    this.written.push({ path: output, bytes: this.outputBytes })

    return { code: 0, stdout: '', stderr: '' }
  }
}

class FakeDownloader implements MediaDownloader {
  readonly calls: { clips: readonly StoryClip[]; directory: string }[] = []
  failure: Error | null = null

  async download(
    clips: readonly StoryClip[],
    directory: string,
    signal?: AbortSignal,
  ): Promise<readonly DownloadedClip[]> {
    this.calls.push({ clips, directory })
    void signal

    if (this.failure) {
      throw this.failure
    }

    const downloaded: DownloadedClip[] = []

    for (const clip of clips) {
      const path = join(directory, `scene-${clip.order}.mp4`)
      await writeFile(path, 'downloaded')
      downloaded.push({ order: clip.order, path })
    }

    return downloaded
  }
}

class FakeMediaStorage implements MediaStorage {
  readonly uploads: MediaStorageUploadInput[] = []
  result = {
    fileUrl: 'https://v3.fal.media/files/test/final.mp4',
    expiresAt: '2026-10-22T18:00:00.000Z',
  }
  error: Error | null = null

  async uploadFile(input: MediaStorageUploadInput) {
    this.uploads.push(input)

    if (this.error) {
      throw this.error
    }

    return this.result
  }
}

const CLIPS: readonly StoryClip[] = [
  { order: 1, url: 'https://v3.fal.media/files/test/clip-1.mp4' },
  { order: 2, url: 'https://v3.fal.media/files/test/clip-2.mp4' },
]

function setup(options: {
  readonly storyId?: string
  readonly clips?: readonly StoryClip[]
  readonly config?: Parameters<typeof createStoryAssembler>[1]
} = {}) {
  const downloader = new FakeDownloader()
  const runner = new FakeRunner()
  const mediaStorage = new FakeMediaStorage()
  const assembler = createStoryAssembler(
    { downloader, runner, mediaStorage, ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' },
    options.config,
  )

  return {
    assembler,
    downloader,
    runner,
    mediaStorage,
    storyId: options.storyId ?? 'story-test-0001',
    clips: options.clips ?? CLIPS,
  }
}

async function captureError(run: () => Promise<unknown>): Promise<StoryError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)

    return error as StoryError
  }

  throw new Error('expected a StoryError')
}

describe('story assembly normalize command', () => {
  it('runs the exact normalization arguments for each clip', async () => {
    const { assembler, runner, storyId, clips } = setup()

    await assembler.assemble({ storyId, clips })

    const normalizeCalls = runner.calls.filter((call) => call.binary === 'ffmpeg')

    expect(normalizeCalls).toHaveLength(3)

    const first = normalizeCalls[0]!
    const directory = first.cwd

    expect(first.args).toEqual([
      '-nostdin',
      '-y',
      '-i',
      join(directory, 'scene-1.mp4'),
      '-t',
      '6',
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
      join(directory, 'scene-normalized-1.mp4'),
    ])
    expect(first.timeoutMs).toBe(60_000)
    expect(first.cwd.startsWith(tmpdir())).toBe(true)
    expect(NORMALIZE_FILTER).toContain('scale=720:1280:force_original_aspect_ratio=increase')
    expect(NORMALIZE_FILTER).toContain('crop=720:1280')
    expect(NORMALIZE_FILTER).toContain('setsar=1')
    expect(NORMALIZE_FILTER).toContain('fps=30')
    expect(NORMALIZE_FILTER).toContain('tpad=stop_mode=clone:stop_duration=6')
  })

  it('normalizes clips in story order regardless of input order', async () => {
    const { assembler, runner, downloader, storyId } = setup({
      clips: [CLIPS[1]!, CLIPS[0]!],
    })

    await assembler.assemble({ storyId, clips: [CLIPS[1]!, CLIPS[0]!] })

    expect(downloader.calls[0]?.clips.map((clip) => clip.order)).toEqual([1, 2])

    const normalizeCalls = runner.calls.filter((call) => call.binary === 'ffmpeg')
    expect(normalizeCalls[0]?.args.join(' ')).toContain('scene-normalized-1.mp4')
    expect(normalizeCalls[1]?.args.join(' ')).toContain('scene-normalized-2.mp4')
  })

  it('uses the concat demuxer with a server-generated list', async () => {
    const { assembler, runner, storyId, clips } = setup()

    await assembler.assemble({ storyId, clips })

    const concatCall = runner.calls.find((call) => call.args.includes('concat'))!

    expect(concatCall.args).toEqual([
      '-nostdin',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      join(concatCall.cwd, 'list.txt'),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      join(concatCall.cwd, 'story-final.mp4'),
    ])
    expect(concatCall.timeoutMs).toBe(120_000)
    expect(runner.listContents[0]).toBe(
      "file 'scene-normalized-1.mp4'\nfile 'scene-normalized-2.mp4'\n",
    )
    expect(runner.listContents[0]).not.toContain('/')
    expect(runner.listContents[0]).not.toContain('http')
  })

  it('verifies the output with ffprobe using exact arguments', async () => {
    const { assembler, runner, storyId, clips } = setup()

    await assembler.assemble({ storyId, clips })

    const probeCall = runner.calls.find((call) => call.binary === 'ffprobe')!

    expect(probeCall.args).toEqual([
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      join(probeCall.cwd, 'story-final.mp4'),
    ])
    expect(probeCall.timeoutMs).toBe(30_000)
  })

  it('uploads the MP4 with the normative lifecycle and generated name', async () => {
    const { assembler, runner, mediaStorage, storyId, clips } = setup()

    const result = await assembler.assemble({ storyId, clips })

    expect(mediaStorage.uploads).toHaveLength(1)

    const upload = mediaStorage.uploads[0]!

    expect(upload.contentType).toBe('video/mp4')
    expect(upload.lifecycleSeconds).toBe(86_400)
    expect(upload.fileName).toMatch(/^story-storytest0001-[a-f0-9]{12}\.mp4$/)
    expect(upload.filePath.startsWith(tmpdir())).toBe(true)
    expect(runner.written.some((entry) => entry.path === upload.filePath)).toBe(true)

    expect(result).toEqual({
      fileUrl: 'https://v3.fal.media/files/test/final.mp4',
      expiresAt: '2026-10-22T18:00:00.000Z',
      width: 720,
      height: 1280,
      durationSeconds: 12,
    })
  })

  it('sanitizes the story id used in the file name', async () => {
    const { assembler, mediaStorage, clips } = setup({ storyId: 'weird/<id>.. 001' })

    await assembler.assemble({ storyId: 'weird/<id>.. 001', clips })

    expect(mediaStorage.uploads[0]?.fileName).toMatch(/^story-weirdid001-[a-f0-9]{12}\.mp4$/)
  })
})

describe('story assembly failures and cleanup', () => {
  it('rejects an empty clip list and unexpected gaps', async () => {
    const { assembler, downloader } = setup()

    expect((await captureError(() => assembler.assemble({
      storyId: 'story-1',
      clips: [],
    }))).code).toBe('assembly-failed')

    expect((await captureError(() => assembler.assemble({
      storyId: 'story-1',
      clips: [CLIPS[0]!, { order: 3, url: CLIPS[1]!.url }],
    }))).code).toBe('assembly-failed')

    expect(downloader.calls).toHaveLength(0)
  })

  it('fails and cleans the temporary directory when normalization fails', async () => {
    const { assembler, runner, storyId, clips } = setup()
    runner.failStage = 'normalize'

    const error = await captureError(() => assembler.assemble({ storyId, clips }))
    const directory = runner.calls[0]!.cwd

    expect(error.code).toBe('assembly-failed')
    expect(existsSync(directory)).toBe(false)
  })

  it('fails when concatenation fails', async () => {
    const { assembler, runner, storyId, clips } = setup()
    runner.failStage = 'concat'

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-failed')
  })

  it('fails when ffprobe returns a non-zero code', async () => {
    const { assembler, runner, storyId, clips } = setup()
    runner.failStage = 'probe'

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-failed')
  })

  it.each([
    ['audio stream', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac' },
    ], format: { duration: '12' } }],
    ['wrong width', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
    ], format: { duration: '12' } }],
    ['wrong pixel format', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv444p', avg_frame_rate: '30/1' },
    ], format: { duration: '12' } }],
    ['wrong frame rate', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '25/1' },
    ], format: { duration: '12' } }],
    ['wrong codec', { streams: [
      { codec_type: 'video', codec_name: 'vp9', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
    ], format: { duration: '12' } }],
    ['wrong duration', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
    ], format: { duration: '12.5' } }],
    ['two video streams', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
    ], format: { duration: '12' } }],
    ['missing duration', { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, pix_fmt: 'yuv420p', avg_frame_rate: '30/1' },
    ], format: {} }],
  ])('rejects an invalid output (%s)', async (_label, payload) => {
    const { assembler, runner, storyId, clips } = setup()
    runner.probePayload = payload

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-failed')
  })

  it('rejects an output larger than the configured maximum and cleans up', async () => {
    const { assembler, runner, storyId, clips } = setup({
      config: { maxOutputBytes: 4 },
    })
    runner.outputBytes = 16

    const error = await captureError(() => assembler.assemble({ storyId, clips }))
    const directory = runner.calls[0]!.cwd

    expect(error.code).toBe('assembly-failed')
    expect(existsSync(directory)).toBe(false)
  })

  it('maps a total timeout to assembly-timeout and kills the work', async () => {
    const { assembler, runner, storyId, clips } = setup({
      config: { totalTimeoutMs: 10 },
    })
    runner.hang = true

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-timeout')
  })

  it('propagates a download failure as the assembly failure', async () => {
    const { assembler, downloader, storyId, clips } = setup()
    downloader.failure = new StoryError('assembly-timeout')

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-timeout')
  })

  it('propagates a storage failure without exposing provider details', async () => {
    const { assembler, mediaStorage, storyId, clips } = setup()
    mediaStorage.error = new Error('raw provider details')

    expect((await captureError(() => assembler.assemble({ storyId, clips }))).code)
      .toBe('assembly-failed')
  })

  it('removes the temporary directory after a successful assembly', async () => {
    const { assembler, runner, storyId, clips } = setup()

    await assembler.assemble({ storyId, clips })

    expect(existsSync(runner.calls[0]!.cwd)).toBe(false)
  })
})

describe('hasFfmpegBinary', () => {
  it('detects absolute binaries, missing paths and undefined values', () => {
    expect(hasFfmpegBinary(process.execPath)).toBe(true)
    expect(hasFfmpegBinary('/definitely/missing/ffmpeg')).toBe(false)
    expect(hasFfmpegBinary(undefined)).toBe(false)
    expect(typeof hasFfmpegBinary('ffmpeg')).toBe('boolean')
  })
})

describe('assembler wiring', () => {
  it('creates an assembler through the factory', () => {
    expect(createStoryAssembler({
      downloader: new FakeDownloader(),
      runner: new FakeRunner(),
      mediaStorage: new FakeMediaStorage(),
    })).toBeInstanceOf(NativeStoryAssembler)
  })
})
