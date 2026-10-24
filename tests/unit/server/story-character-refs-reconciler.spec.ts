import { describe, expect, it } from 'vitest'
import type { StoryCharacter, StoryPlan } from '~/models/story'
import type {
  CharacterReferenceOrchestrator,
  CharacterReferenceSubmission,
} from '../../../server/story/character-ref-orchestrator'
import type {
  ShotKeyframeOrchestrator,
  ShotProviderSubmission,
} from '../../../server/story/shot-keyframe-orchestrator'
import type {
  ShotVideoOrchestrator,
  ShotVideoProviderSubmission,
} from '../../../server/story/shot-video-orchestrator'
import type {
  ShotAssembler,
  ShotAssemblyInput,
} from '../../../server/story/shot-assembly-service'
import { StoryError } from '../../../server/story/errors'
import { createReelCostGuard } from '../../../server/story/reel-cost'
import { DEFAULT_STORY_COST_CONFIG } from '../../../server/story/cost'
import {
  createReelStoryReconciler,
} from '../../../server/story/reel-reconciler'
import { toReelStoryDto } from '../../../server/story/reel-service'
import type { ReelStoryRecord } from '../../../server/story/reel-repository'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'
import { FakeReelStoryRepository } from '../../helpers/story-reel'

const NOW = Date.parse('2026-10-24T12:00:00.000Z')
const REFERENCE = 'https://v3.fal.media/files/test/avatar.png'
const SECONDARY = 'iker'

class FakeCharacterReferences implements CharacterReferenceOrchestrator {
  readonly submitted: { readonly characterId: string; readonly style: string }[] = []
  readonly cancelled: string[] = []
  pollState: 'COMPLETED' | 'IN_PROGRESS' = 'COMPLETED'
  pollError: StoryError | null = null
  submitError: StoryError | null = null
  private readonly byRequest = new Map<string, string>()
  private counter = 0

  async submit(
    character: StoryCharacter,
    style: string,
    styleReferenceUrl: string | null,
  ): Promise<CharacterReferenceSubmission> {
    void styleReferenceUrl

    if (this.submitError) throw this.submitError

    this.counter += 1
    const requestId = `ref-${this.counter}`
    this.byRequest.set(requestId, character.id)
    this.submitted.push({ characterId: character.id, style })

    return {
      requestId,
      statusUrl: `https://queue.fal.run/test/${requestId}/status`,
      responseUrl: `https://queue.fal.run/test/${requestId}`,
      cancelUrl: `https://queue.fal.run/test/${requestId}/cancel`,
    }
  }

  async poll(submission: CharacterReferenceSubmission) {
    if (this.pollError) throw this.pollError

    if (this.pollState === 'IN_PROGRESS') {
      return { state: 'IN_PROGRESS' as const }
    }

    const characterId = this.byRequest.get(submission.requestId) ?? 'unknown'
    const url = `https://v3.fal.media/files/test/${characterId}.png`

    return {
      state: 'COMPLETED' as const,
      ref: { frontalUrl: url, referenceUrls: [url] },
    }
  }

  async cancel(submission: CharacterReferenceSubmission): Promise<void> {
    this.cancelled.push(submission.cancelUrl)
  }
}

class FakeKeyframes implements ShotKeyframeOrchestrator {
  readonly submitted: string[] = []

  async submit(shot: { readonly id: string; readonly order: number }): Promise<ShotProviderSubmission> {
    this.submitted.push(shot.id)

    return {
      requestId: `kf-${shot.order}`,
      statusUrl: `https://queue.fal.run/test/kf-${shot.order}/status`,
      responseUrl: `https://queue.fal.run/test/kf-${shot.order}`,
      cancelUrl: `https://queue.fal.run/test/kf-${shot.order}/cancel`,
    }
  }

  async poll() {
    return { state: 'IN_PROGRESS' as const }
  }

  async cancel(): Promise<void> {
    // Not exercised by the reference phase.
  }
}

class FakeVideos implements ShotVideoOrchestrator {
  async submit(shot: { readonly order: number }): Promise<ShotVideoProviderSubmission> {
    return {
      requestId: `video-${shot.order}`,
      statusUrl: `https://queue.fal.run/test/video-${shot.order}/status`,
      responseUrl: `https://queue.fal.run/test/video-${shot.order}`,
      cancelUrl: `https://queue.fal.run/test/video-${shot.order}/cancel`,
    }
  }

  async poll() {
    return { state: 'IN_PROGRESS' as const }
  }

  async cancel(): Promise<void> {
    // Not exercised by the reference phase.
  }
}

class FakeAssembler implements ShotAssembler {
  async assemble(input: ShotAssemblyInput) {
    return {
      fileUrl: 'https://v3.fal.media/files/test/final.mp4',
      expiresAt: new Date(NOW + 86_400_000).toISOString(),
      width: 720 as const,
      height: 1280 as const,
      durationSeconds: input.plannedDurationSeconds,
    }
  }
}

