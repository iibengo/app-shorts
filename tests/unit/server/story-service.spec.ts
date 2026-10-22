// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { StoryStatus } from '~/models/story'
import { StoryError } from '../../../server/story/errors'
import {
  DEFAULT_STORY_RATE_LIMIT_CONFIG,
  createStoryRateLimiter,
} from '../../../server/story/rate-limit'
import { createStoryCostGuard } from '../../../server/story/cost'
import {
  StoryServiceImpl,
  canonicalStoryBody,
  createStoryService,
  hashStoryBody,
  toStoryDto,
  toStoryJob,
} from '../../../server/story/story-service'
import type { StoryService } from '../../../server/story/story-service'
import type { StoryRecord } from '../../../server/story/repository'
import type { StoryPlan } from '~/models/story'
import { composeKeyframe, composeVideo } from '../../../server/story/story-prompt-composer'
import {
  DEFAULT_PLAN,
  FakeKeyframeOrchestrator,
  FakeStoryDirector,
  FakeStoryRepository,
  FakeVideoOrchestrator,
  SESSION_ID,
  TEST_NOW,
  createTestClock,
  makeSceneRecord,
  makeScenes,
  longGlobalPlan,
  longVideoPlan,
  makeStoryRecord,
} from '../../helpers/story'

const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'

function setup(options: SetupOptions = {}) {
  const repository = new FakeStoryRepository(options.seed ?? [])
  const director = options.director ?? new FakeStoryDirector()
  const clock = options.clock ?? createTestClock(TEST_NOW)
  const rateLimiter = createStoryRateLimiter({
    config: { ...DEFAULT_STORY_RATE_LIMIT_CONFIG, ...options.rateLimit },
    now: clock.now,
  })
  const costGuard = createStoryCostGuard(options.cost)
  const keyframes = options.keyframes ?? new FakeKeyframeOrchestrator()
  const videos = options.videos ?? new FakeVideoOrchestrator()
  const events: string[] = []
  const service = createStoryService({
    repository,
    director,
    keyframes,
    videos,
    rateLimiter,
    costGuard,
    config: { pollAfterMs: 2_500, storyTtlMs: 86_400_000 },
    now: clock.now,
    onEvent: (event) => events.push(event.event),
  })

  return { repository, director, clock, service, keyframes, videos, events, rateLimiter }
}

function request(overrides: Partial<{
  premise: string
  sceneCount: 4 | 5 | 6
  preset: 'fast' | 'quality'
  mode: 'faithful' | 'creative'
  referenceUrl: string | null
  referenceExpiresAt: string | null
}> = {}) {
  return {
    premise: overrides.premise ?? PREMISE,
    sceneCount: overrides.sceneCount ?? 5,
    preset: overrides.preset ?? 'fast',
    mode: overrides.mode ?? 'faithful',
    referenceUrl: overrides.referenceUrl ?? null,
    referenceExpiresAt: overrides.referenceExpiresAt ?? null,
  }
}

function createInput(
  options: {
    readonly sessionId?: string
    readonly idempotencyKey?: string | null
    readonly request?: ReturnType<typeof request>
  } = {},
) {
  const payload = options.request ?? request()

  return {
    sessionId: options.sessionId ?? SESSION_ID,
    request: payload,
    idempotencyKey: options.idempotencyKey ?? null,
    bodyHash: hashStoryBody(canonicalStoryBody(payload)),
  }
}

async function captureError(run: () => Promise<unknown>): Promise<StoryError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(StoryError)

    return error as StoryError
  }

  throw new Error('expected a StoryError')
}

function waitingStory(
  overrides: Partial<StoryRecord> = {},
  sceneOverrides: Parameters<typeof makeScenes>[1] = { status: 'KEYFRAME_READY', keyframeAttempts: 1 },
): StoryRecord {
  return makeStoryRecord({
    status: 'WAITING_APPROVAL',
    scenes: makeScenes(overrides.sceneCount ?? 5, sceneOverrides),
    ...overrides,
  })
}

