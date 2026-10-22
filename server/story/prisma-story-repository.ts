import {
  Prisma,
} from '../generated/prisma/client'
import type {
  PrismaClient,
  Scene as SceneRow,
  Story as StoryRow,
} from '../generated/prisma/client'
import type {
  SceneStatus,
  StoryErrorCode,
  StoryPlan,
  StoryPreset,
  StoryQC,
  StoryStatus,
} from '~/models/story'
import { getPrisma } from '../db/prisma'
import { StoryError, isStoryErrorCode } from './errors'
import { rebuildPlan } from './repository'
import type {
  ApplyQcResultInput,
  CreateStoryRecord,
  SceneGuard,
  ScenePatch,
  SceneRecord,
  StoryGuard,
  StoryPatch,
  StoryRecord,
  StoryRepository,
} from './repository'
import { validateStoryPlan } from './plan-validator'
import { parseStoryMode } from './story-mode'
import { parsePersistedStoryQC } from './qc-validator'

type StoryRowWithScenes = StoryRow & { readonly scenes: readonly SceneRow[] }

const STORY_STATUSES: readonly StoryStatus[] = [
  'PLANNING',
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'WAITING_QC',
  'ASSEMBLING',
  'READY',
  'FAILED',
  'CANCELLED',
]

const SCENE_STATUSES: readonly SceneStatus[] = [
  'PENDING',
  'KEYFRAME_QUEUED',
  'KEYFRAME_RUNNING',
  'KEYFRAME_READY',
  'KEYFRAME_FAILED',
  'VIDEO_QUEUED',
  'VIDEO_RUNNING',
  'VIDEO_READY',
  'VIDEO_FAILED',
  'CANCELLED',
]

const ACTIVE_STORY_STATUSES: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'ASSEMBLING',
]

const CLAIMABLE_STORY_STATUSES: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'ASSEMBLING',
]

const CANCELLABLE_STORY_STATUSES: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'WAITING_QC',
  'ASSEMBLING',
]

function isStoryStatus(value: string): value is StoryStatus {
  return (STORY_STATUSES as readonly string[]).includes(value)
}

function isSceneStatus(value: string): value is SceneStatus {
  return (SCENE_STATUSES as readonly string[]).includes(value)
}

function toStoryStatus(value: string): StoryStatus {
  return isStoryStatus(value) ? value : 'FAILED'
}

function toSceneStatus(value: string): SceneStatus {
  return isSceneStatus(value) ? value : 'CANCELLED'
}

function toStoryErrorCode(value: string | null): StoryErrorCode | null {
  if (!value || !isStoryErrorCode(value)) {
    return null
  }

  return value
}

function toStoryPreset(value: string): StoryPreset {
  return value === 'quality' ? 'quality' : 'fast'
}

function toDate(value: Date | null): Date | null {
  return value === null ? null : new Date(value.getTime())
}

function mapScene(row: SceneRow): SceneRecord {
  return {
    id: row.id,
    storyId: row.storyId,
    order: row.order,
    visualPrompt: row.visualPrompt,
    narration: row.narration,
    status: toSceneStatus(row.status),
    keyframeUrl: row.keyframeUrl,
    keyframeRequestId: row.keyframeRequestId,
    keyframeStatusUrl: row.keyframeStatusUrl,
    keyframeResponseUrl: row.keyframeResponseUrl,
    keyframeCancelUrl: row.keyframeCancelUrl,
    keyframeError: toStoryErrorCode(row.keyframeError),
    videoUrl: row.videoUrl,
    videoRequestId: row.videoRequestId,
    videoStatusUrl: row.videoStatusUrl,
    videoResponseUrl: row.videoResponseUrl,
    videoCancelUrl: row.videoCancelUrl,
    videoError: toStoryErrorCode(row.videoError),
    keyframeAttempts: row.keyframeAttempts,
    videoAttempts: row.videoAttempts,
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
  }
}

