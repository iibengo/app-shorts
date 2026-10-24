import {
  getRouterParam,
  sendStream,
  setResponseHeader,
  setResponseStatus,
} from 'h3'
import { StoryError, sendStoryError } from '~~/server/story/errors'
import {
  applyStoryResponseHeaders,
  assertStorySameOrigin,
  getStoryReadContext,
} from '~~/server/story/session'
import { getStoryRuntime } from '~~/server/story/runtime'
import { openDeliveredStory } from '~~/server/story/delivered-file'

/**
 * Serves the delivered MP4 from the app's own copy.
 *
 * The provider deletes uploaded videos within minutes (E-series, 2026-10-25),
 * so this route is what makes the result survive. Ownership is checked on the
 * story, never on the file name: a story id is not a permission.
 */
export default defineEventHandler(async (event) => {
  applyStoryResponseHeaders(event)

  try {
    assertStorySameOrigin(event)

    const id = getRouterParam(event, 'id')

    if (!id) throw new StoryError('story-not-found')

    const runtime = getStoryRuntime(event)

    if (!runtime.hasDatabase || !runtime.reelService) {
      throw new StoryError('database-unavailable')
    }

    const context = getStoryReadContext(event, runtime.ipSalt)

    if (!context.sessionId) throw new StoryError('story-not-found')

    const story = await runtime.reelService.inspect(id, context.sessionId)

    if (story.status !== 'READY') throw new StoryError('story-not-ready')

    const file = await openDeliveredStory(runtime.storyConfig.outputDirectory ?? null, id)

    if (!file) throw new StoryError('story-not-found')

    setResponseStatus(event, 200)
    setResponseHeader(event, 'Content-Type', 'video/mp4')
    setResponseHeader(event, 'Content-Length', file.size)
    setResponseHeader(event, 'Content-Disposition', `inline; filename="story-${id}.mp4"`)
    setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')

    return sendStream(event, file.stream)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