describe('StoryService.create', () => {
  it('asks the director first and persists the plan with five pending scenes', async () => {
    const { service, repository, director, events } = setup()

    const result = await service.create(createInput())

    expect(result.replayed).toBe(false)
    expect(director.calls).toEqual([{
      premise: PREMISE,
      sceneCount: 5,
      mode: 'faithful',
      referenceUrl: null,
    }])
    expect(repository.records).toHaveLength(1)

    const story = repository.records[0]!
    expect(story).toMatchObject({
      sessionId: SESSION_ID,
      status: 'GENERATING_KEYFRAMES',
      premise: PREMISE,
      title: DEFAULT_PLAN.title,
      logline: DEFAULT_PLAN.logline,
      preset: 'fast',
      sceneCount: 5,
      durationSeconds: 6,
      aspectRatio: '9:16',
      version: 1,
      approvedAt: null,
      completedAt: null,
      leaseOwner: null,
    })
    expect(story.expiresAt.getTime()).toBe(TEST_NOW + 86_400_000)
    expect(story.scenes).toHaveLength(5)
    expect(story.scenes.map((scene) => scene.status)).toEqual(Array(5).fill('PENDING'))
    expect(story.scenes.map((scene) => scene.visualPrompt)).toEqual(
      DEFAULT_PLAN.beats.map((beat) => beat.visualPrompt),
    )
    expect(story.plan).toEqual(DEFAULT_PLAN)
    expect(events).toContain('story.create.start')
    expect(events).toContain('story.create.ok')
  })

  it('persists the reference URL and expiry', async () => {
    const { service, repository } = setup()
    const referenceUrl = 'https://v3.fal.media/files/test/reference.webp'
    const referenceExpiresAt = new Date(TEST_NOW + 3_600_000).toISOString()

    await service.create(createInput({
      request: request({ referenceUrl, referenceExpiresAt }),
    }))

    expect(repository.records[0]).toMatchObject({
      referenceUrl,
      referenceExpiresAt: new Date(referenceExpiresAt),
    })
  })

  it('does not create an orphan story when the director fails', async () => {
    const director = new FakeStoryDirector(DEFAULT_PLAN, new StoryError('director-timeout'))
    const { service, repository, events } = setup({ director })

    const error = await captureError(() => service.create(createInput()))

    expect(error.code).toBe('director-timeout')
    expect(repository.records).toHaveLength(0)
    expect(events).toContain('story.create.failed')
  })

  it('replays the same idempotency key without calling the director again', async () => {
    const { service, director } = setup()

    const first = await service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))
    const second = await service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.story.id).toBe(first.story.id)
    expect(director.calls).toHaveLength(1)
  })

  it('rejects the same key with a different body', async () => {
    const { service } = setup()

    await service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))

    const conflict = await captureError(() => service.create(
      createInput({
        idempotencyKey: 'idem-key-12345678',
        request: request({ premise: 'Otra premisa completamente distinta.' }),
      }),
    ))

    expect(conflict.code).toBe('idempotency-conflict')
    expect(conflict.status).toBe(409)
  })

  it('replays a persisted story found by session and idempotency key', async () => {
    const existing = makeStoryRecord({
      idempotencyKey: 'idem-key-12345678',
      premise: PREMISE,
    })
    const { service, director } = setup({ seed: [existing] })

    const result = await service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))

    expect(result.replayed).toBe(true)
    expect(result.story.id).toBe(existing.id)
    expect(director.calls).toHaveLength(0)
  })

  it('rejects a persisted key whose request differs', async () => {
    const existing = makeStoryRecord({
      idempotencyKey: 'idem-key-12345678',
      premise: 'Una premisa guardada completamente distinta.',
    })
    const { service } = setup({ seed: [existing] })

    const error = await captureError(() => service.create(
      createInput({ idempotencyKey: 'idem-key-12345678' }),
    ))

    expect(error.code).toBe('idempotency-conflict')
  })

  it('rejects a persisted key when only the mode differs', async () => {
    const existing = makeStoryRecord({
      idempotencyKey: 'idem-key-12345678',
      premise: PREMISE,
      mode: 'creative',
    })
    const { service } = setup({ seed: [existing] })

    const error = await captureError(() => service.create(
      createInput({ idempotencyKey: 'idem-key-12345678' }),
    ))

    expect(error.code).toBe('idempotency-conflict')
  })

  it('deduplicates identical bodies without a key for 60 seconds', async () => {
    const { service, director } = setup()

    const first = await service.create(createInput())
    const second = await service.create(createInput())

    expect(second.replayed).toBe(true)
    expect(second.story.id).toBe(first.story.id)
    expect(director.calls).toHaveLength(1)
  })

  it('rejects a second active story for the same session', async () => {
    const active = makeStoryRecord({ status: 'WAITING_APPROVAL' })
    const { service } = setup({ seed: [active] })

    const error = await captureError(() => service.create(createInput()))

    expect(error.code).toBe('story-in-progress')
  })

  it('rejects creation when the instance already has two active stories', async () => {
    const { service } = setup({
      seed: [
        makeStoryRecord({ id: 'story-a', sessionId: 'other-a', status: 'WAITING_APPROVAL' }),
        makeStoryRecord({ id: 'story-b', sessionId: 'other-b', status: 'GENERATING_VIDEOS' }),
      ],
    })

    const error = await captureError(() => service.create(createInput()))

    expect(error.code).toBe('server-busy')
    expect(error.retryAfterSeconds).toBe(30)
  })

  it('rejects a new story when the daily budget is exhausted', async () => {
    const { service, director } = setup({ rateLimit: { dailyBudgetUsd: 1 } })

    const error = await captureError(() => service.create(createInput()))

    expect(error.code).toBe('daily-budget-exhausted')
    expect(error.status).toBe(429)
    expect(director.calls).toHaveLength(0)
  })

  it('rejects a story whose projected base cost exceeds the story cap', async () => {
    const { service, director } = setup({ cost: { maxStoryCostUsd: 1 } })

    const error = await captureError(() => service.create(createInput()))

    expect(error.code).toBe('story-budget-exhausted')
    expect(director.calls).toHaveLength(0)
  })

  it('rejects a concurrent request while the same key is in flight', async () => {
    let resolvePlan!: (plan: StoryPlan) => void
    let calls = 0
    const director = {
      async createPlan() {
        calls += 1

        return new Promise<StoryPlan>((resolve) => {
          resolvePlan = resolve
        })
      },
    }
    const { service } = setup({ director: director as unknown as FakeStoryDirector })

    const first = service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))
    await vi.waitFor(() => {
      if (calls !== 1) throw new Error('director not called yet')
    })

    const conflict = await captureError(() => service.create(
      createInput({ idempotencyKey: 'idem-key-12345678' }),
    ))

    expect(conflict.code).toBe('idempotency-conflict')

    resolvePlan(DEFAULT_PLAN)
    await first
    expect(calls).toBe(1)
  })

  it('recovers from a unique constraint race using the persisted story', async () => {
    const existing = makeStoryRecord({
      status: 'READY',
      idempotencyKey: 'idem-key-12345678',
      premise: PREMISE,
    })
    const { service, repository } = setup({ seed: [existing] })
    const original = repository.findBySessionAndIdempotencyKey.bind(repository)
    let firstLookup = true

    vi.spyOn(repository, 'findBySessionAndIdempotencyKey').mockImplementation(async (...args) => {
      if (firstLookup) {
        firstLookup = false

        return null
      }

      return original(...args)
    })
    vi.spyOn(repository, 'createStory').mockRejectedValueOnce(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    )

    const result = await service.create(createInput({ idempotencyKey: 'idem-key-12345678' }))

    expect(result.replayed).toBe(true)
    expect(result.story.id).toBe(existing.id)
  })
})

