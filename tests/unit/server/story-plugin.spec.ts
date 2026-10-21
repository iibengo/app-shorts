// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

const { default: storyReconcilerPlugin } = await import(
  '../../../server/plugins/story-reconciler'
)

function nitroApp() {
  return { hooks: { hook: vi.fn() } }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('story reconciler plugin', () => {
  it('is a no-op in the test environment', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test')

    const app = nitroApp()
    storyReconcilerPlugin(app)

    expect(vi.getTimerCount()).toBe(0)
    expect(app.hooks.hook).not.toHaveBeenCalled()
    expect((globalThis as { storyReconcilerTimer?: unknown }).storyReconcilerTimer)
      .toBeUndefined()
  })

  it('is a no-op without DATABASE_URL', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DATABASE_URL', '')

    const app = nitroApp()
    storyReconcilerPlugin(app)

    expect(vi.getTimerCount()).toBe(0)
    expect(app.hooks.hook).not.toHaveBeenCalled()
  })

  it('registers a single unref timer and clears it on close', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/plugins/story-reconciler.ts'),
      'utf8',
    )

    expect(source).toContain("process.env.NODE_ENV === 'test'")
    expect(source).toContain('process.env.DATABASE_URL')
    expect(source).toContain('globalState.storyReconcilerTimer')
    expect(source).toContain('timer.unref?.()')
    expect(source).toContain("hooks.hook('close'")
    expect(source).toContain('clearInterval(timer)')
    expect(source).toContain('reconcilerEnabled')
  })
})