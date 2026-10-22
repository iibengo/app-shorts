import { getRouterParam, setResponseStatus } from 'h3'
import type { StoryJob } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import { toReelStoryJob } from '~~/server/story/reel-service'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { getStoryRuntime } from '~~/server/story/runtime'

export default defineEventHandler(async (event): Promise<StoryJob | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const id = getRouterParam(event, 'id')
    const shotId = getRouterParam(event, 'shotId')

    if (!id) throw new StoryError('story-not-found')
    if (!shotId) throw new StoryError('shot-not-found')

    const runtime = getStoryRuntime(event)

    if (!runtime.hasDatabase || !runtime.reelService) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)
    if (!context.sessionId) throw new StoryError('story-not-found')

    runtime.rateLimiter.consumeCommand(context.sessionId)
    runtime.rateLimiter.consumeQcRetry(id)
    const story = await runtime.reelService.recoverShot(
      id,
      context.sessionId,
      shotId,
    )

    setResponseStatus(event, 202)

    return toReelStoryJob(story, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
