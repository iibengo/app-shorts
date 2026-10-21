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
  canonicalStoryBody,
  hashStoryBody,
  toStoryDto,
} from '~~/server/story/story-service'
import { getStoryRuntime } from '~~/server/story/runtime'
import {
  STORY_CREATE_MAX_BODY_BYTES,
  readStoryJsonBody,
  validateCreateRequest,
  validateIdempotencyKey,
} from '~~/server/story/validation'

export default defineEventHandler(async (event): Promise<Story | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const runtime = getStoryRuntime(event)
    const body = await readStoryJsonBody(event, STORY_CREATE_MAX_BODY_BYTES)
    const now = Date.now()
    const request = validateCreateRequest(body, now)
    const idempotencyKey = validateIdempotencyKey(
      getRequestHeader(event, 'idempotency-key') ?? undefined,
    )

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
  } catch (error) {
    return sendStoryError(event, error)
  }
})
