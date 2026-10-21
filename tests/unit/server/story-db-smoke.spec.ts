// @vitest-environment node
/**
 * Opt-in PostgreSQL smoke test.
 *
 *   RUN_DB_SMOKE=1 DATABASE_URL_TEST=postgresql://... npx vitest run tests/unit/server/story-db-smoke.spec.ts
 *
 * Never runs in CI by default. It uses the already-applied migration; run
 * `npx prisma migrate deploy` against the test database first.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../server/generated/prisma/client'
import { PrismaStoryRepository } from '../../../server/story/prisma-story-repository'
import type { CreateStoryRecord, StoryRepository } from '../../../server/story/repository'
import plan5 from '../../fixtures/deepseek/deepseek-plan-5.json'

const connectionString = process.env.DATABASE_URL_TEST
const enabled = process.env.RUN_DB_SMOKE === '1' && Boolean(connectionString)

let client: PrismaClient | null = null
let repository: StoryRepository | null = null

function requireRepository(): StoryRepository {
  if (!repository) throw new Error('repository not initialized')

  return repository
}

function input(overrides: Partial<CreateStoryRecord> = {}): CreateStoryRecord {
  const now = new Date()
  const sceneCount = overrides.sceneCount ?? 5

  return {
    sessionId: 'smoke-session-abcdefghij',
    status: 'GENERATING_KEYFRAMES',
    premise: 'Una premisa de smoke test con longitud suficiente.',
    title: plan5.title,
    logline: plan5.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset: 'fast',
    sceneCount,
    durationSeconds: 6,
    aspectRatio: '9:16',
    plan: plan5,
    idempotencyKey: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
    scenes: plan5.beats.map((beat) => ({
      order: beat.order,
      visualPrompt: beat.visualPrompt,
      narration: beat.narration,
      status: 'PENDING' as const,
    })),
    ...overrides,
  }
}

describe.skipIf(!enabled)('PostgreSQL Story repository smoke (RUN_DB_SMOKE=1)', () => {
  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: connectionString! })
    client = new PrismaClient({ adapter })
    await client.$connect()
    repository = new PrismaStoryRepository(client)
  })

  afterAll(async () => {
    if (client) {
      await client.$disconnect()
    }
  })

  beforeEach(async () => {
    await client!.scene.deleteMany()
    await client!.story.deleteMany()
  })

  it('creates a story with its scenes in one transaction', async () => {
    const story = await requireRepository().createStory(input())

    expect(story.id).toBeTruthy()
    expect(story.status).toBe('GENERATING_KEYFRAMES')
    expect(story.plan?.beats).toHaveLength(5)
    expect(story.scenes).toHaveLength(5)
    expect(story.scenes.map((scene) => scene.order)).toEqual([1, 2, 3, 4, 5])
    expect(story.scenes.every((scene) => scene.status === 'PENDING')).toBe(true)
  })

  it('enforces ownership and the idempotency key', async () => {
    const created = await requireRepository().createStory(input({
      idempotencyKey: 'smoke-idem-key-12345678',
    }))

    expect(await requireRepository().findOwnedById(created.id, created.sessionId))
      .not.toBeNull()
    expect(await requireRepository().findOwnedById(created.id, 'other-session-abcdefghij'))
      .toBeNull()

    const replay = await requireRepository().findBySessionAndIdempotencyKey(
      created.sessionId,
      'smoke-idem-key-12345678',
    )

    expect(replay?.id).toBe(created.id)

    await expect(requireRepository().createStory(input({
      idempotencyKey: 'smoke-idem-key-12345678',
    }))).rejects.toThrow()
  })

  it('claims a story atomically and releases the lease', async () => {
    const created = await requireRepository().createStory(input())
    const now = new Date()
    const lease = new Date(now.getTime() + 60_000)

    expect(await requireRepository().claim(created.id, 'smoke-owner', lease, now)).toBe(true)
    expect(await requireRepository().claim(created.id, 'other-owner', lease, now)).toBe(false)
    expect(await requireRepository().findById(created.id)).toMatchObject({
      leaseOwner: 'smoke-owner',
    })

    await requireRepository().release(created.id, 'smoke-owner')

    expect((await requireRepository().findById(created.id))?.leaseOwner).toBeNull()
    expect(await requireRepository().claim(created.id, 'other-owner', lease, new Date()))
      .toBe(true)
  })

  it('uses conditional version writes and cancels transactionally', async () => {
    const created = await requireRepository().createStory(input())

    expect(await requireRepository().updateStory(
      created.id,
      { statuses: ['GENERATING_KEYFRAMES'], version: created.version },
      { status: 'WAITING_APPROVAL' },
    )).toBe(1)

    const updated = await requireRepository().findById(created.id)

    expect(updated?.status).toBe('WAITING_APPROVAL')
    expect(updated?.version).toBe(created.version + 1)
    expect(await requireRepository().updateStory(
      created.id,
      { version: created.version },
      { status: 'READY' },
    )).toBe(0)

    expect(await requireRepository().cancel(
      created.id,
      created.sessionId,
      new Date(),
    )).toBe(true)

    expect(await requireRepository().findById(created.id)).toMatchObject({
      status: 'CANCELLED',
    })
  })

  it('deletes expired stories in cascade', async () => {
    const created = await requireRepository().createStory(input())
    const cutoff = new Date(Date.now() - 3_600_000)

    await client!.story.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 7_200_000) },
    })

    expect(await requireRepository().deleteExpired(cutoff, 50)).toBe(1)
    expect(await requireRepository().findById(created.id)).toBeNull()
    expect(await client!.scene.count({ where: { storyId: created.id } })).toBe(0)
  })
})
