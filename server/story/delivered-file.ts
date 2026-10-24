import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'

export interface DeliveredStoryFile {
  readonly size: number
  readonly stream: Readable
}

/**
 * Opens the delivered MP4 the app kept for this story.
 *
 * The provider deletes uploaded videos within minutes: on 2026-10-24 a story
 * marked READY answered 404 one minute after the file had been downloaded. The
 * bytes live in `outputDirectory` so the result outlives the URL.
 */
export async function openDeliveredStory(
  outputDirectory: string | null,
  storyId: string,
): Promise<DeliveredStoryFile | null> {
  if (!outputDirectory) return null

  const safeId = storyId.replace(/[^a-zA-Z0-9-]/g, '')
  const path = join(outputDirectory, `${safeId}.mp4`)
  const info = await stat(path).catch(() => null)

  if (!info || info.size === 0) return null

  return { size: info.size, stream: createReadStream(path) }
}
