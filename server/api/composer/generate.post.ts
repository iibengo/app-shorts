import { getRequestHeader } from 'h3'
import type { ComposerApiError, ComposerJob } from '~/models/composer'
import { ComposerError, sendComposerError } from '~~/server/composer/errors'
import {
  applyComposerResponseHeaders,
  assertSameOrigin,
  getRequestContext,
} from '~~/server/composer/request-context'
import { getComposerRuntime } from '~~/server/composer/runtime'
import {
  readJsonBody,
  validateGenerateRequest,
  validateIdempotencyKey,
} from '~~/server/composer/validation'
import { setResponseStatus } from 'h3'

export default defineEventHandler(
  async (event): Promise<ComposerJob | ComposerApiError> => {
    applyComposerResponseHeaders(event)

    const abortController = new AbortController()
    const handleAbort = (): void => {
      abortController.abort()
    }
    const handleClose = (): void => {
      if (!event.node.res.writableEnded) {
        abortController.abort()
      }
    }

    event.node.req.once('aborted', handleAbort)
    event.node.res.once('close', handleClose)

    try {
      assertSameOrigin(event)

      const runtime = getComposerRuntime(event)

      if (!runtime.hasFalKey || !runtime.generation) {
        throw new ComposerError('ai-not-configured')
      }

      const context = getRequestContext(event, runtime.ipSalt)
      const payload = await readJsonBody(event, 16 * 1_024)
      const request = validateGenerateRequest(payload)
      const idempotencyKey = validateIdempotencyKey(
        getRequestHeader(event, 'idempotency-key'),
      )

      const job = await runtime.generation.createJob({
        request,
        context,
        idempotencyKey,
        signal: abortController.signal,
      })

      setResponseStatus(event, 202)

      return job
    } catch (error) {
      return sendComposerError(event, error)
    } finally {
      event.node.req.removeListener('aborted', handleAbort)
      event.node.res.removeListener('close', handleClose)
    }
  },
)
