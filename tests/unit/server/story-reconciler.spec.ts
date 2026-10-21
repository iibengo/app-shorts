// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import { StoryError } from '../../../server/story/errors'
import { createStoryCostGuard } from '../../../server/story/cost'
import {
  DEFAULT_STORY_RECONCILER_CONFIG,
  StoryReconciler,
} from '../../../server/story/reconciler'
import type { StoryReconcilerConfig } from '../../../server/story/reconciler'
import type { StoryAssembler, StoryAssemblyResult } from '../../../server/story/assembly-service'
import type { StoryRecord } from '../../../server/story/repository'
import type { StoryQCService } from '../../../server/story/qc-service'
import type { StoryQCResult } from '../../../server/story/qc-types'
import {
  FakeKeyframeOrchestrator,
  FakeStoryAssembler,
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  TEST_NOW,
  createTestClock,
  makeSceneRecord,
  makeScenes,
  makeStoryRecord,
} from '../../helpers/story'
import { makeStoryRuntime } from '../../helpers/story-runtime'

interface SetupOptions {
  readonly seed?: readonly StoryRecord[]
  readonly repository?: FakeStoryRepository
  readonly config?: Partial<StoryReconcilerConfig>
  readonly cost?: Parameters<typeof createStoryCostGuard>[0]
  readonly keyframes?: FakeKeyframeOrchestrator
  readonly videos?: FakeVideoOrchestrator
  readonly assembler?: StoryAssembler
  readonly qcService?: StoryQCService
}

function setup(options: SetupOptions = {}) {
  const repository = options.repository ?? new FakeStoryRepository(options.seed ?? [])
  const keyframes = options.keyframes ?? new FakeKeyframeOrchestrator()
  const videos = options.videos ?? new FakeVideoOrchestrator()
  const assembler = options.assembler ?? new FakeStoryAssembler()
  const costGuard = createStoryCostGuard(options.cost)
  const clock = createTestClock(TEST_NOW)
  const events: { event: string; storyId?: string; errorCode?: string }[] = []
  const reconciler = new StoryReconciler({
    repository,
    keyframes,
    videos,
    assembler,
    qcService: options.qcService ?? null,
    costGuard,
    config: { ...DEFAULT_STORY_RECONCILER_CONFIG, ...options.config },
    owner: 'test-owner',
    now: clock.now,
    onEvent: (event) => events.push(event),
  })

  return { repository, keyframes, videos, assembler, costGuard, clock, events, reconciler }
}

function keyframeStory(
  sceneCount: number,
  sceneOverrides: Parameters<typeof makeScenes>[1],
  overrides: Partial<StoryRecord> = {},
): StoryRecord {
  return makeStoryRecord({
    status: 'GENERATING_KEYFRAMES',
    sceneCount,
    scenes: makeScenes(sceneCount, sceneOverrides),
    ...overrides,
  })
}

function videoStory(
  sceneCount: number,
  sceneOverrides: Parameters<typeof makeScenes>[1],
  overrides: Partial<StoryRecord> = {},
): StoryRecord {
  return makeStoryRecord({
    status: 'GENERATING_VIDEOS',
    sceneCount,
    scenes: makeScenes(sceneCount, sceneOverrides),
    ...overrides,
  })
}

function videosReadyWithoutQc(id = 'story-videos-ready'): StoryRecord {
  return makeStoryRecord({
    id,
    status: 'VIDEOS_READY',
    sceneCount: 5,
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    }),
  })
}

function qcResult(status: 'PASSED' | 'FAILED' | 'UNAVAILABLE'): StoryQCResult {
  const story = videosReadyWithoutQc()

  return {
    qc: {
      status,
      errorCode: status === 'UNAVAILABLE' ? 'qc-not-configured' : null,
      evaluator: status === 'UNAVAILABLE' ? 'none' : 'vision',
      checkedAt: new Date(TEST_NOW).toISOString(),
      confidence: status === 'PASSED' ? 0.9 : 0.5,
      scenes: story.scenes.map((scene) => ({
        sceneId: scene.id,
        order: scene.order,
        framesUrl: 'https://v3.fal.media/files/test/story-qc.jpg',
        technical: 'pass',
        observed: null,
        confidence: null,
        issues: [],
      })),
      issues: [],
      override: null,
    },
    technicalFailures: [],
  }
}

