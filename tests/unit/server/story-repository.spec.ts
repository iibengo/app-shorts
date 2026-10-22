// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PrismaStoryRepository,
  createPrismaStoryRepository,
} from '../../../server/story/prisma-story-repository'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'
import creative from '../../fixtures/story/plan-creative-scene-changes.json'

type AnyRecord = Record<string, unknown>

const NOW = new Date('2026-10-21T18:00:00.000Z')

function sceneRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'scene-row-1',
    storyId: 'story-row-1',
    order: 1,
    visualPrompt: 'Una escena vertical con descripción suficiente.',
    narration: 'Una narración breve de prueba.',
    status: 'KEYFRAME_READY',
    keyframeUrl: 'https://v3.fal.media/files/test/scene.jpeg',
    keyframeRequestId: 'kf-1',
    keyframeStatusUrl: 'https://queue.fal.run/status',
    keyframeResponseUrl: 'https://queue.fal.run/result',
    keyframeCancelUrl: 'https://queue.fal.run/cancel',
    keyframeError: null,
    videoUrl: null,
    videoRequestId: null,
    videoStatusUrl: null,
    videoResponseUrl: null,
    videoCancelUrl: null,
    videoError: null,
    keyframeAttempts: 1,
    videoAttempts: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function storyRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'story-row-1',
    sessionId: 'session-row-1',
    status: 'WAITING_APPROVAL',
    premise: 'Una premisa de prueba con longitud suficiente.',
    title: plan5.title,
    logline: plan5.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'fast',
    mode: 'faithful',
    sceneCount: 5,
    durationSeconds: 6,
    aspectRatio: '9:16',
    planJson: plan5,
    finalVideoUrl: null,
    finalVideoExpiresAt: null,
    qcJson: null,
    qcCheckedAt: null,
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    version: 3,
    leaseOwner: null,
    leaseUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    approvedAt: null,
    completedAt: null,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    scenes: [sceneRow()],
    ...overrides,
  }
}

function rows(count: number): AnyRecord[] {
  return Array.from({ length: count }, (_value, index) =>
    sceneRow({
      id: `scene-row-${index + 1}`,
      order: index + 1,
      visualPrompt: plan5.beats[index]?.visualPrompt,
      narration: plan5.beats[index]?.narration,
    }),
  )
}

function fakeClient() {
  const client = {
    story: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    scene: {
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(client)),
  }

  return client
}

