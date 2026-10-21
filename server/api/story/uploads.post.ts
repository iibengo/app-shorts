import { getRequestHeader } from 'h3'
import type { StoryUploadTicket } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryRequestContext,
} from '~~/server/story/session'
import { hashStoryBody } from '~~/server/story/story-service'
import { getStoryRuntime } from '~~/server/story/runtime'
import {
  STORY_UPLOAD_MAX_BODY_BYTES,
  readStoryJsonBody,
  validateIdempotencyKey,
  validateUploadRequest,
} from '~~/server/story/validation'

export default defineEventHandler(async (event): Promise<StoryUploadTicket | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const runtime = getStoryRuntime(event)
    const body = await readStoryJsonBody(event, STORY_UPLOAD_MAX_BODY_BYTES)
    const request = validateUploadRequest(body)
    const idempotencyKey = validateIdempotencyKey(
      getRequestHeader(event, 'idempotency-key') ?? undefined,
    )

    if (!runtime.hasFalKey) {
      throw new StoryError('story-not-configured')
    }

    const context = getStoryRequestContext(event, runtime.ipSalt)
    const bodyHash = hashStoryBody(JSON.stringify([
      request.fileName,
      request.contentType,
      request.sizeBytes,
    ]))
    const cacheKey = idempotencyKey
      ? `${context.sessionId}:${idempotencyKey}`
      : null

    if (cacheKey) {
      const cached = runtime.uploadIdempotency.get(cacheKey)

      if (cached) {
        if (cached.bodyHash !== bodyHash) {
          throw new StoryError('idempotency-conflict')
        }

        return cached.ticket
      }
    }

    runtime.rateLimiter.consumeUpload(context.sessionId, context.ipHash)

    const ticket = await runtime.storage.initiate(request)

    if (cacheKey) {
      runtime.uploadIdempotency.set(cacheKey, { bodyHash, ticket })
    }

    return ticket
  } catch (error) {
    return sendStoryError(event, error)
  }
})
