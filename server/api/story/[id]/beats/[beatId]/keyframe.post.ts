import { getRequestHeader, getRouterParam, setResponseStatus } from 'h3'
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
import {
  STORY_BEAT_MAX_BODY_BYTES,
  readStoryJsonBody,
  validateBeatUpdate,
} from '~~/server/story/validation'

const SHOT_SCENE_FIELDS = ['regenerate'] as const

function validateShotSceneBody(body: Record<string, unknown>): void {
  if (!Object.keys(body).every((key) =>
    (SHOT_SCENE_FIELDS as readonly string[]).includes(key))) {
    throw new StoryError('invalid-request')
  }

  if (body.regenerate !== undefined && typeof body.regenerate !== 'boolean') {
    throw new StoryError('invalid-request')
  }
}

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

    const hasBody = Boolean(getRequestHeader(event, 'content-type'))
      || Boolean(getRequestHeader(event, 'content-length'))
    const body = hasBody
      ? await readStoryJsonBody(event, STORY_BEAT_MAX_BODY_BYTES)
      : {}

    if (runtime.reelService) {
      try {
        const reel = await runtime.reelService.inspect(id, context.sessionId)

        if (reel.contract === '008') {
          validateShotSceneBody(body)
          runtime.rateLimiter.consumeCommand(context.sessionId)
          const story = await runtime.reelService.regenerateSceneShots(
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

    const update = validateBeatUpdate(body)
    runtime.rateLimiter.consumeCommand(context.sessionId)
    const story = await runtime.service.updateBeatAndRegenerate({
      storyId: id,
      sessionId: context.sessionId,
      sceneId: beatId,
      update,
    })
    setResponseStatus(event, 202)

    return toStoryJob(story, runtime.pollAfterMs)
  } catch (error) {
    return sendStoryError(event, error)
  }
})
