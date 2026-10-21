import { getQuery, getRequestHeader, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import type { ComposerApiError, ComposerJob } from '~/models/composer'
import { ComposerError, sendComposerError } from '~~/server/shared/errors'
import {
  applyComposerResponseHeaders,
  assertSameOrigin,
  getRequestContext,
} from '~~/server/shared/request-context'
import { getComposerRuntime } from '~~/server/composer/runtime'

function assertNoQueryOrBody(event: H3Event): void {
  if (Object.keys(getQuery(event)).length > 0) {
    throw new ComposerError('invalid-request')
  }

  const contentLength = getRequestHeader(event, 'content-length')

  if (contentLength !== undefined && Number(contentLength) > 0) {
    throw new ComposerError('invalid-request')
  }
}

export default defineEventHandler(
  async (event): Promise<ComposerJob | ComposerApiError> => {
    applyComposerResponseHeaders(event)

    try {
      assertSameOrigin(event)
      assertNoQueryOrBody(event)

      const id = getRouterParam(event, 'id')

      if (!id) {
        throw new ComposerError('job-not-found')
      }

      const runtime = getComposerRuntime(event)

      if (!runtime.hasFalKey || !runtime.generation) {
        throw new ComposerError('ai-not-configured')
      }

      const context = getRequestContext(event, runtime.ipSalt)

      runtime.rateLimiter.consumeCancel(id)

      return await runtime.generation.cancelJob(id, context)
    } catch (error) {
      return sendComposerError(event, error)
    }
  },
)