function repository(client = fakeClient()) {
  return {
    client,
    repo: new PrismaStoryRepository(client as never),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('PrismaStoryRepository createStory', () => {
  it('creates the story and its scenes in one nested write', async () => {
    const { client, repo } = repository()
    client.story.create.mockResolvedValue(storyRow({ scenes: rows(5) }))

    const result = await repo.createStory({
      sessionId: 'session-row-1',
      status: 'GENERATING_KEYFRAMES',
      premise: 'Una premisa de prueba con longitud suficiente.',
      title: plan5.title,
      logline: plan5.logline,
      referenceUrl: null,
      referenceExpiresAt: null,
      preset: 'fast',
      sceneCount: 5,
      durationSeconds: 6,
      aspectRatio: '9:16',
      plan: plan5,
      idempotencyKey: 'idem-key-12345678',
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      scenes: plan5.beats.map((beat) => ({
        order: beat.order,
        visualPrompt: beat.visualPrompt,
        narration: beat.narration,
        status: 'PENDING' as const,
      })),
    })

    expect(client.story.create).toHaveBeenCalledTimes(1)

    const args = client.story.create.mock.calls[0]![0] as {
      data: AnyRecord & { scenes: { create: readonly AnyRecord[] } }
      include: AnyRecord
    }

    expect(args.data).toMatchObject({
      sessionId: 'session-row-1',
      status: 'GENERATING_KEYFRAMES',
      preset: 'fast',
      sceneCount: 5,
      durationSeconds: 6,
      aspectRatio: '9:16',
      idempotencyKey: 'idem-key-12345678',
      version: 1,
      planJson: plan5,
    })
    expect(args.data.scenes.create).toHaveLength(5)
    expect(args.data.scenes.create[0]).toMatchObject({
      order: 1,
      status: 'PENDING',
    })
    expect(args.include).toEqual({ scenes: { orderBy: { order: 'asc' } } })

    expect(result.id).toBe('story-row-1')
    expect(result.status).toBe('WAITING_APPROVAL')
    expect(result.plan?.title).toBe(plan5.title)
    expect(result.scenes).toHaveLength(5)
  })
})

describe('PrismaStoryRepository reads and mapping', () => {
  it('filters owned reads by id and session and orders scenes', async () => {
    const { client, repo } = repository()
    client.story.findFirst.mockResolvedValue(storyRow({ scenes: rows(5) }))

    const story = await repo.findOwnedById('story-row-1', 'session-row-1')

    expect(client.story.findFirst).toHaveBeenCalledWith({
      where: { id: 'story-row-1', sessionId: 'session-row-1' },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })
    expect(story?.id).toBe('story-row-1')
  })

  it('returns null for missing stories', async () => {
    const { client, repo } = repository()
    client.story.findFirst.mockResolvedValue(null)
    client.story.findUnique.mockResolvedValue(null)

    expect(await repo.findOwnedById('missing', 'session')).toBeNull()
    expect(await repo.findById('missing')).toBeNull()
  })

  it('finds a story by session and idempotency key', async () => {
    const { client, repo } = repository()
    client.story.findFirst.mockResolvedValue(storyRow({ idempotencyKey: 'idem-key-12345678' }))

    const story = await repo.findBySessionAndIdempotencyKey(
      'session-row-1',
      'idem-key-12345678',
    )

    expect(client.story.findFirst).toHaveBeenCalledWith({
      where: { sessionId: 'session-row-1', idempotencyKey: 'idem-key-12345678' },
      include: { scenes: { orderBy: { order: 'asc' } } },
    })
    expect(story?.idempotencyKey).toBe('idem-key-12345678')
  })

  it('maps every persisted field and copies dates', async () => {
    const { client, repo } = repository()
    const row = storyRow({
      status: 'READY',
      preset: 'quality',
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
      referenceExpiresAt: new Date(NOW.getTime() + 3_600_000),
      finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4',
      finalVideoExpiresAt: new Date(NOW.getTime() + 86_400_000),
      approvedAt: NOW,
      completedAt: NOW,
      errorCode: 'assembly-failed',
      errorMessage: 'No se pudo montar el vídeo final. Puedes reintentar el montaje.',
      leaseOwner: 'owner-1',
      leaseUntil: NOW,
      scenes: rows(5),
    })
    client.story.findUnique.mockResolvedValue(row)

    const story = await repo.findById('story-row-1')

    expect(story).toMatchObject({
      id: 'story-row-1',
      sessionId: 'session-row-1',
      status: 'READY',
      preset: 'quality',
      referenceUrl: 'https://v3.fal.media/files/test/ref.webp',
      finalVideoUrl: 'https://v3.fal.media/files/test/final.mp4',
      errorCode: 'assembly-failed',
      version: 3,
      leaseOwner: 'owner-1',
    })
    expect(story?.createdAt).not.toBe(NOW)
    expect(story?.createdAt.getTime()).toBe(NOW.getTime())
    expect(story?.referenceExpiresAt?.getTime()).toBe(NOW.getTime() + 3_600_000)
    expect(story?.scenes[0]).toMatchObject({
      keyframeRequestId: 'kf-1',
      keyframeStatusUrl: 'https://queue.fal.run/status',
      keyframeAttempts: 1,
    })
  })

  it('reads a creative plan with invented locations without rebuilding it', async () => {
    const { client, repo } = repository()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    client.story.findUnique.mockResolvedValue(storyRow({
      mode: 'creative',
      planJson: creative,
      scenes: rows(5),
    }))

    const story = await repo.findById('story-row-1')

    expect(story?.mode).toBe('creative')
    expect(story?.plan?.storyBible?.locations).toHaveLength(3)
    expect(story?.plan?.storyBible?.locations.some((location) => location.source === 'invented'))
      .toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  it('rebuilds an invalid planJson from the scenes and logs the incident', async () => {
    const { client, repo } = repository()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    client.story.findUnique.mockResolvedValue(storyRow({
      planJson: { title: 'x', logline: 'y', beats: [] },
      scenes: rows(5),
    }))

    const story = await repo.findById('story-row-1')

    expect(story?.plan?.beats).toHaveLength(5)
    expect(story?.plan?.beats.map((beat) => beat.order)).toEqual([1, 2, 3, 4, 5])
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'story.plan.rebuild',
      storyId: 'story-row-1',
    }))
  })

  it('rebuilds a null plan silently from the scenes', async () => {
    const { client, repo } = repository()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    client.story.findUnique.mockResolvedValue(storyRow({
      planJson: null,
      title: null,
      logline: null,
      scenes: rows(5),
    }))

    const story = await repo.findById('story-row-1')

    expect(story?.plan?.title).toBe('')
    expect(story?.plan?.logline).toBe('')
    expect(story?.plan?.beats).toHaveLength(5)
    expect(warn).not.toHaveBeenCalled()
  })

  it('maps a valid qcJson only when qcCheckedAt is present', async () => {
    const { client, repo } = repository()
    const qcJson = {
      status: 'UNAVAILABLE',
      errorCode: 'qc-not-configured',
      evaluator: 'none',
      confidence: null,
      scenes: [
        {
          sceneId: 'scene-row-1',
          order: 1,
          framesUrl: null,
          technical: 'pass',
          observed: null,
          confidence: null,
          issues: [],
        },
      ],
      issues: [],
      override: null,
    }
    client.story.findUnique.mockResolvedValue(storyRow({
      qcJson,
      qcCheckedAt: NOW,
    }))

    const story = await repo.findById('story-row-1')

    expect(story?.qc?.status).toBe('UNAVAILABLE')
    expect(story?.qc?.checkedAt).toBe(NOW.toISOString())
    expect(story?.qc?.issues.some((issue) => issue.code === 'frames-unavailable'))
      .toBe(true)
  })

  it('returns qc null for invalid qcJson or a missing qcCheckedAt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { client, repo } = repository()
    client.story.findUnique.mockResolvedValueOnce(storyRow({
      qcJson: { status: 'OK' },
      qcCheckedAt: NOW,
    }))
    client.story.findUnique.mockResolvedValueOnce(storyRow({
      qcJson: {
        status: 'FAILED',
        errorCode: null,
        evaluator: 'vision',
        confidence: 0.5,
        scenes: [],
        issues: [],
        override: null,
      },
      qcCheckedAt: null,
    }))

    expect((await repo.findById('story-row-1'))?.qc).toBeNull()
    expect((await repo.findById('story-row-1'))?.qc).toBeNull()
    expect(warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'story.qc.invalid',
      storyId: 'story-row-1',
    }))
  })

  it('falls back to safe domain values for unknown database enums', async () => {    const { client, repo } = repository()
    client.story.findUnique.mockResolvedValue(storyRow({
      status: 'UNKNOWN',
      preset: 'experimental',
      errorCode: 'not-a-code',
      scenes: [sceneRow({ status: 'UNKNOWN', keyframeError: 'not-a-code' })],
    }))

    const story = await repo.findById('story-row-1')

    expect(story?.status).toBe('FAILED')
    expect(story?.preset).toBe('fast')
    expect(story?.errorCode).toBeNull()
    expect(story?.scenes[0]?.status).toBe('CANCELLED')
    expect(story?.scenes[0]?.keyframeError).toBeNull()
  })
})

