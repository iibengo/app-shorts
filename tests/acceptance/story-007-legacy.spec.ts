// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type {
  StoryNarrativeScene,
  StoryPlan,
} from '~/models/story'
import type {
  ReelSceneRecord,
  ReelShotRecord,
  ReelStoryRecord,
} from '../../../server/story/reel-repository'
import { createReelStoryService } from '../../../server/story/reel-service'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import { deriveSceneStatus } from '../../../server/story/scene-status'
import { normalizePlanScenes } from '../../../server/story/legacy-shots'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { legacyPlanWithScenes, FakeReelPlanDirector, FakeReelStoryRepository } from '../helpers/story-reel'
import { makeStoryRuntime } from '../helpers/story-runtime'
import { callStoryRoute } from '../helpers/story-route'

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

const { default: getStory } = await import('../../../server/api/story/[id].get')
const { default: keyframeShot } = await import('../../../server/api/story/[id]/shots/[shotId]/keyframe.post')
const { default: retryShot } = await import('../../../server/api/story/[id]/shots/[shotId]/retry.post')
const { default: recoverShot } = await import('../../../server/api/story/[id]/shots/[shotId]/recover.post')

const SESSION = 'story-session-legacy-007-0001'
const NOW = Date.now()
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

function narrativePlan(): StoryPlan {
  const source = legacyPlanWithScenes(5)

  return {
    title: source.title,
    logline: source.logline,
    tone: source.tone,
    storyBible: source.storyBible,
    scenes: normalizePlanScenes(source),
  }
}

function backfilledShot(
  storyId: string,
  scene: StoryNarrativeScene,
): ReelShotRecord {
  return {
    id: `shot_${scene.order}`,
    storyId,
    sceneId: `scene-${scene.order}`,
    sceneOrder: scene.order,
    order: scene.order,
    indexInScene: 1,
    durationSeconds: 6,
    camera: 'wide',
    framing: 'establishing',
    subject: 'Plano heredado',
    action: scene.action,
    visualPrompt: scene.action,
    transition: 'cut',
    locationId: 'legacy-location',
    status: 'KEYFRAME_READY',
    keyframeUrl: `https://v3.fal.media/files/test/legacy-kf-${scene.order}.jpg`,
    keyframeRequestId: `legacy-request-${scene.order}`,
    keyframeStatusUrl: null,
    keyframeResponseUrl: null,
    keyframeCancelUrl: null,
    keyframeError: null,
    videoUrl: null,
    videoRequestId: null,
    videoStatusUrl: null,
    videoResponseUrl: null,
    videoCancelUrl: null,
    videoError: null,
    keyframeAttempts: 1,
    videoAttempts: 0,
    version: 1,
  }
}

function legacyRecord(withShots: boolean): ReelStoryRecord {
  const plan = narrativePlan()
  const storyId = withShots ? 'legacy-story-with-shots' : 'legacy-story-without-shots'
  const shots = withShots
    ? plan.scenes.map((scene) => backfilledShot(storyId, scene))
    : []

  const scenes: ReelSceneRecord[] = plan.scenes.map((scene) => {
    const sceneShots = shots.filter((shot) => shot.sceneId === `scene-${scene.order}`)

    return {
      id: `scene-${scene.order}`,
      storyId,
      order: scene.order,
      narration: scene.narration,
      scene,
      status: sceneShots.length > 0 ? deriveSceneStatus(sceneShots) : 'KEYFRAME_READY',
      shots: sceneShots,
    }
  })

  return {
    id: storyId,
    sessionId: SESSION,
    status: 'WAITING_APPROVAL',
    premise: PREMISE,
    title: plan.title,
    logline: plan.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'fast',
    mode: 'faithful',
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    plannedDurationSeconds: shots.length > 0 ? 30 : 0,
    shotCount: shots.length,
    finalDurationSeconds: null,
    aspectRatio: '9:16',
    contract: '008',
    plan,
    scenes,
    shots,
    finalVideoUrl: null,
    finalVideoExpiresAt: null,
    qc: null,
    approvedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    version: 3,
    leaseOwner: null,
    leaseUntil: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    expiresAt: new Date(NOW + 86_400_000),
  }
}

/**
 * Mirrors the Prisma repository read path: a legacy 007 scene without `Shot`
 * rows gets a read-only synthetic `legacy-<sceneId>` shot.
 */
function withSyntheticShots(record: ReelStoryRecord): ReelStoryRecord {
  if (record.shots.length > 0) return record

  const scenes: ReelSceneRecord[] = record.scenes.map((scene) => {
    const narrative = scene.scene
    const shot: ReelShotRecord = {
      id: `legacy-${scene.id}`,
      storyId: record.id,
      sceneId: scene.id,
      sceneOrder: scene.order,
      order: scene.order,
      indexInScene: 1,
      durationSeconds: 6,
      camera: 'wide',
      framing: 'establishing',
      subject: 'Plano heredado',
      action: narrative?.action ?? scene.narration,
      visualPrompt: scene.narration,
      transition: 'cut',
      locationId: narrative?.locationId ?? 'legacy-location',
      status: scene.status,
      keyframeUrl: null,
      keyframeRequestId: null,
      keyframeStatusUrl: null,
      keyframeResponseUrl: null,
      keyframeCancelUrl: null,
      keyframeError: null,
      videoUrl: null,
      videoRequestId: null,
      videoStatusUrl: null,
      videoResponseUrl: null,
      videoCancelUrl: null,
      videoError: null,
      keyframeAttempts: 0,
      videoAttempts: 0,
      version: 1,
    }

    return { ...scene, shots: [shot], status: deriveSceneStatus([shot]) }
  })
  const shots = scenes.flatMap((scene) => scene.shots)

  return {
    ...record,
    scenes,
    shots,
    shotCount: shots.length,
    plannedDurationSeconds: shots.reduce(
      (total, shot) => total + shot.durationSeconds,
      0,
    ),
  }
}

