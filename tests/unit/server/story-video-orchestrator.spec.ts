// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerError } from '../../../server/shared/errors'
import { StoryError } from '../../../server/story/errors'
import {
  NativeVideoOrchestrator,
  createVideoOrchestrator,
  storyVideoPrompt,
} from '../../../server/story/video-orchestrator'
import type { FalQueueService } from '../../../server/fal/queue-service'
import { makeSceneRecord, makeStoryRecord } from '../../helpers/story'
import {
  storyBeatForScene,
  storyPromptComposer,
} from '../../../server/story/story-prompt-composer'
import minimaxResult from '../../fixtures/fal/minimax-result.json'

const KEYFRAME = 'https://v3.fal.media/files/test/keyframe.jpeg'
const VISUAL_PROMPT = 'Una repostera abre el obrador al amanecer con luz cálida.'

function fakeQueue() {
  const submit = vi.fn(async () => ({
    requestId: 'request-1',
    statusUrl: 'https://queue.fal.run/requests/request-1/status',
    responseUrl: 'https://queue.fal.run/requests/request-1',
    cancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
  }))
  const getStatus = vi.fn(async () => ({ status: 'IN_QUEUE' as const, queuePosition: 1 }))
  const getResult = vi.fn(async () => minimaxResult)
  const cancel = vi.fn(async () => undefined)
  const queue = { submit, getStatus, getResult, cancel } as unknown as FalQueueService

  return { queue, submit, getStatus, getResult, cancel }
}

function scene(overrides: Parameters<typeof makeSceneRecord>[0]) {
  return makeSceneRecord(overrides)
}

function pendingScene(overrides: Partial<Parameters<typeof makeSceneRecord>[0]> = {}) {
  return scene({
    order: 1,
    status: 'VIDEO_QUEUED',
    keyframeUrl: KEYFRAME,
    keyframeAttempts: 1,
    videoAttempts: 1,
    videoRequestId: 'request-1',
    videoStatusUrl: 'https://queue.fal.run/requests/request-1/status',
    videoResponseUrl: 'https://queue.fal.run/requests/request-1',
    ...overrides,
  })
}

describe('storyVideoPrompt', () => {
  it('composes the normative template without narration', () => {
    expect(storyVideoPrompt(VISUAL_PROMPT)).toBe(
      `${VISUAL_PROMPT}. Vertical 9:16 short film scene, smooth natural motion, consistent subject, no text, no watermark, no logo.`,
    )
  })
})

describe('NativeVideoOrchestrator.submit', () => {
  it('uses MiniMax with a 6 second request for the fast preset', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)
    const story = makeStoryRecord({ preset: 'fast' })
    const target = scene({ order: 1, keyframeUrl: KEYFRAME, visualPrompt: VISUAL_PROMPT })
    const composed = storyPromptComposer.composeVideo({
      bible: story.plan?.storyBible ?? null,
      beat: storyBeatForScene(story.plan, target),
      preset: 'fast',
    })

    const submission = await orchestrator.submit(target, story)

    expect(submit).toHaveBeenCalledWith(
      'fal-ai/minimax/hailuo-02/standard/image-to-video',
      {
        prompt: composed.prompt,
        image_url: KEYFRAME,
        duration: '6',
        resolution: '768P',
        prompt_optimizer: false,
      },
    )
    expect(submission).toEqual({
      requestId: 'request-1',
      statusUrl: 'https://queue.fal.run/requests/request-1/status',
      responseUrl: 'https://queue.fal.run/requests/request-1',
      cancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
    })

    const input = submit.mock.calls[0]?.[1] as { readonly prompt: string }

    expect(input.prompt.length).toBeLessThanOrEqual(2_000)
  })

  it('uses Kling with its native 10 second duration for the quality preset', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)
    const story = makeStoryRecord({ preset: 'quality' })
    const target = scene({ order: 1, keyframeUrl: KEYFRAME, visualPrompt: VISUAL_PROMPT })
    const composed = storyPromptComposer.composeVideo({
      bible: story.plan?.storyBible ?? null,
      beat: storyBeatForScene(story.plan, target),
      preset: 'quality',
    })

    await orchestrator.submit(target, story)

    expect(submit).toHaveBeenCalledWith(
      'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      {
        prompt: composed.prompt,
        image_url: KEYFRAME,
        duration: '10',
        negative_prompt: composed.negativePrompt,
        cfg_scale: 0.5,
      },
    )
  })

  it('uses the keyframe of the submitted scene only', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)
    const first = scene({ order: 1, keyframeUrl: 'https://v3.fal.media/files/test/first.jpeg' })
    const second = scene({ order: 2, keyframeUrl: 'https://v3.fal.media/files/test/second.jpeg' })

    await orchestrator.submit(second, makeStoryRecord())

    const input = submit.mock.calls[0]?.[1] as { image_url: string }

    expect(input.image_url).toBe(second.keyframeUrl)
    expect(input.image_url).not.toBe(first.keyframeUrl)
  })

  it('never sends the narration to the provider', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)
    const target = scene({
      order: 1,
      keyframeUrl: KEYFRAME,
      visualPrompt: VISUAL_PROMPT,
      narration: 'Una narración que solo debe leerse en pantalla.',
    })

    await orchestrator.submit(target, makeStoryRecord())

    expect(JSON.stringify(submit.mock.calls[0]?.[1])).not.toContain(target.narration)
  })

  it('rejects a scene without a keyframe', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)

    try {
      await orchestrator.submit(scene({ order: 1, keyframeUrl: null }), makeStoryRecord())
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('scene-not-ready')
    }

    expect(submit).not.toHaveBeenCalled()
  })

  it('translates provider errors preserving retryAfter', async () => {
    const { queue, submit } = fakeQueue()
    submit.mockRejectedValueOnce(new ComposerError('provider-busy', { retryAfterSeconds: 4 }))
    const orchestrator = new NativeVideoOrchestrator(queue)

    try {
      await orchestrator.submit(
        scene({ order: 1, keyframeUrl: KEYFRAME }),
        makeStoryRecord(),
      )
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('provider-busy')
      expect((error as StoryError).retryAfterSeconds).toBe(4)
    }
  })

  it('creates an orchestrator through the factory', () => {
    const { queue } = fakeQueue()

    expect(createVideoOrchestrator(queue)).toBeInstanceOf(NativeVideoOrchestrator)
  })
})