function parsePlan(value: Prisma.JsonValue | null, story: StoryRowWithScenes): StoryPlan | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const validation = validateStoryPlan(value, {
      sceneCount: story.sceneCount,
      mode: parseStoryMode(story.mode),
      allowLegacy: true,
      premise: story.premise,
      logline: story.logline,
    })

    if (validation.ok) {
      return validation.plan
    }
  }

  if (value !== null) {
    console.warn(JSON.stringify({
      event: 'story.plan.rebuild',
      storyId: story.id,
    }))
  }

  return rebuildPlan({
    title: story.title,
    logline: story.logline,
    scenes: story.scenes.map((scene) => ({
      order: scene.order,
      visualPrompt: scene.visualPrompt,
      narration: scene.narration,
    })),
  })
}

function parseQc(row: StoryRowWithScenes): StoryQC | null {
  if (row.qcJson === null) {
    return null
  }

  const parsed = parsePersistedStoryQC(row.qcJson)

  if (!parsed || row.qcCheckedAt === null) {
    console.warn(JSON.stringify({
      event: 'story.qc.invalid',
      storyId: row.id,
    }))

    return null
  }

  return {
    ...parsed,
    checkedAt: new Date(row.qcCheckedAt.getTime()).toISOString(),
  }
}

function mapStory(row: StoryRowWithScenes): StoryRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: toStoryStatus(row.status),
    premise: row.premise,
    title: row.title,
    logline: row.logline,
    referenceUrl: row.referenceUrl,
    referenceExpiresAt: toDate(row.referenceExpiresAt),
    preset: toStoryPreset(row.preset),
    mode: parseStoryMode(row.mode),
    sceneCount: row.sceneCount,
    durationSeconds: row.durationSeconds,
    aspectRatio: row.aspectRatio,
    plan: parsePlan(row.planJson, row),
    finalVideoUrl: row.finalVideoUrl,
    finalVideoExpiresAt: toDate(row.finalVideoExpiresAt),
    qc: parseQc(row),
    qcCheckedAt: toDate(row.qcCheckedAt),
    errorCode: toStoryErrorCode(row.errorCode),
    errorMessage: row.errorMessage,
    idempotencyKey: row.idempotencyKey,
    version: row.version,
    leaseOwner: row.leaseOwner,
    leaseUntil: toDate(row.leaseUntil),
    createdAt: new Date(row.createdAt.getTime()),
    updatedAt: new Date(row.updatedAt.getTime()),
    approvedAt: toDate(row.approvedAt),
    completedAt: toDate(row.completedAt),
    expiresAt: new Date(row.expiresAt.getTime()),
    scenes: row.scenes.map(mapScene),
  }
}

function storyGuardWhere(guard: StoryGuard): Prisma.StoryWhereInput {
  const where: Prisma.StoryWhereInput = {}

  if (guard.statuses && guard.statuses.length > 0) {
    where.status = { in: [...guard.statuses] }
  }

  if (guard.version !== undefined) {
    where.version = guard.version
  }

  return where
}

function sceneGuardWhere(guard: SceneGuard): Prisma.SceneWhereInput {
  const where: Prisma.SceneWhereInput = {}

  if (guard.statuses && guard.statuses.length > 0) {
    where.status = { in: [...guard.statuses] }
  }

  return where
}

function storyPatchData(patch: StoryPatch): Prisma.StoryUpdateManyMutationInput {
  const data: Prisma.StoryUpdateManyMutationInput = {}

  if (patch.status !== undefined) data.status = patch.status
  if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt
  if (patch.completedAt !== undefined) data.completedAt = patch.completedAt
  if (patch.errorCode !== undefined) data.errorCode = patch.errorCode
  if (patch.errorMessage !== undefined) data.errorMessage = patch.errorMessage
  if (patch.finalVideoUrl !== undefined) data.finalVideoUrl = patch.finalVideoUrl
  if (patch.finalVideoExpiresAt !== undefined) {
    data.finalVideoExpiresAt = patch.finalVideoExpiresAt
  }

  if (patch.plan !== undefined) {
    data.planJson = patch.plan === null
      ? null
      : (patch.plan as unknown as Prisma.InputJsonValue)
  }

  if (patch.qc !== undefined) {
    if (patch.qc === null) {
      data.qcJson = Prisma.DbNull
    } else {
      const { checkedAt, ...persisted } = patch.qc
      void checkedAt
      data.qcJson = persisted as unknown as Prisma.InputJsonValue
    }
  }

  if (patch.qcCheckedAt !== undefined) {
    data.qcCheckedAt = patch.qcCheckedAt
  }

  data.version = { increment: 1 }

  return data
}

