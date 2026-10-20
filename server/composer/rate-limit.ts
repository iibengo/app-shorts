import { ComposerError } from './errors'

export interface RateLimitConfig {
  readonly generateLimit: number
  readonly generateWindowMs: number
  readonly uploadLimit: number
  readonly uploadWindowMs: number
  readonly maxActiveJobs: number
  readonly maxGlobalJobs: number
  readonly dailyGenerationBudget: number
  readonly jobTtlMs: number
}

export interface RateLimiterOptions {
  readonly config: RateLimitConfig
  readonly now?: () => number
}

export type IdempotencyEntry<T> =
  | {
      readonly status: 'pending'
      readonly bodyHash: string
      readonly expiresAt: number
    }
  | {
      readonly status: 'done'
      readonly bodyHash: string
      readonly value: T
      readonly expiresAt: number
    }

const MAX_ENTRIES = 10_000
const POLL_WINDOW_MS = 1_500
const CANCEL_LIMIT = 3
const CANCEL_WINDOW_MS = 60_000
const UPLOAD_IP_LIMIT = 20
const UPLOAD_IP_WINDOW_MS = 3_600_000
const IDEMPOTENCY_TTL_MS = 600_000
const IDEMPOTENCY_MAX_ENTRIES = 1_000

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000))
}

export class RateLimiter {
  private readonly config: RateLimitConfig
  private readonly now: () => number
  private readonly generationWindows = new Map<string, number[]>()
  private readonly uploadWindows = new Map<string, number[]>()
  private readonly uploadIpWindows = new Map<string, number[]>()
  private readonly activeJobs = new Map<string, number>()
  private readonly pollWindows = new Map<string, number[]>()
  private readonly cancelWindows = new Map<string, number[]>()
  private budgetDay = ''
  private budgetCount = 0

  constructor(options: RateLimiterOptions) {
    this.config = options.config
    this.now = options.now ?? Date.now
  }

  consumeGeneration(sessionId: string): void {
    this.consumeFixedWindow(
      this.generationWindows,
      `gen:${sessionId}`,
      this.config.generateLimit,
      this.config.generateWindowMs,
      'rate-limited',
    )
  }

  consumeUpload(sessionId: string, ipHash: string): void {
    this.consumeFixedWindow(
      this.uploadWindows,
      `upload:${sessionId}`,
      this.config.uploadLimit,
      this.config.uploadWindowMs,
      'rate-limited',
    )
    this.consumeFixedWindow(
      this.uploadIpWindows,
      `upload-ip:${ipHash}`,
      UPLOAD_IP_LIMIT,
      UPLOAD_IP_WINDOW_MS,
      'rate-limited',
    )
  }

  consumeDailyBudget(): void {
    const now = this.now()
    const day = new Date(now).toISOString().slice(0, 10)

    if (day !== this.budgetDay) {
      this.budgetDay = day
      this.budgetCount = 0
    }

    if (this.budgetCount >= this.config.dailyGenerationBudget) {
      const date = new Date(now)
      const nextUtcDay = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 1,
      )

      throw new ComposerError('budget-exhausted', {
        retryAfterSeconds: secondsUntil(nextUtcDay, now),
      })
    }

    this.budgetCount += 1
  }

  assertCanStartJob(sessionId: string): void {
    this.cleanupActiveJobs()

    if (this.activeJobs.has(sessionId)) {
      throw new ComposerError('generation-in-progress')
    }

    if (this.activeJobs.size >= this.config.maxGlobalJobs) {
      throw new ComposerError('server-busy', { retryAfterSeconds: 30 })
    }
  }

  reserveJob(sessionId: string): void {
    this.assertCanStartJob(sessionId)
    this.activeJobs.set(sessionId, this.now())
  }

  releaseJob(sessionId: string): void {
    this.activeJobs.delete(sessionId)
  }

  hasActiveJob(sessionId: string): boolean {
    this.cleanupActiveJobs()

    return this.activeJobs.has(sessionId)
  }

  consumePoll(sessionId: string, jobId: string): void {
    this.consumeFixedWindow(
      this.pollWindows,
      `poll:${sessionId}:${jobId}`,
      1,
      POLL_WINDOW_MS,
      'rate-limited',
      2,
    )
  }

  consumeCancel(jobId: string): void {
    this.consumeFixedWindow(
      this.cancelWindows,
      `cancel:${jobId}`,
      CANCEL_LIMIT,
      CANCEL_WINDOW_MS,
      'rate-limited',
    )
  }

  private consumeFixedWindow(
    map: Map<string, number[]>,
    key: string,
    limit: number,
    windowMs: number,
    errorCode: 'rate-limited',
    minimumRetryAfter = 1,
  ): void {
    const now = this.now()
    const threshold = now - windowMs
    const timestamps = (map.get(key) ?? []).filter((value) => value > threshold)

    if (timestamps.length >= limit) {
      const oldest = timestamps[0] ?? now
      const retryAfterSeconds = Math.max(
        minimumRetryAfter,
        secondsUntil(oldest + windowMs, now),
      )

      map.set(key, timestamps)

      throw new ComposerError(errorCode, { retryAfterSeconds })
    }

    timestamps.push(now)
    map.set(key, timestamps)
    this.enforceCapacity(map)
  }

  private cleanupActiveJobs(): void {
    const threshold = this.now() - this.config.jobTtlMs

    for (const [sessionId, startedAt] of this.activeJobs) {
      if (startedAt <= threshold) {
        this.activeJobs.delete(sessionId)
      }
    }
  }

  private enforceCapacity(map: Map<string, number[]>): void {
    if (map.size <= MAX_ENTRIES) return

    const now = this.now()

    for (const [key, timestamps] of map) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1]! <= now - UPLOAD_IP_WINDOW_MS) {
        map.delete(key)
      }
    }

    while (map.size > MAX_ENTRIES) {
      const oldestKey = map.keys().next().value

      if (oldestKey === undefined) return

      map.delete(oldestKey)
    }
  }
}

export class IdempotencyStore<T> {
  private readonly entries = new Map<string, IdempotencyEntry<T>>()
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: {
    readonly ttlMs?: number
    readonly maxEntries?: number
    readonly now?: () => number
  } = {}) {
    this.ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS
    this.maxEntries = options.maxEntries ?? IDEMPOTENCY_MAX_ENTRIES
    this.now = options.now ?? Date.now
  }

  get(key: string): IdempotencyEntry<T> | undefined {
    this.cleanup()

    const entry = this.entries.get(key)

    if (!entry) return undefined

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }

    return entry
  }

  setPending(key: string, bodyHash: string): void {
    this.cleanup()
    this.entries.set(key, {
      status: 'pending',
      bodyHash,
      expiresAt: this.now() + this.ttlMs,
    })
    this.enforceCapacity()
  }

  setDone(key: string, bodyHash: string, value: T): void {
    this.entries.set(key, {
      status: 'done',
      bodyHash,
      value,
      expiresAt: this.now() + this.ttlMs,
    })
    this.enforceCapacity()
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  private cleanup(): void {
    const now = this.now()

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key)
      }
    }
  }

  private enforceCapacity(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value

      if (oldestKey === undefined) return

      this.entries.delete(oldestKey)
    }
  }
}