describe('StoryService.get', () => {
  it('returns the owned story', async () => {
    const story = makeStoryRecord({ status: 'WAITING_APPROVAL' })
    const { service } = setup({ seed: [story] })

    await expect(service.get(story.id, SESSION_ID)).resolves.toMatchObject({
      id: story.id,
    })
  })

  it('throws story-not-found for a missing or foreign story', async () => {
    const story = makeStoryRecord()
    const { service } = setup({ seed: [story] })

    expect((await captureError(() => service.get('missing', SESSION_ID))).code)
      .toBe('story-not-found')
    expect((await captureError(() => service.get(story.id, 'other-session-abcdefghij'))).code)
      .toBe('story-not-found')
  })

  it('throws story-expired when expiresAt is in the past', async () => {
    const story = makeStoryRecord({ expiresAt: new Date(TEST_NOW - 1) })
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.get(story.id, SESSION_ID))

    expect(error.code).toBe('story-expired')
    expect(error.status).toBe(410)
  })

  it('rate limits polling and stays read-only', async () => {
    const story = makeStoryRecord({ status: 'GENERATING_VIDEOS' })
    const { service, repository } = setup({ seed: [story] })

    await service.get(story.id, SESSION_ID)
    const error = await captureError(() => service.get(story.id, SESSION_ID))

    expect(error.code).toBe('rate-limited')
    expect(repository.calls).toEqual(['findOwnedById', 'findOwnedById'])
  })
})

