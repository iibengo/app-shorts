import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

export type CustomPrismaClient = PrismaClient

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseConfigurationError'
  }
}

interface PrismaGlobal {
  storyPrisma?: PrismaClient
}

const globalForPrisma = globalThis as unknown as PrismaGlobal

let cachedClient: PrismaClient | null = globalForPrisma.storyPrisma ?? null

export function hasDatabase(): boolean {
  const connectionString = process.env.DATABASE_URL

  return typeof connectionString === 'string' && connectionString.trim().length > 0
}

/**
 * Lazily creates the Prisma singleton. Importing this module never throws:
 * the configuration error is raised only when a caller requests the client.
 */
export function getPrisma(): PrismaClient {
  if (cachedClient) {
    return cachedClient
  }

  const connectionString = process.env.DATABASE_URL

  if (!connectionString || connectionString.trim().length === 0) {
    throw new DatabaseConfigurationError(
      'DATABASE_URL is required to use the Story database. Configure it in the server environment.',
    )
  }

  const adapter = new PrismaPg({ connectionString })
  const client = new PrismaClient({ adapter })

  cachedClient = client

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.storyPrisma = client
  }

  return client
}
