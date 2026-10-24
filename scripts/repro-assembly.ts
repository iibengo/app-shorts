/**
 * Reproduction harness for the assembler.
 *
 * Usage: `npx tsx scripts/repro-assembly.ts <clips-file> [--no-graphics] [plan.json]`
 *
 * The clips file has one line per clip: `order durationSeconds url`. The plan
 * file is the story plan, needed only for overlays.
 *
 * It never uploads and never touches the database: only the upload result is
 * faked, so a failure is the assembler's, not the provider's.
 *
 * Not a test: it downloads the real clips of an already-paid story and runs the
 * real assembler against them, so the actual error surfaces instead of being
 * deduced. Run it with `npx tsx scripts/repro-assembly.ts <clips-file>`.
 *
 * It prints the StoryError code and its server-only detail, which is exactly
 * what the reconciler logs and what the last hour was missing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { NativeShotAssembler } from '../server/story/shot-assembly-service'
import { createMediaDownloader } from '../server/story/media-downloader'
import { createFfmpegRunner } from '../server/story/ffmpeg-runner'
import type { MediaStorage, MediaStorageUploadInput } from '../server/fal/media-storage'
import { StoryError } from '../server/story/errors'
import type { StoryPlan } from '../app/models/story'
import { createStoryGraphicsPainter } from '../server/story/graphics-painter'

interface ClipLine {
  readonly order: number
  readonly durationSeconds: number
  readonly url: string
}

async function main(): Promise<void> {
  const file = process.argv[2]

  if (file === undefined) throw new Error('usage: repro-assembly <clips-file>')

  const clips: ClipLine[] = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [order, durationSeconds, url] = line.trim().split(/\s+/)

      return {
        order: Number(order),
        durationSeconds: Number(durationSeconds),
        url: url ?? '',
      }
    })

  const planned = clips.reduce((total, clip) => total + clip.durationSeconds, 0)
  const directory = await mkdtemp(join(tmpdir(), 'repro-assembly-'))

  // The storage is the only thing faked: the upload is not what fails, and
  // hitting the real one would cost a request for nothing.
  const storage: MediaStorage = {
    async uploadFile(_input: MediaStorageUploadInput) {
      return {
        fileUrl: 'https://v3.fal.media/files/repro/out.mp4',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }
    },
  }

  // The app has graphics on by default; the first reproduction left them out,
  // which is why it passed. This runs the same path production runs.
  const withGraphics = process.argv[3] !== '--no-graphics'
  // The plan comes as a file: importing the repository would drag the app alias
  // into a plain script.
  const planFile = process.argv[4]
  const plan = planFile === undefined
    ? null
    : JSON.parse(readFileSync(planFile, 'utf8')) as StoryPlan

  const assembler = new NativeShotAssembler(
    {
      downloader: createMediaDownloader({ maxOrder: 99 }),
      runner: createFfmpegRunner(),
      mediaStorage: storage,
      ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
      ffprobePath: process.env.FFPROBE_PATH?.trim() || 'ffprobe',
      graphics: withGraphics
        ? createStoryGraphicsPainter({
            runner: createFfmpegRunner(),
            ffmpegPath: process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
          })
        : null,
    },
    { totalTimeoutMs: 420_000 },
  )

  console.log(`clips=${clips.length} planned=${planned}s dir=${directory}`)

  try {
    const result = await assembler.assemble({
      storyId: 'repro',
      clips,
      plannedDurationSeconds: planned,
      maxDurationSeconds: planned,
      graphicsPlan: plan,
    })

    console.log('OK', result.durationSeconds, result.fileUrl)
  } catch (error) {
    if (error instanceof StoryError) {
      console.log('FAILED code=', error.code)
      console.log('detail=', error.detail ?? '(none)')
    } else {
      console.log('FAILED raw=', error)
    }

    process.exitCode = 1
  }
}

void main()