describe('story DTO projection', () => {
  it('projects the full public contract without internal fields', () => {
    const story = waitingStory({ version: 12, referenceUrl: 'https://v3.fal.media/files/test/ref.webp', referenceExpiresAt: new Date(TEST_NOW + 60_000) })

    const dto = toStoryDto(story, 2_500, TEST_NOW)
    const serialized = JSON.stringify(dto)

    expect(dto).toMatchObject({
      id: story.id,
      status: 'WAITING_APPROVAL',
      preset: 'fast',
      mode: 'faithful',
      modelId: 'minimax-hailuo-02',
      sceneCount: 5,
      durationSeconds: 6,
      totalDurationSeconds: 30,
      aspectRatio: '9:16',
      version: 12,
      pollAfterMs: 2_500,
      error: null,
    })
    expect(dto.scenes).toHaveLength(5)
    expect(dto.scenes[0]).toMatchObject({
      id: story.scenes[0]?.id,
      order: 1,
      keyframeAttempts: 1,
      videoAttempts: 0,
      error: null,
    })
    expect(dto.referenceUrl).toBe('https://v3.fal.media/files/test/ref.webp')
    expect(dto.referenceExpiresAt).toBe(new Date(TEST_NOW + 60_000).toISOString())
    expect(serialized).not.toContain('sessionId')
    expect(serialized).not.toContain('idempotencyKey')
    expect(serialized).not.toContain('leaseOwner')
    expect(serialized).not.toContain('leaseUntil')
    expect(serialized).not.toContain('keyframeRequestId')
    expect(serialized).not.toContain('keyframeStatusUrl')
    expect(serialized).not.toContain('videoResponseUrl')
    expect(serialized).not.toContain('requestId')
  })

  it('hides an expired reference', () => {
    const story = waitingStory({
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
      referenceExpiresAt: new Date(TEST_NOW - 1),
    })

    expect(toStoryDto(story, 2_500, TEST_NOW)).toMatchObject({
      referenceUrl: null,
      referenceExpiresAt: null,
    })
  })

  it('sorts scenes and exposes stable scene errors only on failure', () => {
    const scenes = [
      makeSceneRecord({ id: 'scene-2', order: 2, status: 'KEYFRAME_FAILED', keyframeError: 'provider-error' }),
      makeSceneRecord({ id: 'scene-1', order: 1, status: 'KEYFRAME_READY' }),
    ]
    const story = makeStoryRecord({ status: 'FAILED', errorCode: 'keyframe-failed', scenes })

    const dto = toStoryDto(story, 2_500, TEST_NOW)

    expect(dto.scenes.map((scene) => scene.order)).toEqual([1, 2])
    expect(dto.scenes[0]?.error).toBeNull()
    expect(dto.scenes[1]?.error).toEqual({
      code: 'provider-error',
      message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
      retryable: true,
    })
    expect(dto.error).toEqual({
      code: 'keyframe-failed',
      message: 'No se pudieron crear todas las imágenes de la historia.',
      retryable: false,
    })
  })

  it('uses the persisted Spanish message when present', () => {
    const story = makeStoryRecord({
      status: 'FAILED',
      errorCode: 'assembly-failed',
      errorMessage: 'Mensaje persistido en español.',
    })

    expect(toStoryDto(story, 2_500, TEST_NOW).error?.message).toBe(
      'Mensaje persistido en español.',
    )
  })

  it('returns zero poll delay and the job contract in terminal states', () => {
    const story = makeStoryRecord({ status: 'READY', finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4' })

    expect(toStoryDto(story, 2_500, TEST_NOW).pollAfterMs).toBe(0)
    expect(toStoryJob(story, 2_500)).toEqual({
      storyId: story.id,
      status: 'READY',
      version: story.version,
      pollAfterMs: 0,
    })
  })
})

describe('StoryService.updateBeatAndRegenerate', () => {
  const newPrompt = 'Una repostera abre el obrador con luz cálida de amanecer.'

  it('regenerates one scene and invalidates the approval', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    const sceneId = story.scenes[1]!.id

    const result = await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId,
      update: { visualPrompt: newPrompt, regenerate: true },
    })

    expect(result.status).toBe('GENERATING_KEYFRAMES')
    expect(result.approvedAt).toBeNull()
    expect(result.errorCode).toBeNull()
    expect(result.scenes[1]).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      visualPrompt: newPrompt,
      keyframeAttempts: 1,
      keyframeRequestId: null,
      keyframeStatusUrl: null,
      keyframeResponseUrl: null,
      keyframeCancelUrl: null,
      keyframeError: null,
    })
    expect(result.scenes[0]?.keyframeUrl).toBe(story.scenes[0]?.keyframeUrl)
    expect(result.plan?.beats[1]).toMatchObject({
      order: 2,
      visualPrompt: newPrompt,
      narration: story.plan?.beats[1]?.narration,
    })
    expect(repository.calls).toContain('updateStory')
    expect(repository.calls).toContain('updateScene')
  })

  it('updates only the narration without consuming an attempt', async () => {
    const story = waitingStory()
    const { service } = setup({ seed: [story] })
    const scene = story.scenes[2]!

    const result = await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: scene.id,
      update: {
        visualPrompt: scene.visualPrompt,
        narration: 'Una narración nueva pero válida.',
        regenerate: false,
      },
    })

    expect(result.status).toBe('WAITING_APPROVAL')
    expect(result.scenes[2]).toMatchObject({
      status: 'KEYFRAME_READY',
      narration: 'Una narración nueva pero válida.',
      keyframeAttempts: 1,
      keyframeUrl: scene.keyframeUrl,
    })
    expect(result.plan?.beats[2]?.narration).toBe('Una narración nueva pero válida.')
  })

  it('does nothing when regenerate is false and nothing changed', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    const scene = story.scenes[0]!

    await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: scene.id,
      update: {
        visualPrompt: scene.visualPrompt,
        narration: scene.narration,
        regenerate: false,
      },
    })

    expect(repository.calls).not.toContain('updateStory')
    expect(repository.calls).not.toContain('updateScene')
  })

  it('regenerates when the prompt changed even with regenerate false', async () => {
    const story = waitingStory()
    const { service } = setup({ seed: [story] })

    const result = await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt, regenerate: false },
    })

    expect(result.status).toBe('GENERATING_KEYFRAMES')
  })


  it('accepts an edit and bounds the composed keyframe prompt', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    const scene = story.scenes[1]!
    const longPrompt = 'Composición visual de la escena con detalle. '.repeat(8).slice(0, 360)

    const result = await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: scene.id,
      update: { visualPrompt: longPrompt, regenerate: true },
    })

    expect(result.status).toBe('GENERATING_KEYFRAMES')
    expect(repository.calls).toContain('updateStory')
    expect(repository.calls).toContain('updateScene')
  })

  it('rejects an edit whose video prompt exceeds 2000 without writing', async () => {
    const story = waitingStory({ plan: longVideoPlan() })
    const { service, repository } = setup({ seed: [story] })
    const longPrompt = 'Composición visual '.repeat(30).slice(0, 600)

    const beat = story.plan!.beats[1]!
    const keyframe = composeKeyframe({
      bible: story.plan!.storyBible,
      beat: { ...beat, visualPrompt: longPrompt },
      hasReference: false,
    })
    expect(keyframe.prompt.length).toBeLessThan(4_000)
    expect(() => composeVideo({
      bible: story.plan!.storyBible,
      beat: { ...beat, visualPrompt: longPrompt },
      preset: 'fast',
    })).toThrowError(StoryError)

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[1]!.id,
      update: { visualPrompt: longPrompt, regenerate: true },
    }))

    expect(error.code).toBe('invalid-visual-prompt')
    expect(error.status).toBe(400)
    expect(repository.calls).not.toContain('updateStory')
    expect(repository.calls).not.toContain('updateScene')
  })

  it('rejects an edit that copies the narration literally', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    const narration = 'Una narración que no debe copiarse literalmente.'

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[1]!.id,
      update: {
        visualPrompt: narration,
        narration,
        regenerate: true,
      },
    }))

    expect(error.code).toBe('invalid-visual-prompt')
    expect(repository.calls).not.toContain('updateStory')
    expect(repository.calls).not.toContain('updateScene')
  })

  it('rejects a scene that already used both attempts', async () => {
    const story = waitingStory({}, { status: 'KEYFRAME_READY', keyframeAttempts: 2 })
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('keyframe-limit-reached')
    expect(error.status).toBe(409)
  })

  it('rejects a story that is not waiting for approval', async () => {
    const story = makeStoryRecord({ status: 'GENERATING_KEYFRAMES' })
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('story-not-ready')
  })

  it('allows regeneration from a keyframe-failed story', async () => {
    const story = makeStoryRecord({
      status: 'FAILED',
      errorCode: 'keyframe-failed',
      errorMessage: 'No se pudieron crear todas las imágenes de la historia.',
      scenes: [
        makeSceneRecord({ order: 1, status: 'KEYFRAME_FAILED', keyframeError: 'provider-error', keyframeAttempts: 1 }),
        makeSceneRecord({ order: 2, status: 'KEYFRAME_READY', keyframeAttempts: 1 }),
      ],
      sceneCount: 2,
      plan: null,
    })
    const { service } = setup({ seed: [story] })

    const result = await service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    })

    expect(result.status).toBe('GENERATING_KEYFRAMES')
    expect(result.errorCode).toBeNull()
  })

  it('rejects a scene that is not ready or failed', async () => {
    const story = waitingStory({}, { status: 'PENDING', keyframeAttempts: 0 })
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('scene-not-ready')
  })

  it('rejects an unknown beat', async () => {
    const story = waitingStory()
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: 'missing',
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('beat-not-found')
    expect(error.status).toBe(404)
  })

  it('rejects the regeneration when it would exceed the budget', async () => {
    const story = waitingStory()
    const { service } = setup({ seed: [story], cost: { maxStoryCostUsd: 0.1 } })

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('story-budget-exhausted')
  })

  it('returns 409 when the story version changed concurrently', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    vi.spyOn(repository, 'updateStory').mockResolvedValueOnce(0)

    const error = await captureError(() => service.updateBeatAndRegenerate({
      storyId: story.id,
      sessionId: SESSION_ID,
      sceneId: story.scenes[0]!.id,
      update: { visualPrompt: newPrompt },
    }))

    expect(error.code).toBe('story-not-ready')
  })
})

