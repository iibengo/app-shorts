// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { StoryError } from '../../../server/story/errors'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  StoryRateLimiter,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'

const START = Date.parse('2026-10-21T12:00:00.000Z')

function setup(overrides: Partial<typeof DEFAULT_STORY_RATE_LIMIT_CONFIG> = {}) {
  const clock = { now: START }
  const limiter = new StoryRateLimiter({
    config: { ...DEFAULT_STORY_RATE_LIMIT_CONFIG, ...overrides },
    now: () => clock.now,
  })

  return {
    limiter,
    advance(ms: number) {
      clock.now += ms
    },
    set(value: number) {
      clock.now = value
    },
  }
}

function catchStoryError(run: () => void): StoryError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)

    return error as StoryError
  }

  throw new Error('expected a StoryError')
}

describe('story rate limiter fixed windows', () => {
  it('allows 3 creations per hour and 4th is rate limited', () => {
    const { limiter } = setup()

    expect(() => limiter.consumeCreate('session-a')).not.toThrow()
    expect(() => limiter.consumeCreate('session-a')).not.toThrow()
    expect(() => limiter.consumeCreate('session-a')).not.toThrow()

    const error = catchStoryError(() => limiter.consumeCreate('session-a'))

    expect(error.code).toBe('rate-limited')
    expect(error.status).toBe(429)
    expect(error.retryable).toBe(true)
    expect(error.retryAfterSeconds).toBe(3_600)
  })

  it('resets the create window after an hour', () => {
    const { limiter, advance } = setup()

    for (let index = 0; index < 3; index += 1) limiter.consumeCreate('session-a')
    expect(() => limiter.consumeCreate('session-a')).toThrow(StoryError)

    advance(3_600_000)
    expect(() => limiter.consumeCreate('session-a')).not.toThrow()
  })

  it('keeps sessions independent', () => {
    const { limiter } = setup()

    for (let index = 0; index < 3; index += 1) limiter.consumeCreate('session-a')

    expect(() => limiter.consumeCreate('session-b')).not.toThrow()
  })

  it('limits uploads to 5 per 10 minutes per session', () => {
    const { limiter } = setup()

    for (let index = 0; index < 5; index += 1) {
      limiter.consumeUpload('session-a', `ip-${index}`)
    }

    const error = catchStoryError(() => limiter.consumeUpload('session-a', 'ip-x'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBe(600)
  })

  it('limits uploads to 20 per hour per IP across sessions', () => {
    const { limiter } = setup()

    for (let index = 0; index < 20; index += 1) {
      limiter.consumeUpload(`session-${index}`, 'same-ip')
    }

    const error = catchStoryError(() => limiter.consumeUpload('session-new', 'same-ip'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBe(3_600)
  })

  it('limits commands to 10 per minute per session', () => {
    const { limiter } = setup()

    for (let index = 0; index < 10; index += 1) limiter.consumeCommand('session-a')

    const error = catchStoryError(() => limiter.consumeCommand('session-a'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBe(60)
  })

  it('limits polling to one request every 1.5 seconds per story', () => {
    const { limiter, advance } = setup()

    limiter.consumePoll('story-1')

    const error = catchStoryError(() => limiter.consumePoll('story-1'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(2)

    advance(1_500)
    expect(() => limiter.consumePoll('story-1')).not.toThrow()
  })

  it('keeps polling limits per story', () => {
    const { limiter } = setup()

    limiter.consumePoll('story-1')
    expect(() => limiter.consumePoll('story-2')).not.toThrow()
  })

  it('limits cancellations to 3 per minute per story', () => {
    const { limiter } = setup()

    for (let index = 0; index < 3; index += 1) limiter.consumeCancel('story-1')

    const error = catchStoryError(() => limiter.consumeCancel('story-1'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBe(60)
  })

  it('limits assembly retries to 3 per hour per story', () => {
    const { limiter } = setup()

    for (let index = 0; index < 3; index += 1) limiter.consumeAssemble('story-1')

    const error = catchStoryError(() => limiter.consumeAssemble('story-1'))

    expect(error.code).toBe('rate-limited')
    expect(error.retryAfterSeconds).toBe(3_600)
  })

  it('bounds the in-memory maps and keeps accepting new keys', () => {
    const { limiter } = setup()

    for (let index = 0; index < 10_001; index += 1) {
      limiter.consumeCreate(`session-${index}`)
    }

    expect(() => limiter.consumeCreate('session-0')).not.toThrow()
  })
})

describe('story concurrency guards', () => {
  it('rejects a second active story for the same session', () => {
    const { limiter } = setup()

    const error = catchStoryError(() => limiter.assertCanCreate('session-a', 1, 0))

    expect(error.code).toBe('story-in-progress')
    expect(error.status).toBe(409)
    expect(error.retryable).toBe(false)
  })

  it('rejects a concurrent creation for the same session while pending', () => {
    const { limiter } = setup()
    limiter.beginCreation('session-a')

    const error = catchStoryError(() => limiter.assertCanCreate('session-a', 0, 0))

    expect(error.code).toBe('story-in-progress')
  })

  it('releases the pending creation slot', () => {
    const { limiter } = setup()
    limiter.beginCreation('session-a')
    limiter.endCreation('session-a')

    expect(() => limiter.assertCanCreate('session-a', 0, 0)).not.toThrow()
  })

  it('expires a pending creation slot after five minutes', () => {
    const { limiter, advance } = setup()
    limiter.beginCreation('session-a')

    advance(300_001)

    expect(() => limiter.assertCanCreate('session-a', 0, 0)).not.toThrow()
  })

  it('rejects creation when the instance is busy and returns 30 seconds', () => {
    const { limiter } = setup()

    const error = catchStoryError(() => limiter.assertCanCreate('session-new', 0, 2))

    expect(error.code).toBe('server-busy')
    expect(error.status).toBe(429)
    expect(error.retryable).toBe(true)
    expect(error.retryAfterSeconds).toBe(30)
  })

  it('counts pending creations against the instance cap', () => {
    const { limiter } = setup()
    limiter.beginCreation('session-a')

    const error = catchStoryError(() => limiter.assertCanCreate('session-b', 0, 1))

    expect(error.code).toBe('server-busy')
  })
})

describe('story daily budget', () => {
  it('accumulates the estimated cost and rejects over the daily cap', () => {
    const { limiter } = setup({ dailyBudgetUsd: 1 })

    limiter.consumeDailyBudget(0.6)

    const error = catchStoryError(() => limiter.consumeDailyBudget(0.6))

    expect(error.code).toBe('daily-budget-exhausted')
    expect(error.status).toBe(429)
    expect(error.retryable).toBe(false)
    expect(error.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns the seconds until the next UTC day', () => {
    const { limiter, set } = setup({ dailyBudgetUsd: 1 })

    set(Date.parse('2026-10-21T23:59:00.000Z'))
    limiter.consumeDailyBudget(1)
    const error = catchStoryError(() => limiter.consumeDailyBudget(0.1))

    expect(error.retryAfterSeconds).toBe(60)
  })

  it('resets the budget on the next UTC day', () => {
    const { limiter, set } = setup({ dailyBudgetUsd: 1 })

    set(Date.parse('2026-10-21T23:59:00.000Z'))
    limiter.consumeDailyBudget(1)
    expect(() => limiter.consumeDailyBudget(0.1)).toThrow(StoryError)

    set(Date.parse('2026-10-22T00:00:01.000Z'))
    expect(() => limiter.consumeDailyBudget(0.6)).not.toThrow()
  })

  it('creates a limiter through the factory', () => {
    const limiter = createStoryRateLimiter({
      config: DEFAULT_STORY_RATE_LIMIT_CONFIG,
      now: () => START,
    })

    expect(() => limiter.consumeCreate('session-factory')).not.toThrow()
  })
})
