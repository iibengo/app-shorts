import type {
  SceneStatus,
  StoryBible,
  StoryGraphic,
  StoryNarrativeScene,
  StoryPlan,
  StoryStatus,
} from '~/models/story'
import type {
  DurationPlan,
  ReelPlan,
  ReelPlanDirector,
  StoryDirector,
} from '../../server/story/director-types'
import type {
  CreateReelStoryInput,
  ReelShotGuard,
  ReelShotPatch,
  ReelShotRecord,
  ReelSceneRecord,
  ReelStoryGuard,
  ReelStoryPatch,
  ReelStoryRecord,
  ReelStoryRepository,
} from '../../server/story/reel-repository'
import { deriveSceneStatus } from '../../server/story/scene-status'
import type { StoredCharacterRefs } from '../../server/story/character-refs'
import { DEFAULT_PLAN } from './story'

const ACTIVE: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'ASSEMBLING',
]

function title(index: number): string {
  return `Escena ${index}`
}

function storyBible(): StoryBible {
  return { ...DEFAULT_PLAN.storyBible! }
}

function narrativeScene(order: number, total: number): StoryNarrativeScene {
  return {
    order,
    sceneRole: order === 1 ? 'establishing' : order === total ? 'resolution' : 'development',
    locationId: `lugar-${((order - 1) % 3) + 1}`,
    timeOfDay: 'morning',
    weather: 'clear',
    characters: ['personaje-1'],
    props: order === 1 ? ['objeto-1'] : [],
    action: `Acción narrativa del plano ${order}, con detalle suficiente para el adaptador.`,
    narration: `Narración de la escena ${order}.`,
    storyFunction: order === 1 ? 'hook' : order === total ? 'payoff' : 'complication',
    gag: null,
    stake: `El protagonista necesita cerrar el plano ${order} antes de que se acabe el tiempo.`,
    continuityFromPrevious: order === 1
      ? null
      : 'Continúa desde la escena anterior con el mismo conflicto.',
  }
}

export function legacyPlanWithScenes(sceneCount: number): StoryPlan {
  const scenes = Array.from(
    { length: sceneCount },
    (_value, index) => narrativeScene(index + 1, sceneCount),
  )
  const beats = scenes.map((scene) => ({
    ...scene,
    visualPrompt: `Prompt visual heredado para ${title(scene.order)} con composición y luz.`,
  }))

  return {
    title: 'Historia de prueba',
    logline: 'Una protagonista resuelve un conflicto cotidiano.',
    tone: 'humor',
    storyBible: storyBible(),
    scenes,
    // The vertical adapter consumes the legacy 007 shape.
    beats,
  } as unknown as StoryPlan
}

export class FakeSceneCountStoryDirector implements StoryDirector {
  readonly calls: { readonly sceneCount: number; readonly premise: string }[] = []
  error: Error | null = null

  async createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
  }): Promise<StoryPlan> {
    this.calls.push({ sceneCount: input.sceneCount, premise: input.premise })

    if (this.error) throw this.error

    return legacyPlanWithScenes(input.sceneCount)
  }
}

function planScenes(plan: DurationPlan, shotCount: number): StoryNarrativeScene[] {
  const required = Math.ceil(shotCount / 4)
  const count = Math.max(
    3,
    plan.sceneCount.min,
    Math.min(plan.sceneCount.max, required),
  )

  return Array.from({ length: count }, (_value, index) => narrativeScene(index + 1, count))
}

function plannedShotCount(plan: DurationPlan): number {
  return plan.exactShotCount ?? plan.shotCount.max
}

function shotDurations(plan: DurationPlan, count: number): readonly number[] {
  if (plan.costMode === 'budget' && plan.targetDurationSeconds === 90) {
    return Array.from({ length: count }, () => 6)
  }

  const durations = Array.from({ length: count }, () => 2)
  let remaining = plan.targetDurationSeconds - count * 2

  while (remaining > 0) {
    let added = false

    for (let index = 0; index < count && remaining > 0; index += 1) {
      const cap = index === 0 ? 3 : 6

      if (durations[index]! < cap) {
        durations[index]! += 1
        remaining -= 1
        added = true
      }
    }

    if (!added) break
  }

  return durations
}

