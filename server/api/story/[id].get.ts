import { getRouterParam } from 'h3'
import type { Story } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { toReelStoryDto } from '~~/server/story/reel-service'
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

    if (!runtime.hasDatabase || (!runtime.service && !runtime.reelService)) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)

    if (!context.sessionId) {
      throw new StoryError('story-not-found')
    }

    if (runtime.reelService) {
      try {
        const reel = await runtime.reelService.get(id, context.sessionId)

        // Legacy 007 rows keep the old DTO until the UI migration ships.
        if (reel.contract !== 'legacy' || !runtime.service) {
          return toReelStoryDto(reel, runtime.pollAfterMs, Date.now())
        }
      } catch (error) {
        // Backwards compatible reads: legacy stories only exist in the
        // pre-008 repository. In production both repositories share the DB.
        if (!runtime.service || !(error instanceof StoryError) || error.code !== 'story-not-found') {
          throw error
        }
      }
    }

    if (!runtime.service) {
      throw new StoryError('database-unavailable')
    }

    const story = await runtime.service.get(id, context.sessionId)

    return toStoryDto(story, runtime.pollAfterMs, Date.now())
  } catch (error) {
    return sendStoryError(event, error)
  }
})
