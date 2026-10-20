// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  IdempotencyStore,
  RateLimiter,
  type RateLimitConfig,
} from '../../../server/composer/rate-limit'

const NOW = Date.parse('2026-10-21T12:00:00.000Z')

const CONFIG: RateLimitConfig = {
  generateLimit: 3,
  generateWindowMs: 600_000,
  uploadLimit: 5,
  uploadWindowMs: 600_000,
  maxActiveJobs: 1,
  maxGlobalJobs: 3,
  dailyGenerationBudget: 50,
  jobTtlMs: 3_600_000,
}

function createLimiter(now = NOW, overrides: Partial<RateLimitConfig> = {}) {
  let clock = now
  const limiter = new RateLimiter({
    config: { ...CONFIG, ...overrides },
    now: () => clock,
  })

  return {
    limiter,
    setNow(value: number) {
      clock = value
    },
    advance(ms: number) {
      clock += ms
    },
  }
}

function codeOf(fn: () => void): string {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown'
  }

  return 'no-error'
}

function retryAfterOf(fn: () => void): number | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { retryAfterSeconds?: number }).retryAfterSeconds
  }

  return undefined
}

describe('RateLimiter generation window', () => {
  it('allows 3 generations per 10 minute fixed window and returns Retry-After', () => {
    const { limiter, advance } = createLimiter()

    expect(() => limiter.consumeGeneration('session-a')).not.toThrow()
    expect(() => limiter.consumeGeneration('session-a')).not.toThrow()
    expect(() => limiter.consumeGeneration('session-a')).not.toThrow()
    expect(codeOf(() => limiter.consumeGeneration('session-a'))).toBe('rate-limited')
    expect(retryAfterOf(() => limiter.consumeGeneration('session-a'))).toBe(600)

    advance(599_999)
    expect(codeOf(() => limiter.consumeGeneration('session-a'))).toBe('rate-limited')

    advance(1)
    expect(() => limiter.consumeGeneration('session-a')).not.toThrow()
  })

  it('keeps session windows independent', () => {
    const { limiter } = createLimiter()

    for (let index = 0; index < 3; index += 1) {
      limiter.consumeGeneration('session-a')
    }

    expect(() => limiter.consumeGeneration('session-b')).not.toThrow()
  })
})

describe('RateLimiter upload windows', () => {
  it('allows 20 tickets per IP per hour across sessions', () => {
    const { limiter, advance } = createLimiter()

    for (let index = 0; index < 20; index += 1) {
      limiter.consumeUpload(`session-${index}`, 'same-ip')
    }

    expect(codeOf(() => limiter.consumeUpload('session-21', 'same-ip'))).toBe(
      'rate-limited',
    )
    expect(retryAfterOf(() => limiter.consumeUpload('session-21', 'same-ip'))).toBe(3600)
    expect(() => limiter.consumeUpload('session-21', 'fresh-ip')).not.toThrow()

    advance(3_600_000)
    expect(() => limiter.consumeUpload('session-22', 'same-ip')).not.toThrow()
  })

  it('limits a single session to 5 uploads regardless of IP', () => {
    const { limiter } = createLimiter()

    for (let index = 0; index < 5; index += 1) {
      limiter.consumeUpload('same-session', `ip-${index}`)
    }

    expect(codeOf(() => limiter.consumeUpload('same-session', 'ip-fresh'))).toBe('rate-limited')
    expect(retryAfterOf(() => limiter.consumeUpload('same-session', 'ip-fresh'))).toBe(600)
  })
})

describe('RateLimiter daily budget', () => {
  it('resets at 00:00 UTC and reports seconds until midnight', () => {
    const { limiter, advance } = createLimiter(NOW, { dailyGenerationBudget: 2 })

    limiter.consumeDailyBudget()
    limiter.consumeDailyBudget()

    expect(codeOf(() => limiter.consumeDailyBudget())).toBe('budget-exhausted')
    const retry = retryAfterOf(() => limiter.consumeDailyBudget())
    expect(retry).toBe(12 * 3_600)

    advance(12 * 3_600_000)
    expect(() => limiter.consumeDailyBudget()).not.toThrow()
  })

  it('is independent from the per-session generation window', () => {
    const { limiter } = createLimiter(NOW, { dailyGenerationBudget: 1 })

    limiter.consumeDailyBudget()
    expect(() => limiter.consumeGeneration('session-a')).not.toThrow()
  })
})

