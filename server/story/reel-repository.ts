import { randomUUID } from 'node:crypto'
import type {
  SceneStatus,
  StoryCostMode,
  StoryErrorCode,
  StoryMode,
  StoryNarrativeScene,
  StoryPlan,
  StoryPlatform,
  StoryPreset,
  StoryShotDurationSeconds,
  StoryShotFraming,
  StoryQC,
  StoryStatus,
  StoryTone,
} from '~/models/story'
import type { ShotPlan } from './director-types'
import { getPrisma } from '../db/prisma'
import { normalizePlanScenes } from './legacy-shots'
import { deriveSceneStatus } from './scene-status'

export type ReelPrismaClient = ReturnType<typeof getPrisma>

export interface ReelShotRecord {
  readonly id: string
  readonly storyId: string
  readonly sceneId: string
  readonly sceneOrder: number
  readonly order: number
  readonly indexInScene: number
  readonly durationSeconds: StoryShotDurationSeconds
  readonly camera: string
  readonly framing: StoryShotFraming
  readonly subject: string
  readonly action: string
  readonly visualPrompt: string
  readonly transition: 'cut'
  readonly locationId: string
  readonly status: SceneStatus
  readonly keyframeUrl: string | null
  readonly keyframeRequestId: string | null
  readonly keyframeStatusUrl: string | null
  readonly keyframeResponseUrl: string | null
  readonly keyframeCancelUrl: string | null
  readonly keyframeError: StoryErrorCode | null
  readonly videoUrl: string | null
  readonly videoRequestId: string | null
  readonly videoStatusUrl: string | null
  readonly videoResponseUrl: string | null
  readonly videoCancelUrl: string | null
  readonly videoError: StoryErrorCode | null
  readonly keyframeAttempts: number
  readonly videoAttempts: number
  readonly version: number
}

export interface ReelSceneRecord {
  readonly id: string
  readonly storyId: string
  readonly order: number
  readonly narration: string
  readonly scene: StoryNarrativeScene | null
  readonly status: SceneStatus
  readonly shots: readonly ReelShotRecord[]
}

export interface ReelStoryRecord {
  readonly id: string
  readonly sessionId: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: Date | null
  readonly preset: StoryPreset
  readonly mode: StoryMode
  readonly platform: StoryPlatform
  readonly costMode: StoryCostMode
  readonly targetDurationSeconds: number
  readonly maxDurationSeconds: number
  readonly plannedDurationSeconds: number
  readonly shotCount: number
  readonly finalDurationSeconds: number | null
  readonly aspectRatio: string
  /** `008` when planJson stores narrative scenes; `legacy` for 007 beats. */
  readonly contract: '008' | 'legacy'
  readonly plan: StoryPlan
  readonly scenes: readonly ReelSceneRecord[]
  readonly shots: readonly ReelShotRecord[]
  readonly finalVideoUrl: string | null
  readonly finalVideoExpiresAt: Date | null
  readonly qc: unknown
  readonly approvedAt: Date | null
  readonly completedAt: Date | null
  readonly errorCode: StoryErrorCode | null
  readonly errorMessage: string | null
  readonly idempotencyKey: string | null
  readonly version: number
  readonly leaseOwner: string | null
  readonly leaseUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
}

export interface CreateReelStoryInput {
  readonly sessionId: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: Date | null
  readonly preset: StoryPreset
  readonly mode: StoryMode
  readonly platform: StoryPlatform
  readonly costMode: StoryCostMode
  readonly targetDurationSeconds: number
  readonly maxDurationSeconds: number
  readonly plan: StoryPlan
  readonly shotPlan: ShotPlan
  readonly idempotencyKey: string | null
  readonly now: Date
  readonly expiresAt: Date
}

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

export interface ReelStoryGuard {
  readonly statuses?: readonly StoryStatus[]
  readonly version?: number
}

export interface ReelShotGuard {
  readonly statuses?: readonly SceneStatus[]
  readonly version?: number
}

export interface ReelStoryPatch {
  readonly status?: StoryStatus
  readonly approvedAt?: Date | null
  readonly completedAt?: Date | null
  readonly errorCode?: StoryErrorCode | null
  readonly errorMessage?: string | null
  readonly qc?: StoryQC | null
  readonly qcCheckedAt?: Date | null
  readonly finalVideoUrl?: string | null
  readonly finalVideoExpiresAt?: Date | null
  readonly finalDurationSeconds?: number | null
  readonly plannedDurationSeconds?: number
  readonly shotCount?: number
}

