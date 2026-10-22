import { describe, expect, it } from 'vitest'
import { durationPlanFor } from '../../../server/story/cost-profiles'
import { createLegacyReelPlanAdapter } from '../../../server/story/reel-plan-adapter'
import { PrismaReelStoryRepository } from '../../../server/story/reel-repository'
import type { ReelPrismaClient } from '../../../server/story/reel-repository'
import { toReelStoryDto } from '../../../server/story/reel-service'
import { FakeSceneCountStoryDirector, legacyPlanWithScenes } from '../../helpers/story-reel'

const NOW = new Date('2026-10-22T12:00:00.000Z')
const PREMISE = 'Una repostera descubre que sus postres predicen el futuro.'

type Row = Record<string, unknown>

class FakePrisma {
  readonly stories = new Map<string, Row>()
  readonly shots: Row[] = []

  async $transaction<T>(callback: (client: FakePrisma) => Promise<T>): Promise<T> {
    return callback(this)
  }

  readonly shot = {
    createMany: async (input: { readonly data: readonly Row[] }): Promise<{ count: number }> => {
      this.shots.push(...input.data.map((shot) => ({
        ...shot,
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
      })))
      return { count: input.data.length }
    },
  }

  readonly story = {
    create: async (input: { readonly data: Row }): Promise<Row> => {
      const { scenes, ...story } = input.data
      const nested = (scenes as { readonly create: readonly Row[] }).create
      const row: Row = {
        ...story,
        sceneCount: nested.length,
        durationSeconds: 6,
        aspectRatio: '9:16',
        finalVideoUrl: null,
        finalVideoExpiresAt: null,
        qcJson: null,
        qcCheckedAt: null,
        approvedAt: null,
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        leaseOwner: null,
        leaseUntil: null,
        scenes: nested.map((scene) => ({
          ...scene,
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
        })),
      }
      this.stories.set(String(row.id), row)
      return row
    },
    findUnique: async (input: { readonly where: { readonly id: string } }): Promise<Row | null> => {
      return this.row(input.where.id)
    },
    findFirst: async (input: { readonly where: Row }): Promise<Row | null> => {
      const where = input.where

      for (const story of this.stories.values()) {
        if (where.id !== undefined && story.id !== where.id) continue
        if (where.sessionId !== undefined && story.sessionId !== where.sessionId) continue
        if (
          where.idempotencyKey !== undefined
          && story.idempotencyKey !== where.idempotencyKey
        ) continue

        return this.row(String(story.id))
      }

      return null
    },
    count: async (input: { readonly where?: Row }): Promise<number> => {
      const where = input.where ?? {}
      const status = where.status as { readonly in?: readonly string[] } | undefined
      const statuses = status?.in

      return [...this.stories.values()].filter((story) => {
        if (where.sessionId !== undefined && story.sessionId !== where.sessionId) return false
        if (statuses && !statuses.includes(String(story.status))) return false
        return true
      }).length
    },
  }

  seed(story: Row): void {
    this.stories.set(String(story.id), story)
  }

  private row(id: string): Row | null {
    const story = this.stories.get(id)

    if (!story) return null

    return {
      ...story,
      scenes: [...(story.scenes as readonly Row[])].sort(
        (a, b) => Number(a.order) - Number(b.order),
      ),
      shots: this.shots
        .filter((shot) => shot.storyId === id)
        .sort((a, b) => Number(a.order) - Number(b.order)),
    }
  }
}

function repository(fake: FakePrisma): PrismaReelStoryRepository {
  return new PrismaReelStoryRepository(fake as unknown as ReelPrismaClient)
}

async function input() {
  const plan = durationPlanFor('standard', 30, 'tiktok', false)
  const director = new FakeSceneCountStoryDirector()
  const reel = await createLegacyReelPlanAdapter(director).createPlan({
    premise: PREMISE,
    mode: 'faithful',
    durationPlan: plan,
    referenceUrl: null,
  })

  return {
    sessionId: 'story-session-reel-repo',
    status: 'GENERATING_KEYFRAMES' as const,
    premise: PREMISE,
    title: reel.plan.title,
    logline: reel.plan.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'fast' as const,
    mode: 'faithful' as const,
    platform: 'tiktok' as const,
    costMode: 'standard' as const,
    targetDurationSeconds: 30 as const,
    maxDurationSeconds: 30 as const,
    plan: reel.plan,
    shotPlan: reel.shotPlan,
    idempotencyKey: 'reel-repo-key-0001',
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  }
}