describe('PrismaStoryRepository claim and leases', () => {
  it('lists claimable stories with an expired or missing lease', async () => {
    const { client, repo } = repository()
    client.story.findMany.mockResolvedValue([storyRow()])

    await repo.listClaimable(NOW, 5)

    const args = client.story.findMany.mock.calls[0]![0] as AnyRecord

    expect(args).toMatchObject({
      where: {
        status: { in: ['GENERATING_KEYFRAMES', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'ASSEMBLING'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: NOW } }],
      },
      orderBy: { updatedAt: 'asc' },
      take: 5,
    })
  })

  it('renews the lease in the same applyQcResult transition', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 1 })
    const leaseUntil = new Date(NOW.getTime() + 240_000)

    expect(await repo.applyQcResult({
      storyId: 'story-row-1',
      storyGuard: { statuses: ['QC'], version: 3 },
      storyPatch: { status: 'ASSEMBLING' },
      scenes: [],
      leaseUntil,
    })).toBe(true)

    expect(client.story.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'story-row-1',
        status: { in: ['QC'] },
        version: 3,
      },
      data: expect.objectContaining({
        status: 'ASSEMBLING',
        leaseUntil,
        version: { increment: 1 },
      }),
    })
  })

  it('claims atomically with status and lease guards', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 1 })
    const leaseUntil = new Date(NOW.getTime() + 60_000)

    expect(await repo.claim('story-row-1', 'owner-1', leaseUntil, NOW)).toBe(true)

    expect(client.story.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'story-row-1',
        status: { in: ['GENERATING_KEYFRAMES', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'ASSEMBLING'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: NOW } }],
      },
      data: {
        leaseOwner: 'owner-1',
        leaseUntil,
        version: { increment: 1 },
      },
    })
  })

  it('returns false when another instance owns the lease', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 0 })

    expect(await repo.claim('story-row-1', 'owner-1', NOW, NOW)).toBe(false)
  })

  it('releases only its own lease', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 1 })

    await repo.release('story-row-1', 'owner-1')

    expect(client.story.updateMany).toHaveBeenCalledWith({
      where: { id: 'story-row-1', leaseOwner: 'owner-1' },
      data: { leaseOwner: null, leaseUntil: null },
    })
  })
})