describe('RateLimiter active jobs', () => {
  it('allows one active job per session', () => {
    const { limiter } = createLimiter()

    limiter.reserveJob('session-a')

    expect(codeOf(() => limiter.assertCanStartJob('session-a'))).toBe(
      'generation-in-progress',
    )
    expect(limiter.hasActiveJob('session-a')).toBe(true)

    limiter.releaseJob('session-a')
    expect(() => limiter.assertCanStartJob('session-a')).not.toThrow()
    expect(limiter.hasActiveJob('session-a')).toBe(false)
  })

  it('rejects a fourth global active job with server-busy and Retry-After 30', () => {
    const { limiter } = createLimiter()

    limiter.reserveJob('session-a')
    limiter.reserveJob('session-b')
    limiter.reserveJob('session-c')

    expect(codeOf(() => limiter.assertCanStartJob('session-d'))).toBe('server-busy')
    expect(retryAfterOf(() => limiter.assertCanStartJob('session-d'))).toBe(30)
  })

  it('cleans active jobs after the job TTL', () => {
    const { limiter, advance } = createLimiter(NOW, { jobTtlMs: 1_000 })

    limiter.reserveJob('session-a')
    expect(limiter.hasActiveJob('session-a')).toBe(true)

    advance(1_001)
    expect(limiter.hasActiveJob('session-a')).toBe(false)
    expect(() => limiter.assertCanStartJob('session-a')).not.toThrow()
  })
})

describe('RateLimiter polls and cancels', () => {
  it('allows one poll per 1.5 seconds per job/session with Retry-After 2', () => {
    const { limiter, advance } = createLimiter()

    limiter.consumePoll('session-a', 'job-1')
    expect(codeOf(() => limiter.consumePoll('session-a', 'job-1'))).toBe('rate-limited')
    expect(retryAfterOf(() => limiter.consumePoll('session-a', 'job-1'))).toBe(2)

    expect(() => limiter.consumePoll('session-a', 'job-2')).not.toThrow()
    expect(() => limiter.consumePoll('session-b', 'job-1')).not.toThrow()

    advance(1_500)
    expect(() => limiter.consumePoll('session-a', 'job-1')).not.toThrow()
  })

  it('allows 3 cancellations per minute per job', () => {
    const { limiter, advance } = createLimiter()

    limiter.consumeCancel('job-1')
    limiter.consumeCancel('job-1')
    limiter.consumeCancel('job-1')

    expect(codeOf(() => limiter.consumeCancel('job-1'))).toBe('rate-limited')
    expect(retryAfterOf(() => limiter.consumeCancel('job-1'))).toBe(60)
    expect(() => limiter.consumeCancel('job-2')).not.toThrow()

    advance(60_000)
    expect(() => limiter.consumeCancel('job-1')).not.toThrow()
  })
})

describe('IdempotencyStore', () => {
  it('returns pending and done entries until the TTL expires', () => {
    let now = NOW
    const store = new IdempotencyStore<string>({
      ttlMs: 600_000,
      maxEntries: 2,
      now: () => now,
    })

    store.setPending('key-1', 'body-a')
    expect(store.get('key-1')).toEqual({
      status: 'pending',
      bodyHash: 'body-a',
      expiresAt: NOW + 600_000,
    })

    store.setDone('key-1', 'body-a', 'value-a')
    expect(store.get('key-1')).toMatchObject({ status: 'done', value: 'value-a' })

    now += 600_000
    expect(store.get('key-1')).toBeUndefined()
  })

  it('caps the number of entries by evicting the oldest key', () => {
    let now = NOW
    const store = new IdempotencyStore<string>({ maxEntries: 2, now: () => now })

    store.setDone('key-1', 'a', 'one')
    now += 1
    store.setDone('key-2', 'b', 'two')
    now += 1
    store.setDone('key-3', 'c', 'three')

    expect(store.get('key-1')).toBeUndefined()
    expect(store.get('key-2')).toMatchObject({ value: 'two' })
    expect(store.get('key-3')).toMatchObject({ value: 'three' })
  })

  it('supports explicit deletion', () => {
    const store = new IdempotencyStore<string>()

    store.setPending('key', 'body')
    store.delete('key')

    expect(store.get('key')).toBeUndefined()
  })
})