function scenePatchData(patch: ScenePatch): Prisma.SceneUpdateManyMutationInput {  const data: Prisma.SceneUpdateManyMutationInput = {}

  if (patch.status !== undefined) data.status = patch.status
  if (patch.visualPrompt !== undefined) data.visualPrompt = patch.visualPrompt
  if (patch.narration !== undefined) data.narration = patch.narration
  if (patch.keyframeUrl !== undefined) data.keyframeUrl = patch.keyframeUrl
  if (patch.keyframeRequestId !== undefined) data.keyframeRequestId = patch.keyframeRequestId
  if (patch.keyframeStatusUrl !== undefined) data.keyframeStatusUrl = patch.keyframeStatusUrl
  if (patch.keyframeResponseUrl !== undefined) {
    data.keyframeResponseUrl = patch.keyframeResponseUrl
  }
  if (patch.keyframeCancelUrl !== undefined) data.keyframeCancelUrl = patch.keyframeCancelUrl
  if (patch.keyframeError !== undefined) data.keyframeError = patch.keyframeError
  if (patch.videoUrl !== undefined) data.videoUrl = patch.videoUrl
  if (patch.videoRequestId !== undefined) data.videoRequestId = patch.videoRequestId
  if (patch.videoStatusUrl !== undefined) data.videoStatusUrl = patch.videoStatusUrl
  if (patch.videoResponseUrl !== undefined) data.videoResponseUrl = patch.videoResponseUrl
  if (patch.videoCancelUrl !== undefined) data.videoCancelUrl = patch.videoCancelUrl
  if (patch.videoError !== undefined) data.videoError = patch.videoError
  if (patch.keyframeAttempts !== undefined) data.keyframeAttempts = patch.keyframeAttempts
  if (patch.videoAttempts !== undefined) data.videoAttempts = patch.videoAttempts

  return data
}

class QcResultConflictError extends Error {
  constructor() {
    super('qc-result-conflict')
    this.name = 'QcResultConflictError'
  }
}

export class PrismaStoryRepository implements StoryRepository {
  private readonly client: PrismaClient

  constructor(client: PrismaClient = getPrisma()) {
    this.client = client
  }

  async createStory(input: CreateStoryRecord): Promise<StoryRecord> {
    const story = await this.client.story.create({
      data: {
        sessionId: input.sessionId,
        status: input.status,
        premise: input.premise,
        title: input.title,
        logline: input.logline,
        referenceUrl: input.referenceUrl,
        referenceExpiresAt: input.referenceExpiresAt,
        preset: input.preset,
        mode: input.mode,
        sceneCount: input.sceneCount,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        planJson: input.plan === null
          ? undefined
          : (input.plan as unknown as Prisma.InputJsonValue),
        idempotencyKey: input.idempotencyKey,
        version: input.version,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        expiresAt: input.expiresAt,
        scenes: {
          create: input.scenes.map((scene) => ({
            order: scene.order,
            visualPrompt: scene.visualPrompt,
            narration: scene.narration,
            status: scene.status,
          })),
        },
      },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })

    return mapStory(story)
  }