export interface ReelShotPatch {
  readonly status?: SceneStatus
  readonly visualPrompt?: string
  readonly durationSeconds?: StoryShotDurationSeconds
  readonly keyframeUrl?: string | null
  readonly keyframeRequestId?: string | null
  readonly keyframeStatusUrl?: string | null
  readonly keyframeResponseUrl?: string | null
  readonly keyframeCancelUrl?: string | null
  readonly keyframeError?: StoryErrorCode | null
  readonly videoUrl?: string | null
  readonly videoRequestId?: string | null
  readonly videoStatusUrl?: string | null
  readonly videoResponseUrl?: string | null
  readonly videoCancelUrl?: string | null
  readonly videoError?: StoryErrorCode | null
  readonly keyframeAttempts?: number
  readonly videoAttempts?: number
}

export interface ReelStoryRepository {
  createStory(input: CreateReelStoryInput): Promise<ReelStoryRecord>
  findOwnedById(id: string, sessionId: string): Promise<ReelStoryRecord | null>
  findById(id: string): Promise<ReelStoryRecord | null>
  findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<ReelStoryRecord | null>
  countActive(sessionId: string): Promise<number>
  countActiveGlobal(): Promise<number>
  listClaimable(now: Date, limit: number): Promise<ReelStoryRecord[]>
  claim(id: string, owner: string, leaseUntil: Date, now: Date): Promise<boolean>
  release(id: string, owner: string): Promise<void>
  updateStory(id: string, guard: ReelStoryGuard, patch: ReelStoryPatch): Promise<number>
  updateShot(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    patch: ReelShotPatch,
  ): Promise<number>
  updateShotDuration(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    durationSeconds: StoryShotDurationSeconds,
  ): Promise<number>
  revalidateQcShots(
    storyId: string,
    storyGuard: ReelStoryGuard,
    shotIds: readonly string[],
  ): Promise<boolean>
  countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number>
  cancel(id: string, sessionId: string, now: Date): Promise<boolean>
}

