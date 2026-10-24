// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryCreateRequest } from '~/models/story'
import { createReelStoryService } from '../../../server/story/reel-service'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { FakeReelPlanDirector, FakeReelStoryRepository } from '../helpers/story-reel'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: retryCharacter } = await import(
  '../../../server/api/story/[id]/characters/[characterId]/retry.post'
)

const SESSION = 'story-session-character-retry-01'
const NOW = Date.parse('2026-10-24T12:00:00.000Z')

function request(): StoryCreateRequest {
  return {
    premise: 'Una repostera descubre que sus postres predicen el futuro.',
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: null,
    referenceExpiresAt: null,
  }
}

function failedRef(source: 'generated' | 'user', status: 'failed' | 'ready') {
  const ready = status === 'ready'

  return {
    status,
    source,
    frontalUrl: ready ? 'https://v3.fal.media/files/x.png' : null,
    referenceUrls: ready ? ['https://v3.fal.media/files/x.png'] : [],
    attempts: ready ? 0 : 2,
    updatedAt: new Date(NOW).toISOString(),
  }
}

async function setup(references: Record<string, ReturnType<typeof failedRef>>) {
  const repository = new FakeReelStoryRepository()
  const service = createReelStoryService({
    repository,
    director: new FakeReelPlanDirector(),
    costGuard: createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG }),
    rateLimiter: createStoryRateLimiter({
      config: { ...DEFAULT_STORY_RATE_LIMIT_CONFIG, maxActiveStories: 20, createLimit: 20, dailyBudgetUsd: 500 },
      now: () => NOW,
    }),
    config: { storyTtlMs: 86_400_000, pollAfterMs: 2_500 },
    now: () => NOW,
  })

  const created = await service.create({
    sessionId: SESSION,
    request: request(),
    idempotencyKey: null,
    bodyHash: 'character-retry',
  })

  const record = (await repository.findById(created.story.id))!
  const index = repository.records.findIndex((item) => item.id === created.story.id)

  repository.records[index] = {
    ...record,
    status: 'WAITING_APPROVAL',
    characterRefs: references as never,
  }

  const runtime = makeStoryRuntime({ hasDeepSeekKey: true, reelService: service })

  return {
    story: created.story,
    repository,
    retry: (characterId: string, options: { cookieSessionId?: string; origin?: string } = {}) =>
      callStoryRoute(retryCharacter, {
        method: 'POST',
        path: `/api/story/${created.story.id}/characters/${characterId}/retry`,
        runtime,
        params: { id: created.story.id, characterId },
        cookieSessionId: SESSION,
        ...options,
      }),
  }
}

describe('POST /api/story/[id]/characters/[characterId]/retry', () => {
  it('queues a failed generated reference again', async () => {
    const ctx = await setup({ pixel: failedRef('generated', 'failed') })

    const response = await ctx.retry('pixel')

    expect(response.status).toBe(202)
    expect((await ctx.repository.findById(ctx.story.id))?.characterRefs.pixel?.status)
      .toBe('pending')
  })

  it('refuses to redraw a reference that is already ready', async () => {
    // Paying to redraw an image the user already has is waste, not a retry.
    const ctx = await setup({ pixel: failedRef('generated', 'ready') })

    expect((await ctx.retry('pixel')).status).toBe(409)
  })

  it('refuses to redraw the uploaded photo', async () => {
    const ctx = await setup({ ionias: failedRef('user', 'failed') })

    expect((await ctx.retry('ionias')).status).toBe(409)
  })

  it('returns 404 for a character the story does not have', async () => {
    const ctx = await setup({ pixel: failedRef('generated', 'failed') })

    expect((await ctx.retry('nobody')).status).toBe(404)
  })

  it('rejects a foreign session', async () => {
    const ctx = await setup({ pixel: failedRef('generated', 'failed') })

    expect((await ctx.retry('pixel', { cookieSessionId: 'someone-else' })).status).toBe(404)
  })

  it('rejects cross-origin requests', async () => {
    const ctx = await setup({ pixel: failedRef('generated', 'failed') })

    expect((await ctx.retry('pixel', { origin: 'https://evil.example' })).status).toBe(403)
  })
})