function fakeQcService(result: StoryQCResult | (() => StoryQCResult)) {
  const calls: { readonly storyId: string }[] = []

  const qcService: StoryQCService = {
    async run(input) {
      calls.push({ storyId: input.story.id })

      return typeof result === 'function' ? result() : result
    },
  }

  return { qcService, calls }
}

function videosReadyStory(id = 'story-videos-ready'): StoryRecord {
  return makeStoryRecord({
    id,
    status: 'VIDEOS_READY',
    sceneCount: 5,
    qc: qcResult('PASSED').qc,
    scenes: makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    }),
  })
}

class DeferredAssembler implements StoryAssembler {
  readonly calls: { readonly storyId: string; readonly clips: readonly { order: number; url: string }[] }[] = []
  private readonly resolvers: ((result: StoryAssemblyResult) => void)[] = []

  async assemble(input: {
    readonly storyId: string
    readonly clips: readonly { readonly order: number; readonly url: string }[]
  }): Promise<StoryAssemblyResult> {
    this.calls.push(input)

    return new Promise<StoryAssemblyResult>((resolve) => {
      this.resolvers.push(resolve)
    })
  }

  resolveAll(result: StoryAssemblyResult): void {
    for (const resolve of this.resolvers.splice(0)) {
      resolve(result)
    }
  }
}

