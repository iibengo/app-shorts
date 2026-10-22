import type {
  SceneStatus,
  StoryErrorCode,
  StoryMode,
  StoryPlan,
  StoryPreset,
  StorySceneCount,
  StoryStatus,
} from '~/models/story'
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
} from '../../server/story/repository'
import type { StoryDirector } from '../../server/story/director-types'
import type { StoryAssembler } from '../../server/story/assembly-service'
import type {
  KeyframeOrchestrator,
  KeyframePollResult,
  ProviderSubmission,
} from '../../server/story/keyframe-orchestrator'
import type {
  VideoOrchestrator,
  VideoPollResult,
  VideoProviderSubmission,
} from '../../server/story/video-orchestrator'
import plan4 from '../fixtures/deepseek/deepseek-plan-4.json'
import plan5 from '../fixtures/deepseek/deepseek-plan-5.json'
import plan6 from '../fixtures/deepseek/deepseek-plan-6.json'

export const TEST_NOW_ISO = '2026-10-21T18:00:00.000Z'
export const TEST_NOW = Date.parse(TEST_NOW_ISO)

export const PLANS = {
  4: plan4 as StoryPlan,
  5: plan5 as StoryPlan,
  6: plan6 as StoryPlan,
} as const

export const DEFAULT_PLAN: StoryPlan = PLANS[5]


export function longGlobalPlan(): StoryPlan {
  const plan = structuredClone(DEFAULT_PLAN) as StoryPlan
  const long = 'Palabra '.repeat(25).trim()

  plan.storyBible = {
    ...plan.storyBible!,
    style: long.slice(0, 140),
    theme: long.slice(0, 140),
    leadCharacterId: 'personaje-1',
    signaturePropId: 'objeto-1',
    characters: Array.from({ length: 2 }, (_value, index) => ({
      id: `personaje-${index + 1}`,
      name: `Personaje ${index + 1}`,
      description: long.slice(0, 160),
      wardrobe: long.slice(0, 120),
      source: 'premise' as const,
    })),
    locations: Array.from({ length: 3 }, (_value, index) => ({
      id: `lugar-${index + 1}`,
      name: `Lugar ${index + 1}`,
      description: long.slice(0, 160),
      source: 'premise' as const,
    })),
    props: Array.from({ length: 3 }, (_value, index) => ({
      id: `objeto-${index + 1}`,
      name: `Objeto ${index + 1}`,
      description: long.slice(0, 120),
      source: 'premise' as const,
    })),
    forbidden: Array.from(
      { length: 5 },
      (_value, index) => `Prohibido ${index + 1} ${long.slice(0, 35)}`.slice(0, 50),
    ),
    continuityRules: Array.from(
      { length: 2 },
      (_value, index) => `Regla ${index + 1} ${long.slice(0, 120)}`.slice(0, 140),
    ),
  }
  plan.beats = plan.beats.map((beat, index) => ({
    ...beat,
    locationId: `lugar-${(index % 3) + 1}`,
    visualPrompt: 'Composición '.repeat(50).slice(0, 600),
    action: 'Acción '.repeat(80).slice(0, 600),
    characters: index % 2 === 0
      ? ['personaje-1', 'personaje-2']
      : ['personaje-1'],
    props: [
      ['objeto-1'],
      ['objeto-2'],
      ['objeto-3'],
      ['objeto-1'],
      ['objeto-2'],
    ][index]!,
  }))

  return plan
}

export function longVideoPlan(): StoryPlan {
  const plan = structuredClone(DEFAULT_PLAN) as StoryPlan
  const beat = plan.beats[1]!

  plan.beats = plan.beats.map((item) => item.order === beat.order
    ? {
        ...item,
        action: 'Acción '.repeat(80).slice(0, 600),
        visualPrompt: 'Composición '.repeat(50).slice(0, 600),
    action: 'Acción '.repeat(80).slice(0, 600),
      }
    : item)

  return plan
}

export const STORY_ID = 'story-test-0001'
export const SESSION_ID = 'story-session-abcdefghijkl'

let sequence = 0

export function nextSequence(): number {
  sequence += 1

  return sequence
}

export function resetSequence(): void {
  sequence = 0
}