describe('StoryService.approve', () => {
  it('moves a fully ready story to GENERATING_VIDEOS', async () => {
    const story = waitingStory()
    const { service, events } = setup({ seed: [story] })

    const result = await service.approve(story.id, SESSION_ID)

    expect(result.status).toBe('GENERATING_VIDEOS')
    expect(result.approvedAt).not.toBeNull()
    expect(result.approvedAt?.getTime()).toBe(TEST_NOW)
    expect(result.errorCode).toBeNull()
    expect(events).toContain('story.approve')
  })

  it.each<StoryStatus>(['GENERATING_VIDEOS', 'VIDEOS_READY', 'ASSEMBLING', 'READY'])(
    'is idempotent from %s',
    async (status) => {
      const story = waitingStory({ status, approvedAt: new Date(TEST_NOW - 1) })
      const { service, repository } = setup({ seed: [story] })
      repository.clearCalls()

      const result = await service.approve(story.id, SESSION_ID)

      expect(result.id).toBe(story.id)
      expect(result.status).toBe(status)
      expect(repository.calls).not.toContain('updateStory')
    },
  )

  it('rejects approval when any scene is not KEYFRAME_READY', async () => {
    const scenes = makeScenes(5, { status: 'KEYFRAME_READY', keyframeAttempts: 1 })
    scenes[3] = { ...scenes[3]!, status: 'KEYFRAME_QUEUED' }
    const story = makeStoryRecord({ status: 'WAITING_APPROVAL', scenes })
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.approve(story.id, SESSION_ID))

    expect(error.code).toBe('story-not-ready')
  })

  it('rejects approval from a non-waiting state', async () => {
    const story = makeStoryRecord({ status: 'GENERATING_KEYFRAMES' })
    const { service } = setup({ seed: [story] })

    expect((await captureError(() => service.approve(story.id, SESSION_ID))).code)
      .toBe('story-not-ready')
  })

  it('rejects approval when the video projection exceeds the budget', async () => {
    const story = waitingStory({ preset: 'quality' })
    const { service } = setup({ seed: [story], cost: { maxStoryCostUsd: 1 } })

    const error = await captureError(() => service.approve(story.id, SESSION_ID))

    expect(error.code).toBe('story-budget-exhausted')
  })

  it('rejects approval when the version changed and the story is not generating', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })
    vi.spyOn(repository, 'updateStory').mockResolvedValueOnce(0)

    const error = await captureError(() => service.approve(story.id, SESSION_ID))

    expect(error.code).toBe('story-not-ready')
  })
})

