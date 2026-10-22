import { getRouterParam, setResponseStatus } from 'h3'
import type { StoryJob } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import { toReelStoryJob } from '~~/server/story/reel-service'
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

    if (!id) throw new StoryError('story-not-found')
    if (!beatId) throw new StoryError('beat-not-found')

    const runtime = getStoryRuntime(event)
    if (!runtime.hasDatabase) throw new StoryError('database-unavailable')

    const context = getStoryReadContext(event, runtime.ipSalt)
    if (!context.sessionId) throw new StoryError('story-not-found')

    if (runtime.reelService) {
      try {
        const reel = await runtime.reelService.inspect(id, context.sessionId)

        if (reel.contract === '008') {
          runtime.rateLimiter.consumeCommand(context.sessionId)
          runtime.rateLimiter.consumeQcRetry(id)
          const story = await runtime.reelService.recoverSceneShots(
            id,
            context.sessionId,
            beatId,
          )
          setResponseStatus(event, 202)

          return toReelStoryJob(story, runtime.pollAfterMs)
        }
      } catch (error) {
        if (!(error instanceof StoryError) || error.code !== 'story-not-found') {
          throw error
        }
      }
    }

    if (!runtime.service) throw new StoryError('database-unavailable')

    runtime.rateLimiter.consumeCommand(context.sessionId)
    const story = await runtime.service.recoverScene(id, context.sessionId, beatId)
    setResponseStatus(event, 202)

    return toStoryJob(story, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
