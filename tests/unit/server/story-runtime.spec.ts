// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  canonicalStoryBody,
  createStoryRuntime,
  getStoryRuntime,
  storyBodyHash,
} from '../../../server/story/runtime'
import { StoryError } from '../../../server/story/errors'
import { createTestEvent } from '../../helpers/h3'
import { makeStoryRuntime } from '../../helpers/story-runtime'

const FAL_KEY = 'fal-test-key'
const DEEPSEEK_KEY = 'deepseek-test-key'
const DATABASE_URL = 'postgresql://ai_shorts:ai_shorts@localhost:5432/ai_shorts?schema=public'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createStoryRuntime configuration', () => {
  it('does not throw without keys or database and reports capabilities', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('FFMPEG_PATH', '/missing/ffmpeg')
    vi.stubEnv('FFPROBE_PATH', '/missing/ffprobe')

    const runtime = createStoryRuntime({ falKey: '', deepseekKey: '', story: {} })

    expect(runtime.hasFalKey).toBe(false)
    expect(runtime.hasDeepSeekKey).toBe(false)
    expect(runtime.hasDatabase).toBe(false)
    expect(runtime.hasFfmpeg).toBe(false)
    expect(runtime.director).toBeNull()
    expect(runtime.repository).toBeNull()
    expect(runtime.service).toBeNull()
    expect(runtime.keyframes).toBeNull()
    expect(runtime.videos).toBeNull()
    expect(runtime.mediaStorage).toBeNull()
    expect(runtime.assembler).toBeNull()
    expect(runtime.reconciler).toBeNull()
    expect(runtime.pollAfterMs).toBe(2_500)
    expect(runtime.storyTtlMs).toBe(86_400_000)
    expect(runtime.reconcilerEnabled).toBe(true)
    expect(runtime.reconcilerIntervalMs).toBe(5_000)
    expect(runtime.videoConcurrency).toBe(2)
    expect(runtime.assemblyTimeoutMs).toBe(180_000)
    expect(runtime.canonTimeoutMs).toBe(60_000)
    expect(runtime.beatsTimeoutMs).toBe(60_000)
    expect(runtime.visualTimeoutMs).toBe(40_000)
    expect(runtime.directorTotalTimeoutMs).toBe(180_000)
    expect(runtime.uploadIdempotency.size).toBe(0)
    expect(runtime.ipSalt).toMatch(/^[a-f0-9]{64}$/)
  })

  it('composes the Fal services, director and assembler when keys exist', () => {
    vi.stubEnv('DATABASE_URL', '')

    const runtime = createStoryRuntime({
      falKey: FAL_KEY,
      deepseekKey: DEEPSEEK_KEY,
      story: {},
    })

    expect(runtime.hasFalKey).toBe(true)
    expect(runtime.hasDeepSeekKey).toBe(true)
    expect(runtime.director).not.toBeNull()
    expect(runtime.keyframes).not.toBeNull()
    expect(runtime.videos).not.toBeNull()
    expect(runtime.mediaStorage).not.toBeNull()
    expect(runtime.assembler).not.toBeNull()
    expect(runtime.client).toBeDefined()
    expect(runtime.queue).toBeDefined()
    expect(runtime.storage).toBeDefined()
    expect(runtime.service).toBeNull()
    expect(runtime.repository).toBeNull()
  })

  it('creates the Prisma repository and service when DATABASE_URL is set', () => {
    vi.stubEnv('DATABASE_URL', DATABASE_URL)
    vi.stubEnv('FFMPEG_PATH', '/missing/ffmpeg')
    vi.stubEnv('FFPROBE_PATH', '/missing/ffprobe')

    const runtime = createStoryRuntime({
      falKey: FAL_KEY,
      deepseekKey: DEEPSEEK_KEY,
      story: {},
    })

    expect(runtime.hasDatabase).toBe(true)
    expect(runtime.repository).not.toBeNull()
    expect(runtime.service).not.toBeNull()
    expect(runtime.hasFfmpeg).toBe(false)
    expect(runtime.assembler).not.toBeNull()
  })

  it('reads the QC configuration defaults and overrides', () => {
    vi.stubEnv('DATABASE_URL', '')

    const disabled = createStoryRuntime({
      falKey: FAL_KEY,
      deepseekKey: DEEPSEEK_KEY,
      story: {},
    })

    expect(disabled.qcEnabled).toBe(false)
    expect(disabled.qcMinConfidence).toBe(0.7)
    expect(disabled.costQcUsd).toBe(0.02)

    const enabled = createStoryRuntime({
      falKey: FAL_KEY,
      deepseekKey: DEEPSEEK_KEY,
      story: {
        qcEnabled: true,
        qcMinConfidence: 0.55,
        costQcUsd: 0.03,
      },
    })

    expect(enabled.qcEnabled).toBe(true)
    expect(enabled.qcMinConfidence).toBe(0.55)
    expect(enabled.costQcUsd).toBe(0.03)
  })

  it('applies the story configuration with safe numeric fallbacks', () => {    vi.stubEnv('DATABASE_URL', '')

    const runtime = createStoryRuntime({
      falKey: FAL_KEY,
      deepseekKey: DEEPSEEK_KEY,
      composer: {
        falQueueBaseUrl: 'http://127.0.0.1:9999',
        falRunBaseUrl: 'http://127.0.0.1:9999',
        falStorageBaseUrl: 'http://127.0.0.1:9999',
      },
      story: {
        maxCostUsd: 3,
        costDirectorUsd: 0.02,
        costNarrativeUsd: 0.012,
        costVisualUsd: 0.006,
        costDirectorRepairUsd: 0.007,
        costKeyframeUsd: 0.04,
        costKeyframeReferenceUsd: 0.06,
        costVideoFastUsd: 0.3,
        costVideoQualityUsd: 0.6,
        dailyBudgetUsd: 20,
        ttlMs: 1_000,
        reconcilerEnabled: false,
        reconcilerIntervalMs: 8_000,
        leaseMs: 30_000,
        keyframeConcurrency: 2,
        videoConcurrency: 4,
        pollAfterMs: 3_000,
        createLimit: 2,
        createWindowMs: 60_000,
        uploadLimit: 1,
        uploadWindowMs: 30_000,
        commandLimit: 5,
        commandWindowMs: 30_000,
        maxActiveStories: 1,
        canonTimeoutMs: 21_000,
        beatsTimeoutMs: 31_000,
        visualTimeoutMs: 22_000,
        directorTotalTimeoutMs: 77_000,
        deepseekBaseUrl: 'http://127.0.0.1:9999',
        assemblyTimeoutMs: 30_000,
        assemblyConcurrency: 1,
      },
    })

    expect(runtime.pollAfterMs).toBe(3_000)
    expect(runtime.storyTtlMs).toBe(1_000)
    expect(runtime.reconcilerEnabled).toBe(false)
    expect(runtime.reconcilerIntervalMs).toBe(8_000)
    expect(runtime.videoConcurrency).toBe(4)
    expect(runtime.assemblyTimeoutMs).toBe(30_000)
    expect(runtime.canonTimeoutMs).toBe(21_000)
    expect(runtime.beatsTimeoutMs).toBe(31_000)
    expect(runtime.visualTimeoutMs).toBe(22_000)
    expect(runtime.directorTotalTimeoutMs).toBe(77_000)

    const costs = (runtime.costGuard as unknown as { costs: Record<string, number> }).costs

    expect(costs).toMatchObject({
      maxStoryCostUsd: 3,
      directorCostUsd: 0.02,
      narrativeCostUsd: 0.012,
      visualCostUsd: 0.006,
      directorRepairCostUsd: 0.007,
      keyframeCostUsd: 0.04,
      keyframeReferenceCostUsd: 0.06,
      videoFastCostUsd: 0.3,
      videoQualityCostUsd: 0.6,
      dailyBudgetUsd: 20,
    })

    expect(() => runtime.rateLimiter.consumeCreate('session-a')).not.toThrow()
    expect(() => runtime.rateLimiter.consumeCreate('session-a')).not.toThrow()
    expect(() => runtime.rateLimiter.consumeCreate('session-a')).toThrow(StoryError)
  })

  it('falls back to safe defaults for invalid configuration values', () => {
    vi.stubEnv('DATABASE_URL', '')

    const runtime = createStoryRuntime({
      falKey: FAL_KEY,
      story: {
        pollAfterMs: 0,
        ttlMs: -1,
        reconcilerIntervalMs: 'not-a-number' as unknown as number,
        videoConcurrency: Number.NaN,
        maxCostUsd: 0,
        dailyBudgetUsd: -10,
        reconcilerEnabled: 'yes' as unknown as boolean,
      },
    })

    expect(runtime.pollAfterMs).toBe(2_500)
    expect(runtime.storyTtlMs).toBe(86_400_000)
    expect(runtime.reconcilerIntervalMs).toBe(5_000)
    expect(runtime.videoConcurrency).toBe(2)
    expect(runtime.reconcilerEnabled).toBe(true)
    expect(runtime.canonTimeoutMs).toBe(60_000)
    expect(runtime.beatsTimeoutMs).toBe(60_000)
    expect(runtime.visualTimeoutMs).toBe(40_000)
    expect(runtime.directorTotalTimeoutMs).toBe(180_000)
    expect((runtime.costGuard as unknown as { costs: Record<string, number> }).costs.maxStoryCostUsd)
      .toBe(8)
    expect((runtime.costGuard as unknown as { costs: Record<string, number> }).costs.dailyBudgetUsd)
      .toBe(50)
  })

  it('does not log when NODE_ENV is test', () => {
    vi.stubEnv('DATABASE_URL', '')
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    createStoryRuntime({ falKey: FAL_KEY, deepseekKey: '', story: {} })

    expect(info).not.toHaveBeenCalled()
  })
})

