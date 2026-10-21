// @vitest-environment node
/**
 * H4 regression: real abort coverage.
 *
 * These tests use the real `SpawnFfmpegRunner` (a local sh script, never a
 * provider), the real `NativeMediaDownloader` cleanup path with a streaming
 * fetch stub, and the real `NativeStoryFrameExtractor`. The goal is to prove
 * that aborting a QC leaves no orphan process, no partial file and no leftover
 * temporary directory, not only that a fake extractor rejects.
 *
 * The downloader cannot hit a real HTTP server because `assertFalMediaUrl`
 * only allows the HTTPS Fal CDN; the transaction, stream teardown and unlink
 * are still the production code paths.
 */
import { existsSync } from 'node:fs'
import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MediaStorage } from '../../../server/fal/media-storage'
import { StoryError } from '../../../server/story/errors'
import { FfmpegTimeoutError, SpawnFfmpegRunner } from '../../../server/story/ffmpeg-runner'
import { NativeMediaDownloader } from '../../../server/story/media-downloader'
import {
  NativeStoryFrameExtractor,
  QCFramesGlobalError,
} from '../../../server/story/qc-frames'

const CDN = 'https://v3.fal.media/files/test/clip.mp4'
const PROBE_JSON =
  '{"streams":[{"codec_type":"video","codec_name":"h264","width":720,"height":1280}],'
  + '"format":{"duration":"6.0"}}'

const directories: string[] = []

async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'story-qc-abort-test-'))
  directories.push(path)

  return path
}

async function executable(path: string, content: string): Promise<string> {
  await writeFile(path, content, 'utf8')
  await chmod(path, 0o755)

  return path
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForFile(path: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (existsSync(path)) return

    await delay(10)
  }

  throw new Error(`timed out waiting for ${path}`)
}

async function sleep(ms: number): Promise<void> {
  await delay(ms)
}

function qcTempDirectories(): readonly string[] {
  return readdir(tmpdir())
    .then((entries) => entries.filter((entry) => entry.startsWith('ai-shorts-story-qc-')))
    .catch(() => [])
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('SpawnFfmpegRunner: real process abort', () => {
  it.skipIf(process.platform === 'win32')(
    'kills the child with SIGKILL on abort and never runs the next step',
    async () => {
      const directory = await workspace()
      const started = join(directory, 'started')
      const finished = join(directory, 'finished')
      const script = await executable(join(directory, 'slow-ffmpeg.sh'), [
        '#!/bin/sh',
        `: > "${started}"`,
        'sleep 0.5',
        `: > "${finished}"`,
        '',
      ].join('\n'))
      const controller = new AbortController()
      const promise = new SpawnFfmpegRunner().run({
        binary: script,
        args: [],
        cwd: directory,
        timeoutMs: 60_000,
        signal: controller.signal,
      })

      await waitForFile(started)
      controller.abort()

      await expect(promise).rejects.toBeInstanceOf(FfmpegTimeoutError)

      await sleep(300)
      expect(existsSync(finished)).toBe(false)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'kills the child when the real timeout fires',
    async () => {
      const directory = await workspace()
      const started = join(directory, 'started')
      const finished = join(directory, 'finished')
      const script = await executable(join(directory, 'slow-ffmpeg.sh'), [
        '#!/bin/sh',
        `: > "${started}"`,
        'sleep 0.5',
        `: > "${finished}"`,
        '',
      ].join('\n'))

      await expect(new SpawnFfmpegRunner().run({
        binary: script,
        args: [],
        cwd: directory,
        timeoutMs: 50,
      })).rejects.toBeInstanceOf(FfmpegTimeoutError)

      await sleep(300)
      expect(existsSync(finished)).toBe(false)
    },
  )
})

describe('NativeMediaDownloader: real streaming abort', () => {
  it('aborts a streaming body, maps to assembly-timeout and removes the partial file', async () => {
    const target = await workspace()
    const controller = new AbortController()
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(new Uint8Array([1, 2, 3, 4]))
          init?.signal?.addEventListener('abort', () => {
            streamController.error(new DOMException('aborted', 'AbortError'))
          }, { once: true })
        },
      })

      return new Response(stream, { status: 200 })
    }) as typeof fetch
    const downloader = new NativeMediaDownloader({ fetchImpl, timeoutMs: 10_000 })
    const promise = downloader.download(
      [{ order: 1, url: CDN }],
      target,
      controller.signal,
    )

    await delay(30)
    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(StoryError)
    await expect(promise).rejects.toMatchObject({ code: 'assembly-timeout' })
    expect(await readdir(target)).toEqual([])
  })
})

describe('NativeStoryFrameExtractor: real integrated abort', () => {
  it.skipIf(process.platform === 'win32')(
    'aborts the real ffmpeg child, cleans the temporary directory and uploads nothing',
    async () => {
      const before = await qcTempDirectories()
      const directory = await workspace()
      const started = join(directory, 'ffmpeg-started')
      const finished = join(directory, 'ffmpeg-finished')
      const binary = await executable(join(directory, 'fake-ffmpeg.sh'), [
        '#!/bin/sh',
        'if [ "$1" = "-v" ]; then',
        `  printf '%s' '${PROBE_JSON}'`,
        '  exit 0',
        'fi',
        `: > "${started}"`,
        'sleep 0.5',
        `: > "${finished}"`,
        '',
      ].join('\n'))
      const uploads: string[] = []
      const mediaStorage: MediaStorage = {
        async uploadFile(input) {
          uploads.push(input.fileName)

          return {
            fileUrl: 'https://v3.fal.media/files/test/story-qc.jpg',
            expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          }
        },
      }
      const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })) as typeof fetch
      const extractor = new NativeStoryFrameExtractor({
        downloader: new NativeMediaDownloader({ fetchImpl }),
        runner: new SpawnFfmpegRunner(),
        mediaStorage,
        ffmpegPath: binary,
        ffprobePath: binary,
      })
      const controller = new AbortController()
      const promise = extractor.extract({
        storyId: 'story-abort',
        clips: [{ sceneId: 'scene-1', order: 1, url: CDN }],
        signal: controller.signal,
      })

      await waitForFile(started)
      controller.abort()

      await expect(promise).rejects.toBeInstanceOf(QCFramesGlobalError)
      await expect(promise).rejects.toMatchObject({ code: 'qc-frames-failed' })
      expect(uploads).toEqual([])

      await sleep(300)
      expect(existsSync(finished)).toBe(false)

      const after = await qcTempDirectories()
      const leaked = after.filter((entry) => !before.includes(entry))

      expect(leaked).toEqual([])
    },
  )
})