export function makeSceneRecord(
  overrides: Partial<SceneRecord> & { readonly order: number },
): SceneRecord {
  const sequenceId = nextSequence()

  return {
    id: `scene-${sequenceId}`,
    storyId: STORY_ID,
    order: overrides.order,
    visualPrompt:
      overrides.visualPrompt
      ?? `Escena número ${overrides.order} con una descripción visual coherente.`,
    narration: overrides.narration ?? `Narración breve de la escena ${overrides.order}.`,
    status: overrides.status ?? 'PENDING',
    keyframeUrl: overrides.keyframeUrl ?? null,
    keyframeRequestId: overrides.keyframeRequestId ?? null,
    keyframeStatusUrl: overrides.keyframeStatusUrl ?? null,
    keyframeResponseUrl: overrides.keyframeResponseUrl ?? null,
    keyframeCancelUrl: overrides.keyframeCancelUrl ?? null,
    keyframeError: overrides.keyframeError ?? null,
    videoUrl: overrides.videoUrl ?? null,
    videoRequestId: overrides.videoRequestId ?? null,
    videoStatusUrl: overrides.videoStatusUrl ?? null,
    videoResponseUrl: overrides.videoResponseUrl ?? null,
    videoCancelUrl: overrides.videoCancelUrl ?? null,
    videoError: overrides.videoError ?? null,
    keyframeAttempts: overrides.keyframeAttempts ?? 0,
    videoAttempts: overrides.videoAttempts ?? 0,
    createdAt: overrides.createdAt ?? new Date(TEST_NOW),
    updatedAt: overrides.updatedAt ?? new Date(TEST_NOW),
  }
}

export function makeScenes(
  count: number,
  overrides: Partial<SceneRecord> = {},
): SceneRecord[] {
  return Array.from({ length: count }, (_value, index) =>
    makeSceneRecord({ ...overrides, order: index + 1 }),
  )
}

export function makeStoryRecord(overrides: Partial<StoryRecord> = {}): StoryRecord {
  const scenes = overrides.scenes ?? makeScenes(overrides.sceneCount ?? 5)
  const sceneCount = overrides.sceneCount ?? scenes.length
  const preset = overrides.preset ?? 'fast'
  const plan = overrides.plan === undefined
    ? sceneCount === 4 || sceneCount === 5 || sceneCount === 6
      ? PLANS[sceneCount]
      : null
    : overrides.plan

  return {
    id: overrides.id ?? STORY_ID,
    sessionId: overrides.sessionId ?? SESSION_ID,
    status: overrides.status ?? 'GENERATING_KEYFRAMES',
    premise: overrides.premise ?? 'Una premisa de prueba con longitud suficiente.',
    title: overrides.title ?? plan?.title ?? null,
    logline: overrides.logline ?? plan?.logline ?? null,
    referenceUrl: overrides.referenceUrl ?? null,
    referenceExpiresAt: overrides.referenceExpiresAt ?? null,
    preset,
    mode: overrides.mode ?? 'faithful',
    sceneCount,
    durationSeconds: overrides.durationSeconds ?? 6,
    aspectRatio: overrides.aspectRatio ?? '9:16',
    plan,
    finalVideoUrl: overrides.finalVideoUrl ?? null,
    finalVideoExpiresAt: overrides.finalVideoExpiresAt ?? null,
    qc: overrides.qc ?? null,
    qcCheckedAt: overrides.qcCheckedAt ?? null,
    errorCode: overrides.errorCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    idempotencyKey: overrides.idempotencyKey ?? null,
    version: overrides.version ?? 1,
    leaseOwner: overrides.leaseOwner ?? null,
    leaseUntil: overrides.leaseUntil ?? null,
    createdAt: overrides.createdAt ?? new Date(TEST_NOW),
    updatedAt: overrides.updatedAt ?? new Date(TEST_NOW),
    approvedAt: overrides.approvedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    expiresAt: overrides.expiresAt ?? new Date(TEST_NOW + 86_400_000),
    scenes: scenes.map((scene) => ({ ...scene, storyId: overrides.id ?? STORY_ID })),
  }
}

function mergeDefined<T extends object>(base: T, patch: object): T {
  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      result[key] = value
    }
  }

  return result as T
}

function withinStoryGuard(story: StoryRecord, guard: StoryGuard): boolean {
  const statusMatches = !guard.statuses || guard.statuses.includes(story.status)
  const versionMatches = guard.version === undefined || guard.version === story.version

  return statusMatches && versionMatches
}