type StoryRow = Awaited<ReturnType<ReturnType<typeof getPrisma>['story']['findUnique']>>
type ShotRow = NonNullable<NonNullable<StoryRow>['shots']>[number]
type SceneRow = NonNullable<NonNullable<StoryRow>['scenes']>[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePlan(value: unknown): StoryPlan {
  if (!isRecord(value)) {
    return { title: '', logline: '', tone: 'neutral', storyBible: null, scenes: [] }
  }

  const scenes = normalizePlanScenes(value as unknown as Parameters<typeof normalizePlanScenes>[0])
  const storyBible = isRecord(value.storyBible)
    ? value.storyBible as unknown as StoryPlan['storyBible']
    : null
  const tone = typeof value.tone === 'string' ? value.tone as StoryTone : 'neutral'

  return {
    title: typeof value.title === 'string' ? value.title : '',
    logline: typeof value.logline === 'string' ? value.logline : '',
    tone,
    storyBible,
    scenes,
  }
}

function mapShot(row: ShotRow): ReelShotRecord {
  return {
    id: row.id,
    storyId: row.storyId,
    sceneId: row.sceneId,
    sceneOrder: row.sceneOrder,
    order: row.order,
    indexInScene: row.indexInScene,
    durationSeconds: row.durationSeconds as StoryShotDurationSeconds,
    camera: row.camera,
    framing: row.framing as StoryShotFraming,
    subject: row.subject,
    action: row.action,
    visualPrompt: row.visualPrompt,
    transition: 'cut',
    locationId: row.locationId,
    status: row.status,
    keyframeUrl: row.keyframeUrl,
    keyframeRequestId: row.keyframeRequestId,
    keyframeStatusUrl: row.keyframeStatusUrl,
    keyframeResponseUrl: row.keyframeResponseUrl,
    keyframeCancelUrl: row.keyframeCancelUrl,
    keyframeError: row.keyframeError as StoryErrorCode | null,
    videoUrl: row.videoUrl,
    videoRequestId: row.videoRequestId,
    videoStatusUrl: row.videoStatusUrl,
    videoResponseUrl: row.videoResponseUrl,
    videoCancelUrl: row.videoCancelUrl,
    videoError: row.videoError as StoryErrorCode | null,
    keyframeAttempts: row.keyframeAttempts,
    videoAttempts: row.videoAttempts,
    version: row.version,
  }
}

function syntheticShot(scene: SceneRow, planScene: StoryNarrativeScene | null): ReelShotRecord {
  return {
    id: `legacy-${scene.id}`,
    storyId: scene.storyId,
    sceneId: scene.id,
    sceneOrder: scene.order,
    order: scene.order,
    indexInScene: 1,
    durationSeconds: 6,
    camera: 'wide',
    framing: 'establishing',
    subject: 'Plano heredado',
    action: planScene?.action ?? scene.visualPrompt ?? scene.narration,
    visualPrompt: scene.visualPrompt ?? planScene?.action ?? scene.narration,
    transition: 'cut',
    locationId: planScene?.locationId ?? 'legacy-location',
    status: scene.status,
    keyframeUrl: scene.keyframeUrl,
    keyframeRequestId: scene.keyframeRequestId,
    keyframeStatusUrl: scene.keyframeStatusUrl,
    keyframeResponseUrl: scene.keyframeResponseUrl,
    keyframeCancelUrl: scene.keyframeCancelUrl,
    keyframeError: scene.keyframeError as StoryErrorCode | null,
    videoUrl: scene.videoUrl,
    videoRequestId: scene.videoRequestId,
    videoStatusUrl: scene.videoStatusUrl,
    videoResponseUrl: scene.videoResponseUrl,
    videoCancelUrl: scene.videoCancelUrl,
    videoError: scene.videoError as StoryErrorCode | null,
    keyframeAttempts: scene.keyframeAttempts,
    videoAttempts: scene.videoAttempts,
    version: 1,
  }
}

function mapStory(row: NonNullable<StoryRow>): ReelStoryRecord {
  const plan = parsePlan(row.planJson)
  const shotsByScene = new Map<string, ReelShotRecord[]>()

  for (const shotRow of row.shots) {
    const shot = mapShot(shotRow)
    const list = shotsByScene.get(shot.sceneId) ?? []
    list.push(shot)
    shotsByScene.set(shot.sceneId, list)
  }

  const scenes = row.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((sceneRow): ReelSceneRecord => {
      const planScene = plan.scenes.find((scene) => scene.order === sceneRow.order) ?? null
      const existing = shotsByScene.get(sceneRow.id) ?? []
      const shots = existing.length > 0
        ? existing.sort((a, b) => a.order - b.order)
        : [syntheticShot(sceneRow, planScene)]

      return {
        id: sceneRow.id,
        storyId: sceneRow.storyId,
        order: sceneRow.order,
        narration: planScene?.narration ?? sceneRow.narration,
        scene: planScene,
        status: deriveSceneStatus(shots),
        shots,
      }
    })
  const shots = scenes.flatMap((scene) => scene.shots)
  const planned = shots.reduce((total, shot) => total + shot.durationSeconds, 0)
  const target = row.targetDurationSeconds ?? scenes.length * 6

  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    premise: row.premise,
    title: row.title,
    logline: row.logline,
    referenceUrl: row.referenceUrl,
    referenceExpiresAt: row.referenceExpiresAt,
    preset: row.preset === 'quality' ? 'quality' : 'fast',
    mode: row.mode,
    platform: row.platform as StoryPlatform,
    costMode: row.costMode as StoryCostMode,
    targetDurationSeconds: target,
    maxDurationSeconds: row.maxDurationSeconds ?? target,
    plannedDurationSeconds: row.plannedDurationSeconds ?? planned,
    shotCount: row.shotCount ?? shots.length,
    finalDurationSeconds: row.finalDurationSeconds,
    aspectRatio: row.aspectRatio,
    // The shot DTO is the only public read contract. Legacy rows without Shot
    // rows still get a synthetic legacy-<sceneId> shot for read compatibility.
    contract: '008',
    plan,
    scenes,
    shots,
    finalVideoUrl: row.finalVideoUrl,
    finalVideoExpiresAt: row.finalVideoExpiresAt,
    qc: row.qcJson,
    approvedAt: row.approvedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode as StoryErrorCode | null,
    errorMessage: row.errorMessage,
    idempotencyKey: row.idempotencyKey,
    version: row.version,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  }
}

function storyGuardWhere(guard: ReelStoryGuard): Record<string, unknown> {
  return {
    ...(guard.statuses === undefined ? {} : { status: { in: [...guard.statuses] } }),
    ...(guard.version === undefined ? {} : { version: guard.version }),
  }
}