describe('getStoryRuntime override', () => {
  it('returns the injected runtime without touching runtimeConfig', () => {
    const injected = makeStoryRuntime()
    const event = createTestEvent({ method: 'GET', path: '/api/story/1' })
    ;(event.context as { storyRuntime?: unknown }).storyRuntime = injected

    expect(getStoryRuntime(event)).toBe(injected)
  })
})

describe('story body hashing', () => {
  it('hashes the canonical request deterministically', () => {
    const request = {
      premise: 'Una premisa de prueba con longitud suficiente.',
      sceneCount: 5 as const,
      preset: 'fast' as const,
      mode: 'faithful' as const,
      referenceUrl: null,
      referenceExpiresAt: null,
    }

    const canonical = canonicalStoryBody(request)

    expect(canonical).toBe(JSON.stringify([
      request.premise,
      request.sceneCount,
      request.preset,
      request.mode,
      null,
      null,
    ]))
    expect(storyBodyHash(canonical)).toBe(
      createHash('sha256').update(canonical).digest('hex'),
    )
    expect(storyBodyHash(canonical)).toBe(storyBodyHash(canonical))
    expect(storyBodyHash(canonicalStoryBody({ ...request, preset: 'quality' })))
      .not.toBe(storyBodyHash(canonical))
  })
})
