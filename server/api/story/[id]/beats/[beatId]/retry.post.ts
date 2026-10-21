import { getRouterParam, setResponseStatus } from 'h3'
import type { StoryJob } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { toStoryJob } from '~~/server/story/story-service'
import { getStoryRuntime } from '~~/server/story/runtime'

export default defineEventHandler(async (event): Promise<StoryJob | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const id = getRouterParam(event, 'id')
    const beatId = getRouterParam(event, 'beatId')

    if (!id) {
      throw new StoryError('story-not-found')
    }

    if (!beatId) {
      throw new StoryError('beat-not-found')
    }

    const runtime = getStoryRuntime(event)

    if (!runtime.hasDatabase || !runtime.service) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)

    if (!context.sessionId) {
      throw new StoryError('story-not-found')
    }

    runtime.rateLimiter.consumeCommand(context.sessionId)

    const story = await runtime.service.retryVideo(id, context.sessionId, beatId)

    setResponseStatus(event, 202)

    return toStoryJob(story, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