function shotGuardWhere(guard: ReelShotGuard): Record<string, unknown> {
  return {
    ...(guard.statuses === undefined ? {} : { status: { in: [...guard.statuses] } }),
    ...(guard.version === undefined ? {} : { version: guard.version }),
  }
}

function storyPatchData(patch: ReelStoryPatch): Record<string, unknown> {
  return {
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.approvedAt === undefined ? {} : { approvedAt: patch.approvedAt }),
    ...(patch.completedAt === undefined ? {} : { completedAt: patch.completedAt }),
    ...(patch.errorCode === undefined ? {} : { errorCode: patch.errorCode }),
    ...(patch.errorMessage === undefined ? {} : { errorMessage: patch.errorMessage }),
    ...(patch.qc === undefined ? {} : { qcJson: patch.qc as unknown as never }),
    ...(patch.qcCheckedAt === undefined ? {} : { qcCheckedAt: patch.qcCheckedAt }),
    ...(patch.finalVideoUrl === undefined ? {} : { finalVideoUrl: patch.finalVideoUrl }),
    ...(patch.finalVideoExpiresAt === undefined
      ? {}
      : { finalVideoExpiresAt: patch.finalVideoExpiresAt }),
    ...(patch.finalDurationSeconds === undefined
      ? {}
      : { finalDurationSeconds: patch.finalDurationSeconds }),
    ...(patch.plannedDurationSeconds === undefined
      ? {}
      : { plannedDurationSeconds: patch.plannedDurationSeconds }),
    ...(patch.shotCount === undefined ? {} : { shotCount: patch.shotCount }),
  }
}

function shotPatchData(patch: ReelShotPatch): Record<string, unknown> {
  return {
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.visualPrompt === undefined ? {} : { visualPrompt: patch.visualPrompt }),
    ...(patch.durationSeconds === undefined
      ? {}
      : { durationSeconds: patch.durationSeconds }),
    ...(patch.keyframeUrl === undefined ? {} : { keyframeUrl: patch.keyframeUrl }),
    ...(patch.keyframeRequestId === undefined
      ? {}
      : { keyframeRequestId: patch.keyframeRequestId }),
    ...(patch.keyframeStatusUrl === undefined
      ? {}
      : { keyframeStatusUrl: patch.keyframeStatusUrl }),
    ...(patch.keyframeResponseUrl === undefined
      ? {}
      : { keyframeResponseUrl: patch.keyframeResponseUrl }),
    ...(patch.keyframeCancelUrl === undefined
      ? {}
      : { keyframeCancelUrl: patch.keyframeCancelUrl }),
    ...(patch.keyframeError === undefined ? {} : { keyframeError: patch.keyframeError }),
    ...(patch.videoUrl === undefined ? {} : { videoUrl: patch.videoUrl }),
    ...(patch.videoRequestId === undefined
      ? {}
      : { videoRequestId: patch.videoRequestId }),
    ...(patch.videoStatusUrl === undefined
      ? {}
      : { videoStatusUrl: patch.videoStatusUrl }),
    ...(patch.videoResponseUrl === undefined
      ? {}
      : { videoResponseUrl: patch.videoResponseUrl }),
    ...(patch.videoCancelUrl === undefined ? {} : { videoCancelUrl: patch.videoCancelUrl }),
    ...(patch.videoError === undefined ? {} : { videoError: patch.videoError }),
    ...(patch.keyframeAttempts === undefined
      ? {}
      : { keyframeAttempts: patch.keyframeAttempts }),
    ...(patch.videoAttempts === undefined ? {} : { videoAttempts: patch.videoAttempts }),
  }
}

export class PrismaReelStoryRepository implements ReelStoryRepository {
  private readonly client: ReelPrismaClient
  private readonly include = { scenes: { orderBy: { order: 'asc' as const } }, shots: { orderBy: { order: 'asc' as const } } } as const

  constructor(client: ReelPrismaClient = getPrisma()) {
    this.client = client
  }

