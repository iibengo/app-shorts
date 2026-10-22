import { getRequestHeader, setResponseStatus } from 'h3'
import type { Story } from '~/models/story'
import {
  StoryError,
  sendStoryError,
} from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryRequestContext,
} from '~~/server/story/session'
import {
  canonicalReelStoryBody,
  toReelStoryDto,
} from '~~/server/story/reel-service'
import {
  canonicalStoryBody,
  hashStoryBody,
  toStoryDto,
} from '~~/server/story/story-service'
import { validateReelCreateRequest } from '~~/server/story/reel-validation'
import { getStoryRuntime } from '~~/server/story/runtime'
import {
  STORY_CREATE_MAX_BODY_BYTES,
  readStoryJsonBody,
  validateCreateRequest,
  validateIdempotencyKey,
} from '~~/server/story/validation'

/**
 * Explicit legacy escape hatch for the 005–007 contract. Production clients
 * and the default contract use 008; an old caller must opt in with `legacy`.
 */
function legacyPayload(body: Record<string, unknown>): Record<string, unknown> {
  const { legacy: _legacy, ...rest } = body
  return rest
}

export default defineEventHandler(async (event): Promise<Story | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const runtime = getStoryRuntime(event)
    const body = await readStoryJsonBody(event, STORY_CREATE_MAX_BODY_BYTES)
    const now = Date.now()
    const idempotencyKey = validateIdempotencyKey(
      getRequestHeader(event, 'idempotency-key') ?? undefined,
    )

    if (body.legacy === true) {
      const request = validateCreateRequest(legacyPayload(body), now)

      if (!runtime.hasDeepSeekKey) {
        throw new StoryError('director-not-configured')
      }

      if (!runtime.hasDatabase || !runtime.service) {
        throw new StoryError('database-unavailable')
      }

      const context = getStoryRequestContext(event, runtime.ipSalt)
      const result = await runtime.service.create({
        sessionId: context.sessionId,
        request,
        idempotencyKey,
        bodyHash: hashStoryBody(canonicalStoryBody(request)),
      })

      setResponseStatus(event, result.replayed ? 200 : 201)

      return toStoryDto(result.story, runtime.pollAfterMs, Date.now())
    }

    const { request } = validateReelCreateRequest(body, now)

    if (!runtime.hasDeepSeekKey) {
      throw new StoryError('director-not-configured')
    }

    if (!runtime.hasDatabase || !runtime.reelService) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryRequestContext(event, runtime.ipSalt)
    const result = await runtime.reelService.create({
      sessionId: context.sessionId,
      request,
      idempotencyKey,
      bodyHash: hashStoryBody(canonicalReelStoryBody(request)),
    })

    setResponseStatus(event, result.replayed ? 200 : 201)

    return toReelStoryDto(result.story, runtime.pollAfterMs, Date.now())
  } catch (error) {
    return sendStoryError(event, error)
  }
})
