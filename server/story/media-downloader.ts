import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { assertFalMediaUrl } from '../fal/types'
import { StoryError } from './errors'

export interface StoryClip {
  readonly order: number
  readonly url: string
}

export interface DownloadedClip {
  readonly order: number
  readonly path: string
}

export interface MediaDownloader {
  download(
    clips: readonly StoryClip[],
    directory: string,
    signal?: AbortSignal,
  ): Promise<readonly DownloadedClip[]>
}

export interface MediaDownloaderOptions {
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
  readonly maxClipBytes?: number
  readonly maxTotalBytes?: number
  readonly maxOrder?: number
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_CLIP_BYTES = 314_572_800
const DEFAULT_MAX_TOTAL_BYTES = 1_610_612_736

function sceneFileName(order: number, maxOrder: number): string {
  if (!Number.isInteger(order) || order < 1 || order > maxOrder) {
    throw new StoryError('internal-error')
  }

  return `scene-${order}.mp4`
}

export class NativeMediaDownloader implements MediaDownloader {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxClipBytes: number
  private readonly maxTotalBytes: number
  private readonly maxOrder: number

  constructor(options: MediaDownloaderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxClipBytes = options.maxClipBytes ?? DEFAULT_MAX_CLIP_BYTES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
    this.maxOrder = options.maxOrder ?? 6
  }

  async download(
    clips: readonly StoryClip[],
    directory: string,
    signal?: AbortSignal,
  ): Promise<readonly DownloadedClip[]> {
    const orders = new Set<number>()
    const downloaded: DownloadedClip[] = []
    let totalBytes = 0

    for (const clip of clips) {
      if (orders.has(clip.order)) {
        throw new StoryError('internal-error')
      }

      orders.add(clip.order)

      let safeUrl: string

      try {
        safeUrl = assertFalMediaUrl(clip.url)
      } catch {
        throw new StoryError('assembly-failed')
      }

      const path = join(directory, sceneFileName(clip.order, this.maxOrder))
      const bytes = await this.downloadOne(safeUrl, path, signal)

      totalBytes += bytes

      if (bytes > this.maxClipBytes || totalBytes > this.maxTotalBytes) {
        await unlink(path).catch(() => undefined)
        throw new StoryError('assembly-failed')
      }

      downloaded.push({ order: clip.order, path })
    }

    return downloaded.sort((a, b) => a.order - b.order)
  }

  private async downloadOne(
    url: string,
    path: string,
    externalSignal?: AbortSignal,
  ): Promise<number> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    const onAbort = (): void => controller.abort()

    externalSignal?.addEventListener('abort', onAbort, { once: true })

    let stream: ReturnType<typeof createWriteStream> | null = null
    let bytes = 0

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new StoryError('assembly-failed')
      }

      stream = createWriteStream(path)
      const reader = response.body.getReader()

      for (;;) {
        const { done, value } = await reader.read()

        if (done) break
        if (!value) continue

        bytes += value.byteLength

        if (bytes > this.maxClipBytes) {
          await reader.cancel().catch(() => undefined)
          throw new StoryError('assembly-failed')
        }

        if (!stream.write(value)) {
          await once(stream, 'drain')
        }
      }

      stream.end()
      await once(stream, 'finish')

      return bytes
    } catch (error) {
      if (stream) {
        stream.destroy()

        // Wait for the file handle to close before unlinking; otherwise a
        // stream that had not opened yet can recreate the partial file after
        // the cleanup, leaking it until the assembly directory is removed.
        if (!stream.closed) {
          await once(stream, 'close').catch(() => undefined)
        }
      }

      await unlink(path).catch(() => undefined)

      if (error instanceof StoryError) {
        throw error
      }

      if (timedOut || externalSignal?.aborted) {
        throw new StoryError('assembly-timeout')
      }

      throw new StoryError('assembly-failed')
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onAbort)
    }
  }
}

export function createMediaDownloader(
  options: MediaDownloaderOptions = {},
): MediaDownloader {
  return new NativeMediaDownloader(options)
}
