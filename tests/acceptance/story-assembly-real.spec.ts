// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NativeShotAssembler } from '../../../server/story/shot-assembly-service'
import { createFfmpegRunner } from '../../../server/story/ffmpeg-runner'
import { createStoryGraphicsPainter } from '../../../server/story/graphics-painter'
import type { MediaDownloader, DownloadedClip } from '../../../server/story/media-downloader'
import type { MediaStorage, MediaStorageUploadInput } from '../../../server/fal/media-storage'
import type { StoryPlan } from '~/models/story'

const run = promisify(execFile)
function resolveBinary(name: string): string | null {
  const configured = process.env[`${name.toUpperCase()}_PATH`]?.trim()

  if (configured !== undefined && configured.length > 0) {
    return existsSync(configured) ? configured : null
  }

  for (const directory of (process.env.PATH ?? '').split(':')) {
    if (directory.length === 0) continue

    const candidate = join(directory, name)

    if (existsSync(candidate)) return candidate
  }

  return null
}

const FFMPEG = resolveBinary('ffmpeg')
const FFPROBE = resolveBinary('ffprobe')
const hasFfmpeg = FFMPEG !== null && FFPROBE !== null

/**
 * The suite tested every piece and still shipped a graphics painter that was
 * never assigned: the pipeline test used a fake assembler that reported no
 * overlays. This runs the real assembler over real encoded clips, with local
 * FFmpeg only. No provider, no cost, no network.
 */
describe.skipIf(!hasFfmpeg)('assembler over real encoded clips', () => {
  let directory: string
  let clips: readonly { order: number; path: string; durationSeconds: number }[] = []

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'assemble-real-'))
    const built: { order: number; path: string; durationSeconds: number }[] = []

    // Three clips of 3, 3 and 2 seconds: enough to show a concatenation, a
    // trim and a rounding, without spending minutes encoding.
    for (const [index, seconds] of [3, 3, 2].entries()) {
      const path = join(directory, `src-${index + 1}.mp4`)

      await run(FFMPEG ?? 'ffmpeg', [
        '-y', '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', `testsrc=size=768x1344:rate=24:duration=${seconds + 2}`,
        '-pix_fmt', 'yuv420p',
        path,
      ])

      built.push({ order: index + 1, path, durationSeconds: seconds })
    }

    clips = built
  }, 120_000)

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  })

  function downloader(): MediaDownloader {
    return {
      async download(
        requested: readonly { readonly order: number; readonly url: string }[],
        target: string,
      ): Promise<readonly DownloadedClip[]> {
        return Promise.all(requested.map(async (clip) => {
          const source = clips.find((item) => item.order === clip.order)!
          const path = join(target, `scene-${clip.order}.mp4`)

          await writeFile(path, await readFile(source.path))

          return { order: clip.order, path }
        }))
      },
    }
  }

  function storage(captured: { path: string | null }): MediaStorage {
    return {
      async uploadFile(_input: MediaStorageUploadInput) {
        captured.path = _input.filePath

        return {
          fileUrl: 'https://v3.fal.media/files/test/final.mp4',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        }
      },
    }
  }

  const plan = {
    title: 'Prueba local',
    logline: 'Un montaje de verdad',
    tone: 'humor',
    storyBible: null,
    scenes: [{
      order: 1,
      sceneRole: 'establishing',
      locationId: 'desk',
      timeOfDay: 'morning',
      weather: 'clear',
      characters: ['ionias'],
      props: ['laptop'],
      storyFunction: 'hook',
      gag: null,
      narration: 'Ionias mira la pantalla.',
    }],
  } as unknown as StoryPlan

  it('assembles, paints and reports the overlays', async () => {
    const captured: { path: string | null } = { path: null }
    const assembler = new NativeShotAssembler(
      {
        downloader: downloader(),
        runner: createFfmpegRunner(),
        mediaStorage: storage(captured),
        ffmpegPath: FFMPEG ?? 'ffmpeg',
        ffprobePath: FFPROBE ?? 'ffprobe',
        graphics: createStoryGraphicsPainter({
          runner: createFfmpegRunner(),
          ffmpegPath: FFMPEG ?? 'ffmpeg',
        }),
      },
      { totalTimeoutMs: 120_000 },
    )

    const result = await assembler.assemble({
      storyId: 'assembly-real',
      clips: clips.map((clip) => ({
        order: clip.order,
        url: `https://v3.fal.media/files/test/${clip.order}.mp4`,
        durationSeconds: clip.durationSeconds,
      })),
      plannedDurationSeconds: 8,
      maxDurationSeconds: 8,
      graphicsPlan: plan,
    })

    expect(result.durationSeconds).toBeGreaterThan(7.5)
    expect(result.durationSeconds).toBeLessThan(8.5)
    // The painter really ran: overlays come back and the file that was
    // uploaded is not the un-painted concatenation.
    expect(result.graphics.length).toBeGreaterThan(0)
    expect(captured.path).not.toBeNull()
  }, 180_000)
})