function withinSceneGuard(scene: SceneRecord, guard: SceneGuard): boolean {
  return !guard.statuses || guard.statuses.includes(scene.status)
}

const CLAIMABLE: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'ASSEMBLING',
]

const ACTIVE: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'ASSEMBLING',
]

const CANCELLABLE: readonly StoryStatus[] = [
  'GENERATING_KEYFRAMES',
  'WAITING_APPROVAL',
  'GENERATING_VIDEOS',
  'VIDEOS_READY',
  'QC',
  'WAITING_QC',
  'ASSEMBLING',
]

export interface ExpiredDeleteCall {
  readonly cutoff: Date
  readonly limit: number
}

/**
 * In-memory repository that mirrors the contract of the Prisma implementation.
 * Every method records its name so tests can assert read-only paths and
 * transactional behaviour without a database.
 */
export class FakeStoryRepository implements StoryRepository {
  readonly records: StoryRecord[] = []
  readonly calls: string[] = []
  readonly deleteExpiredCalls: ExpiredDeleteCall[] = []
  private counter = 0

  constructor(seed: readonly StoryRecord[] = []) {
    for (const story of seed) {
      this.records.push(story)
      this.counter = Math.max(this.counter, this.records.length)
    }
  }

  seed(story: StoryRecord): StoryRecord {
    this.records.push(story)

    return story
  }

  find(id: string): StoryRecord | undefined {
    return this.records.find((story) => story.id === id)
  }

  clearCalls(): void {
    this.calls.length = 0
  }

  async createStory(input: CreateStoryRecord): Promise<StoryRecord> {
    this.calls.push('createStory')
    this.counter += 1
    const id = `story-${this.counter}`

    const story = makeStoryRecord({
      id,
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
      plan: input.plan,
      idempotencyKey: input.idempotencyKey,
      version: input.version,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      expiresAt: input.expiresAt,
      scenes: input.scenes.map((scene) => {
        this.counter += 1

        return makeSceneRecord({
          id: `scene-${this.counter}`,
          storyId: id,
          order: scene.order,
          visualPrompt: scene.visualPrompt,
          narration: scene.narration,
          status: scene.status,
        })
      }),
    })

    this.records.push(story)

    return story
  }

  async findOwnedById(id: string, sessionId: string): Promise<StoryRecord | null> {
    this.calls.push('findOwnedById')

    return this.records.find((story) => story.id === id && story.sessionId === sessionId) ?? null
  }

  async findById(id: string): Promise<StoryRecord | null> {
    this.calls.push('findById')

    return this.find(id) ?? null
  }

  async findBySessionAndIdempotencyKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<StoryRecord | null> {
    this.calls.push('findBySessionAndIdempotencyKey')

    return this.records.find(
      (story) =>
        story.sessionId === sessionId && story.idempotencyKey === idempotencyKey,
    ) ?? null
  }

  async listClaimable(now: Date, limit: number): Promise<StoryRecord[]> {
    this.calls.push('listClaimable')

    return this.records
      .filter(
        (story) =>
          CLAIMABLE.includes(story.status)
          && (story.leaseUntil === null || story.leaseUntil.getTime() < now.getTime()),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit)
  }

  async claim(
    id: string,
    owner: string,
    leaseUntil: Date,
    now: Date,
  ): Promise<boolean> {
    this.calls.push('claim')
    const index = this.records.findIndex((story) => story.id === id)

    if (index < 0) return false

    const story = this.records[index]!

    if (
      !CLAIMABLE.includes(story.status)
      || (story.leaseUntil !== null && story.leaseUntil.getTime() >= now.getTime())
    ) {
      return false
    }

    this.records[index] = {
      ...story,
      leaseOwner: owner,
      leaseUntil,
      version: story.version + 1,
    }

    return true
  }

  async release(id: string, owner: string): Promise<void> {
    this.calls.push('release')
    const index = this.records.findIndex(
      (story) => story.id === id && story.leaseOwner === owner,
    )

    if (index < 0) return

    this.records[index] = {
      ...this.records[index]!,
      leaseOwner: null,
      leaseUntil: null,
    }
  }