describe('StoryReconciler claims and leases', () => {
  it('claims a story, processes it and releases the lease', async () => {
    const story = keyframeStory(1, { status: 'KEYFRAME_READY', keyframeAttempts: 1 })
    const { reconciler, repository, events } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(events.some((event) => event.event === 'story.reconciler.claim')).toBe(true)
    expect(events.some((event) => event.event === 'story.reconciler.release')).toBe(false)
    expect(repository.find(story.id)?.leaseOwner).toBeNull()
    expect(repository.find(story.id)?.leaseUntil).toBeNull()
    expect(repository.find(story.id)?.status).toBe('WAITING_APPROVAL')
  })

  it('does not process a story with an active lease', async () => {
    const story = keyframeStory(1, { status: 'PENDING' }, {
      leaseOwner: 'another-owner',
      leaseUntil: new Date(TEST_NOW + 30_000),
    })
    const { reconciler, keyframes, events } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(events.some((event) => event.event === 'story.reconciler.claim')).toBe(false)
    expect(story.leaseOwner).toBe('another-owner')
  })

  it('claims a story whose lease has expired', async () => {
    const story = keyframeStory(1, { status: 'KEYFRAME_READY', keyframeAttempts: 1 }, {
      leaseOwner: 'crashed-owner',
      leaseUntil: new Date(TEST_NOW - 1),
    })
    const { reconciler, repository } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(repository.find(story.id)?.leaseOwner).toBeNull()
    expect(repository.find(story.id)?.status).toBe('WAITING_APPROVAL')
  })

  it('does not process when the atomic claim loses the race', async () => {
    const story = keyframeStory(1, { status: 'PENDING' })
    const { reconciler, repository, keyframes, events } = setup({ seed: [story] })
    vi.spyOn(repository, 'claim').mockResolvedValueOnce(false)

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(events.some((event) => event.event === 'story.reconciler.claim')).toBe(false)
  })

  it('releases the lease even when processing fails', async () => {
    const story = keyframeStory(1, { status: 'KEYFRAME_READY', keyframeAttempts: 1 })
    const { reconciler, repository, events } = setup({ seed: [story] })
    vi.spyOn(repository, 'findById').mockRejectedValueOnce(new Error('boom'))

    await reconciler.runOnce()

    expect(events.some((event) => event.event === 'story.reconciler.error')).toBe(true)
    expect(repository.find(story.id)?.leaseOwner).toBeNull()
  })

  it('uses the long assembly lease for the VIDEOS_READY fast-path with PASSED QC', async () => {
    const story = videosReadyStory()
    const { reconciler, repository } = setup({ seed: [story] })
    const original = repository.claim.bind(repository)
    const claim = vi.spyOn(repository, 'claim').mockImplementation(async (...args) => original(...args))

    await reconciler.runOnce()

    const [id, owner, leaseUntil] = claim.mock.calls[0]!

    expect(id).toBe(story.id)
    expect(owner).toBe('test-owner')
    expect(leaseUntil.getTime()).toBe(TEST_NOW + DEFAULT_STORY_RECONCILER_CONFIG.assemblyLeaseMs)
  })

  it('uses the QC lease for VIDEOS_READY stories that still need QC', async () => {
    const story = videosReadyWithoutQc()
    const { reconciler, repository } = setup({ seed: [story] })
    const original = repository.claim.bind(repository)
    const claim = vi.spyOn(repository, 'claim').mockImplementation(async (...args) => original(...args))

    await reconciler.runOnce()

    const [id, _owner, leaseUntil] = claim.mock.calls[0]!

    expect(id).toBe(story.id)
    expect(leaseUntil.getTime()).toBe(TEST_NOW + DEFAULT_STORY_RECONCILER_CONFIG.qcLeaseMs)
  })

  /**
   * R4 regression: the QC -> ASSEMBLING transition renews the lease to
   * `now + assemblyLeaseMs` inside `applyQcResult`, so another instance cannot
   * claim the story while the first FFmpeg assembly is still running.
   */
  it('never lets a second instance re-claim the story while the first assembly runs (R4)', async () => {
    const story = videosReadyWithoutQc('story-r4')
    const repository = new FakeStoryRepository([story])
    const clock = createTestClock(TEST_NOW)
    const base = qcResult('PASSED')
    const passed: StoryQCResult = {
      ...base,
      qc: {
        ...base.qc,
        scenes: story.scenes.map((scene) => ({
          sceneId: scene.id,
          order: scene.order,
          framesUrl: 'https://v3.fal.media/files/test/story-qc.jpg',
          technical: 'pass' as const,
          observed: null,
          confidence: null,
          issues: [],
        })),
      },
    }
    const qcService: StoryQCService = {
      async run() {
        // QC consumes almost its whole timeout before passing.
        clock.advance(DEFAULT_STORY_RECONCILER_CONFIG.qcTimeoutMs)

        return passed
      },
    }
    const config = { ...DEFAULT_STORY_RECONCILER_CONFIG }
    const keyframes = new FakeKeyframeOrchestrator()
    const videos = new FakeVideoOrchestrator()
    const costGuard = createStoryCostGuard()
    let second: StoryReconciler | null = null
    let assemblies = 0
    const assembler: StoryAssembler = {
      async assemble() {
        assemblies += 1

        if (assemblies === 1) {
          clock.advance(
            DEFAULT_STORY_RECONCILER_CONFIG.qcLeaseMs
            - DEFAULT_STORY_RECONCILER_CONFIG.qcTimeoutMs
            + 5_000,
          )

          await second!.runOnce()
        }

        return {
          fileUrl: 'https://v3.fal.media/files/test/story-final.mp4',
          expiresAt: new Date(clock.now() + 86_400_000).toISOString(),
          width: 720 as const,
          height: 1280 as const,
          durationSeconds: 30,
        }
      },
    }
    const build = (owner: string) => new StoryReconciler({
      repository,
      keyframes,
      videos,
      assembler,
      qcService,
      costGuard,
      config,
      owner,
      now: clock.now,
    })
    const first = build('owner-a')

    second = build('owner-b')

    await first.runOnce()

    expect(assemblies).toBe(1)
  })

  it('cleans up expired stories at most once every ten minutes', async () => {
    const expired = makeStoryRecord({
      id: 'story-expired',
      expiresAt: new Date(TEST_NOW - 7_200_000),
    })
    const { reconciler, repository, clock, events } = setup({ seed: [expired] })

    await reconciler.runOnce()
    expect(repository.deleteExpiredCalls).toHaveLength(1)
    expect(repository.find('story-expired')).toBeUndefined()
    expect(events.some((event) => event.event === 'story.cleanup')).toBe(true)

    await reconciler.runOnce()
    expect(repository.deleteExpiredCalls).toHaveLength(1)

    clock.advance(600_000)
    await reconciler.runOnce()
    expect(repository.deleteExpiredCalls).toHaveLength(2)
  })
})

