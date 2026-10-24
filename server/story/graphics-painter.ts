import type { StoryGraphic, StoryPlan } from '~/models/story'
import type { FfmpegRunner } from './ffmpeg-runner'
import { buildGraphicsArgs } from './graphics-renderer'
import { buildGraphicsPlan } from './graphics-plan'
import type { GraphicsPainter } from './shot-assembly-service'

/**
 * Paints the overlays with FFmpeg and reports what it drew.
 *
 * Fonts are resolved on the server against a fixed list, never from input: a
 * client-supplied path is a file read waiting to happen. When no font resolves
 * the painter reports `painted: false` instead of failing, because a video
 * without overlays is still a video.
 */
export interface GraphicsPaintInput {
  readonly inputPath: string
  readonly outputPath: string
  readonly totalDurationSeconds: number
  readonly width: number
  readonly height: number
  readonly plan: StoryPlan | null | undefined
}

export interface GraphicsPainterOptions {
  readonly runner: FfmpegRunner
  readonly ffmpegPath?: string
  /** Channel tag; empty disables the badge. */
  readonly badgeText?: string
  readonly timeoutMs?: number
}

/** Sans first for titles, mono for the terminal. Both are widely installed. */
export const SANS_FONT_CANDIDATES: readonly string[] = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
]

export const MONO_FONT_CANDIDATES: readonly string[] = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
]

const DEFAULT_TIMEOUT_MS = 120_000

/** Existence check without spawning: `fc-match` is not guaranteed either. */
async function firstExisting(paths: readonly string[]): Promise<string | null> {
  const { access } = await import('node:fs/promises')

  for (const path of paths) {
    try {
      await access(path)

      return path
    } catch {
      continue
    }
  }

  return null
}

export class FfmpegGraphicsPainter implements GraphicsPainter {
  private readonly runner: FfmpegRunner
  private readonly ffmpegPath: string
  private readonly badgeText: string
  private readonly timeoutMs: number

  constructor(options: GraphicsPainterOptions) {
    this.runner = options.runner
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.badgeText = options.badgeText ?? ''
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async paint(
    input: GraphicsPaintInput,
  ): Promise<{ readonly painted: boolean; readonly graphics: readonly StoryGraphic[] }> {
    if (input.plan === null || input.plan === undefined) {
      return { painted: false, graphics: [] }
    }

    const graphicsPlan = buildGraphicsPlan({
      plan: input.plan,
      totalDurationSeconds: input.totalDurationSeconds,
      width: input.width,
      height: input.height,
      badgeText: this.badgeText,
    })

    if (graphicsPlan.graphics.length === 0) return { painted: false, graphics: [] }

    const font = await firstExisting(SANS_FONT_CANDIDATES)

    if (font === null) return { painted: false, graphics: [] }

    const mono = await firstExisting(MONO_FONT_CANDIDATES)
    const args = buildGraphicsArgs({
      plan: graphicsPlan,
      inputPath: input.inputPath,
      outputPath: input.outputPath,
      fontFile: font,
      monoFontFile: mono,
    })

    if (args === null) return { painted: false, graphics: [] }

    const result = await this.runner.run({
      binary: this.ffmpegPath,
      args,
      cwd: '/',
      timeoutMs: this.timeoutMs,
    })

    if (result.code !== 0) return { painted: false, graphics: [] }

    return { painted: true, graphics: graphicsPlan.graphics }
  }
}

/**
 * Answers whether this build of FFmpeg can draw text. It goes through the same
 * runner as everything else: only one module spawns processes.
 */
export async function ffmpegHasDrawText(
  runner: FfmpegRunner,
  ffmpegPath: string,
): Promise<boolean> {
  try {
    const result = await runner.run({
      binary: ffmpegPath,
      args: ['-hide_banner', '-filters'],
      cwd: '/',
      timeoutMs: 5_000,
    })

    return result.code === 0 && result.stdout.includes('drawtext')
  } catch {
    return false
  }
}

export function createStoryGraphicsPainter(
  options: GraphicsPainterOptions,
): GraphicsPainter {
  return new FfmpegGraphicsPainter(options)
}
