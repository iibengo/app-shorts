import { createHash } from 'node:crypto'
import { getRequestHeader } from 'h3'
import type { ComposerApiError, ComposerUploadTicket } from '~/models/composer'
import { ComposerError, sendComposerError } from '~~/server/composer/errors'
import {
  applyComposerResponseHeaders,
  assertSameOrigin,
  getRequestContext,
} from '~~/server/composer/request-context'
import { getComposerRuntime } from '~~/server/composer/runtime'
import {
  canonicalUploadBody,
  readJsonBody,
  validateIdempotencyKey,
  validateUploadRequest,
} from '~~/server/composer/validation'

function hashBody(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export default defineEventHandler(
  async (event): Promise<ComposerUploadTicket | ComposerApiError> => {
    applyComposerResponseHeaders(event)

    let pendingStoreKey: string | null = null

    try {
      assertSameOrigin(event)

      const runtime = getComposerRuntime(event)

      if (!runtime.hasFalKey) {
        throw new ComposerError('ai-not-configured')
      }

      const context = getRequestContext(event, runtime.ipSalt)
      const payload = await readJsonBody(event, 4 * 1_024)
      const request = validateUploadRequest(payload)
      const bodyHash = hashBody(canonicalUploadBody(request))
      const idempotencyKey = validateIdempotencyKey(
        getRequestHeader(event, 'idempotency-key'),
      )

      if (idempotencyKey) {
        const storeKey = `${context.sessionId}:${idempotencyKey}`
        const existing = runtime.uploadIdempotency.get(storeKey)

        if (existing) {
          if (existing.bodyHash !== bodyHash || existing.status === 'pending') {
            throw new ComposerError('idempotency-conflict')
          }

          return existing.value
        }

        runtime.uploadIdempotency.setPending(storeKey, bodyHash)
        pendingStoreKey = storeKey
      }

      runtime.rateLimiter.consumeUpload(context.sessionId, context.ipHash)

      const ticket = await runtime.storage.initiate(request)

      if (pendingStoreKey) {
        runtime.uploadIdempotency.setDone(pendingStoreKey, bodyHash, ticket)
      }

      return ticket
    } catch (error) {
      if (pendingStoreKey) {
        getComposerRuntime(event).uploadIdempotency.delete(pendingStoreKey)
      }

      return sendComposerError(event, error)
    }
  },
)