describe('StoryReconciler keyframes', () => {
  it('submits at most three keyframes per tick and persists the request ids', async () => {
    const story = keyframeStory(6, { status: 'PENDING' })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(3)

    const updated = repository.find(story.id)!

    expect(updated.scenes.slice(0, 3).map((scene) => scene.status)).toEqual([
      'KEYFRAME_QUEUED',
      'KEYFRAME_QUEUED',
      'KEYFRAME_QUEUED',
    ])
    expect(updated.scenes.slice(0, 3).every((scene) => scene.keyframeRequestId !== null)).toBe(true)
    expect(updated.scenes.slice(0, 3).every((scene) => scene.keyframeAttempts === 1)).toBe(true)
    expect(updated.scenes.slice(3).map((scene) => scene.status)).toEqual([
      'PENDING',
      'PENDING',
      'PENDING',
    ])
  })

  it('moves the story to WAITING_APPROVAL when all keyframes are ready', async () => {
    const story = keyframeStory(5, { status: 'KEYFRAME_READY', keyframeAttempts: 1 })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'WAITING_APPROVAL',
      approvedAt: null,
    })
  })

  it('marks a queued scene as running when the provider is in progress', async () => {
    const story = keyframeStory(1, {
      status: 'KEYFRAME_QUEUED',
      keyframeAttempts: 1,
      keyframeRequestId: 'kf-1',
      keyframeStatusUrl: 'https://queue.fal.run/status',
      keyframeResponseUrl: 'https://queue.fal.run/result',
    })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })
    keyframes.pollResults.push({ state: 'IN_PROGRESS' })

    await reconciler.runOnce()

    expect(repository.find(story.id)?.scenes[0]?.status).toBe('KEYFRAME_RUNNING')
    expect(repository.find(story.id)?.status).toBe('GENERATING_KEYFRAMES')
  })

  it('returns a running scene to queued when the provider reports IN_QUEUE', async () => {
    const story = keyframeStory(1, {
      status: 'KEYFRAME_RUNNING',
      keyframeAttempts: 1,
      keyframeRequestId: 'kf-1',
      keyframeStatusUrl: 'https://queue.fal.run/status',
      keyframeResponseUrl: 'https://queue.fal.run/result',
    })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })
    keyframes.pollResults.push({ state: 'IN_QUEUE' })

    await reconciler.runOnce()

    expect(repository.find(story.id)?.scenes[0]?.status).toBe('KEYFRAME_QUEUED')
  })

  it('persists a completed keyframe and finalizes the story', async () => {
    const story = makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      sceneCount: 2,
      scenes: [
        makeSceneRecord({
          id: 'scene-ready',
          order: 1,
          status: 'KEYFRAME_READY',
          keyframeAttempts: 1,
          keyframeUrl: 'https://v3.fal.media/files/test/one.jpeg',
        }),
        makeSceneRecord({
          id: 'scene-polling',
          order: 2,
          status: 'KEYFRAME_RUNNING',
          keyframeAttempts: 1,
          keyframeRequestId: 'kf-2',
          keyframeStatusUrl: 'https://queue.fal.run/status',
          keyframeResponseUrl: 'https://queue.fal.run/result',
        }),
      ],
      plan: null,
    })
    const { reconciler, repository, keyframes, events } = setup({ seed: [story] })
    keyframes.pollResults.push({
      state: 'COMPLETED',
      keyframeUrl: 'https://v3.fal.media/files/test/two.jpeg',
    })

    await reconciler.runOnce()

    const updated = repository.find(story.id)!

    expect(updated.scenes[1]).toMatchObject({
      status: 'KEYFRAME_READY',
      keyframeUrl: 'https://v3.fal.media/files/test/two.jpeg',
      keyframeError: null,
    })
    expect(updated.status).toBe('WAITING_APPROVAL')
    expect(events.some((event) => event.event === 'story.keyframe.succeeded')).toBe(true)
  })

  it('fails the scene and the story when polling fails without active scenes', async () => {
    const story = makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      sceneCount: 2,
      scenes: [
        makeSceneRecord({ id: 'scene-ready', order: 1, status: 'KEYFRAME_READY', keyframeAttempts: 1 }),
        makeSceneRecord({
          id: 'scene-polling',
          order: 2,
          status: 'KEYFRAME_QUEUED',
          keyframeAttempts: 1,
          keyframeRequestId: 'kf-2',
          keyframeStatusUrl: 'https://queue.fal.run/status',
          keyframeResponseUrl: 'https://queue.fal.run/result',
        }),
      ],
      plan: null,
    })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })
    keyframes.pollError = new StoryError('provider-timeout')

    await reconciler.runOnce()

    const updated = repository.find(story.id)!

    expect(updated.scenes[1]).toMatchObject({
      status: 'KEYFRAME_FAILED',
      keyframeError: 'provider-timeout',
    })
    expect(updated).toMatchObject({
      status: 'FAILED',
      errorCode: 'keyframe-failed',
    })
  })

  it('fails a scene whose submit fails and marks the story failed', async () => {
    const story = keyframeStory(1, { status: 'PENDING' })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })
    keyframes.submitError = new StoryError('provider-busy')

    await reconciler.runOnce()

    const updated = repository.find(story.id)!

    expect(updated.scenes[0]).toMatchObject({
      status: 'KEYFRAME_FAILED',
      keyframeError: 'provider-busy',
      keyframeAttempts: 1,
    })
    expect(updated).toMatchObject({ status: 'FAILED', errorCode: 'keyframe-failed' })
  })

  it('never submits more than two keyframe attempts per scene', async () => {
    const story = keyframeStory(1, {
      status: 'PENDING',
      keyframeAttempts: 2,
      keyframeError: 'provider-error',
    })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(repository.find(story.id)?.scenes[0]?.keyframeAttempts).toBe(2)
  })

  it('fails with reference-expired before calling the provider', async () => {
    const story = makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
      referenceExpiresAt: new Date(TEST_NOW - 1),
      scenes: makeScenes(2, { status: 'PENDING' }),
    })
    const { reconciler, repository, keyframes } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'reference-expired',
    })
  })

  it('fails the scene and story when the keyframe budget is exhausted', async () => {
    const story = keyframeStory(1, { status: 'PENDING' })
    const { reconciler, repository, keyframes } = setup({
      seed: [story],
      cost: { maxStoryCostUsd: 0.01 },
    })

    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(0)
    expect(repository.find(story.id)?.scenes[0]).toMatchObject({
      status: 'KEYFRAME_FAILED',
      keyframeError: 'story-budget-exhausted',
    })
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'story-budget-exhausted',
    })
  })
})