describe('StoryService.retryVideo', () => {
  function videoStory(
    status: StoryStatus,
    sceneStatus: 'VIDEO_FAILED' | 'VIDEO_READY' = 'VIDEO_FAILED',
    videoAttempts = 1,
    errorCode: StoryRecord['errorCode'] = 'video-failed',
  ) {
    const scenes = makeScenes(5, {
      status: 'VIDEO_READY',
      keyframeAttempts: 1,
      videoAttempts: 1,
    })
    scenes[2] = {
      ...scenes[2]!,
      status: sceneStatus,
      videoAttempts,
      videoError: sceneStatus === 'VIDEO_FAILED' ? 'provider-error' : null,
      videoRequestId: 'video-request-1',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
      videoCancelUrl: 'https://queue.fal.run/cancel',
    }

    return makeStoryRecord({
      status,
      scenes,
      errorCode,
      errorMessage: errorCode === 'video-failed' ? 'No se pudieron generar todos los vídeos de la historia.' : null,
    })
  }

  it('requeues a failed scene without touching the others', async () => {
    const story = videoStory('GENERATING_VIDEOS')
    const { service, events } = setup({ seed: [story] })
    const target = story.scenes[2]!

    const result = await service.retryVideo(story.id, SESSION_ID, target.id)

    expect(result.status).toBe('GENERATING_VIDEOS')
    expect(result.scenes[2]).toMatchObject({
      status: 'VIDEO_QUEUED',
      videoAttempts: 1,
      videoError: null,
      videoRequestId: null,
      videoStatusUrl: null,
      videoResponseUrl: null,
      videoCancelUrl: null,
      keyframeUrl: target.keyframeUrl,
    })
    expect(result.scenes[0]?.status).toBe('VIDEO_READY')
    expect(events).toContain('story.video.retry')
  })

  it('recovers a FAILED video-failed story', async () => {
    const story = videoStory('FAILED')
    const { service } = setup({ seed: [story] })

    const result = await service.retryVideo(story.id, SESSION_ID, story.scenes[2]!.id)

    expect(result.status).toBe('GENERATING_VIDEOS')
    expect(result.errorCode).toBeNull()
  })

  it('rejects the third video attempt', async () => {
    const story = videoStory('GENERATING_VIDEOS', 'VIDEO_FAILED', 2)
    const { service } = setup({ seed: [story] })

    const error = await captureError(() => service.retryVideo(
      story.id,
      SESSION_ID,
      story.scenes[2]!.id,
    ))

    expect(error.code).toBe('video-retry-limit-reached')
    expect(error.status).toBe(409)
  })

  it('rejects retrying a scene that is not VIDEO_FAILED', async () => {
    const story = videoStory('GENERATING_VIDEOS', 'VIDEO_READY')
    const { service } = setup({ seed: [story] })

    expect((await captureError(() => service.retryVideo(
      story.id,
      SESSION_ID,
      story.scenes[2]!.id,
    ))).code).toBe('scene-not-ready')
  })

  it('rejects an unknown beat and a wrong aggregate state', async () => {
    const story = videoStory('GENERATING_VIDEOS')

    expect((await captureError(() => setup({ seed: [story] }).service.retryVideo(
      story.id,
      SESSION_ID,
      'missing',
    ))).code).toBe('beat-not-found')

    const notVideo = makeStoryRecord({ status: 'WAITING_APPROVAL' })
    expect((await captureError(() => setup({ seed: [notVideo] }).service.retryVideo(
      notVideo.id,
      SESSION_ID,
      notVideo.scenes[2]!.id,
    ))).code).toBe('story-not-ready')
  })

  it('rejects a retry that would exceed the budget', async () => {
    const story = videoStory('GENERATING_VIDEOS')
    const { service } = setup({ seed: [story], cost: { maxStoryCostUsd: 0.1 } })

    expect((await captureError(() => service.retryVideo(
      story.id,
      SESSION_ID,
      story.scenes[2]!.id,
    ))).code).toBe('story-budget-exhausted')
  })
})

function passedQc() {
  return {
    status: 'PASSED' as const,
    errorCode: null,
    evaluator: 'vision' as const,
    checkedAt: new Date(TEST_NOW).toISOString(),
    confidence: 0.9,
    scenes: [],
    issues: [],
    override: null,
  }
}

