// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryCreateRequest, StoryNarrativeScene } from '~/models/story'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { createReelStoryService } from '../../../server/story/reel-service'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import {
  STORY_COST_PROFILES,
  costProfile,
  profileCapUsd,
} from '../../../server/story/cost-profiles'
import { validateNarrativeStructure } from '../../../server/story/shot-plan-validator'
import { validateReelCreateRequest } from '../../../server/story/reel-validation'
import {
  FakeReelPlanDirector,
  FakeReelStoryRepository,
} from '../../helpers/story-reel'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const SESSION = 'story-budget-policy-session-0001'
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function request(overrides: Partial<StoryCreateRequest> = {}): StoryCreateRequest {
  return {
    premise: PREMISE,
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    preset: 'fast',
    mode: 'faithful',
    referenceUrl: null,
    referenceExpiresAt: null,
    ...overrides,
  }
}

function setup(
  costs = DEFAULT_STORY_COST_CONFIG,
  qcEnabled = false,
) {
  const repository = new FakeReelStoryRepository()
  const director = new FakeReelPlanDirector()
  const costGuard = createReelCostGuard({ costs })
  const service = createReelStoryService({
    repository,
    director,
    costGuard,
    qcEnabled,
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

  return { repository, director, service, costGuard }
}

function input(value: StoryCreateRequest, sessionId = SESSION) {
  return {
    sessionId,
    request: value,
    idempotencyKey: null,
    bodyHash: 'body',
  }
}

async function waitingApproval(
  ctx: ReturnType<typeof setup>,
  value: StoryCreateRequest = request({
    costMode: 'budget',
    targetDurationSeconds: 15,
    maxDurationSeconds: 15,
  }),
) {
  const created = await ctx.service.create(input(value))
  let story = (await ctx.repository.findById(created.story.id))!

  for (const shot of story.shots) {
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'KEYFRAME_READY',
        keyframeUrl: `https://v3.fal.media/files/test/kf-${shot.order}.jpg`,
        keyframeAttempts: 1,
      },
    )
  }

  await ctx.repository.updateStory(
    story.id,
    { statuses: ['GENERATING_KEYFRAMES'], version: story.version },
    { status: 'WAITING_APPROVAL' },
  )
  story = (await ctx.repository.findById(story.id))!

  return story
}

async function waitingQc(
  ctx: ReturnType<typeof setup>,
  value: StoryCreateRequest = request({
    costMode: 'budget',
    targetDurationSeconds: 15,
    maxDurationSeconds: 15,
  }),
) {
  const story = await waitingApproval(ctx, value)

  for (const shot of story.shots) {
    const current = story.shots.find((item) => item.id === shot.id)!
    await ctx.repository.updateShot(
      story.id,
      current.id,
      { version: current.version },
      {
        status: 'VIDEO_READY',
        videoUrl: 'https://v3.fal.media/files/test/video.mp4',
        keyframeAttempts: 1,
        videoAttempts: 1,
      },
    )
  }

  await ctx.repository.updateStory(
    story.id,
    { statuses: ['WAITING_APPROVAL'], version: story.version },
    { status: 'WAITING_QC', approvedAt: new Date(NOW) },
  )

  return (await ctx.repository.findById(story.id))!
}

