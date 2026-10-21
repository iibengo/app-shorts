import { StoryError } from './errors'

export interface StoryRateLimitConfig {
  readonly createLimit: number
  readonly createWindowMs: number
  readonly uploadLimit: number
  readonly uploadWindowMs: number
  readonly uploadIpLimit: number
  readonly uploadIpWindowMs: number
  readonly commandLimit: number
  readonly commandWindowMs: number
  readonly pollWindowMs: number
  readonly cancelLimit: number
  readonly cancelWindowMs: number
  readonly assembleLimit: number
  readonly assembleWindowMs: number
  readonly maxActiveStories: number
  readonly dailyBudgetUsd: number
}

export interface StoryRateLimiterOptions {
  readonly config: StoryRateLimitConfig
  readonly now?: () => number
}

const MAX_ENTRIES = 10_000
const PENDING_CREATION_TTL_MS = 300_000

export const DEFAULT_STORY_RATE_LIMIT_CONFIG: StoryRateLimitConfig = {
  createLimit: 3,
  createWindowMs: 3_600_000,
  uploadLimit: 5,
  uploadWindowMs: 600_000,
  uploadIpLimit: 20,
  uploadIpWindowMs: 3_600_000,
  commandLimit: 10,
  commandWindowMs: 60_000,
  pollWindowMs: 1_500,
  cancelLimit: 3,
  cancelWindowMs: 60_000,
  assembleLimit: 3,
  assembleWindowMs: 3_600_000,
  maxActiveStories: 2,
  dailyBudgetUsd: 50,
}

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000))
}

function nextUtcMidnight(now: number): number {
  const date = new Date(now)

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

export class StoryRateLimiter {
  private readonly config: StoryRateLimitConfig
  private readonly now: () => number
  private readonly createWindows = new Map<string, number[]>()
  private readonly uploadWindows = new Map<string, number[]>()
  private readonly uploadIpWindows = new Map<string, number[]>()
  private readonly commandWindows = new Map<string, number[]>()
  private readonly pollWindows = new Map<string, number[]>()
  private readonly cancelWindows = new Map<string, number[]>()
  private readonly assembleWindows = new Map<string, number[]>()
  private readonly pendingCreations = new Map<string, number>()
  private budgetDay = ''
  private budgetSpentUsd = 0

  constructor(options: StoryRateLimiterOptions) {
    this.config = options.config
    this.now = options.now ?? Date.now
  }

  consumeCreate(sessionId: string): void {
    this.consumeFixedWindow(
      this.createWindows,
      `create:${sessionId}`,
      this.config.createLimit,
      this.config.createWindowMs,
    )
  }

  consumeUpload(sessionId: string, ipHash: string): void {
    this.consumeFixedWindow(
      this.uploadWindows,
      `upload:${sessionId}`,
      this.config.uploadLimit,
      this.config.uploadWindowMs,
    )
    this.consumeFixedWindow(
      this.uploadIpWindows,
      `upload-ip:${ipHash}`,
      this.config.uploadIpLimit,
      this.config.uploadIpWindowMs,
    )
  }

  consumeCommand(sessionId: string): void {
    this.consumeFixedWindow(
      this.commandWindows,
      `command:${sessionId}`,
      this.config.commandLimit,
      this.config.commandWindowMs,
    )
  }

  consumePoll(storyId: string): void {
    this.consumeFixedWindow(this.pollWindows, `poll:${storyId}`, 1, this.config.pollWindowMs, 2)
  }

  consumeCancel(storyId: string): void {
    this.consumeFixedWindow(
      this.cancelWindows,
      `cancel:${storyId}`,
      this.config.cancelLimit,
      this.config.cancelWindowMs,
    )
  }

  consumeAssemble(storyId: string): void {
    this.consumeFixedWindow(
      this.assembleWindows,
      `assemble:${storyId}`,
      this.config.assembleLimit,
      this.config.assembleWindowMs,
    )
  }

  assertCanCreate(
    sessionId: string,
    sessionActiveStories: number,
    globalActiveStories: number,
  ): void {
    this.cleanupPending()

    if (sessionActiveStories > 0 || this.pendingCreations.has(sessionId)) {
      throw new StoryError('story-in-progress')
    }

    if (globalActiveStories + this.pendingCreations.size >= this.config.maxActiveStories) {
      throw new StoryError('server-busy', { retryAfterSeconds: 30 })
    }
  }

  beginCreation(sessionId: string): void {
    this.pendingCreations.set(sessionId, this.now())
    this.cleanupPending()
  }

  endCreation(sessionId: string): void {
    this.pendingCreations.delete(sessionId)
  }

  consumeDailyBudget(costUsd: number): void {
    const now = this.now()
    const day = new Date(now).toISOString().slice(0, 10)

    if (day !== this.budgetDay) {
      this.budgetDay = day
      this.budgetSpentUsd = 0
    }

    if (this.budgetSpentUsd + costUsd > this.config.dailyBudgetUsd) {
      throw new StoryError('daily-budget-exhausted', {
        retryAfterSeconds: secondsUntil(nextUtcMidnight(now), now),
      })
    }

    this.budgetSpentUsd += costUsd
  }

  private cleanupPending(): void {
    const threshold = this.now() - PENDING_CREATION_TTL_MS

    for (const [sessionId, startedAt] of this.pendingCreations) {
      if (startedAt <= threshold) {
        this.pendingCreations.delete(sessionId)
      }
    }
  }

  private consumeFixedWindow(
    map: Map<string, number[]>,
    key: string,
    limit: number,
    windowMs: number,
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

      throw new StoryError('rate-limited', { retryAfterSeconds })
    }

    timestamps.push(now)
    map.set(key, timestamps)
    this.enforceCapacity(map)
  }

  private enforceCapacity(map: Map<string, number[]>): void {
    if (map.size <= MAX_ENTRIES) return

    const now = this.now()

    for (const [key, timestamps] of map) {
      const last = timestamps[timestamps.length - 1]

      if (last === undefined || last <= now - this.config.uploadIpWindowMs) {
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

export function createStoryRateLimiter(
  options: StoryRateLimiterOptions,
): StoryRateLimiter {
  return new StoryRateLimiter(options)
}