  async createStory(input: CreateReelStoryInput): Promise<ReelStoryRecord> {
    const storyId = randomUUID()
    const sceneIds = new Map<number, string>()

    for (const scene of input.plan.scenes) {
      sceneIds.set(scene.order, randomUUID())
    }

    await this.client.$transaction(async (tx) => {
      await tx.story.create({
        data: {
          id: storyId,
          sessionId: input.sessionId,
          status: input.status,
          premise: input.premise,
          title: input.title,
          logline: input.logline,
          referenceUrl: input.referenceUrl,
          referenceExpiresAt: input.referenceExpiresAt,
          preset: input.preset,
          mode: input.mode,
          platform: input.platform,
          costMode: input.costMode,
          targetDurationSeconds: input.targetDurationSeconds,
          maxDurationSeconds: input.maxDurationSeconds,
          plannedDurationSeconds: input.shotPlan.plannedDurationSeconds,
          shotCount: input.shotPlan.scenes.flatMap((scene) => scene.shots).length,
          sceneCount: input.plan.scenes.length,
          durationSeconds: 6,
          planJson: input.plan as unknown as never,
          idempotencyKey: input.idempotencyKey,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
          expiresAt: input.expiresAt,
          scenes: {
            create: input.plan.scenes.map((scene) => ({
              id: sceneIds.get(scene.order)!,
              order: scene.order,
              visualPrompt: null,
              narration: scene.narration,
              status: 'PENDING',
              createdAt: input.now,
              updatedAt: input.now,
            })),
          },
        },
      })

      const shots = input.shotPlan.scenes.flatMap((scene) =>
        scene.shots.map((shot) => ({
          id: randomUUID(),
          storyId,
          sceneId: sceneIds.get(scene.order)!,
          sceneOrder: scene.order,
          order: shot.order,
          indexInScene: shot.indexInScene,
          durationSeconds: shot.durationSeconds,
          camera: shot.camera,
          framing: shot.framing,
          subject: shot.subject,
          action: shot.action,
          visualPrompt: shot.visualPrompt,
          transition: 'cut',
          locationId: shot.locationId,
          status: 'PENDING' as const,
          keyframeAttempts: 0,
          videoAttempts: 0,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      )

      if (shots.length > 0) {
        await tx.shot.createMany({ data: shots })
      }
    })

    const row = await this.client.story.findUnique({
      where: { id: storyId },
      include: this.include,
    })

    if (!row) throw new Error('story-not-found')

    return mapStory(row)
  }

  async findOwnedById(id: string, sessionId: string): Promise<ReelStoryRecord | null> {
    const row = await this.client.story.findFirst({
      where: { id, sessionId },
      include: this.include,
    })

    return row ? mapStory(row) : null
  }

  async findById(id: string): Promise<ReelStoryRecord | null> {
    const row = await this.client.story.findUnique({
      where: { id },
      include: this.include,
    })

    return row ? mapStory(row) : null
  }

  async findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<ReelStoryRecord | null> {
    const row = await this.client.story.findFirst({
      where: { sessionId, idempotencyKey },
      include: this.include,
    })

    return row ? mapStory(row) : null
  }

  async listClaimable(now: Date, limit: number): Promise<ReelStoryRecord[]> {
    const rows = await this.client.story.findMany({
      where: {
        status: { in: [...CLAIMABLE_STORY_STATUSES] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      include: this.include,
      orderBy: { updatedAt: 'asc' },
      take: Math.max(limit * 4, limit),
    })

    return rows
      .map(mapStory)
      // Legacy rows without Shot rows are read-only DTOs and stay in the 007
      // worker until a backfill exists.
      .filter((story) => story.shots.some((shot) => !shot.id.startsWith('legacy-')))
      .slice(0, limit)
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

  async updateStory(
    id: string,
    guard: ReelStoryGuard,
    patch: ReelStoryPatch,
  ): Promise<number> {
    const result = await this.client.story.updateMany({
      where: { id, ...storyGuardWhere(guard) },
      data: {
        ...storyPatchData(patch),
        version: { increment: 1 },
      },
    })

    return result.count
  }

  async updateShot(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    patch: ReelShotPatch,
  ): Promise<number> {
    return this.client.$transaction(async (tx) => {
      const shot = await tx.shot.findFirst({
        where: { id: shotId, storyId },
        select: { sceneId: true },
      })

      if (!shot) return 0

      const result = await tx.shot.updateMany({
        where: { id: shotId, storyId, ...shotGuardWhere(guard) },
        data: {
          ...shotPatchData(patch),
          version: { increment: 1 },
        },
      })

      if (result.count === 0) return 0

      const shots = await tx.shot.findMany({
        where: { storyId, sceneId: shot.sceneId },
        select: { status: true, durationSeconds: true },
      })
      const sceneStatus = deriveSceneStatus(shots)

      await tx.scene.updateMany({
        where: { id: shot.sceneId, storyId },
        data: { status: sceneStatus },
      })

      return result.count
    })
  }

  async updateShotDuration(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    durationSeconds: StoryShotDurationSeconds,
  ): Promise<number> {
    return this.client.$transaction(async (tx) => {
      const shot = await tx.shot.findFirst({
        where: { id: shotId, storyId },
        select: { id: true, status: true, version: true },
      })

      if (!shot) return 0
      if (guard.statuses && !guard.statuses.includes(shot.status)) return 0
      if (guard.version !== undefined && shot.version !== guard.version) return 0

      const updated = await tx.shot.updateMany({
        where: { id: shotId, storyId, ...shotGuardWhere(guard) },
        data: { durationSeconds, version: { increment: 1 } },
      })

      if (updated.count === 0) return 0

      const shots = await tx.shot.findMany({
        where: { storyId },
        select: { id: true, durationSeconds: true, status: true },
      })
      const plannedDurationSeconds = shots.reduce(
        (total, item) => total + (item.id === shotId ? durationSeconds : item.durationSeconds),
        0,
      )
      await tx.story.updateMany({
        where: { id: storyId },
        data: {
          plannedDurationSeconds,
          shotCount: shots.length,
          version: { increment: 1 },
        },
      })

      return updated.count
    })
  }

  async revalidateQcShots(
    storyId: string,
    storyGuard: ReelStoryGuard,
    shotIds: readonly string[],
  ): Promise<boolean> {
    try {
      return await this.client.$transaction(async (tx) => {
        const storyUpdate = await tx.story.updateMany({
          where: { id: storyId, ...storyGuardWhere(storyGuard) },
          data: {
            status: 'VIDEOS_READY',
            qcJson: null as unknown as never,
            qcCheckedAt: null,
            errorCode: null,
            errorMessage: null,
            version: { increment: 1 },
          },
        })

        if (storyUpdate.count === 0) return false

        if (shotIds.length > 0) {
          const shots = await tx.shot.updateMany({
            where: {
              storyId,
              id: { in: [...shotIds] },
              status: 'VIDEO_FAILED',
              videoError: 'provider-invalid-output',
            },
            data: {
              status: 'VIDEO_READY',
              videoError: null,
              version: { increment: 1 },
            },
          })

          if (shots.count !== new Set(shotIds).size) {
            throw new Error('qc-retry-conflict')
          }

          const affected = await tx.shot.findMany({
            where: { storyId, id: { in: [...shotIds] } },
            select: { sceneId: true },
          })
          const sceneIds = [...new Set(affected.map((shot) => shot.sceneId))]

          for (const sceneId of sceneIds) {
            const sceneShots = await tx.shot.findMany({
              where: { storyId, sceneId },
              select: { status: true, durationSeconds: true },
            })
            await tx.scene.updateMany({
              where: { id: sceneId, storyId },
              data: { status: deriveSceneStatus(sceneShots) },
            })
          }
        }

        return true
      })
    } catch {
      return false
    }
  }

  async countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number> {
    return this.client.shot.count({
      where: stage === 'keyframe'
        ? {
            status: { in: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
            keyframeRequestId: { not: null },
          }
        : {
            status: { in: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
            videoRequestId: { not: null },
          },
    })
  }

  async cancel(id: string, sessionId: string, now: Date): Promise<boolean> {
    void now
    const result = await this.client.$transaction(async (tx) => {
      const storyUpdate = await tx.story.updateMany({
        where: {
          id,
          sessionId,
          status: { in: [...CANCELLABLE_STORY_STATUSES] },
        },
        data: {
          status: 'CANCELLED',
          leaseOwner: null,
          leaseUntil: null,
          version: { increment: 1 },
        },
      })

      if (storyUpdate.count === 0) return 0

      await tx.shot.updateMany({
        where: { storyId: id, status: { notIn: ['VIDEO_READY', 'CANCELLED'] } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      })
      await tx.scene.updateMany({
        where: { storyId: id, status: { notIn: ['VIDEO_READY', 'CANCELLED'] } },
        data: { status: 'CANCELLED' },
      })

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
}

export function createPrismaReelStoryRepository(): ReelStoryRepository {
  return new PrismaReelStoryRepository()
}