  async updateStory(id: string, guard: StoryGuard, patch: StoryPatch): Promise<number> {
    this.calls.push('updateStory')
    const index = this.records.findIndex((story) => story.id === id)

    if (index < 0) return 0

    const story = this.records[index]!

    if (!withinStoryGuard(story, guard)) {
      return 0
    }

    this.records[index] = {
      ...mergeDefined(story, patch),
      version: story.version + 1,
      updatedAt: new Date(story.updatedAt.getTime() + 1_000),
    }

    return 1
  }

  async updateScene(
    storyId: string,
    sceneId: string,
    guard: SceneGuard,
    patch: ScenePatch,
  ): Promise<number> {
    this.calls.push('updateScene')
    const index = this.records.findIndex((story) => story.id === storyId)

    if (index < 0) return 0

    const story = this.records[index]!
    const sceneIndex = story.scenes.findIndex((scene) => scene.id === sceneId)

    if (sceneIndex < 0) return 0

    const scene = story.scenes[sceneIndex]!

    if (!withinSceneGuard(scene, guard)) {
      return 0
    }

    const scenes = story.scenes.slice()
    scenes[sceneIndex] = {
      ...mergeDefined(scene, patch),
      updatedAt: new Date(scene.updatedAt.getTime() + 1_000),
    }

    this.records[index] = { ...story, scenes }

    return 1
  }

  async applyQcResult(input: ApplyQcResultInput): Promise<boolean> {
    this.calls.push('applyQcResult')
    const index = this.records.findIndex((story) => story.id === input.storyId)

    if (index < 0) return false

    const story = this.records[index]!

    if (!withinStoryGuard(story, input.storyGuard)) {
      return false
    }

    for (const update of input.scenes) {
      const scene = story.scenes.find((item) => item.id === update.sceneId)

      if (!scene || !withinSceneGuard(scene, update.guard)) {
        return false
      }
    }

    const updatedStory = {
      ...mergeDefined(story, input.storyPatch),
      ...(input.leaseUntil === undefined ? {} : { leaseUntil: input.leaseUntil }),
      version: story.version + 1,
      updatedAt: new Date(story.updatedAt.getTime() + 1_000),
    }

    const scenes = updatedStory.scenes.slice()

    for (const update of input.scenes) {
      const sceneIndex = scenes.findIndex((item) => item.id === update.sceneId)

      if (sceneIndex < 0) continue

      scenes[sceneIndex] = {
        ...mergeDefined(scenes[sceneIndex]!, update.patch),
        updatedAt: new Date(scenes[sceneIndex]!.updatedAt.getTime() + 1_000),
      }
    }

    this.records[index] = { ...updatedStory, scenes }

    return true
  }

  async cancel(id: string, sessionId: string, now: Date): Promise<boolean> {
    this.calls.push('cancel')
    void now
    const index = this.records.findIndex(
      (story) =>
        story.id === id
        && story.sessionId === sessionId
        && CANCELLABLE.includes(story.status),
    )

    if (index < 0) return false

    const story = this.records[index]!

    this.records[index] = {
      ...story,
      status: 'CANCELLED',
      leaseOwner: null,
      leaseUntil: null,
      version: story.version + 1,
      scenes: story.scenes.map((scene) =>
        scene.status === 'VIDEO_READY' || scene.status === 'CANCELLED'
          ? scene
          : { ...scene, status: 'CANCELLED' as SceneStatus },
      ),
    }

    return true
  }

  async countActive(sessionId: string): Promise<number> {
    this.calls.push('countActive')

    return this.records.filter(
      (story) => story.sessionId === sessionId && ACTIVE.includes(story.status),
    ).length
  }

  async countActiveGlobal(): Promise<number> {
    this.calls.push('countActiveGlobal')

    return this.records.filter((story) => ACTIVE.includes(story.status)).length
  }

  async countActiveProviderJobs(stage: 'keyframe' | 'video'): Promise<number> {
    this.calls.push('countActiveProviderJobs')
    const statuses: readonly SceneStatus[] = stage === 'keyframe'
      ? ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING']
      : ['VIDEO_QUEUED', 'VIDEO_RUNNING']

    return this.records.reduce(
      (total, story) =>
        total
        + story.scenes.filter(
          (scene) =>
            statuses.includes(scene.status)
            && (stage === 'keyframe'
              ? scene.keyframeRequestId !== null
              : scene.videoRequestId !== null),
        ).length,
      0,
    )
  }