describe('StoryReconciler videos', () => {
  it('submits at most two videos per tick and persists their request ids', async () => {
    const story = videoStory(4, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    const { reconciler, repository, videos } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(videos.submits).toHaveLength(2)

    const updated = repository.find(story.id)!

    expect(updated.scenes.map((scene) => scene.status)).toEqual([
      'VIDEO_QUEUED',
      'VIDEO_QUEUED',
      'KEYFRAME_READY',
      'KEYFRAME_READY',
    ])
    expect(updated.scenes[0]?.videoAttempts).toBe(1)
    expect(updated.scenes[0]?.videoRequestId).toBe('video-request-1')
    expect(updated.status).toBe('GENERATING_VIDEOS')
  })

  it('moves to VIDEOS_READY when every video is ready', async () => {
    const story = videoStory(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    })
    const { reconciler, repository } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(repository.find(story.id)?.status).toBe('VIDEOS_READY')
  })

  it('marks a queued video as running when the provider is in progress', async () => {
    const story = videoStory(1, {
      status: 'VIDEO_QUEUED',
      keyframeAttempts: 1,
      videoAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      videoRequestId: 'video-1',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
    })
    const { reconciler, repository, videos } = setup({ seed: [story] })
    videos.pollResults.push({ state: 'IN_PROGRESS' })

    await reconciler.runOnce()

    expect(repository.find(story.id)?.scenes[0]?.status).toBe('VIDEO_RUNNING')
  })

  it('persists a completed video and finalizes the story', async () => {
    const story = videoStory(1, {
      status: 'VIDEO_RUNNING',
      keyframeAttempts: 1,
      videoAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
      videoRequestId: 'video-1',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
    })
    const { reconciler, repository, videos, events } = setup({ seed: [story] })
    videos.pollResults.push({
      state: 'COMPLETED',
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    })

    await reconciler.runOnce()

    const updated = repository.find(story.id)!

    expect(updated.scenes[0]).toMatchObject({
      status: 'VIDEO_READY',
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      videoError: null,
    })
    expect(updated.status).toBe('VIDEOS_READY')
    expect(events.some((event) => event.event === 'story.video.succeeded')).toBe(true)
  })

  it('fails the video and the story when no active scenes remain', async () => {
    const story = videoStory(2, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    })
    const scenes = story.scenes.slice()
    scenes[1] = {
      ...scenes[1]!,
      status: 'VIDEO_QUEUED',
      videoRequestId: 'video-1',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
    }
    const withFailure = { ...story, scenes }
    const { reconciler, repository, videos } = setup({ seed: [withFailure] })
    videos.pollError = new StoryError('provider-error')

    await reconciler.runOnce()

    expect(repository.find(story.id)?.scenes[1]).toMatchObject({
      status: 'VIDEO_FAILED',
      videoError: 'provider-error',
    })
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'video-failed',
    })
  })

  it('fails a scene whose video submit fails', async () => {
    const story = videoStory(1, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    const { reconciler, repository, videos } = setup({ seed: [story] })
    videos.submitError = new StoryError('provider-error')

    await reconciler.runOnce()

    expect(repository.find(story.id)?.scenes[0]).toMatchObject({
      status: 'VIDEO_FAILED',
      videoError: 'provider-error',
      videoAttempts: 1,
    })
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'video-failed',
    })
  })

  it('never submits more than two video attempts per scene', async () => {
    const story = videoStory(1, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      videoAttempts: 2,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    const { reconciler, videos } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(videos.submits).toHaveLength(0)
  })

  it('fails the scene and story when the video budget is exhausted', async () => {
    const story = videoStory(1, {
      status: 'KEYFRAME_READY',
      keyframeAttempts: 1,
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
    })
    const { reconciler, repository, videos } = setup({
      seed: [story],
      cost: { maxStoryCostUsd: 0.01 },
    })

    await reconciler.runOnce()

    expect(videos.submits).toHaveLength(0)
    expect(repository.find(story.id)?.scenes[0]).toMatchObject({
      status: 'VIDEO_FAILED',
      videoError: 'story-budget-exhausted',
    })
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'story-budget-exhausted',
    })
  })
})

