// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerError } from '../../../server/composer/errors'
import { GenerationOrchestrator } from '../../../server/composer/generation-orchestrator'
import type {
  FalHttpClient,
  FalHttpRequest,
} from '../../../server/composer/fal-http-client'
import type { FalQueueService } from '../../../server/composer/fal-queue-service'
import { ModelRegistry } from '../../../server/composer/model-registry'
import { PromptComposer } from '../../../server/composer/prompt-composer'
import fluxDev from '../../fixtures/fal/flux-dev-result.json'
import fluxKontext from '../../fixtures/fal/flux-kontext-result.json'
import minimax from '../../fixtures/fal/minimax-result.json'

const NOW = Date.parse('2026-10-21T18:00:00.000Z')
const KEYFRAME = 'https://v3.fal.media/files/test/reference.webp'
const SUBMISSION = {
  requestId: 'req-1',
  statusUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1/status',
  responseUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1',
  cancelUrl: 'https://queue.fal.run/fal-ai/minimax/requests/req-1/cancel',
}

function createOrchestrator(options: {
  readonly httpHandler?: (request: FalHttpRequest) => Promise<unknown>
  readonly submit?: FalQueueService['submit']
  readonly pollAfterMs?: number
} = {}) {
  const httpRequest = vi.fn(async (request: FalHttpRequest) => ({
    status: 200,
    data: await (options.httpHandler ?? (async () => fluxDev))(request) as never,
    headers: new Headers(),
  }))
  const submit = vi.fn(options.submit ?? (async () => SUBMISSION))
  const queue = {
    submit,
    getStatus: vi.fn(),
    getResult: vi.fn(),
    cancel: vi.fn(),
  } as unknown as FalQueueService
  const orchestrator = new GenerationOrchestrator({
    queue,
    models: new ModelRegistry(),
    prompts: new PromptComposer(),
    http: { request: httpRequest } as unknown as FalHttpClient,
    runBaseUrl: 'https://fal.run/',
    keyframeTimeoutMs: 45_000,
    jobTtlMs: 3_600_000,
    pollAfterMs: options.pollAfterMs ?? 2_000,
    now: () => NOW,
  })

  return { orchestrator, httpRequest, submit, queue }
}

const REQUEST = {
  prompt: 'Un short sobre luz natural',
  preset: 'fast' as const,
  durationSeconds: 6 as const,
  referenceUrl: null,
}