  async countByStatus(status: StoryStatus): Promise<number> {
    this.calls.push('countByStatus')

    return this.records.filter((story) => story.status === status).length
  }

  async deleteExpired(cutoff: Date, limit: number): Promise<number> {
    this.calls.push('deleteExpired')
    this.deleteExpiredCalls.push({ cutoff, limit })
    const expired = this.records
      .filter((story) => story.expiresAt.getTime() < cutoff.getTime())
      .slice(0, limit)

    for (const story of expired) {
      const index = this.records.indexOf(story)

      if (index >= 0) {
        this.records.splice(index, 1)
      }
    }

    return expired.length
  }
}

export interface DirectorCall {
  readonly premise: string
  readonly sceneCount: number
  readonly mode: StoryMode
  readonly referenceUrl: string | null
}

export class FakeStoryDirector implements StoryDirector {
  readonly calls: DirectorCall[] = []
  plan: StoryPlan
  error: Error | null

  constructor(plan: StoryPlan = DEFAULT_PLAN, error: Error | null = null) {
    this.plan = plan
    this.error = error
  }

  async createPlan(input: DirectorCall): Promise<StoryPlan> {
    this.calls.push(input)

    if (this.error) {
      throw this.error
    }

    return this.plan
  }
}

export interface SubmissionCall {
  readonly sceneId: string
  readonly storyId: string
}

export class FakeKeyframeOrchestrator implements KeyframeOrchestrator {
  readonly submits: SubmissionCall[] = []
  readonly cancels: SubmissionCall[] = []
  readonly pollResults: KeyframePollResult[] = []
  submitError: Error | null = null
  pollError: Error | null = null
  cancelError: Error | null = null
  requestCounter = 0

  async submit(scene: SceneRecord, story: StoryRecord): Promise<ProviderSubmission> {
    this.submits.push({ sceneId: scene.id, storyId: story.id })

    if (this.submitError) {
      throw this.submitError
    }

    this.requestCounter += 1

    return {
      requestId: `kf-request-${this.requestCounter}`,
      statusUrl: `https://queue.fal.run/fal-ai/flux/requests/kf-${this.requestCounter}/status`,
      responseUrl: `https://queue.fal.run/fal-ai/flux/requests/kf-${this.requestCounter}`,
      cancelUrl: `https://queue.fal.run/fal-ai/flux/requests/kf-${this.requestCounter}/cancel`,
    }
  }

  async poll(scene: SceneRecord): Promise<KeyframePollResult> {
    if (this.pollError) {
      throw this.pollError
    }

    return this.pollResults.shift() ?? { state: 'IN_QUEUE' }
  }

  async cancel(scene: SceneRecord): Promise<void> {
    this.cancels.push({ sceneId: scene.id, storyId: scene.storyId })

    if (this.cancelError) {
      throw this.cancelError
    }
  }
}

export class FakeVideoOrchestrator implements VideoOrchestrator {
  readonly submits: SubmissionCall[] = []
  readonly cancels: SubmissionCall[] = []
  readonly pollResults: VideoPollResult[] = []
  submitError: Error | null = null
  pollError: Error | null = null
  cancelError: Error | null = null
  requestCounter = 0

  async submit(
    scene: SceneRecord,
    story: StoryRecord,
  ): Promise<VideoProviderSubmission> {
    this.submits.push({ sceneId: scene.id, storyId: story.id })

    if (this.submitError) {
      throw this.submitError
    }

    this.requestCounter += 1

    return {
      requestId: `video-request-${this.requestCounter}`,
      statusUrl: `https://queue.fal.run/fal-ai/video/requests/video-${this.requestCounter}/status`,
      responseUrl: `https://queue.fal.run/fal-ai/video/requests/video-${this.requestCounter}`,
      cancelUrl: `https://queue.fal.run/fal-ai/video/requests/video-${this.requestCounter}/cancel`,
    }
  }

  async poll(scene: SceneRecord): Promise<VideoPollResult> {
    if (this.pollError) {
      throw this.pollError
    }

    return this.pollResults.shift() ?? { state: 'IN_QUEUE' }
  }

  async cancel(scene: SceneRecord): Promise<void> {
    this.cancels.push({ sceneId: scene.id, storyId: scene.storyId })

    if (this.cancelError) {
      throw this.cancelError
    }
  }
}