  async findOwnedById(id: string, sessionId: string): Promise<StoryRecord | null> {
    const story = await this.client.story.findFirst({
      where: { id, sessionId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })

    return story ? mapStory(story) : null
  }

  async findById(id: string): Promise<StoryRecord | null> {
    const story = await this.client.story.findUnique({
      where: { id },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })

    return story ? mapStory(story) : null
  }

  async findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<StoryRecord | null> {
    const story = await this.client.story.findFirst({
      where: { sessionId, idempotencyKey },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })

    return story ? mapStory(story) : null
  }

  async listClaimable(now: Date, limit: number): Promise<StoryRecord[]> {
    const stories = await this.client.story.findMany({
      where: {
        status: { in: [...CLAIMABLE_STORY_STATUSES] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      include: { scenes: { orderBy: { order: 'asc' } } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    })

    return stories.map(mapStory)
  }

  async claim(
    id: string,
    owner: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await this.client.story.updateMany({
      where: {
        id,
        status: { in: [...CLAIMABLE_STORY_STATUSES] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseOwner: owner,
        leaseUntil,
        version: { increment: 1 },
      },
    })

    return result.count > 0
  }

  async release(id: string, owner: string): Promise<void> {
    await this.client.story.updateMany({
      where: { id, leaseOwner: owner },
      data: { leaseOwner: null, leaseUntil: null },
    })
  }

  async updateStory(id: string, guard: StoryGuard, patch: StoryPatch): Promise<number> {
    const result = await this.client.story.updateMany({
      where: { id, ...storyGuardWhere(guard) },
      data: storyPatchData(patch),
    })

    return result.count
  }

  async updateScene(
    storyId: string,
    sceneId: string,
    guard: SceneGuard,
    patch: ScenePatch,
  ): Promise<number> {
    const result = await this.client.scene.updateMany({
      where: { id: sceneId, storyId, ...sceneGuardWhere(guard) },
      data: scenePatchData(patch),
    })

    return result.count
  }

  async applyQcResult(input: ApplyQcResultInput): Promise<boolean> {
    try {
      return await this.client.$transaction(async (tx) => {
        const storyUpdate = await tx.story.updateMany({
          where: { id: input.storyId, ...storyGuardWhere(input.storyGuard) },
          data: {
            ...storyPatchData(input.storyPatch),
            ...(input.leaseUntil === undefined
              ? {}
              : { leaseUntil: input.leaseUntil }),
          },
        })

        if (storyUpdate.count === 0) {
          return false
        }

        for (const scene of input.scenes) {
          const sceneUpdate = await tx.scene.updateMany({
            where: {
              id: scene.sceneId,
              storyId: input.storyId,
              ...sceneGuardWhere(scene.guard),
            },
            data: scenePatchData(scene.patch),
          })

          if (sceneUpdate.count === 0) {
            throw new QcResultConflictError()
          }
        }

        return true
      })
    } catch (error) {
      if (error instanceof QcResultConflictError) {
        return false
      }

      throw error
    }
  }

  async cancel(id: string, sessionId: string, now: Date): Promise<boolean> {
    const result = await this.client.$transaction(async (tx) => {
      const storyUpdate = await tx.story.updateMany({
        where: { id, sessionId, status: { in: [...CANCELLABLE_STORY_STATUSES] } },
        data: {
          status: 'CANCELLED',
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      })

      if (storyUpdate.count === 0) {
        return 0
      }

      await tx.scene.updateMany({
        where: {
          storyId: id,
          status: { notIn: ['VIDEO_READY', 'CANCELLED'] },
        },
        data: { status: 'CANCELLED' },
      })

      void now

      return storyUpdate.count
    })

    return result > 0
  }

  async countActive(sessionId: string): Promise<number> {
    return this.client.story.count({
      where: { sessionId, status: { in: [...ACTIVE_STORY_STATUSES] } },
    })
  }

  async countActiveGlobal(): Promise<number> {
    return this.client.story.count({
      where: { status: { in: [...ACTIVE_STORY_STATUSES] } },
    })
  }

  async countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number> {
    if (stage === 'keyframe') {
      return this.client.scene.count({
        where: {
          status: { in: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
          keyframeRequestId: { not: null },
        },
      })
    }

    return this.client.scene.count({
      where: {
        status: { in: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
        videoRequestId: { not: null },
      },
    })
  }

  async countByStatus(status: StoryStatus): Promise<number> {
    return this.client.story.count({
      where: { status },
    })
  }

  async deleteExpired(cutoff: Date, limit: number): Promise<number> {
    const expired = await this.client.story.findMany({
      where: { expiresAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })

    if (expired.length === 0) {
      return 0
    }

    const result = await this.client.story.deleteMany({
      where: { id: { in: expired.map((story) => story.id) } },
    })

    return result.count
  }
}

export function createPrismaStoryRepository(
  client?: PrismaClient,
): StoryRepository {
  try {
    return new PrismaStoryRepository(client)
  } catch (error) {
    if (isStoryError(error)) {
      throw error
    }

    throw new StoryError('database-unavailable')
  }
}
