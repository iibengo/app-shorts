import { getRouterParam, setResponseStatus } from 'h3'
import type { StoryJob } from '~/models/story'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import { toReelStoryJob } from '~~/server/story/reel-service'
import { validateReelShotUpdate } from '~~/server/story/reel-validation'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { getStoryRuntime } from '~~/server/story/runtime'
import {
  STORY_BEAT_MAX_BODY_BYTES,
  readStoryJsonBody,
} from '~~/server/story/validation'

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

    const body = await readStoryJsonBody(event, STORY_BEAT_MAX_BODY_BYTES)
    const update = validateReelShotUpdate(body)

    runtime.rateLimiter.consumeCommand(context.sessionId)
    const story = await runtime.reelService.regenerateShot(
      id,
      context.sessionId,
      shotId,
      update,
    )

    setResponseStatus(event, 202)

    return toReelStoryJob(story, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
