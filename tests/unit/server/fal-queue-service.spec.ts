// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerError } from '../../../server/composer/errors'
import { createFalQueueService } from '../../../server/composer/fal-queue-service'
import type { FalHttpClient, FalHttpRequest } from '../../../server/composer/fal-http-client'
import queueSubmit from '../../fixtures/fal/queue-submit.json'
import queuedStatus from '../../fixtures/fal/queue-status-in-queue.json'
import inProgressStatus from '../../fixtures/fal/queue-status-in-progress.json'
import completedStatus from '../../fixtures/fal/queue-status-completed.json'

const ALLOWED = ['https://queue.fal.run', 'https://fal.run', 'https://rest.fal.ai']

function createClient(handler: (request: FalHttpRequest) => Promise<unknown>) {
  const request = vi.fn(async (input: FalHttpRequest) => ({
    status: 200,
    data: await handler(input) as never,
    headers: new Headers(),
  }))

  return { client: { request } as unknown as FalHttpClient, request }
}

function createService(handler: (request: FalHttpRequest) => Promise<unknown>) {
  const { client, request } = createClient(handler)
  const service = createFalQueueService({
    client,
    queueBaseUrl: 'https://queue.fal.run/',
    allowedOrigins: ALLOWED,
    allowInsecure: false,
  })

  return { service, request }
}

describe('FalQueueService.submit', () => {
  it('posts to the allowlisted endpoint and keeps the returned URLs verbatim', async () => {
    const { service, request } = createService(async () => queueSubmit)

    const submission = await service.submit(
      'fal-ai/minimax/hailuo-02/standard/image-to-video',
      { prompt: 'Idea' },
    )

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://queue.fal.run/fal-ai/minimax/hailuo-02/standard/image-to-video',
      method: 'POST',
      body: { prompt: 'Idea' },
      timeoutMs: 15_000,
    })
    expect(submission).toEqual({
      requestId: 'req-test-fast-001',
      statusUrl: queueSubmit.status_url,
      responseUrl: queueSubmit.response_url,
      cancelUrl: queueSubmit.cancel_url,
    })
    expect(submission.statusUrl).not.toContain('owner/app')
  })

  it('rejects incomplete submission payloads', async () => {
    const { service } = createService(async () => ({
      request_id: 'req-1',
      status_url: 'https://queue.fal.run/status',
    }))

    await expect(service.submit(
      'fal-ai/flux/dev',
      {},
    )).rejects.toMatchObject({ code: 'provider-invalid-output' })
  })

  it('rejects submission URLs outside the allowlist', async () => {
    const { service } = createService(async () => ({
      ...queueSubmit,
      status_url: 'https://evil.example/status',
    }))

    await expect(service.submit(
      'fal-ai/flux/dev',
      {},
    )).rejects.toMatchObject({ code: 'provider-invalid-output' })
  })

  it('passes the abort signal to the HTTP client', async () => {
    const { service, request } = createService(async () => queueSubmit)
    const controller = new AbortController()

    await service.submit('fal-ai/flux/dev', {}, controller.signal)

    expect(request.mock.calls[0]?.[0].signal).toBe(controller.signal)
  })
})

describe('FalQueueService.getStatus', () => {
  it('parses IN_QUEUE with position', async () => {
    const { service, request } = createService(async () => queuedStatus)

    await expect(service.getStatus(queueSubmit.status_url)).resolves.toEqual({
      status: 'IN_QUEUE',
      queuePosition: 3,
    })
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: queueSubmit.status_url,
      method: 'GET',
      timeoutMs: 10_000,
    })
  })

  it.each([
    [inProgressStatus, 'IN_PROGRESS', null],
    [completedStatus, 'COMPLETED', null],
    [{ status: 'IN_QUEUE', queue_position: 4.8 }, 'IN_QUEUE', 4],
    [{ status: 'IN_QUEUE', queue_position: -3 }, 'IN_QUEUE', 0],
    [{ status: 'IN_QUEUE', queue_position: 'soon' }, 'IN_QUEUE', null],
  ])('parses %o', async (payload, status, position) => {
    const { service } = createService(async () => payload)

    await expect(service.getStatus(queueSubmit.status_url)).resolves.toEqual({
      status,
      queuePosition: position,
    })
  })

  it('rejects unknown statuses and malformed payloads', async () => {
    for (const payload of [
      { status: 'PENDING' },
      null,
      'IN_QUEUE',
      [],
    ]) {
      const { service } = createService(async () => payload)

      await expect(service.getStatus(queueSubmit.status_url)).rejects.toMatchObject({
        code: 'provider-invalid-output',
      })
    }
  })
})

describe('FalQueueService.getResult and cancel', () => {
  it('returns the raw response payload', async () => {
    const payload = { video: { url: 'https://v3.fal.media/files/test/video.mp4' } }
    const { service, request } = createService(async () => payload)

    await expect(service.getResult(queueSubmit.response_url)).resolves.toEqual(payload)
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: queueSubmit.response_url,
      method: 'GET',
      timeoutMs: 15_000,
    })
  })

  it('cancels with PUT and no Authorization reconstruction', async () => {
    const { service, request } = createService(async () => ({}))

    await service.cancel(queueSubmit.cancel_url)

    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: queueSubmit.cancel_url,
      method: 'PUT',
      timeoutMs: 15_000,
    })
  })

  it('maps a provider 409 during cancel to job-not-cancellable', async () => {
    const { service } = createService(async () => {
      throw new ComposerError('provider-error', { providerStatus: 409 })
    })

    await expect(service.cancel(queueSubmit.cancel_url)).rejects.toMatchObject({
      code: 'job-not-cancellable',
    })
  })

  it('maps other cancel failures to cancel-failed', async () => {
    const { service } = createService(async () => {
      throw new ComposerError('provider-error', { providerStatus: 500 })
    })

    await expect(service.cancel(queueSubmit.cancel_url)).rejects.toMatchObject({
      code: 'cancel-failed',
      retryable: true,
    })
  })
})