export interface AssemblerCall {
  readonly storyId: string
  readonly clips: readonly { readonly order: number; readonly url: string }[]
}

export class FakeStoryAssembler implements StoryAssembler {
  readonly calls: AssemblerCall[] = []
  result: {
    fileUrl: string
    expiresAt: string
    width: 720
    height: 1280
    durationSeconds: number
  } = {
    fileUrl: 'https://v3.fal.media/files/test/story-final.mp4',
    expiresAt: new Date(TEST_NOW + 86_400_000).toISOString(),
    width: 720,
    height: 1280,
    durationSeconds: 30,
  }

  error: Error | null = null

  async assemble(input: AssemblerCall) {
    this.calls.push(input)

    if (this.error) {
      throw this.error
    }

    return this.result
  }
}

export function createTestClock(initial: number = TEST_NOW) {
  let current = initial

  return {
    now: (): number => current,
    advance(ms: number): void {
      current += ms
    },
    set(value: number): void {
      current = value
    },
  }
}

export type StoryFixture = {
  readonly status: StoryStatus
  readonly errorCode?: StoryErrorCode | null
}

export function storyErrorCodeOf(body: unknown): string | undefined {
  return (body as { error?: { code?: string } } | null)?.error?.code
}

export function asPreset(value: string): StoryPreset {
  return value === 'quality' ? 'quality' : 'fast'
}

export function asSceneCount(value: number): StorySceneCount {
  return value === 4 || value === 6 ? value : 5
}

export function makeSceneDto(
  overrides: Partial<import('~/models/story').StoryScene> & { readonly order: number },
): import('~/models/story').StoryScene {
  return {
    id: overrides.id ?? `scene-dto-${overrides.order}`,
    order: overrides.order,
    visualPrompt:
      overrides.visualPrompt
      ?? 'Un prompt visual de prueba con longitud suficiente.',
    narration: overrides.narration ?? 'Una narración breve de prueba.',
    status: overrides.status ?? 'KEYFRAME_READY',
    keyframeUrl:
      overrides.keyframeUrl === undefined
        ? 'https://v3.fal.media/files/test/keyframe.jpeg'
        : overrides.keyframeUrl,
    keyframeAttempts: overrides.keyframeAttempts ?? 1,
    videoUrl: overrides.videoUrl ?? null,
    videoAttempts: overrides.videoAttempts ?? 0,
    error: overrides.error ?? null,
  }
}

export function makeStoryDto(
  overrides: Partial<import('~/models/story').Story> = {},
): import('~/models/story').Story {
  const sceneCount = overrides.sceneCount ?? 5
  const preset = overrides.preset ?? 'fast'
  const scenes = overrides.scenes ?? Array.from({ length: sceneCount }, (_value, index) =>
    makeSceneDto({ order: index + 1 }),
  )

  return {
    id: overrides.id ?? STORY_ID,
    status: overrides.status ?? 'WAITING_APPROVAL',
    premise: overrides.premise ?? 'Una premisa de prueba con longitud suficiente.',
    title: overrides.title ?? 'El azúcar lo sabe',
    logline: overrides.logline ?? 'Una repostera descubre lo que anticipan sus postres.',
    referenceUrl: overrides.referenceUrl ?? null,
    referenceExpiresAt: overrides.referenceExpiresAt ?? null,
    preset,
    mode: overrides.mode ?? 'faithful',
    modelId: overrides.modelId
      ?? (preset === 'quality' ? 'kling-2.5-turbo-pro' : 'minimax-hailuo-02'),
    sceneCount,
    durationSeconds: 6,
    totalDurationSeconds: sceneCount * 6,
    aspectRatio: '9:16',
    plan: overrides.plan ?? null,
    scenes,
    finalVideoUrl: overrides.finalVideoUrl ?? null,
    finalVideoExpiresAt: overrides.finalVideoExpiresAt ?? null,
    approvedAt: overrides.approvedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? TEST_NOW_ISO,
    updatedAt: overrides.updatedAt ?? TEST_NOW_ISO,
    expiresAt: overrides.expiresAt ?? '2026-10-22T18:00:00.000Z',
    version: overrides.version ?? 1,
    error: overrides.error ?? null,
    qc: overrides.qc ?? null,
    pollAfterMs: overrides.pollAfterMs ?? 2_500,
  }
}