describe('008 budget caps', () => {
  it('uses the normative cap per cost mode and duration', () => {
    const expected: readonly (readonly [StoryCreateRequest['costMode'], StoryCreateRequest['targetDurationSeconds'], number])[] = [
      ['budget', 15, 2.5],
      ['standard', 15, 5],
      ['standard', 30, 7],
      ['standard', 45, 9],
      ['standard', 60, 11],
      ['budget', 90, 7],
      ['production', 90, 15],
    ]

    for (const [costMode, duration, cap] of expected) {
      const profile = costProfile(costMode, duration)!
      expect(profileCapUsd(profile), `${costMode} ${duration}`).toBe(cap)
    }

    expect(STORY_COST_PROFILES).toHaveLength(7)
  })

  it('resolves the cap of a story from its profile, not from the legacy 8 USD cap', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)

    expect(ctx.costGuard.capFor(story)).toBe(2.5)
    expect(ctx.costGuard.capFor(story)).not.toBe(DEFAULT_STORY_COST_CONFIG.maxStoryCostUsd)
  })

  it('creates the four budget/profile combinations within their cap', async () => {
    const ctx = setup()

    const budget = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }), 'session-budget-15'))
    const budget90 = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    }), 'session-budget-90'))
    const production = await ctx.service.create(input(request({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
      preset: 'quality',
    }), 'session-production-90'))

    expect(budget.story.shotCount).toBeGreaterThanOrEqual(4)
    expect(budget.story.shotCount).toBeLessThanOrEqual(5)
    expect(budget.story.plannedDurationSeconds).toBeGreaterThanOrEqual(12)
    expect(budget.story.plannedDurationSeconds).toBeLessThanOrEqual(15)
    expect(budget.story.preset).toBe('fast')

    expect(budget90.story.shotCount).toBe(15)
    expect(budget90.story.shots.every((shot) => shot.durationSeconds === 6)).toBe(true)
    expect(budget90.story.plannedDurationSeconds).toBe(90)

    expect(production.story.shotCount).toBeGreaterThanOrEqual(26)
    expect(production.story.shotCount).toBeLessThanOrEqual(30)
  })

  it('reserves QC only when enabled and keeps every profile within its cap', async () => {
    const ctx = setup(DEFAULT_STORY_COST_CONFIG, true)

    const budget = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }), 'session-qc-budget'))
    const budget90 = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    }), 'session-qc-budget-90'))
    const production = await ctx.service.create(input(request({
      costMode: 'production',
      targetDurationSeconds: 90,
      maxDurationSeconds: 90,
    }), 'session-qc-production'))

    expect(budget.story.costMode).toBe('budget')
    expect(budget90.story.shotCount).toBe(15)
    expect(production.story.shotCount).toBeGreaterThanOrEqual(26)
  })

  it('uses exactly four shots for Presupuesto 15 with a reference', async () => {
    const ctx = setup()
    const withReference = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
      referenceUrl: 'https://v3.fal.media/files/test/reference.webp',
      referenceExpiresAt: new Date(NOW + 3_600_000).toISOString(),
    }), 'session-budget-reference'))
    const withoutReference = await ctx.service.create(input(request({
      costMode: 'budget',
      targetDurationSeconds: 15,
      maxDurationSeconds: 15,
    }), 'session-budget-no-reference'))

    expect(withReference.story.shotCount).toBe(4)
    expect(withoutReference.story.shotCount).toBeGreaterThanOrEqual(4)
    expect(withoutReference.story.shotCount).toBeLessThanOrEqual(5)
  })

  it('uses the 5 s quality unit (0.35 USD) and never the legacy 10 s unit', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const base = ctx.costGuard.estimate(story)

    expect(DEFAULT_STORY_COST_CONFIG.videoQualityShortCostUsd).toBe(0.35)
    expect(base).toBeLessThan(ctx.costGuard.capFor(story))

    const quality = await ctx.service.create(input(request({ preset: 'quality' }), 'session-quality'))
    const qualityRecord = {
      ...quality.story,
      shots: quality.story.shots.map((shot) => ({
        ...shot,
        keyframeAttempts: 1,
        videoAttempts: 0,
      })),
    }

    expect(
      ctx.costGuard.estimateVideoAttempt(qualityRecord)
      - ctx.costGuard.estimate(qualityRecord),
    ).toBeCloseTo(0.35, 6)
  })

  it('rejects quality in Presupuesto before any director call', () => {
    let error: unknown

    try {
      validateReelCreateRequest({
        premise: PREMISE,
        costMode: 'budget',
        targetDurationSeconds: 15,
        maxDurationSeconds: 15,
        preset: 'quality',
        mode: 'faithful',
      }, NOW)
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({ code: 'invalid-cost-mode' })
  })
})