describe('PrismaStoryRepository conditional updates', () => {
  it('updates a story with status and version guards, incrementing version', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 1 })

    const updated = await repo.updateStory(
      'story-row-1',
      { statuses: ['WAITING_APPROVAL'], version: 3 },
      {
        status: 'GENERATING_VIDEOS',
        approvedAt: NOW,
        errorCode: null,
        errorMessage: null,
        plan: plan5,
        finalVideoUrl: null,
        finalVideoExpiresAt: null,
        completedAt: null,
      },
    )

    expect(updated).toBe(1)

    const args = client.story.updateMany.mock.calls[0]![0] as {
      where: AnyRecord
      data: AnyRecord
    }

    expect(args.where).toEqual({
      id: 'story-row-1',
      status: { in: ['WAITING_APPROVAL'] },
      version: 3,
    })
    expect(args.data).toMatchObject({
      status: 'GENERATING_VIDEOS',
      approvedAt: NOW,
      errorCode: null,
      errorMessage: null,
      planJson: plan5,
      version: { increment: 1 },
    })
  })

  it('returns 0 when the story guard does not match', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 0 })

    expect(await repo.updateStory('story-row-1', { version: 1 }, { status: 'READY' })).toBe(0)
  })

  it('updates a scene with status guards and story scope', async () => {
    const { client, repo } = repository()
    client.scene.updateMany.mockResolvedValue({ count: 1 })

    const updated = await repo.updateScene(
      'story-row-1',
      'scene-row-1',
      { statuses: ['KEYFRAME_READY', 'KEYFRAME_FAILED'] },
      {
        status: 'KEYFRAME_QUEUED',
        visualPrompt: 'Un nuevo prompt visual con longitud suficiente.',
        keyframeError: null,
        keyframeRequestId: null,
        keyframeAttempts: 2,
      },
    )

    expect(updated).toBe(1)

    const args = client.scene.updateMany.mock.calls[0]![0] as {
      where: AnyRecord
      data: AnyRecord
    }

    expect(args.where).toEqual({
      id: 'scene-row-1',
      storyId: 'story-row-1',
      status: { in: ['KEYFRAME_READY', 'KEYFRAME_FAILED'] },
    })
    expect(args.data).toMatchObject({
      status: 'KEYFRAME_QUEUED',
      visualPrompt: 'Un nuevo prompt visual con longitud suficiente.',
      keyframeError: null,
      keyframeRequestId: null,
      keyframeAttempts: 2,
    })
  })
})

