import type {
  SceneStatus,
  StoryBeat,
  StoryErrorCode,
  StoryMode,
  StoryPlan,
  StoryPreset,
  StoryQC,
  StoryStatus,
} from '~/models/story'

export interface StoryRecord {
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
  readonly sceneCount: number
  readonly durationSeconds: number
  readonly aspectRatio: string
  readonly plan: StoryPlan | null
  readonly finalVideoUrl: string | null
  readonly finalVideoExpiresAt: Date | null
  readonly qc: StoryQC | null
  readonly qcCheckedAt: Date | null
  readonly errorCode: StoryErrorCode | null
  readonly errorMessage: string | null
  readonly idempotencyKey: string | null
  readonly version: number
  readonly leaseOwner: string | null
  readonly leaseUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly approvedAt: Date | null
  readonly completedAt: Date | null
  readonly expiresAt: Date
  readonly scenes: readonly SceneRecord[]
}

export interface SceneRecord {
  readonly id: string
  readonly storyId: string
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
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
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface CreateSceneRecord {
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
  readonly status: SceneStatus
}

export interface CreateStoryRecord {
  readonly sessionId: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: Date | null
  readonly preset: StoryPreset
  readonly mode: StoryMode
  readonly sceneCount: number
  readonly durationSeconds: number
  readonly aspectRatio: string
  readonly plan: StoryPlan | null
  readonly idempotencyKey: string | null
  readonly version: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly expiresAt: Date
  readonly scenes: readonly CreateSceneRecord[]
}

export interface StoryGuard {
  readonly statuses?: readonly StoryStatus[]
  readonly version?: number
}

export interface SceneGuard {
  readonly statuses?: readonly SceneStatus[]
}

export interface StoryPatch {
  readonly status?: StoryStatus
  readonly approvedAt?: Date | null
  readonly completedAt?: Date | null
  readonly errorCode?: StoryErrorCode | null
  readonly errorMessage?: string | null
  readonly plan?: StoryPlan | null
  readonly finalVideoUrl?: string | null
  readonly finalVideoExpiresAt?: Date | null
  readonly qc?: StoryQC | null
  readonly qcCheckedAt?: Date | null
}

export interface ScenePatch {
  readonly status?: SceneStatus
  readonly visualPrompt?: string
  readonly narration?: string
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

export interface QcResultSceneUpdate {
  readonly sceneId: string
  readonly guard: SceneGuard
  readonly patch: ScenePatch
}

export interface ApplyQcResultInput {
  readonly storyId: string
  readonly storyGuard: StoryGuard
  readonly storyPatch: StoryPatch
  readonly scenes: readonly QcResultSceneUpdate[]
  /** Renueva el lease en la misma transición, por ejemplo al entrar en ASSEMBLING. */
  readonly leaseUntil?: Date
}

export interface StoryRepository {
  createStory(input: CreateStoryRecord): Promise<StoryRecord>
  findOwnedById(id: string, sessionId: string): Promise<StoryRecord | null>
  findById(id: string): Promise<StoryRecord | null>
  findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<StoryRecord | null>
  listClaimable(now: Date, limit: number): Promise<StoryRecord[]>
  claim(id: string, owner: string, leaseUntil: Date, now: Date): Promise<boolean>
  release(id: string, owner: string): Promise<void>
  updateStory(id: string, guard: StoryGuard, patch: StoryPatch): Promise<number>
  updateScene(
    storyId: string,
    sceneId: string,
    guard: SceneGuard,
    patch: ScenePatch,
  ): Promise<number>
  applyQcResult(input: ApplyQcResultInput): Promise<boolean>
  cancel(id: string, sessionId: string, now: Date): Promise<boolean>
  countActive(sessionId: string): Promise<number>
  countActiveGlobal(): Promise<number>
  countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number>
  countByStatus(status: StoryStatus): Promise<number>
  deleteExpired(cutoff: Date, limit: number): Promise<number>
}

export interface PlanRebuildInput {
  readonly scenes: readonly {
    readonly order: number
    readonly visualPrompt: string
    readonly narration: string
  }[]
  readonly title: string | null
  readonly logline: string | null
}

export function rebuildPlan(input: PlanRebuildInput): StoryPlan | null {
  if (input.scenes.length === 0) {
    return null
  }

  const beats: StoryBeat[] = input.scenes
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((scene, index, all) => {
      const sceneRole = index === 0
        ? 'establishing'
        : index === all.length - 1
          ? 'resolution'
          : 'development'
      const storyFunction = index === 0
        ? 'hook'
        : index === all.length - 1
          ? 'payoff'
          : 'complication'

      return {
        order: scene.order,
        sceneRole,
        locationId: 'legacy-location',
        timeOfDay: 'morning',
        weather: 'clear',
        visualPrompt: scene.visualPrompt,
        narration: scene.narration,
        characters: [],
        props: [],
        action: scene.visualPrompt,
        storyFunction,
        gag: null,
        camera: 'wide',
        continuityFromPrevious: index === 0 ? null : 'Continúa la escena anterior.',
        transition: 'cut',
      }
    })

  return {
    title: input.title ?? '',
    logline: input.logline ?? '',
    tone: 'neutral',
    storyBible: null,
    beats,
  }
}