describe('008 budget attempt policy', () => {
  it('does not reset keyframeAttempts on a prompt change in Presupuesto', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!

    const next = await ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      {
        visualPrompt: 'Un plano nuevo de la repostera con el postre azul sobre la mesa.',
        regenerate: true,
      },
    )

    expect(next.shots.find((item) => item.id === shot.id)).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 1,
    })
  })

  it('rejects a prompt change at two keyframe attempts in Presupuesto without writing', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 2 },
    )

    await expect(ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      {
        visualPrompt: 'Otro plano distinto de la protagonista con el objeto característico.',
        regenerate: true,
      },
    )).rejects.toMatchObject({ code: 'keyframe-limit-reached' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_APPROVAL')
    expect(after.shots.find((item) => item.id === shot.id)).toMatchObject({
      status: 'KEYFRAME_READY',
      keyframeAttempts: 2,
    })
  })

  it('resets keyframeAttempts on a prompt change in Estándar', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx, request())
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 2 },
    )

    const next = await ctx.service.regenerateShot(
      story.id,
      SESSION,
      shot.id,
      {
        visualPrompt: 'Un plano nuevo de la repostera con el postre azul sobre la mesa.',
        regenerate: true,
      },
    )

    expect(next.shots.find((item) => item.id === shot.id)).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 0,
      videoAttempts: 0,
    })
  })

  it('rejects recover at two video attempts in Presupuesto without writing', async () => {
    const ctx = setup()
    const story = await waitingQc(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      { keyframeAttempts: 1, videoAttempts: 2 },
    )
    const before = (await ctx.repository.findById(story.id))!

    await expect(ctx.service.recoverShot(story.id, SESSION, shot.id))
      .rejects.toMatchObject({ code: 'video-retry-limit-reached' })

    const after = (await ctx.repository.findById(story.id))!
    expect(after.status).toBe('WAITING_QC')
    expect(after.shots.find((item) => item.id === shot.id)).toBe(before.shots[0])
  })

  it('does not reset attempts on recover in Presupuesto', async () => {
    const ctx = setup()
    const story = await waitingQc(ctx)
    const shot = story.shots[0]!

    const next = await ctx.service.recoverShot(story.id, SESSION, shot.id)
    const recovered = next.shots.find((item) => item.id === shot.id)!

    expect(recovered).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 1,
      videoAttempts: 1,
    })
  })

  it('resets both counters on recover in Estándar', async () => {
    const ctx = setup()
    const story = await waitingQc(ctx, request())
    const shot = story.shots[0]!

    const next = await ctx.service.recoverShot(story.id, SESSION, shot.id)

    expect(next.shots.find((item) => item.id === shot.id)).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 0,
      videoAttempts: 0,
    })
  })

  it('allows one video retry and rejects the second in Presupuesto', async () => {
    const ctx = setup()
    const story = await waitingApproval(ctx)
    const shot = story.shots[0]!
    await ctx.repository.updateShot(
      story.id,
      shot.id,
      { version: shot.version },
      {
        status: 'VIDEO_FAILED',
        videoError: 'provider-error',
        videoAttempts: 1,
      },
    )
    await ctx.repository.updateStory(
      story.id,
      { statuses: ['WAITING_APPROVAL'], version: story.version },
      { status: 'GENERATING_VIDEOS' },
    )

    const retried = await ctx.service.retryVideoShot(story.id, SESSION, shot.id)
    expect(retried.shots.find((item) => item.id === shot.id)?.status).toBe('VIDEO_QUEUED')

    const current = retried.shots.find((item) => item.id === shot.id)!
    await ctx.repository.updateShot(
      story.id,
      current.id,
      { version: current.version },
      { status: 'VIDEO_FAILED', videoError: 'provider-error', videoAttempts: 2 },
    )

    await expect(ctx.service.retryVideoShot(story.id, SESSION, shot.id))
      .rejects.toMatchObject({ code: 'video-retry-limit-reached' })
  })
})

function scene(
  storyFunction: StoryNarrativeScene['storyFunction'],
  order: number,
  action = 'Mara descubre que el postre cambia de color en la cocina.',
): StoryNarrativeScene {
  return {
    order,
    sceneRole: order === 1 ? 'establishing' : 'resolution',
    locationId: 'cocina',
    timeOfDay: 'morning',
    weather: 'clear',
    characters: ['mara'],
    props: [],
    action,
    narration: 'Mara no esperaba lo que iba a ocurrir con el postre.',
    storyFunction,
    gag: null,
    continuityFromPrevious: order === 1
      ? null
      : 'La continuidad mantiene el vestuario y el conflicto anterior.',
  }
}

describe('008 Presupuesto micro-story structure', () => {
  const narrative = (scenes: readonly StoryNarrativeScene[]) => ({
    title: 'El postre que lo sabía',
    logline: 'Mara descubre que su postre anticipa una sorpresa.',
    tone: 'humor' as const,
    storyBible: {
      style: 'Animación vertical.',
      tone: 'humor' as const,
      theme: 'Postres que predicen el futuro.',
      leadCharacterId: 'mara',
      signaturePropId: null,
      characters: [],
      locations: [],
      props: [],
      forbidden: [],
      continuityRules: [],
    },
    scenes,
  })

  it('accepts a two-scene hook + payoff with the twist inside the payoff action', () => {
    const reason = validateNarrativeStructure(narrative([
      scene('hook', 1),
      scene('payoff', 2, 'Mara gira la tarta: el glaseado anuncia el giro y remata la historia.'),
    ]))

    expect(reason).toBeNull()
  })

  it('rejects a dedicated twist scene when there are only two scenes', () => {
    const reason = validateNarrativeStructure(narrative([
      scene('hook', 1),
      scene('twist', 2),
    ]))

    expect(reason).not.toBeNull()
    expect(reason).toContain('payoff')
  })

  it('accepts the unique central twist of a three-scene micro-story', () => {
    const reason = validateNarrativeStructure(narrative([
      scene('hook', 1),
      scene('twist', 2),
      scene('payoff', 3),
    ]))

    expect(reason).toBeNull()
  })

  it('rejects a three-scene micro-story without a twist', () => {
    const reason = validateNarrativeStructure(narrative([
      scene('hook', 1),
      scene('complication', 2),
      scene('payoff', 3),
    ]))

    expect(reason).toContain('twist')
  })
})