describe('StoryReconciler QC phase', () => {
  it('recovers a WAITING_QC scene without resubmitting already-ready videos', async () => {
    const base = makeStoryRecord({
      id: 'story-recovered',
      status: 'WAITING_QC',
      sceneCount: 5,
      approvedAt: new Date(TEST_NOW),
      qc: qcResult('FAILED').qc,
      scenes: makeScenes(5, {
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
        keyframeUrl: 'https://v3.fal.media/files/test/keyframe.jpeg',
        videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      }),
    })
    const repository = new FakeStoryRepository([base])
    const runtime = makeStoryRuntime({ repository })
    const target = base.scenes[2]!

    await runtime.service!.recoverScene(base.id, SESSION_ID, target.id)
    expect(repository.find(base.id)).toMatchObject({
      status: 'GENERATING_KEYFRAMES',
      qc: null,
    })

    const { reconciler, keyframes, videos } = setup({ repository })
    await reconciler.runOnce()

    expect(keyframes.submits).toHaveLength(1)

    keyframes.pollResults.push({
      state: 'COMPLETED',
      keyframeUrl: 'https://v3.fal.media/files/test/recovered.jpeg',
    })
    await reconciler.runOnce()

    expect(repository.find(base.id)?.status).toBe('GENERATING_VIDEOS')

    await reconciler.runOnce()

    expect(videos.submits).toHaveLength(1)
    expect(videos.submits[0]?.sceneId).toBe(target.id)

    videos.pollResults.push({
      state: 'COMPLETED',
      videoUrl: 'https://v3.fal.media/files/test/recovered.mp4',
    })
    await reconciler.runOnce()

    const updated = repository.find(base.id)!

    expect(updated.status).toBe('VIDEOS_READY')
    expect(updated.qc).toBeNull()
    expect(updated.scenes[2]).toMatchObject({
      status: 'VIDEO_READY',
      videoAttempts: 2,
    })
    expect(updated.scenes.filter((_scene, index) => index !== 2)
      .every((scene) => scene.videoAttempts === 1)).toBe(true)
  })

  it('enters QC for VIDEOS_READY without a PASS and never assembles', async () => {
    const story = videosReadyWithoutQc()
    const { qcService, calls } = fakeQcService(qcResult('FAILED'))
    const { reconciler, repository, assembler } = setup({
      seed: [story],
      qcService,
    })

    await reconciler.runOnce()

    expect(calls).toHaveLength(1)
    expect((assembler as FakeStoryAssembler).calls).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'WAITING_QC',
      errorCode: null,
    })
    expect(repository.find(story.id)?.qc?.status).toBe('FAILED')
  })

  it('assembles in the same tick when QC passes', async () => {
    const story = videosReadyWithoutQc()
    const { qcService, calls } = fakeQcService(qcResult('PASSED'))
    const { reconciler, repository, assembler } = setup({
      seed: [story],
      qcService,
    })

    await reconciler.runOnce()

    expect(calls).toHaveLength(1)
    expect((assembler as FakeStoryAssembler).calls).toHaveLength(1)
    expect(repository.find(story.id)).toMatchObject({
      status: 'READY',
      errorCode: null,
    })
  })

  it('skips the QC when a PASSED report is already persisted', async () => {
    const story = videosReadyStory()
    const { qcService, calls } = fakeQcService(qcResult('FAILED'))
    const { reconciler, assembler } = setup({ seed: [story], qcService })

    await reconciler.runOnce()

    expect(calls).toHaveLength(0)
    expect((assembler as FakeStoryAssembler).calls).toHaveLength(1)
  })

  it('persists the technical failure and qcJson in one repository transition', async () => {
    const story = videosReadyWithoutQc()
    const result = qcResult('FAILED')
    const broken = { ...result, technicalFailures: [{ sceneId: story.scenes[1]!.id, order: 2 }] }
    const { qcService } = fakeQcService(broken)
    const { reconciler, repository } = setup({ seed: [story], qcService })
    const apply = vi.spyOn(repository, 'applyQcResult')

    await reconciler.runOnce()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      storyId: story.id,
      storyGuard: { statuses: ['QC'], version: expect.any(Number) },
      storyPatch: expect.objectContaining({
        status: 'WAITING_QC',
        qc: expect.objectContaining({ status: 'FAILED' }),
      }),
      scenes: [{
        sceneId: story.scenes[1]!.id,
        guard: { statuses: ['VIDEO_READY'] },
        patch: {
          status: 'VIDEO_FAILED',
          videoError: 'provider-invalid-output',
        },
      }],
    }))
    expect(repository.calls.filter((call) => call === 'updateScene')).toHaveLength(0)
  })

  it('fails the story when the QC persistence transition conflicts', async () => {
    const story = videosReadyWithoutQc()
    const { qcService } = fakeQcService(qcResult('FAILED'))
    const { reconciler, repository } = setup({ seed: [story], qcService })
    vi.spyOn(repository, 'applyQcResult').mockResolvedValueOnce(false)

    await reconciler.runOnce()

    expect(repository.find(story.id)?.status).toBe('QC')
  })

  it('degrades a technically broken scene and leaves the story in WAITING_QC', async () => {
    const story = videosReadyWithoutQc()
    const result = qcResult('FAILED')
    const broken = { ...result, technicalFailures: [{ sceneId: story.scenes[1]!.id, order: 2 }] }
    const { qcService } = fakeQcService(broken)
    const { reconciler, repository, assembler } = setup({ seed: [story], qcService })

    await reconciler.runOnce()

    expect((assembler as FakeStoryAssembler).calls).toHaveLength(0)
    expect(repository.find(story.id)?.scenes[1]).toMatchObject({
      status: 'VIDEO_FAILED',
      videoError: 'provider-invalid-output',
    })
    expect(repository.find(story.id)).toMatchObject({
      status: 'WAITING_QC',
      errorCode: null,
    })
  })

  it('fails the story when the QC infrastructure is missing', async () => {
    const story = videosReadyWithoutQc()
    const { reconciler, repository } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'ffmpeg-not-configured',
    })
  })
})