class LegacyReadRepository extends FakeReelStoryRepository {
  override async findOwnedById(
    id: string,
    sessionId: string,
  ): Promise<ReelStoryRecord | null> {
    const record = await super.findOwnedById(id, sessionId)

    return record === null ? null : withSyntheticShots(record)
  }

  override async findById(id: string): Promise<ReelStoryRecord | null> {
    const record = await super.findById(id)

    return record === null ? null : withSyntheticShots(record)
  }
}

function setup(record: ReelStoryRecord) {
  const repository = new LegacyReadRepository()
  repository.records.push(record)
  const service = createReelStoryService({
    repository,
    director: new FakeReelPlanDirector(),
    costGuard: createReelCostGuard({ costs: DEFAULT_STORY_COST_CONFIG }),
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
  const runtime = makeStoryRuntime({ hasDeepSeekKey: true, reelService: service })

  return {
    repository,
    get(id: string) {
      return callStoryRoute(getStory, {
        method: 'GET',
        path: `/api/story/${id}`,
        runtime,
        params: { id },
        cookieSessionId: SESSION,
      })
    },
    shotCommand(
      handler: (event: H3Event) => unknown,
      id: string,
      shotId: string,
      body?: unknown,
    ) {
      return callStoryRoute(handler, {
        method: 'POST',
        path: `/api/story/${id}/shots/${shotId}`,
        runtime,
        params: { id, shotId },
        cookieSessionId: SESSION,
        ...(body === undefined ? {} : { body }),
      })
    },
  }
}

function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } } | null)?.error?.code
}

describe('007 legacy rows under the 008 engine', () => {
  it('reads a backfilled 007 row as an 008 DTO with one legacy shot per scene', async () => {
    const record = legacyRecord(true)
    const ctx = setup(record)
    const response = await ctx.get(record.id)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: record.id,
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 5,
      sceneCount: 5,
      finalDurationSeconds: null,
      preset: 'fast',
      mode: 'faithful',
    })

    const body = response.body as {
      scenes: readonly { readonly shots: readonly { readonly id: string; readonly subject: string }[] }[]
    }
    expect(body.scenes).toHaveLength(5)
    expect(body.scenes.every((scene) => scene.shots.length === 1)).toBe(true)
    expect(body.scenes[0]?.shots[0]).toMatchObject({
      id: 'shot_1',
      subject: 'Plano heredado',
    })

    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('sessionId')
    expect(serialized).not.toContain('requestId')
    expect(serialized).not.toContain('statusUrl')
    expect(serialized).not.toContain('legacy-request')
  })

  it('synthesises a read-only legacy shot when the 007 row has no Shot rows', async () => {
    const record = legacyRecord(false)
    const ctx = setup(record)
    const response = await ctx.get(record.id)

    expect(response.status).toBe(200)
    const body = response.body as {
      sceneCount: number
      shotCount: number
      plannedDurationSeconds: number
      scenes: readonly {
        readonly id: string
        readonly shots: readonly {
          readonly id: string
          readonly subject: string
          readonly durationSeconds: number
          readonly framing: string
          readonly locationId: string
        }[]
      }[]
    }

    expect(body.sceneCount).toBe(5)
    expect(body.shotCount).toBe(5)
    expect(body.plannedDurationSeconds).toBe(30)
    expect(body.scenes[0]?.shots[0]).toMatchObject({
      id: `legacy-${body.scenes[0]?.id}`,
      subject: 'Plano heredado',
      durationSeconds: 6,
      framing: 'establishing',
      locationId: 'lugar-1',
    })
  })

  it('returns 404 for every per-shot action on a synthetic legacy shot', async () => {
    const record = legacyRecord(false)
    const ctx = setup(record)
    const detail = await ctx.get(record.id)
    const body = detail.body as {
      scenes: readonly { readonly shots: readonly { readonly id: string }[] }[]
    }
    const shotId = body.scenes[0]?.shots[0]?.id ?? ''

    expect(shotId.startsWith('legacy-')).toBe(true)

    const keyframe = await ctx.shotCommand(keyframeShot, record.id, shotId, {
      visualPrompt: 'Un plano nuevo de la repostera mirando el postre azul.',
    })
    const retry = await ctx.shotCommand(retryShot, record.id, shotId)
    const recover = await ctx.shotCommand(recoverShot, record.id, shotId)

    expect(keyframe.status).toBe(404)
    expect(errorCode(keyframe)).toBe('shot-not-found')
    expect(retry.status).toBe(404)
    expect(errorCode(retry)).toBe('shot-not-found')
    expect(recover.status).toBe(404)
    expect(errorCode(recover)).toBe('shot-not-found')
  })

  it('keeps the source state unchanged after a rejected legacy action', async () => {
    const record = legacyRecord(false)
    const ctx = setup(record)
    const detail = await ctx.get(record.id)
    const body = detail.body as {
      scenes: readonly { readonly shots: readonly { readonly id: string }[] }[]
    }
    const shotId = body.scenes[0]?.shots[0]?.id ?? ''
    const before = (await ctx.repository.findById(record.id))!

    await ctx.shotCommand(keyframeShot, record.id, shotId, {
      visualPrompt: 'Un plano nuevo de la repostera mirando el postre azul.',
    })

    const after = (await ctx.repository.findById(record.id))!
    expect(after.status).toBe(before.status)
    expect(after.shots).toEqual(before.shots)
  })
})
