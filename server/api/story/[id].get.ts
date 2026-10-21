import { getRouterParam } from 'h3'
import type { Story } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { toStoryDto } from '~~/server/story/story-service'
import { getStoryRuntime } from '~~/server/story/runtime'

export default defineEventHandler(async (event): Promise<Story | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const id = getRouterParam(event, 'id')

    if (!id) {
      throw new StoryError('story-not-found')
    }

    const runtime = getStoryRuntime(event)

    if (!runtime.hasDatabase || !runtime.service) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)

    if (!context.sessionId) {
      throw new StoryError('story-not-found')
    }

    const story = await runtime.service.get(id, context.sessionId)

    return toStoryDto(story, runtime.pollAfterMs, Date.now())
  } catch (error) {
    return sendStoryError(event, error)
  }
})