describe('StoryReconciler assembly', () => {
  it('assembles ordered clips and marks the story ready', async () => {
    const story = videosReadyStory()
    const { reconciler, repository, assembler, events } = setup({ seed: [story] })

    await reconciler.runOnce()

    const call = (assembler as FakeStoryAssembler).calls[0]!
    expect(call.storyId).toBe(story.id)
    expect(call.clips.map((clip) => clip.order)).toEqual([1, 2, 3, 4, 5])
    expect(call.clips.every((clip) => clip.url === 'https://v3.fal.media/files/test/clip.mp4'))
      .toBe(true)

    const updated = repository.find(story.id)!

    expect(updated).toMatchObject({
      status: 'READY',
      finalVideoUrl: 'https://v3.fal.media/files/test/story-final.mp4',
      errorCode: null,
      errorMessage: null,
    })
    expect(updated.finalVideoExpiresAt?.toISOString()).toBe(
      new Date(TEST_NOW + 86_400_000).toISOString(),
    )
    expect(updated.completedAt).not.toBeNull()
    expect(events.some((event) => event.event === 'story.assembly.start')).toBe(true)
    expect(events.some((event) => event.event === 'story.assembly.ok')).toBe(true)
  })

  it.each([
    [new StoryError('assembly-timeout'), 'assembly-timeout'],
    [new StoryError('ffmpeg-not-configured'), 'ffmpeg-not-configured'],
    [new Error('disk full'), 'assembly-failed'],
  ])('maps an assembly failure to %s', async (error, code) => {
    const story = videosReadyStory()
    const assembler = new FakeStoryAssembler()
    assembler.error = error
    const { reconciler, repository } = setup({ seed: [story], assembler })

    await reconciler.runOnce()

    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: code,
    })
  })

  it('rejects an uploaded URL outside the Fal CDN allowlist', async () => {
    const story = videosReadyStory()
    const assembler = new FakeStoryAssembler()
    assembler.result = {
      ...assembler.result,
      fileUrl: 'https://evil.example/final.mp4',
    }
    const { reconciler, repository } = setup({ seed: [story], assembler })

    await reconciler.runOnce()

    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'assembly-failed',
    })
  })

  it('fails a VIDEOS_READY story that no longer has every clip ready', async () => {
    const base = videosReadyStory()
    const scenes = base.scenes.slice()
    scenes[2] = { ...scenes[2]!, status: 'VIDEO_FAILED' }
    const story = { ...base, scenes }
    const { reconciler, repository, assembler } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect((assembler as FakeStoryAssembler).calls).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'assembly-failed',
    })
  })

  it('retries the assembly of a crashed ASSEMBLING story with a new directory', async () => {
    const story = { ...videosReadyStory(), status: 'ASSEMBLING' as StoryStatus }
    const { reconciler, repository, assembler } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect((assembler as FakeStoryAssembler).calls).toHaveLength(1)
    expect(repository.find(story.id)?.status).toBe('READY')
  })

  it('marks READY an ASSEMBLING story that already has a final video', async () => {
    const story = {
      ...videosReadyStory(),
      status: 'ASSEMBLING' as StoryStatus,
      finalVideoUrl: 'https://v3.fal.media/files/test/already.mp4',
    }
    const { reconciler, repository, assembler } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect((assembler as FakeStoryAssembler).calls).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'READY',
      finalVideoUrl: 'https://v3.fal.media/files/test/already.mp4',
    })
  })

  it('fails an ASSEMBLING story that no longer has every clip ready', async () => {
    const base = videosReadyStory()
    const scenes = base.scenes.slice()
    scenes[2] = { ...scenes[2]!, status: 'VIDEO_FAILED' }
    const story = { ...base, status: 'ASSEMBLING' as StoryStatus, scenes }
    const { reconciler, repository, assembler } = setup({ seed: [story] })

    await reconciler.runOnce()

    expect((assembler as FakeStoryAssembler).calls).toHaveLength(0)
    expect(repository.find(story.id)).toMatchObject({
      status: 'FAILED',
      errorCode: 'assembly-failed',
    })
  })

  it('assembles one story at a time per instance', async () => {
    const first = videosReadyStory('story-a')
    const second = videosReadyStory('story-b')
    const assembler = new DeferredAssembler()
    const { reconciler, repository } = setup({
      seed: [first, second],
      assembler,
      config: { claimLimit: 1 },
    })

    const firstRun = reconciler.runOnce()
    await vi.waitFor(() => {
      if (assembler.calls.length !== 1) throw new Error('assembly not started')
    })

    const secondRun = reconciler.runOnce()
    await secondRun

    expect(assembler.calls).toHaveLength(1)
    expect(repository.find(second.id)?.status).toBe('VIDEOS_READY')

    assembler.resolveAll({
      fileUrl: 'https://v3.fal.media/files/test/story-final.mp4',
      expiresAt: new Date(TEST_NOW + 86_400_000).toISOString(),
      width: 720,
      height: 1280,
      durationSeconds: 30,
    })
    await firstRun

    expect(repository.find(first.id)?.status).toBe('READY')

    const thirdRun = reconciler.runOnce()
    await vi.waitFor(() => {
      if (assembler.calls.length !== 2) throw new Error('second assembly not started')
    })
    expect(assembler.calls).toHaveLength(2)

    assembler.resolveAll({
      fileUrl: 'https://v3.fal.media/files/test/story-final-2.mp4',
      expiresAt: new Date(TEST_NOW + 86_400_000).toISOString(),
      width: 720,
      height: 1280,
      durationSeconds: 30,
    })
    await thirdRun
  })
})