async function makeStory(options: {
  readonly referenceUrl?: string | null
} = {}): Promise<{
  readonly repository: FakeReelStoryRepository
  readonly story: ReelStoryRecord
}> {
  const fixture = makeReelNarrative('budget', 15, options.referenceUrl !== undefined)
  const repository = new FakeReelStoryRepository()
  const story = await repository.createStory({
    sessionId: 'ref-session',
    status: 'GENERATING_KEYFRAMES',
    premise: fixture.canon.logline,
    title: fixture.canon.title,
    logline: fixture.canon.logline,
    referenceUrl: options.referenceUrl ?? null,
    referenceExpiresAt: options.referenceUrl
      ? new Date(NOW + 3_600_000)
      : null,
    preset: 'fast',
    visualStyle: 'papercraft',
    mode: 'faithful',
    platform: 'tiktok',
    costMode: 'budget',
    targetDurationSeconds: 15,
    maxDurationSeconds: 15,
    plan: fixture.narrative as StoryPlan,
    shotPlan: makeReelShotList(fixture.narrative, fixture.plan),
    idempotencyKey: null,
    now: new Date(NOW),
    expiresAt: new Date(NOW + 86_400_000),
  })

  return { repository, story }
}

function setup(
  repository: FakeReelStoryRepository,
  options: {
    readonly references: FakeCharacterReferences
    readonly keyframes?: FakeKeyframes
    readonly maxCostUsd?: number
    readonly now?: () => number
  },
) {
  const keyframes = options.keyframes ?? new FakeKeyframes()
  const events: { readonly event: string; readonly errorCode?: string }[] = []
  const costGuard = createReelCostGuard({
    costs: {
      ...DEFAULT_STORY_COST_CONFIG,
      ...(options.maxCostUsd === undefined ? {} : { maxStoryCostUsd: options.maxCostUsd }),
    },
  })
  const reconciler = createReelStoryReconciler({
    repository,
    keyframes,
    characterReferences: options.references,
    videos: new FakeVideos(),
    assembler: new FakeAssembler(),
    qcService: null,
    costGuard,
    qcEnabled: false,
    owner: 'ref-test',
    now: options.now ?? (() => NOW + 1_000),
    onEvent: (event) => events.push(event),
    config: {
      leaseMs: 60_000,
      assemblyLeaseMs: 480_000,
      qcLeaseMs: 720_000,
      tickBudgetMs: 45_000,
      keyframeConcurrency: 50,
      videoConcurrency: 50,
      claimLimit: 5,
    },
  })

  return { reconciler, keyframes, events, costGuard }
}

function refStatuses(story: ReelStoryRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(story.characterRefs).map(([id, ref]) => [id, ref.status]),
  )
}

