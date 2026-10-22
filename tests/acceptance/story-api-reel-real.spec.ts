// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeepSeekClient } from '../../../server/story/deepseek-client'
import { createReelStoryDirector } from '../../../server/story/reel-director'
import { createReelNarrativeDirector } from '../../../server/story/reel-narrative-director'
import { createReelShotDirector } from '../../../server/story/reel-shot-director'
import { createReelStoryService } from '../../../server/story/reel-service'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { makeReelNarrative, makeReelShotList } from '../helpers/reel-fixtures'
import { startDeepSeekStub } from '../helpers/deepseek-stub'
import { FakeReelStoryRepository } from '../helpers/story-reel'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: createStory } = await import('../../../server/api/story/index.post')
const { default: getStory } = await import('../../../server/api/story/[id].get')

const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'
const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const stub = await startDeepSeekStub()

afterAll(async () => {
  await stub.close()
})

beforeEach(() => {
  stub.reset()
})

describe('POST /api/story with real 008 directors', () => {
  it('creates and reads a standard 30 story end-to-end', async () => {
    const fixture = makeReelNarrative('standard', 30, false)
    const shots = makeReelShotList(fixture.narrative, fixture.plan)
    stub.state.contents = [
      fixture.canon,
      { scenes: fixture.narrative.scenes },
      shots,
    ]
    const repository = new FakeReelStoryRepository()
    const client = createDeepSeekClient({ apiKey: 'test-key', baseUrl: stub.baseUrl })
    const reelService = createReelStoryService({
      repository,
      director: createReelStoryDirector({
        narrative: createReelNarrativeDirector({
          client,
          canonTimeoutMs: 2_000,
          scenesTimeoutMs: 2_000,
        }),
        shots: createReelShotDirector({ client, timeoutMs: 2_000 }),
        totalTimeoutMs: 5_000,
      }),
      rateLimiter: createStoryRateLimiter({
        config: {
          ...DEFAULT_STORY_RATE_LIMIT_CONFIG,
          maxActiveStories: 20,
          createLimit: 20,
          dailyBudgetUsd: 500,
        },
        now: () => NOW,
      }),
      config: { storyTtlMs: 86_400_000, pollAfterMs: 2_500 },
      now: () => NOW,
    })
    const runtime = makeStoryRuntime({
      hasDeepSeekKey: true,
      reelService,
    })
    const response = await callStoryRoute(createStory, {
      method: 'POST',
      path: '/api/story',
      runtime,
      body: {
        premise: PREMISE,
        platform: 'tiktok',
        costMode: 'standard',
        targetDurationSeconds: 30,
        maxDurationSeconds: 30,
        preset: 'fast',
        mode: 'faithful',
      },
    })
    const story = response.body as Record<string, unknown>
    const sessionId = response.setCookie?.match(/story_sid=([^;]+)/)?.[1] ?? ''

    expect(response.status).toBe(201)
    expect(story).toMatchObject({
      costMode: 'standard',
      targetDurationSeconds: 30,
      shotCount: fixture.plan.shotCount.max,
      plannedDurationSeconds: 30,
    })
    expect(story.scenes).toHaveLength(fixture.narrative.scenes.length)
    expect((story.scenes as { shots: unknown[] }[]).flatMap((scene) => scene.shots))
      .toHaveLength(fixture.plan.shotCount.max)
    expect(stub.requests).toHaveLength(3)

    const detail = await callStoryRoute(getStory, {
      method: 'GET',
      path: `/api/story/${String(story.id)}`,
      runtime,
      params: { id: String(story.id) },
      cookieSessionId: sessionId,
    })

    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({
      id: story.id,
      costMode: 'standard',
      shotCount: fixture.plan.shotCount.max,
    })
    expect(repository.records).toHaveLength(1)
  })
})