describe('GenerationOrchestrator keyframe and submit', () => {
  it('generates the FLUX dev keyframe and submits MiniMax with the composed prompt', async () => {
    const { orchestrator, httpRequest, submit } = createOrchestrator()

    const job = await orchestrator.createVideoJob(REQUEST)

    expect(httpRequest).toHaveBeenCalledTimes(1)
    expect(httpRequest.mock.calls[0]?.[0]).toMatchObject({
      url: 'https://fal.run/fal-ai/flux/dev',
      method: 'POST',
      timeoutMs: 45_000,
    })
    expect(httpRequest.mock.calls[0]?.[0].body).toMatchObject({
      prompt: 'Cinematic vertical 9:16 keyframe for a short video. Un short sobre luz natural. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.',
      image_size: { width: 1152, height: 2048 },
    })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]?.[0]).toBe(
      'fal-ai/minimax/hailuo-02/standard/image-to-video',
    )
    expect(submit.mock.calls[0]?.[1]).toEqual({
      prompt: 'Un short sobre luz natural. Vertical 9:16 short video, smooth natural motion, consistent subject, no text, no watermark, no logo.',
      image_url: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      duration: '6',
      resolution: '768P',
      prompt_optimizer: false,
    })
    expect(job).toMatchObject({
      endpointId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
      requestId: 'req-1',
      statusUrl: SUBMISSION.statusUrl,
      responseUrl: SUBMISSION.responseUrl,
      cancelUrl: SUBMISSION.cancelUrl,
      modelId: 'minimax-hailuo-02',
      preset: 'fast',
      durationSeconds: 6,
      posterUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
      referenceUrl: null,
      createdAt: NOW,
      expiresAt: NOW + 3_600_000,
      pollAfterMs: 2_000,
    })
    expect(job.promptHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(job)).not.toContain('Un short sobre luz natural')
  })

  it('uses Kontext and Kling with a reference image', async () => {
    const { orchestrator, httpRequest, submit } = createOrchestrator({
      httpHandler: async (request) => {
        expect(request.url).toBe('https://fal.run/fal-ai/flux-pro/kontext')
        return fluxKontext
      },
    })

    const job = await orchestrator.createVideoJob({
      ...REQUEST,
      preset: 'quality',
      durationSeconds: 5,
      referenceUrl: KEYFRAME,
    })

    expect(httpRequest.mock.calls[0]?.[0].body).toMatchObject({
      image_url: KEYFRAME,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      safety_tolerance: '2',
    })
    expect(submit.mock.calls[0]?.[0]).toBe(
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    )
    expect(submit.mock.calls[0]?.[1]).toMatchObject({
      image_url: 'https://v3.fal.media/files/test/keyframe-kontext.jpeg',
      duration: '5',
      cfg_scale: 0.5,
    })
    expect(job).toMatchObject({
      modelId: 'kling-2.5-turbo-pro',
      preset: 'quality',
      referenceUrl: KEYFRAME,
    })
  })

  it.each([
    [500, 'provider-error'],
    [400, 'provider-rejected'],
    [401, 'ai-unavailable'],
  ])('does not submit when the keyframe fails with HTTP %i', async (status, code) => {
    const { orchestrator, submit } = createOrchestrator({
      httpHandler: async () => {
        throw new ComposerError(code as 'provider-error')
      },
    })

    await expect(orchestrator.createVideoJob(REQUEST)).rejects.toMatchObject({ code })
    expect(submit).not.toHaveBeenCalled()
  })

  it('maps a keyframe timeout to keyframe-timeout without submitting', async () => {
    const { orchestrator, submit } = createOrchestrator({
      httpHandler: async () => {
        throw new ComposerError('provider-timeout')
      },
    })

    await expect(orchestrator.createVideoJob(REQUEST)).rejects.toMatchObject({
      code: 'keyframe-timeout',
      retryable: true,
    })
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not submit when the client aborts after the keyframe', async () => {
    const controller = new AbortController()
    const { orchestrator, submit } = createOrchestrator({
      httpHandler: async () => {
        controller.abort()
        return fluxDev
      },
    })

    await expect(orchestrator.createVideoJob(REQUEST, controller.signal))
      .rejects.toMatchObject({ code: 'keyframe-timeout' })
    expect(submit).not.toHaveBeenCalled()
  })

  it('passes the signal to the queue submission', async () => {
    const controller = new AbortController()
    const { orchestrator, submit } = createOrchestrator()

    await orchestrator.createVideoJob(REQUEST, controller.signal)

    expect(submit.mock.calls[0]?.[2]).toBe(controller.signal)
  })

  it('clamps pollAfterMs between 1 and 10 seconds', async () => {
    for (const [value, expected] of [
      [50, 1_000],
      [2_500, 2_500],
      [60_000, 10_000],
    ] as const) {
      const { orchestrator } = createOrchestrator({ pollAfterMs: value })
      const job = await orchestrator.createVideoJob(REQUEST)
      expect(job.pollAfterMs).toBe(expected)
    }
  })

  it('parses the video output through the preset adapter', () => {
    const { orchestrator } = createOrchestrator()

    expect(orchestrator.parseVideoOutput('fast', minimax, 6)).toEqual({
      videoUrl: 'https://v3.fal.media/files/test/minimax-video.mp4',
      width: 1080,
      height: 1920,
    })
  })
})