describe('PrismaStoryRepository cancel and cleanup', () => {
  it('cancels the story and its non-terminal scenes in one transaction', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 1 })
    client.scene.updateMany.mockResolvedValue({ count: 4 })

    expect(await repo.cancel('story-row-1', 'session-row-1', NOW)).toBe(true)

    expect(client.$transaction).toHaveBeenCalledTimes(1)
    expect(client.story.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'story-row-1',
        sessionId: 'session-row-1',
        status: {
          in: ['GENERATING_KEYFRAMES', 'WAITING_APPROVAL', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'WAITING_QC', 'ASSEMBLING'],
        },
      },
      data: {
        status: 'CANCELLED',
        leaseOwner: null,
        leaseUntil: null,
        version: { increment: 1 },
      },
    })
    expect(client.scene.updateMany).toHaveBeenCalledWith({
      where: {
        storyId: 'story-row-1',
        status: { notIn: ['VIDEO_READY', 'CANCELLED'] },
      },
      data: { status: 'CANCELLED' },
    })
  })

  it('does not touch scenes when the story is not cancellable', async () => {
    const { client, repo } = repository()
    client.story.updateMany.mockResolvedValue({ count: 0 })

    expect(await repo.cancel('story-row-1', 'session-row-1', NOW)).toBe(false)
    expect(client.scene.updateMany).not.toHaveBeenCalled()
  })

  it('counts active stories, provider jobs and statuses', async () => {
    const { client, repo } = repository()
    client.story.count.mockResolvedValue(2)
    client.scene.count.mockResolvedValue(1)

    expect(await repo.countActive('session-row-1')).toBe(2)
    expect(await repo.countActiveGlobal()).toBe(2)
    expect(await repo.countActiveProviderJobs('keyframe')).toBe(1)
    expect(await repo.countActiveProviderJobs('video')).toBe(1)
    expect(await repo.countByStatus('READY')).toBe(2)

    const activeArgs = client.story.count.mock.calls[0]![0] as AnyRecord
    expect(activeArgs.where).toEqual({
      sessionId: 'session-row-1',
      status: {
        in: ['GENERATING_KEYFRAMES', 'WAITING_APPROVAL', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'ASSEMBLING'],
      },
    })

    const globalArgs = client.story.count.mock.calls[1]![0] as AnyRecord
    expect(globalArgs.where).toEqual({
      status: {
        in: ['GENERATING_KEYFRAMES', 'WAITING_APPROVAL', 'GENERATING_VIDEOS', 'VIDEOS_READY', 'QC', 'ASSEMBLING'],
      },
    })

    const keyframeArgs = client.scene.count.mock.calls[0]![0] as AnyRecord
    expect(keyframeArgs.where).toEqual({
      status: { in: ['KEYFRAME_QUEUED', 'KEYFRAME_RUNNING'] },
      keyframeRequestId: { not: null },
    })

    const videoArgs = client.scene.count.mock.calls[1]![0] as AnyRecord
    expect(videoArgs.where).toEqual({
      status: { in: ['VIDEO_QUEUED', 'VIDEO_RUNNING'] },
      videoRequestId: { not: null },
    })
  })

  it('deletes expired stories in bounded batches with cascade', async () => {
    const { client, repo } = repository()
    client.story.findMany.mockResolvedValue([{ id: 'story-1' }, { id: 'story-2' }])
    client.story.deleteMany.mockResolvedValue({ count: 2 })
    const cutoff = new Date(NOW.getTime() - 3_600_000)

    expect(await repo.deleteExpired(cutoff, 50)).toBe(2)

    expect(client.story.findMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: cutoff } },
      select: { id: true },
      take: 50,
    })
    expect(client.story.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-1', 'story-2'] } },
    })
  })

  it('does not call deleteMany when nothing expired', async () => {
    const { client, repo } = repository()
    client.story.findMany.mockResolvedValue([])

    expect(await repo.deleteExpired(NOW, 50)).toBe(0)
    expect(client.story.deleteMany).not.toHaveBeenCalled()
  })

  it('builds the repository through the factory', () => {
    const { client } = repository()
    const created = createPrismaStoryRepository(client as never)

    expect(created).toBeInstanceOf(PrismaStoryRepository)
    expect(typeof created.createStory).toBe('function')
  })
})