export class FakeReelPlanDirector implements ReelPlanDirector {
  readonly calls: { readonly premise: string; readonly durationPlan: DurationPlan }[] = []

  async createPlan(input: Parameters<ReelPlanDirector['createPlan']>[0]): Promise<ReelPlan> {
    this.calls.push(input)
    const shotCount = plannedShotCount(input.durationPlan)
    const scenes = planScenes(input.durationPlan, shotCount)
    const durations = shotDurations(input.durationPlan, shotCount)
    let order = 1
    const shotScenes = scenes.map((scene) => {
      const shotsInScene = Math.ceil(
        (shotCount - (order - 1)) / (scenes.length - scene.order + 1),
      )
      const shots = Array.from({ length: shotsInScene }, (_value, index) => {
        const globalIndex = order - 1 + index

        return {
          sceneId: `scene-${scene.order}`,
          sceneOrder: scene.order,
          order: globalIndex + 1,
          indexInScene: index + 1,
          durationSeconds: durations[globalIndex] as 2 | 3 | 4 | 5 | 6,
          camera: 'medium' as const,
          framing: index === 0 ? 'medium' as const : 'close-up' as const,
          subject: 'Personaje 1',
          action: scene.action,
          visualPrompt: `Plano ${index + 1} de la escena ${scene.order} con cobertura clara.`,
          transition: 'cut' as const,
          locationId: scene.locationId,
        }
      })

      order += shotsInScene

      return { order: scene.order, shots }
    })
    const flat = shotScenes.flatMap((scene) => scene.shots)
    const overflow = flat.length - shotCount

    if (overflow > 0) {
      shotScenes[shotScenes.length - 1]!.shots.splice(-overflow)
      order -= overflow
    }

    return {
      plan: {
        title: 'Historia de prueba',
        logline: 'Una protagonista resuelve un conflicto cotidiano.',
        tone: 'humor',
        storyBible: storyBible(),
        scenes,
      },
      shotPlan: {
        scenes: shotScenes,
        plannedDurationSeconds: shotScenes
          .flatMap((scene) => scene.shots)
          .reduce((total, shot) => total + shot.durationSeconds, 0),
      },
    }
  }
}

function activeStatus(status: StoryStatus): boolean {
  return ACTIVE.includes(status)
}

function sceneStatuses(shots: readonly { readonly status: SceneStatus }[]): SceneStatus {
  return shots.length > 0 && shots.every((shot) => shot.status === 'PENDING')
    ? 'PENDING'
    : shots[0]?.status ?? 'PENDING'
}

export class FakeReelStoryRepository implements ReelStoryRepository {
  readonly records: ReelStoryRecord[] = []
  failQcRetry = false
  /** Milliseconds reported by shotIdleMs; tests raise it to simulate a dead job. */
  shotIdleMsValue = 0
  private counter = 0

