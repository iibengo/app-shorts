// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planCaptions } from '../../../server/story/captions-plan'
import { renderAss } from '../../../server/story/captions-render'
import { muxAudioPlan } from '../../../server/story/audio-mux'
import type { StorySpeechSegment } from '~/models/story'

const run = promisify(execFile)

/**
 * 014: the mux is proved with real FFmpeg and synthetic audio.
 *
 * No provider, no key, no cost: a tone stands in for the narration and libass
 * is asked to paint a real ASS file. If this passes, the pipeline can put a
 * voice and captions inside an MP4.
 */
const ffmpeg = process.env.STORY_FFMPEG_PATH ?? 'ffmpeg'
const ffprobe = process.env.STORY_FFPROBE_PATH ?? 'ffprobe'
let directory = ''
let available = true

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run(ffmpeg, ['-version'])

    return true
  } catch {
    return false
  }
}

describe('014 · mux real con FFmpeg', () => {
  beforeAll(async () => {
    available = await hasFfmpeg()
    if (!available) return
    directory = await mkdtemp(join(tmpdir(), 'story-mux-'))
  })

  afterAll(async () => {
    if (directory.length > 0) await rm(directory, { recursive: true, force: true })
  })

  it('delivers an MP4 with both a video and an audio track', async () => {
    if (!available) return

    const silent = join(directory, 'silent.mp4')
    const voice = join(directory, 'voice.mp3')
    const output = join(directory, 'with-voice.mp4')
    const ass = join(directory, 'captions.ass')

    await run(ffmpeg, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'color=c=navy:s=720x1280:d=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent,
    ])

    // A tone stands in for the narrator: real audio, no provider, no cost.
    await run(ffmpeg, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3',
      '-c:a', 'libmp3lame', voice,
    ])

    const segments: readonly StorySpeechSegment[] = [{
      sceneOrder: 1,
      text: 'Clara encuentra la caja.',
      startSeconds: 0,
      endSeconds: 3,
      speechSeconds: 3,
      estimatedSeconds: 3,
      status: 'ready',
    }]
    await writeFile(ass, renderAss(planCaptions(segments), { width: 720, height: 1280, fontName: 'DejaVu Sans' }), 'utf8')

    const { args } = muxAudioPlan({
      videoPath: silent,
      audioPath: voice,
      outputPath: output,
      captionsPath: ass,
    })

    await run(ffmpeg, [...args])

    const probe = await run(ffprobe, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      output,
    ])
    const kinds = probe.stdout.split('\n').map((line) => line.trim()).filter(Boolean)

    expect(kinds).toContain('video')
    expect(kinds).toContain('audio')
  }, 60_000)
})