describe('NativeVideoOrchestrator.poll', () => {
  it.each([
    ['IN_QUEUE', { state: 'IN_QUEUE' }],
    ['IN_PROGRESS', { state: 'IN_PROGRESS' }],
  ] as const)('maps provider status %s', async (status, expected) => {
    const { queue, getStatus } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status, queuePosition: null })
    const orchestrator = new NativeVideoOrchestrator(queue)

    await expect(orchestrator.poll(pendingScene())).resolves.toEqual(expected)
  })

  it('parses the completed video output', async () => {
    const { queue, getStatus, getResult } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status: 'COMPLETED', queuePosition: null })
    const orchestrator = new NativeVideoOrchestrator(queue)

    await expect(orchestrator.poll(pendingScene())).resolves.toEqual({
      state: 'COMPLETED',
      videoUrl: 'https://v3.fal.media/files/test/minimax-video.mp4',
    })
    expect(getResult).toHaveBeenCalledWith('https://queue.fal.run/requests/request-1')
  })

  it('rejects an incomplete scene record', async () => {
    const { queue, getStatus } = fakeQueue()
    const orchestrator = new NativeVideoOrchestrator(queue)

    try {
      await orchestrator.poll(scene({ order: 1, status: 'VIDEO_QUEUED' }))
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('scene-not-ready')
    }

    expect(getStatus).not.toHaveBeenCalled()
  })

  it('translates invalid provider output', async () => {
    const { queue, getStatus, getResult } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status: 'COMPLETED', queuePosition: null })
    getResult.mockResolvedValueOnce({ video: null })
    const orchestrator = new NativeVideoOrchestrator(queue)

    try {
      await orchestrator.poll(pendingScene())
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('provider-invalid-output')
    }
  })

  it('rejects a provider video URL outside the CDN allowlist', async () => {
    const { queue, getStatus, getResult } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status: 'COMPLETED', queuePosition: null })
    getResult.mockResolvedValueOnce({
      video: { url: 'https://evil.example/video.mp4' },
    })
    const orchestrator = new NativeVideoOrchestrator(queue)

    try {
      await orchestrator.poll(pendingScene())
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('provider-invalid-output')
    }
  })
})

describe('NativeVideoOrchestrator.cancel', () => {
  it('does nothing without a cancel URL', async () => {
    const { queue, cancel } = fakeQueue()

    await new NativeVideoOrchestrator(queue).cancel(pendingScene({ videoCancelUrl: null }))

    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels using the exact provider URL', async () => {
    const { queue, cancel } = fakeQueue()

    await new NativeVideoOrchestrator(queue).cancel(
      pendingScene({ videoCancelUrl: 'https://queue.fal.run/requests/request-1/cancel' }),
    )

    expect(cancel).toHaveBeenCalledWith('https://queue.fal.run/requests/request-1/cancel')
  })

  it('translates a cancel failure', async () => {
    const { queue, cancel } = fakeQueue()
    cancel.mockRejectedValueOnce(new ComposerError('cancel-failed'))

    try {
      await new NativeVideoOrchestrator(queue).cancel(
        pendingScene({ videoCancelUrl: 'https://queue.fal.run/requests/request-1/cancel' }),
      )
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('cancel-failed')
    }
  })
})
