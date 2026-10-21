import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

export type CustomPrismaClient = PrismaClient

interface PrismaGlobal {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as unknown as PrismaGlobal

/**
 * Lazily creates the Prisma client. Importing this module must not require a
 * database connection; routes that do not use Story keep working without one.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required to use the Story database. Configure it in the server environment.',
    )
  }

  const adapter = new PrismaPg({ connectionString })
  const client = new PrismaClient({ adapter })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}