  async createStory(input: CreateReelStoryInput): Promise<ReelStoryRecord> {
    this.counter += 1
    const id = `reel-${this.counter}`
    const sceneIds = new Map<number, string>()

    for (const scene of input.plan.scenes) {
      sceneIds.set(scene.order, `${id}-scene-${scene.order}`)
    }

    let globalShotOrder = 0
    const shots: ReelShotRecord[] = input.shotPlan.scenes.flatMap((scene) =>
      scene.shots.map((shot) => {
        globalShotOrder += 1
        const order = shot.order ?? globalShotOrder

        return {
        id: `${id}-shot-${order}`,
        storyId: id,
        sceneId: sceneIds.get(scene.order)!,
        sceneOrder: shot.sceneOrder,
        order,
        indexInScene: shot.indexInScene,
        durationSeconds: shot.durationSeconds,
        camera: shot.camera,
        framing: shot.framing,
        subject: shot.subject,
        action: shot.action,
        visualPrompt: shot.visualPrompt,
        transition: 'cut',
        locationId: shot.locationId,
        status: 'PENDING',
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
      }),
    )
    const scenes: ReelSceneRecord[] = input.plan.scenes.map((scene) => {
      const sceneShots = shots.filter((shot) => shot.sceneOrder === scene.order)

      return {
        id: sceneIds.get(scene.order)!,
        storyId: id,
        order: scene.order,
        narration: scene.narration,
        scene,
        status: sceneStatuses(sceneShots),
        shots: sceneShots,
      }
    })
    const record: ReelStoryRecord = {
      id,
      sessionId: input.sessionId,
      status: input.status,
      premise: input.premise,
      title: input.title,
      logline: input.logline,
      referenceUrl: input.referenceUrl,
      referenceExpiresAt: input.referenceExpiresAt,
      preset: input.preset,
      visualStyle: input.visualStyle ?? 'cartoon3d',
      anchors: input.anchors ?? {},
      characterSheet: null,
      characterRefs: input.characterRefs ?? {},
      graphics: input.graphics ?? [],
      mode: input.mode,
      platform: input.platform,
      costMode: input.costMode,
      targetDurationSeconds: input.targetDurationSeconds,
      maxDurationSeconds: input.maxDurationSeconds,
      plannedDurationSeconds: input.shotPlan.plannedDurationSeconds,
      shotCount: shots.length,
      finalDurationSeconds: null,
      aspectRatio: '9:16',
      contract: '008',
      plan: input.plan,
      scenes,
      shots,
      finalVideoUrl: null,
      finalVideoExpiresAt: null,
      qc: null,
      approvedAt: null,
      completedAt: null,
      errorCode: null,
      errorMessage: null,
      idempotencyKey: input.idempotencyKey,
      version: 1,
      leaseOwner: null,
      leaseUntil: null,
      createdAt: input.now,
      updatedAt: input.now,
      expiresAt: input.expiresAt,
    }

    this.records.push(record)

    return record
  }

  async findOwnedById(id: string, sessionId: string): Promise<ReelStoryRecord | null> {
    return this.records.find(
      (record) => record.id === id && record.sessionId === sessionId,
    ) ?? null
  }

  async findById(id: string): Promise<ReelStoryRecord | null> {
    return this.records.find((record) => record.id === id) ?? null
  }

  async findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<ReelStoryRecord | null> {
    return this.records.find(
      (record) =>
        record.sessionId === sessionId
        && record.idempotencyKey === idempotencyKey,
    ) ?? null
  }

  async listClaimable(now: Date, limit: number): Promise<ReelStoryRecord[]> {
    return this.records
      .filter((record) =>
        ['GENERATING_KEYFRAMES', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'ASSEMBLING']
          .includes(record.status)
        && (record.leaseUntil === null || record.leaseUntil.getTime() < now.getTime()))
      .slice(0, limit)
  }

  async claim(id: string, owner: string, leaseUntil: Date, now: Date): Promise<boolean> {
    const index = this.records.findIndex((record) =>
      record.id === id
      && (record.leaseUntil === null || record.leaseUntil.getTime() < now.getTime()))
    const record = this.records[index]

    if (!record) return false

    this.records[index] = {
      ...record,
      leaseOwner: owner,
      leaseUntil,
      version: record.version + 1,
    }

    return true
  }

  async release(id: string, owner: string): Promise<void> {
    const index = this.records.findIndex((record) =>
      record.id === id && record.leaseOwner === owner)

    if (index >= 0) {
      this.records[index] = {
        ...this.records[index]!,
        leaseOwner: null,
        leaseUntil: null,
      }
    }
  }

  async updateStory(
    id: string,
    guard: ReelStoryGuard,
    patch: ReelStoryPatch,
  ): Promise<number> {
    const index = this.records.findIndex((record) => {
      if (record.id !== id) return false
      if (guard.statuses && !guard.statuses.includes(record.status)) return false
      if (guard.version !== undefined && record.version !== guard.version) return false
      return true
    })
    const record = this.records[index]

    if (!record) return 0

    const next: ReelStoryRecord = {
      ...record,
      ...Object.fromEntries(
        Object.entries(patch).filter((entry) => entry[1] !== undefined),
      ),
      qc: patch.qc === undefined ? record.qc : patch.qc,
      version: record.version + 1,
      updatedAt: new Date(record.updatedAt.getTime() + 1_000),
    }
    this.records[index] = next

    return 1
  }

  async updateShot(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    patch: ReelShotPatch,
  ): Promise<number> {
    const storyIndex = this.records.findIndex((record) => record.id === storyId)
    const story = this.records[storyIndex]

    if (!story) return 0

    const shotIndex = story.shots.findIndex((shot) => shot.id === shotId)
    const shot = story.shots[shotIndex]

    if (!shot) return 0
    if (guard.statuses && !guard.statuses.includes(shot.status)) return 0
    if (guard.version !== undefined && shot.version !== guard.version) return 0

    const nextShot: ReelShotRecord = {
      ...shot,
      ...Object.fromEntries(
        Object.entries(patch).filter((entry) => entry[1] !== undefined),
      ),
      version: shot.version + 1,
    }
    const shots = story.shots.map((item) => item.id === shotId ? nextShot : item)
    const scenes = story.scenes.map((scene) => {
      if (scene.id !== shot.sceneId) return scene
      const sceneShots = shots.filter((item) => item.sceneId === scene.id)

      return {
        ...scene,
        status: deriveSceneStatus(sceneShots),
        shots: sceneShots,
      }
    })

    this.records[storyIndex] = {
      ...story,
      shots,
      scenes,
      updatedAt: new Date(story.updatedAt.getTime() + 1_000),
    }

    return 1
  }

  async updateShotDuration(
    storyId: string,
    shotId: string,
    guard: ReelShotGuard,
    durationSeconds: number,
  ): Promise<number> {
    const storyIndex = this.records.findIndex((record) => record.id === storyId)
    const story = this.records[storyIndex]

    if (!story) return 0

    const shot = story.shots.find((item) => item.id === shotId)

    if (!shot) return 0
    if (guard.statuses && !guard.statuses.includes(shot.status)) return 0
    if (guard.version !== undefined && shot.version !== guard.version) return 0

    const shots = story.shots.map((item) =>
      item.id === shotId
        ? { ...item, durationSeconds, version: item.version + 1 }
        : item)
    const planned = shots.reduce((total, item) => total + item.durationSeconds, 0)

    this.records[storyIndex] = {
      ...story,
      shots,
      plannedDurationSeconds: planned,
      shotCount: shots.length,
      version: story.version + 1,
    }

    return 1
  }

  async revalidateQcShots(
    storyId: string,
    storyGuard: ReelStoryGuard,
    shotIds: readonly string[],
  ): Promise<boolean> {
    if (this.failQcRetry) return false

    const storyIndex = this.records.findIndex((record) => {
      if (record.id !== storyId) return false
      if (storyGuard.statuses && !storyGuard.statuses.includes(record.status)) return false
      if (storyGuard.version !== undefined && record.version !== storyGuard.version) return false
      return true
    })
    const story = this.records[storyIndex]

    if (!story) return false

    const valid = story.shots.filter((shot) =>
      shotIds.includes(shot.id)
      && shot.status === 'VIDEO_FAILED'
      && shot.videoError === 'provider-invalid-output')

    if (valid.length !== new Set(shotIds).size) return false

    const shots = story.shots.map((shot) =>
      valid.some((item) => item.id === shot.id)
        ? {
            ...shot,
            status: 'VIDEO_READY' as const,
            videoError: null,
            version: shot.version + 1,
          }
        : shot)
    const scenes = story.scenes.map((scene) => {
      const sceneShots = shots.filter((shot) => shot.sceneId === scene.id)

      return {
        ...scene,
        status: deriveSceneStatus(sceneShots),
        shots: sceneShots,
      }
    })

    this.records[storyIndex] = {
      ...story,
      status: 'VIDEOS_READY',
      qc: null,
      shots,
      scenes,
      version: story.version + 1,
    }

    return true
  }

  async countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number> {
    const statuses = stage === 'keyframe'
      ? ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING']
      : ['VIDEO_QUEUED', 'VIDEO_RUNNING']

    return this.records.reduce(
      (total, record) => total + record.shots.filter((shot) =>
        statuses.includes(shot.status)
        && (stage === 'keyframe'
          ? shot.keyframeRequestId !== null
          : shot.videoRequestId !== null)).length,
      0,
    )
  }

  async updateCharacterSheet(storyId: string, sheet: null | Record<string, string>): Promise<boolean> {
    const story = this.records.find((record) => record.id === storyId)

    if (!story) return false

    story.characterSheet = sheet as never

    return true
  }

  async updateGraphics(
    storyId: string,
    graphics: readonly StoryGraphic[],
  ): Promise<boolean> {
    const record = this.records.find((item) => item.id === storyId)

    if (record === undefined) return false

    record.graphics = graphics

    return true
  }

  async updateStoryAnchors(
    storyId: string,
    anchors: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    const story = this.records.find((record) => record.id === storyId)

    if (!story) return false

    story.anchors = anchors

    return true
  }

  async updateCharacterRefs(
    storyId: string,
    refs: StoredCharacterRefs,
    guard: ReelStoryGuard & { readonly leaseOwner?: string } = {},
  ): Promise<boolean> {
    const index = this.records.findIndex((record) => record.id === storyId)

    if (index < 0) return false

    const current = this.records[index]!

    // Mirrors the Prisma where-clause: a stale version or a lost lease must not
    // write, because that write is what re-triggers a paid generation.
    if (guard.version !== undefined && current.version !== guard.version) return false
    if (guard.statuses !== undefined && !guard.statuses.includes(current.status)) return false
    if (guard.leaseOwner !== undefined && current.leaseOwner !== guard.leaseOwner) return false

    this.records[index] = {
      ...current,
      characterRefs: refs,
      version: current.version + 1,
    }

    return true
  }

  async shotIdleMs(storyId: string, shotId: string, now: number): Promise<number | null> {
    void now
    const exists = this.records.some((record) =>
      record.id === storyId && record.shots.some((shot) => shot.id === shotId))

    return exists ? this.shotIdleMsValue : null
  }

  async cancel(id: string, sessionId: string, now: Date): Promise<boolean> {
    void now
    const index = this.records.findIndex((record) =>
      record.id === id && record.sessionId === sessionId)

    if (index < 0) return false

    const record = this.records[index]!
    this.records[index] = {
      ...record,
      status: 'CANCELLED',
      leaseOwner: null,
      leaseUntil: null,
      version: record.version + 1,
      shots: record.shots.map((shot) =>
        shot.status === 'VIDEO_READY' || shot.status === 'CANCELLED'
          ? shot
          : { ...shot, status: 'CANCELLED' }),
    }
    this.records[index] = {
      ...this.records[index]!,
      scenes: this.records[index]!.scenes.map((scene) => ({
        ...scene,
        status: scene.shots.every((shot) => shot.status === 'CANCELLED')
          ? 'CANCELLED'
          : scene.status,
      })),
    }

    return true
  }

  async countActive(sessionId: string): Promise<number> {
    return this.records.filter(
      (record) => record.sessionId === sessionId && activeStatus(record.status),
    ).length
  }

  async countActiveGlobal(): Promise<number> {
    return this.records.filter((record) => activeStatus(record.status)).length
  }
}