describe('StoryService QC commands', () => {
  function waitingStory(overrides: Partial<StoryRecord> = {}) {
    return makeStoryRecord({
      status: 'WAITING_QC',
      qc: passedQc(),
      approvedAt: new Date(TEST_NOW),
      scenes: makeScenes(5, {
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
        videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
      }),
      ...overrides,
    })
  }

  it('retries the QC and clears the persisted report', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })

    const result = await service.retryQc(story.id, SESSION_ID)

    expect(result.status).toBe('VIDEOS_READY')
    expect(repository.find(story.id)).toMatchObject({
      qc: null,
      qcCheckedAt: null,
    })
  })

  it('revalidates technical-failed clips with a URL without consuming attempts', async () => {
    const scenes = makeScenes(5, {
      status: 'VIDEO_FAILED',
      keyframeAttempts: 1,
      videoAttempts: 1,
      videoError: 'provider-invalid-output',
      videoUrl: 'https://v3.fal.media/files/test/clip.mp4',
    })
    const story = waitingStory({ scenes })
    const { service, repository } = setup({ seed: [story] })

    const result = await service.retryQc(story.id, SESSION_ID)
    const updated = repository.find(story.id)!

    expect(result.status).toBe('VIDEOS_READY')
    expect(updated.scenes.every((scene) => scene.status === 'VIDEO_READY')).toBe(true)
    expect(updated.scenes.every((scene) => scene.videoAttempts === 1)).toBe(true)
  })

  it('keeps retryQc idempotent from VIDEOS_READY and QC', async () => {
    for (const status of ['VIDEOS_READY', 'QC'] as const) {
      const story = waitingStory({ status, qc: null })
      const { service } = setup({ seed: [story] })

      expect((await service.retryQc(story.id, SESSION_ID)).status).toBe(status)
    }
  })

  it('approves the QC with an explicit override and keeps the status', async () => {
    const story = waitingStory()
    const { service, repository } = setup({ seed: [story] })

    const result = await service.approveQc(story.id, SESSION_ID)

    expect(result.status).toBe('ASSEMBLING')
    expect(repository.find(story.id)?.qc).toMatchObject({
      status: 'PASSED',
      override: { approved: true },
    })
  })

  it('keeps UNAVAILABLE when the manual override unblocks assembly', async () => {
    const story = waitingStory({
      qc: {
        ...passedQc(),
        status: 'UNAVAILABLE',
        errorCode: 'qc-disabled',
        evaluator: 'none',
        confidence: null,
      },
    })
    const { service, repository } = setup({ seed: [story] })

    const result = await service.approveQc(story.id, SESSION_ID)

    expect(result.status).toBe('ASSEMBLING')
    expect(repository.find(story.id)?.qc).toMatchObject({
      status: 'UNAVAILABLE',
      evaluator: 'none',
      override: { approved: true },
    })
    expect(toStoryDto(result, 2_500, TEST_NOW).qc).toMatchObject({
      status: 'UNAVAILABLE',
      override: { approved: true },
    })
  })

  it('is idempotent when the override was already applied', async () => {
    const story = waitingStory({
      status: 'ASSEMBLING',
      qc: {
        ...passedQc(),
        status: 'UNAVAILABLE',
        evaluator: 'none',
        override: { at: new Date(TEST_NOW).toISOString(), approved: true },
      },
    })
    const { service, repository } = setup({ seed: [story] })
    repository.clearCalls()

    const result = await service.approveQc(story.id, SESSION_ID)

    expect(result.status).toBe('ASSEMBLING')
    expect(repository.calls).not.toContain('updateStory')
  })

  it('rejects the override with a technically broken clip', async () => {
    const story = waitingStory()
    story.scenes[1] = { ...story.scenes[1]!, status: 'VIDEO_FAILED' }

    const error = await captureError(() => setup({ seed: [story] }).service.approveQc(
      story.id,
      SESSION_ID,
    ))

    expect(error.code).toBe('story-not-ready')
  })

  it('recovers a scene keeping the approval and the previous keyframe', async () => {
    const story = waitingStory()
    const target = story.scenes[2]!
    const { service, repository } = setup({ seed: [story] })

    const result = await service.recoverScene(story.id, SESSION_ID, target.id)

    expect(result.status).toBe('GENERATING_KEYFRAMES')
    expect(result.approvedAt?.getTime()).toBe(TEST_NOW)
    expect(result.qc).toBeNull()
    expect(result.scenes[2]).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      keyframeUrl: target.keyframeUrl,
      videoUrl: null,
    })
  })

  it('rejects recover with exhausted attempts, wrong state or wrong scene', async () => {
    const exhausted = waitingStory()
    exhausted.scenes[2] = { ...exhausted.scenes[2]!, keyframeAttempts: 2 }
    const exhaustedError = await captureError(() => setup({ seed: [exhausted] })
      .service.recoverScene(exhausted.id, SESSION_ID, exhausted.scenes[2]!.id))

    expect(exhaustedError.code).toBe('keyframe-limit-reached')

    const notReady = waitingStory()
    notReady.scenes[2] = { ...notReady.scenes[2]!, status: 'VIDEO_FAILED' }
    const notReadyError = await captureError(() => setup({ seed: [notReady] })
      .service.recoverScene(notReady.id, SESSION_ID, notReady.scenes[2]!.id))

    expect(notReadyError.code).toBe('scene-not-ready')

    const generating = waitingStory({ status: 'GENERATING_VIDEOS' })
    const generatingError = await captureError(() => setup({ seed: [generating] })
      .service.recoverScene(generating.id, SESSION_ID, generating.scenes[2]!.id))

    expect(generatingError.code).toBe('story-not-ready')
  })

  it('exposes qc and zero polling in WAITING_QC', () => {
    const dto = toStoryDto(waitingStory(), 2_500, TEST_NOW)

    expect(dto.qc?.status).toBe('PASSED')
    expect(dto.pollAfterMs).toBe(0)
  })

  it('hides qc in READY/ASSEMBLING without an override and shows it with one', () => {
    const ready = makeStoryRecord({ status: 'READY', qc: passedQc() })
    const assembling = makeStoryRecord({ status: 'ASSEMBLING', qc: passedQc() })

    expect(toStoryDto(ready, 2_500, TEST_NOW).qc).toBeNull()
    expect(toStoryDto(assembling, 2_500, TEST_NOW).qc).toBeNull()

    const override = { at: new Date(TEST_NOW).toISOString(), approved: true as const }
    const readyWithOverride = makeStoryRecord({
      status: 'READY',
      qc: { ...passedQc(), status: 'UNAVAILABLE', evaluator: 'none', override },
    })
    const assemblingWithOverride = makeStoryRecord({
      status: 'ASSEMBLING',
      qc: { ...passedQc(), status: 'UNAVAILABLE', evaluator: 'none', override },
    })

    expect(toStoryDto(readyWithOverride, 2_500, TEST_NOW).qc?.override)
      .toEqual(override)
    expect(toStoryDto(assemblingWithOverride, 2_500, TEST_NOW).qc?.override)
      .toEqual(override)
  })
})

describe('StoryService.requestAssembly', () => {
  function videosReady(id = 'story-ready', sessionId = SESSION_ID) {
    return makeStoryRecord({
      id,
      sessionId,
      status: 'VIDEOS_READY',
      qc: passedQc(),
      scenes: makeScenes(5, {
        status: 'VIDEO_READY',
        keyframeAttempts: 1,
        videoAttempts: 1,
      }),
    })
  }

  it('keeps a VIDEOS_READY story ready for the reconciler without effects', async () => {
    const story = videosReady()
    const { service, events, repository } = setup({ seed: [story] })
    repository.clearCalls()

    const result = await service.requestAssembly(story.id, SESSION_ID)

    expect(result.status).toBe('VIDEOS_READY')
    expect(result.errorCode).toBeNull()
    expect(events).not.toContain('story.assembly.request')
    expect(repository.calls).not.toContain('updateStory')
  })

  it.each<StoryStatus>(['ASSEMBLING', 'READY'])('is idempotent from %s', async (status) => {
    const story = makeStoryRecord({ status })
    const { service, repository } = setup({ seed: [story] })
    repository.clearCalls()

    expect((await service.requestAssembly(story.id, SESSION_ID)).id).toBe(story.id)
    expect(repository.calls).not.toContain('updateStory')
  })

  it('recovers a FAILED assembly story when every clip is ready and QC passed', async () => {
    const story = { ...videosReady(), status: 'FAILED' as const, errorCode: 'assembly-timeout' as const, errorMessage: 'El montaje tardó demasiado. Puedes reintentarlo.' }
    const { service } = setup({ seed: [story] })

    const result = await service.requestAssembly(story.id, SESSION_ID)

    expect(result.status).toBe('VIDEOS_READY')
    expect(result.errorCode).toBeNull()
  })

  it('rejects a FAILED assembly without a QC report', async () => {
    const story = {
      ...videosReady(),
      status: 'FAILED' as const,
      errorCode: 'assembly-failed' as const,
      qc: null,
    }

    const error = await captureError(() => setup({ seed: [story] }).service.requestAssembly(
      story.id,
      SESSION_ID,
    ))

    expect(error.code).toBe('story-not-ready')
  })

  it('rejects assembly when a scene has no video', async () => {
    const base = videosReady()
    const scenes = base.scenes.slice()
    scenes[1] = { ...scenes[1]!, status: 'VIDEO_FAILED' }
    const story = {
      ...base,
      status: 'FAILED' as const,
      errorCode: 'assembly-failed' as const,
      scenes,
    }

    const error = await captureError(() => setup({ seed: [story] }).service.requestAssembly(
      story.id,
      SESSION_ID,
    ))

    expect(error.code).toBe('story-not-ready')
  })

  it('rejects a non-assemblable aggregate state', async () => {
    const story = makeStoryRecord({ status: 'GENERATING_VIDEOS' })

    expect((await captureError(() => setup({ seed: [story] }).service.requestAssembly(
      story.id,
      SESSION_ID,
    ))).code).toBe('story-not-ready')
  })

  it('rejects assembly from WAITING_QC', async () => {
    const story = { ...videosReady(), status: 'WAITING_QC' as const }

    const error = await captureError(() => setup({ seed: [story] }).service.requestAssembly(
      story.id,
      SESSION_ID,
    ))

    expect(error.code).toBe('story-not-ready')
  })
})

