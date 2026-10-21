// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NativeMediaDownloader,
  createMediaDownloader,
} from '../../../server/story/media-downloader'
import { StoryError } from '../../../server/story/errors'

const CDN = 'https://v3.fal.media/files/test/clip'
const created: string[] = []

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'story-downloader-test-'))
  created.push(path)

  return path
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

interface FetchCall {
  readonly url: string
  readonly init: RequestInit
}

function recordingFetch(payload: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })

    return payload(url, init ?? {})
  }) as typeof fetch

  return { fetchImpl, calls }
}

function bodyOf(bytes: number): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'video/mp4' },
  })
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('NativeMediaDownloader', () => {
  it('downloads clips one by one to server-named files', async () => {
    const { fetchImpl, calls } = recordingFetch(() => bodyOf(3))
    const downloader = new NativeMediaDownloader({ fetchImpl })
    const target = await directory()

    const result = await downloader.download([
      { order: 2, url: `${CDN}-2.mp4` },
      { order: 1, url: `${CDN}-1.mp4` },
    ], target)

    expect(result.map((clip) => clip.order)).toEqual([1, 2])
    expect(result.map((clip) => clip.path)).toEqual([
      join(target, 'scene-1.mp4'),
      join(target, 'scene-2.mp4'),
    ])
    expect(calls).toHaveLength(2)

    for (const clip of result) {
      expect(existsSync(clip.path)).toBe(true)
      expect((await readFile(clip.path)).byteLength).toBe(3)
    }
  })

  it('uses a non-redirecting, credential-free GET', async () => {
    const { fetchImpl, calls } = recordingFetch(() => bodyOf(1))
    const target = await directory()

    await new NativeMediaDownloader({ fetchImpl }).download(
      [{ order: 1, url: `${CDN}-1.mp4` }],
      target,
    )

    expect(calls[0]?.url).toBe(`${CDN}-1.mp4`)
    expect(calls[0]?.init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    })
  })

  it('rejects non-allowlisted URLs before fetching', async () => {
    for (const url of [
      'http://v3.fal.media/files/test/a.mp4',
      'https://evil.example/video.mp4',
      'https://user:pass@v3.fal.media/a.mp4',
      'https://v3.fal.media/a.mp4#fragment',
    ]) {
      const { fetchImpl, calls } = recordingFetch(() => bodyOf(1))
      const target = await directory()

      const error = await captureError(() => new NativeMediaDownloader({ fetchImpl }).download(
        [{ order: 1, url }],
        target,
      ))

      expect(error.code, url).toBe('assembly-failed')
      expect(calls, url).toHaveLength(0)
      expect(await readdir(target)).toEqual([])
    }
  })

  it('rejects duplicate or out-of-range orders', async () => {
    const { fetchImpl } = recordingFetch(() => bodyOf(1))
    const downloader = new NativeMediaDownloader({ fetchImpl })
    const target = await directory()

    expect((await captureError(() => downloader.download([
      { order: 1, url: `${CDN}-1.mp4` },
      { order: 1, url: `${CDN}-1b.mp4` },
    ], target))).code).toBe('internal-error')

    for (const order of [0, 7]) {
      expect((await captureError(() => downloader.download(
        [{ order, url: `${CDN}-${order}.mp4` }],
        target,
      ))).code).toBe('internal-error')
    }
  })

  it('fails on a non-ok response and removes the partial file', async () => {
    const { fetchImpl } = recordingFetch(() => new Response('nope', { status: 404 }))
    const target = await directory()

    const error = await captureError(() => new NativeMediaDownloader({ fetchImpl }).download(
      [{ order: 1, url: `${CDN}-1.mp4` }],
      target,
    ))

    expect(error.code).toBe('assembly-failed')
    expect(await readdir(target)).toEqual([])
  })

  it('enforces the per-clip size limit and removes the file', async () => {
    const { fetchImpl } = recordingFetch(() => bodyOf(10))
    const target = await directory()

    const error = await captureError(() => new NativeMediaDownloader({
      fetchImpl,
      maxClipBytes: 2,
    }).download([{ order: 1, url: `${CDN}-1.mp4` }], target))

    expect(error.code).toBe('assembly-failed')
    expect(await readdir(target)).toEqual([])
  })

  it('enforces the total size limit across clips', async () => {
    const { fetchImpl } = recordingFetch(() => bodyOf(3))
    const target = await directory()

    const error = await captureError(() => new NativeMediaDownloader({
      fetchImpl,
      maxClipBytes: 100,
      maxTotalBytes: 4,
    }).download([
      { order: 1, url: `${CDN}-1.mp4` },
      { order: 2, url: `${CDN}-2.mp4` },
    ], target))

    expect(error.code).toBe('assembly-failed')
    expect(existsSync(join(target, 'scene-2.mp4'))).toBe(false)
  })

  it('maps the download timeout to assembly-timeout and removes the file', async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
    }) as typeof fetch
    const target = await directory()

    const error = await captureError(() => new NativeMediaDownloader({
      fetchImpl,
      timeoutMs: 5,
    }).download([{ order: 1, url: `${CDN}-1.mp4` }], target))

    expect(error.code).toBe('assembly-timeout')
    expect(await readdir(target)).toEqual([])
  })

  it('maps an external abort to assembly-timeout', async () => {
    const controller = new AbortController()
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        }, { once: true })
      })
    }) as typeof fetch
    const target = await directory()
    const promise = new NativeMediaDownloader({ fetchImpl, timeoutMs: 10_000 }).download(
      [{ order: 1, url: `${CDN}-1.mp4` }],
      target,
      controller.signal,
    )

    controller.abort()

    expect((await captureError(() => promise)).code).toBe('assembly-timeout')
  })

  it('creates a downloader through the factory', () => {
    expect(createMediaDownloader()).toBeInstanceOf(NativeMediaDownloader)
  })
})
