// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FfmpegBinaryMissingError,
  FfmpegTimeoutError,
  SpawnFfmpegRunner,
  createFfmpegRunner,
} from '../../../server/story/ffmpeg-runner'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly kills: (string | number | undefined)[] = []
  autoCloseOnKill = true
  closeCode: number | null = null

  kill(signal?: string | number): boolean {
    this.kills.push(signal)

    if (this.autoCloseOnKill) {
      queueMicrotask(() => this.emit('close', this.closeCode, signal))
    }

    return true
  }
}

const OPTIONS = {
  binary: 'ffmpeg',
  args: ['-nostdin', '-i', 'input.mp4', 'output.mp4'],
  cwd: '/tmp/story',
  timeoutMs: 5_000,
}

function start(options: Partial<typeof OPTIONS> = {}) {
  const child = new FakeChild()
  spawnMock.mockReturnValue(child)
  const runner = new SpawnFfmpegRunner()
  const promise = runner.run({ ...OPTIONS, ...options })

  return { child, promise }
}

beforeEach(() => {
  spawnMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SpawnFfmpegRunner process contract', () => {
  it('spawns the binary with an argument array and no shell', async () => {
    const { child, promise } = start()

    expect(spawnMock).toHaveBeenCalledWith('ffmpeg', OPTIONS.args, {
      cwd: '/tmp/story',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.emit('close', 0)
    await expect(promise).resolves.toEqual({ code: 0, stdout: '', stderr: '' })
  })

  it('never passes user text through a shell string', () => {
    start({ args: ['-i', 'file with spaces; rm -rf /'] })

    const args = spawnMock.mock.calls[0]![1] as readonly string[]

    expect(Array.isArray(args)).toBe(true)
    expect(args).toContain('file with spaces; rm -rf /')
    expect(spawnMock.mock.calls[0]![2]).toMatchObject({ shell: false })
  })

  it('returns the exit code and captured output', async () => {
    const { child, promise } = start()

    child.stdout.emit('data', Buffer.from('probe-json'))
    child.stderr.emit('data', Buffer.from('warning'))
    child.emit('close', 0)

    await expect(promise).resolves.toEqual({
      code: 0,
      stdout: 'probe-json',
      stderr: 'warning',
    })
  })

  it('returns a non-zero code without throwing', async () => {
    const { child, promise } = start()

    child.stderr.emit('data', Buffer.from('invalid data'))
    child.emit('close', 1)

    await expect(promise).resolves.toMatchObject({ code: 1, stderr: 'invalid data' })
  })

  it('bounds stdout and stderr to 64 KiB', async () => {
    const { child, promise } = start()

    child.stderr.emit('data', Buffer.alloc(100_000, 120))
    child.stdout.emit('data', Buffer.alloc(100_000, 121))
    child.emit('close', 0)

    const result = await promise

    expect(result.stderr.length).toBe(65_536)
    expect(result.stdout.length).toBe(65_536)
  })

  it('ignores repeated close events', async () => {
    const { child, promise } = start()

    child.emit('close', 0)
    child.emit('close', 0)

    await expect(promise).resolves.toMatchObject({ code: 0 })
  })
})

describe('SpawnFfmpegRunner failures', () => {
  it('kills with SIGKILL and rejects with FfmpegTimeoutError on timeout', async () => {
    const { child, promise } = start({ timeoutMs: 5 })

    await expect(promise).rejects.toBeInstanceOf(FfmpegTimeoutError)
    expect(child.kills).toEqual(['SIGKILL'])
  })

  it('kills with SIGKILL when the abort signal fires', async () => {
    const controller = new AbortController()
    const child = new FakeChild()
    spawnMock.mockReturnValue(child)
    const promise = new SpawnFfmpegRunner().run({
      ...OPTIONS,
      signal: controller.signal,
    })

    controller.abort()

    await expect(promise).rejects.toBeInstanceOf(FfmpegTimeoutError)
    expect(child.kills).toEqual(['SIGKILL'])
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const child = new FakeChild()
    spawnMock.mockReturnValue(child)

    await expect(new SpawnFfmpegRunner().run({
      ...OPTIONS,
      signal: controller.signal,
    })).rejects.toBeInstanceOf(FfmpegTimeoutError)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('removes the abort listener after settling', async () => {
    const controller = new AbortController()
    const child = new FakeChild()
    spawnMock.mockReturnValue(child)
    const promise = new SpawnFfmpegRunner().run({
      ...OPTIONS,
      signal: controller.signal,
    })

    child.emit('close', 0)
    await promise
    controller.abort()

    expect(child.kills).toEqual([])
  })

  it('rejects with FfmpegBinaryMissingError when spawn throws', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    await expect(new SpawnFfmpegRunner().run(OPTIONS))
      .rejects.toBeInstanceOf(FfmpegBinaryMissingError)
  })

  it('rejects with FfmpegBinaryMissingError on a child error event', async () => {
    const { child, promise } = start()

    child.emit('error', new Error('spawn ENOENT'))

    await expect(promise).rejects.toBeInstanceOf(FfmpegBinaryMissingError)
  })

  it('creates a runner through the factory', () => {
    expect(createFfmpegRunner()).toBeInstanceOf(SpawnFfmpegRunner)
  })
})