describe('StoryService.cancel', () => {
  it('cancels the story, its active scenes and the provider jobs', async () => {
    const scenes = makeScenes(5, { status: 'VIDEO_READY', videoAttempts: 1, keyframeAttempts: 1 })
    scenes[3] = {
      ...scenes[3]!,
      status: 'VIDEO_RUNNING',
      videoRequestId: 'video-request-9',
      videoStatusUrl: 'https://queue.fal.run/status',
      videoResponseUrl: 'https://queue.fal.run/result',
      videoCancelUrl: 'https://queue.fal.run/cancel',
    }
    const story = makeStoryRecord({ status: 'GENERATING_VIDEOS', scenes })
    const { service, videos, events } = setup({ seed: [story] })

    const result = await service.cancel(story.id, SESSION_ID)

    expect(result.status).toBe('CANCELLED')
    expect(result.scenes.filter((scene) => scene.status === 'VIDEO_READY')).toHaveLength(4)
    expect(result.scenes[3]?.status).toBe('CANCELLED')
    expect(videos.cancels).toEqual([{ sceneId: scenes[3]!.id, storyId: story.id }])
    expect(events).toContain('story.cancel')
  })

  it('cancels active keyframe jobs', async () => {
    const scene = makeSceneRecord({
      order: 1,
      status: 'KEYFRAME_RUNNING',
      keyframeRequestId: 'kf-1',
      keyframeCancelUrl: 'https://queue.fal.run/cancel',
      keyframeAttempts: 1,
    })
    const story = makeStoryRecord({
      status: 'GENERATING_KEYFRAMES',
      sceneCount: 1,
      scenes: [scene],
      plan: null,
    })
    const { service, keyframes } = setup({ seed: [story] })

    await service.cancel(story.id, SESSION_ID)

    expect(keyframes.cancels).toEqual([{ sceneId: scene.id, storyId: story.id }])
  })

  it('is idempotent when already cancelled', async () => {
    const story = makeStoryRecord({ status: 'CANCELLED' })
    const { service, repository } = setup({ seed: [story] })
    repository.clearCalls()

    expect((await service.cancel(story.id, SESSION_ID)).status).toBe('CANCELLED')
    expect(repository.calls).not.toContain('cancel')
  })

  it.each<StoryStatus>(['READY', 'FAILED'])('rejects cancelling a %s story', async (status) => {
    const story = makeStoryRecord({ status })

    expect((await captureError(() => setup({ seed: [story] }).service.cancel(
      story.id,
      SESSION_ID,
    ))).code).toBe('story-not-cancellable')
  })

  it('returns cancel-failed when the conditional write loses', async () => {
    const story = makeStoryRecord({ status: 'GENERATING_VIDEOS' })
    const { service, repository } = setup({ seed: [story] })
    vi.spyOn(repository, 'cancel').mockResolvedValueOnce(false)
    vi.spyOn(repository, 'findOwnedById').mockResolvedValueOnce({ ...story, status: 'GENERATING_VIDEOS' })

    expect((await captureError(() => service.cancel(story.id, SESSION_ID))).code)
      .toBe('cancel-failed')
  })

  it('keeps the story cancelled when a provider cancellation fails', async () => {
    const scene = makeSceneRecord({
      order: 1,
      status: 'VIDEO_RUNNING',
      videoRequestId: 'video-request-1',
      videoCancelUrl: 'https://queue.fal.run/cancel',
      videoAttempts: 1,
    })
    const story = makeStoryRecord({ status: 'GENERATING_VIDEOS', sceneCount: 1, scenes: [scene], plan: null })
    const videos = new FakeVideoOrchestrator()
    videos.cancelError = new StoryError('cancel-failed')
    const { service, events } = setup({ seed: [story], videos })

    const result = await service.cancel(story.id, SESSION_ID)

    expect(result.status).toBe('CANCELLED')
    expect(events).toContain('story.cancel.failed')
  })
})

describe('StoryService wiring', () => {
  it('creates a StoryServiceImpl through the factory', () => {
    const { service } = setup()

    expect(service).toBeInstanceOf(StoryServiceImpl)
    expect(typeof (service as StoryService).create).toBe('function')
  })
})