describe('PrismaReelStoryRepository', () => {
  it('creates Story, narrative Scene rows and Shot rows in one transaction', async () => {
    const fake = new FakePrisma()
    const repo = repository(fake)
    const created = await repo.createStory(await input())

    expect(fake.stories.size).toBe(1)
    expect(created).toMatchObject({
      contract: '008',
      premise: PREMISE,
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      plannedDurationSeconds: 30,
      status: 'GENERATING_KEYFRAMES',
      idempotencyKey: 'reel-repo-key-0001',
    })
    expect(created.plan.scenes).toHaveLength(3)
    expect(created.scenes).toHaveLength(3)
    expect(created.shots).toHaveLength(12)
    expect(created.shots.every((shot) => shot.status === 'PENDING')).toBe(true)
    expect(created.scenes.every((scene) => scene.status === 'PENDING')).toBe(true)
    expect(fake.shots.every((shot) => shot.status === 'PENDING')).toBe(true)
  })

  it('finds by owner, id and idempotency key and counts active stories', async () => {
    const fake = new FakePrisma()
    const repo = repository(fake)
    const created = await repo.createStory(await input())

    await expect(repo.findOwnedById(created.id, created.sessionId))
      .resolves.toMatchObject({ id: created.id })
    await expect(repo.findOwnedById(created.id, 'another-session')).resolves.toBeNull()
    await expect(repo.findBySessionAndIdempotencyKey(
      created.sessionId,
      'reel-repo-key-0001',
    )).resolves.toMatchObject({ id: created.id })
    await expect(repo.countActive(created.sessionId)).resolves.toBe(1)
    await expect(repo.countActiveGlobal()).resolves.toBe(1)
  })

  it('treats a 007 row with backfilled shots as 008 and maps its DTO', async () => {
    const fake = new FakePrisma()
    const legacy = legacyPlanWithScenes(5)
    const legacyJson = {
      title: legacy.title,
      logline: legacy.logline,
      tone: legacy.tone,
      storyBible: legacy.storyBible,
      beats: (legacy as unknown as { readonly beats: readonly Row[] }).beats,
    }
    const sceneId = 'legacy-scene-1'

    fake.seed({
      id: 'legacy-story-1',
      sessionId: 'legacy-session',
      status: 'READY',
      premise: PREMISE,
      title: legacy.title,
      logline: legacy.logline,
      referenceUrl: null,
      referenceExpiresAt: null,
      preset: 'fast',
      mode: 'faithful',
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 30,
      shotCount: 1,
      finalDurationSeconds: 30,
      sceneCount: 1,
      durationSeconds: 6,
      aspectRatio: '9:16',
      planJson: legacyJson,
      finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4',
      finalVideoExpiresAt: null,
      qcJson: null,
      idempotencyKey: null,
      version: 3,
      leaseOwner: null,
      leaseUntil: null,
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      scenes: [{
        id: sceneId,
        storyId: 'legacy-story-1',
        order: 1,
        visualPrompt: 'Prompt heredado',
        narration: 'Narración heredada',
        status: 'VIDEO_READY',
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
        createdAt: NOW,
        updatedAt: NOW,
      }],
    })
    fake.shots.push({
      id: 'legacy-shot-1',
      storyId: 'legacy-story-1',
      sceneId,
      sceneOrder: 1,
      order: 1,
      indexInScene: 1,
      durationSeconds: 6,
      camera: 'wide',
      framing: 'establishing',
      subject: 'Plano heredado',
      action: 'Acción heredada',
      visualPrompt: 'Prompt heredado',
      transition: 'cut',
      locationId: 'legacy-location',
      status: 'VIDEO_READY',
      keyframeUrl: null,
      keyframeRequestId: null,
      keyframeStatusUrl: null,
      keyframeResponseUrl: null,
      keyframeCancelUrl: null,
      keyframeError: null,
      videoUrl: 'https://v3.fal.media/files/test/legacy.mp4',
      videoRequestId: null,
      videoStatusUrl: null,
      videoResponseUrl: null,
      videoCancelUrl: null,
      videoError: null,
      keyframeAttempts: 0,
      videoAttempts: 0,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })

    const record = await repository(fake).findById('legacy-story-1')

    expect(record).not.toBeNull()
    expect(record!.contract).toBe('008')
    expect(record!.plan.scenes).toHaveLength(5)
    expect(record!.scenes).toHaveLength(1)
    expect(record!.scenes[0]?.shots).toHaveLength(1)
    expect(record!.scenes[0]?.shots[0]).toMatchObject({
      id: 'legacy-shot-1',
      status: 'VIDEO_READY',
      videoUrl: 'https://v3.fal.media/files/test/legacy.mp4',
    })
    const dto = toReelStoryDto(record!, 0, NOW.getTime())
    expect(dto.scenes[0]?.storyFunction).toBe('hook')
    expect(dto.scenes[0]?.shots[0]?.id).toBe('legacy-shot-1')
  })

  it('synthesises a shot for a legacy row without Shot rows', async () => {
    const fake = new FakePrisma()
    const legacy = legacyPlanWithScenes(5)

    fake.seed({
      id: 'legacy-story-2',
      sessionId: 'legacy-session',
      status: 'KEYFRAME_READY',
      premise: PREMISE,
      title: legacy.title,
      logline: legacy.logline,
      referenceUrl: null,
      referenceExpiresAt: null,
      preset: 'fast',
      mode: 'faithful',
      platform: 'tiktok',
      costMode: 'standard',
      targetDurationSeconds: 30,
      maxDurationSeconds: 30,
      plannedDurationSeconds: 6,
      shotCount: 1,
      finalDurationSeconds: null,
      sceneCount: 1,
      durationSeconds: 6,
      aspectRatio: '9:16',
      planJson: { ...legacy, scenes: undefined },
      finalVideoUrl: null,
      finalVideoExpiresAt: null,
      qcJson: null,
      idempotencyKey: null,
      version: 1,
      leaseOwner: null,
      leaseUntil: null,
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      scenes: [{
        id: 'legacy-scene-2',
        storyId: 'legacy-story-2',
        order: 1,
        visualPrompt: 'Prompt heredado',
        narration: 'Narración heredada',
        status: 'KEYFRAME_READY',
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
        createdAt: NOW,
        updatedAt: NOW,
      }],
    })

    const record = await repository(fake).findById('legacy-story-2')

    expect(record!.contract).toBe('008')
    expect(record!.scenes[0]?.shots[0]).toMatchObject({
      id: 'legacy-legacy-scene-2',
      sceneId: 'legacy-scene-2',
      status: 'KEYFRAME_READY',
      durationSeconds: 6,
      subject: 'Plano heredado',
    })
    const dto = toReelStoryDto(record!, 0, NOW.getTime())
    expect(dto.scenes[0]?.shots[0]?.id).toBe('legacy-legacy-scene-2')
  })
})
