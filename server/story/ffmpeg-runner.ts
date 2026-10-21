import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

const MAX_STDERR_CHARS = 64 * 1024

export class FfmpegBinaryMissingError extends Error {
  constructor(binary: string) {
    super(`ffmpeg-binary-missing: ${binary}`)
    this.name = 'FfmpegBinaryMissingError'
  }
}

export class FfmpegTimeoutError extends Error {
  constructor() {
    super('ffmpeg-timeout')
    this.name = 'FfmpegTimeoutError'
  }
}

export interface FfmpegRunOptions {
  readonly binary: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface FfmpegRunResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

export interface FfmpegRunner {
  run(options: FfmpegRunOptions): Promise<FfmpegRunResult>
}

export class SpawnFfmpegRunner implements FfmpegRunner {
  run(options: FfmpegRunOptions): Promise<FfmpegRunResult> {
    if (options.signal?.aborted) {
      return Promise.reject(new FfmpegTimeoutError())
    }

    return new Promise<FfmpegRunResult>((resolve, reject) => {
      let child: ChildProcess

      try {
        child = spawn(options.binary, [...options.args], {
          cwd: options.cwd,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch {
        reject(new FfmpegBinaryMissingError(options.binary))

        return
      }

      let stderr = ''
      let stdout = ''
      let timedOut = false
      let settled = false

      const cleanup = (): void => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }

      const settle = (action: () => void): void => {
        if (settled) return

        settled = true
        cleanup()
        action()
      }

      const onAbort = (): void => {
        timedOut = true
        child.kill('SIGKILL')
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, options.timeoutMs)

      options.signal?.addEventListener('abort', onAbort, { once: true })

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length >= MAX_STDERR_CHARS) return

        stderr += chunk.toString('utf8').slice(0, MAX_STDERR_CHARS - stderr.length)
      })

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length >= MAX_STDERR_CHARS) return

        stdout += chunk.toString('utf8').slice(0, MAX_STDERR_CHARS - stdout.length)
      })

      child.on('error', () => {
        settle(() => reject(new FfmpegBinaryMissingError(options.binary)))
      })

      child.on('close', (code) => {
        settle(() => {
          if (timedOut) {
            reject(new FfmpegTimeoutError())

            return
          }

          resolve({ code, stdout, stderr })
        })
      })
    })
  }
}

export function createFfmpegRunner(): FfmpegRunner {
  return new SpawnFfmpegRunner()
}
