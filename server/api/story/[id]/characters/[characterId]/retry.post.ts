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

/**
 * 015: queues a failed character reference again. A ready one is refused: paying
 * to redraw an image the user already has is not a retry, it is waste.
 */
export default defineEventHandler(async (event): Promise<StoryJob | void> => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const id = getRouterParam(event, 'id')
    const characterId = getRouterParam(event, 'characterId')

    if (!id) throw new StoryError('story-not-found')
    if (!characterId) throw new StoryError('beat-not-found')

    const runtime = getStoryRuntime(event)

    if (!runtime.hasDatabase || !runtime.reelService) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)
    const record = await runtime.reelService.retryCharacterReference(
      id,
      context.sessionId,
      characterId,
    )

    setResponseStatus(event, 202)

    return toReelStoryJob(record, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
