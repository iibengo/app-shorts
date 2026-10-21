// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const URL = 'postgresql://ai_shorts:ai_shorts@localhost:5432/ai_shorts?schema=public'

beforeEach(() => {
  vi.resetModules()
  delete (globalThis as { storyPrisma?: unknown }).storyPrisma
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete (globalThis as { storyPrisma?: unknown }).storyPrisma
})

describe('lazy Prisma client', () => {
  it('reports the database as unavailable when DATABASE_URL is missing or empty', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const module = await import('../../../server/db/prisma')

    expect(module.hasDatabase()).toBe(false)

    vi.stubEnv('DATABASE_URL', '   ')
    expect(module.hasDatabase()).toBe(false)
  })

  it('does not throw on import and throws a configuration error only on use', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const module = await import('../../../server/db/prisma')

    expect(module.DatabaseConfigurationError).toBeTypeOf('function')

    try {
      module.getPrisma()
      throw new Error('expected a configuration error')
    } catch (error) {
      expect(error).toBeInstanceOf(module.DatabaseConfigurationError)
      expect((error as Error).name).toBe('DatabaseConfigurationError')
      expect((error as Error).message).toContain('DATABASE_URL')
    }
  })

  it('creates a single Prisma client when a connection string exists', async () => {
    vi.stubEnv('DATABASE_URL', URL)
    const module = await import('../../../server/db/prisma')

    expect(module.hasDatabase()).toBe(true)

    const client = module.getPrisma()

    expect(client).toBeDefined()
    expect(module.getPrisma()).toBe(client)
    expect(typeof client.$connect).toBe('function')
    expect(typeof client.story.findFirst).toBe('function')
  })

  it('reports availability before creating a client', async () => {
    vi.stubEnv('DATABASE_URL', URL)
    const module = await import('../../../server/db/prisma')

    expect(module.hasDatabase()).toBe(true)
    expect(module.hasDatabase()).toBe(true)
  })
})