describe('reconciler character references', () => {
  it('generates one reference per character before the first keyframe and never repeats it', async () => {
    const { repository, story } = await makeStory()
    const references = new FakeCharacterReferences()
    const { reconciler, keyframes, events } = setup(repository, { references })

    await reconciler.runOnce()

    expect(references.submitted.map((item) => item.characterId).sort())
      .toEqual(['iker', 'mara'])
    expect(keyframes.submitted).toHaveLength(0)
    expect(refStatuses((await repository.findById(story.id))!)).toEqual({
      mara: 'pending',
      iker: 'pending',
    })

    await reconciler.runOnce()

    const afterReady = (await repository.findById(story.id))!
    expect(refStatuses(afterReady)).toEqual({ mara: 'ready', iker: 'ready' })
    expect(keyframes.submitted.length).toBeGreaterThan(0)
    expect(references.submitted).toHaveLength(2)

    await reconciler.runOnce()

    expect(references.submitted).toHaveLength(2)
    expect(events.filter((event) => event.event === 'reel.character-ref.ready'))
      .toHaveLength(2)
  })

  it('retries a terminally failed reference once, then fails it without blocking the story', async () => {
    const { repository, story } = await makeStory()
    const references = new FakeCharacterReferences()
    references.pollError = new StoryError('content-blocked')
    const { reconciler, keyframes, events } = setup(repository, { references })

    await reconciler.runOnce()
    expect(references.submitted).toHaveLength(2)

    await reconciler.runOnce()
    let current = (await repository.findById(story.id))!
    expect(refStatuses(current)).toEqual({ mara: 'pending', iker: 'pending' })
    expect(keyframes.submitted).toHaveLength(0)

    await reconciler.runOnce()
    expect(references.submitted).toHaveLength(4)

    await reconciler.runOnce()
    current = (await repository.findById(story.id))!
    expect(refStatuses(current)).toEqual({ mara: 'failed', iker: 'failed' })
    expect(current.status).toBe('GENERATING_KEYFRAMES')
    expect(keyframes.submitted.length).toBeGreaterThan(0)
    expect(events.filter((event) => event.event === 'reel.character-ref.failed').length)
      .toBeGreaterThanOrEqual(2)
  })

  it('fails a reference after 180 s of inactivity and continues with keyframes', async () => {
    const { repository, story } = await makeStory()
    const references = new FakeCharacterReferences()
    let clock = NOW
    const { reconciler, keyframes } = setup(repository, {
      references,
      now: () => clock,
    })

    await reconciler.runOnce()
    expect(references.submitted).toHaveLength(2)

    clock += 181_000
    await reconciler.runOnce()

    const current = (await repository.findById(story.id))!
    expect(refStatuses(current)).toEqual({ mara: 'failed', iker: 'failed' })
    expect(references.cancelled).toHaveLength(2)
    expect(current.status).toBe('GENERATING_KEYFRAMES')
    expect(keyframes.submitted.length).toBeGreaterThan(0)
  })

  it('skips a reference that does not fit the cap and keeps the story alive', async () => {
    const { repository, story } = await makeStory()
    // A combination without a cost profile falls back to `maxStoryCostUsd`,
    // which lets the test force the cap below one reference.
    repository.records[0] = {
      ...repository.records[0]!,
      costMode: 'production',
      targetDurationSeconds: 15,
    }
    const references = new FakeCharacterReferences()
    const { reconciler, events } = setup(repository, {
      references,
      maxCostUsd: 0.001,
    })

    await reconciler.runOnce()

    const current = (await repository.findById(story.id))!
    expect(references.submitted).toHaveLength(0)
    expect(refStatuses(current)).toEqual({ mara: 'failed', iker: 'failed' })
    // The reference never blocks anything; the keyframe budget (008) is the
    // one that can still fail the story with the cap applied to its own unit.
    expect(current.errorCode === null || current.errorCode === 'story-budget-exhausted')
      .toBe(true)
    expect(events.some((event) => event.event === 'reel.character-ref.budget-skipped'))
      .toBe(true)
  })

  it('uses the user image for the protagonist without a provider call', async () => {
    const { repository, story } = await makeStory({ referenceUrl: REFERENCE })
    const references = new FakeCharacterReferences()
    const { reconciler } = setup(repository, { references })

    await reconciler.runOnce()

    expect(references.submitted.map((item) => item.characterId)).toEqual([SECONDARY])

    const current = (await repository.findById(story.id))!
    expect(current.characterRefs.mara).toMatchObject({
      status: 'ready',
      source: 'user',
      frontalUrl: REFERENCE,
    })

    const dto = toReelStoryDto(current, 2_500, NOW)
    expect(dto.characterRefs[0]).toEqual({
      characterId: 'mara',
      source: 'user',
      status: 'ready',
      imageUrl: REFERENCE,
    })
    expect(dto.characterRefs[1]).toMatchObject({
      characterId: SECONDARY,
      source: 'generated',
      status: 'pending',
      imageUrl: null,
    })
  })
})

describe('write guard', () => {
  it('refuses a write from a stale version so a ready reference is never redone', async () => {
    const { repository, story } = await makeStory()
    const references = new FakeCharacterReferences()
    const { reconciler } = setup(repository, { references })

    await reconciler.runOnce()
    await reconciler.runOnce()

    const current = (await repository.findById(story.id))!
    expect(Object.values(current.characterRefs ?? {}).every((ref) => ref.status === 'ready'))
      .toBe(true)

    // A worker that read the story before those writes must not be able to
    // overwrite them: that write is what used to cause a second paid call.
    const stored = await repository.updateCharacterRefs(
      story.id,
      {},
      {
        statuses: ['GENERATING_KEYFRAMES'],
        version: current.version - 1,
        leaseOwner: 'stale-worker',
      },
    )

    expect(stored).toBe(false)
    const after = (await repository.findById(story.id))!
    expect(Object.values(after.characterRefs ?? {}).filter((ref) => ref.status === 'ready'))
      .toHaveLength(2)
  })
})

describe('character reference DTO', () => {
  it('keeps failed references visible with a null image', async () => {
    const { repository, story } = await makeStory()
    const references = new FakeCharacterReferences()
    references.pollError = new StoryError('provider-rejected')
    const { reconciler } = setup(repository, { references })

    await reconciler.runOnce()
    await reconciler.runOnce()
    await reconciler.runOnce()
    await reconciler.runOnce()

    const current = (await repository.findById(story.id))!
    const dto = toReelStoryDto(current, 2_500, NOW)

    expect(dto.characterRefs).toHaveLength(2)
    expect(dto.characterRefs.every((ref) => ref.status === 'failed')).toBe(true)
    expect(dto.characterRefs.every((ref) => ref.imageUrl === null)).toBe(true)
    expect(dto.status).toBe('GENERATING_KEYFRAMES')
  })
})
