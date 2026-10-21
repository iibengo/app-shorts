// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ComposerError } from '../../../server/shared/errors'
import { StoryError } from '../../../server/story/errors'
import {
  NativeKeyframeOrchestrator,
  createKeyframeOrchestrator,
  storyKeyframeFluxPrompt,
  storyKeyframeKontextPrompt,
} from '../../../server/story/keyframe-orchestrator'
import type { FalQueueService } from '../../../server/fal/queue-service'
import { makeSceneRecord, makeStoryRecord } from '../../helpers/story'
import {
  storyBeatForScene,
  storyPromptComposer,
} from '../../../server/story/story-prompt-composer'
import fluxDev from '../../fixtures/fal/flux-dev-result.json'

const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'
const VISUAL_PROMPT = 'Una repostera abre el obrador al amanecer con luz cálida.'

function fakeQueue() {
  const submit = vi.fn(async () => ({
    requestId: 'request-1',
    statusUrl: 'https://queue.fal.run/requests/request-1/status',
    responseUrl: 'https://queue.fal.run/requests/request-1',
    cancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
  }))
  const getStatus = vi.fn(async () => ({ status: 'IN_QUEUE' as const, queuePosition: 1 }))
  const getResult = vi.fn(async () => fluxDev)
  const cancel = vi.fn(async () => undefined)

  const queue = { submit, getStatus, getResult, cancel } as unknown as FalQueueService

  return { queue, submit, getStatus, getResult, cancel }
}

function scene(overrides: Parameters<typeof makeSceneRecord>[0]) {
  return makeSceneRecord(overrides)
}

describe('keyframe prompt templates', () => {
  it('composes the normative FLUX dev template', () => {
    expect(storyKeyframeFluxPrompt(VISUAL_PROMPT)).toBe(
      `Cinematic vertical 9:16 keyframe for a short film. ${VISUAL_PROMPT}. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.`,
    )
  })

  it('composes the normative Kontext template', () => {
    expect(storyKeyframeKontextPrompt(VISUAL_PROMPT)).toBe(
      `Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short film. ${VISUAL_PROMPT}. Preserve subject identity, clothing and color palette. No text, no watermark, no logo.`,
    )
  })
})

describe('NativeKeyframeOrchestrator.submit', () => {
  it('uses FLUX dev with the exact input when there is no reference', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)
    const story = makeStoryRecord({ referenceUrl: null })
    const target = scene({ order: 1, visualPrompt: VISUAL_PROMPT })
    const beat = storyBeatForScene(story.plan, target)
    const expectedPrompt = storyPromptComposer.composeKeyframe({
      bible: story.plan?.storyBible ?? null,
      beat,
      hasReference: false,
    }).prompt

    const submission = await orchestrator.submit(target, story)

    expect(submit).toHaveBeenCalledWith('fal-ai/flux/dev', {
      prompt: expectedPrompt,
      image_size: { width: 1152, height: 2048 },
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    })
    expect(submission).toEqual({
      requestId: 'request-1',
      statusUrl: 'https://queue.fal.run/requests/request-1/status',
      responseUrl: 'https://queue.fal.run/requests/request-1',
      cancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
    })
  })

  it('uses Kontext with the reference when the story has one', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)
    const story = makeStoryRecord({
      referenceUrl: REFERENCE,
      referenceExpiresAt: new Date(Date.now() + 3_600_000),
    })

    const target = scene({ order: 2, visualPrompt: VISUAL_PROMPT })
    const beat = storyBeatForScene(story.plan, target)
    const expectedPrompt = storyPromptComposer.composeKeyframe({
      bible: story.plan?.storyBible ?? null,
      beat,
      hasReference: true,
    }).prompt

    await orchestrator.submit(target, story)

    expect(submit).toHaveBeenCalledWith('fal-ai/flux-pro/kontext', {
      prompt: expectedPrompt,
      image_url: REFERENCE,
      aspect_ratio: '9:16',
      output_format: 'jpeg',
      safety_tolerance: '2',
    })
  })

  it('does not send the narration or provider internals', async () => {
    const { queue, submit } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)
    const target = scene({
      order: 1,
      visualPrompt: VISUAL_PROMPT,
      narration: 'Una narración secreta que no debe viajar al proveedor.',
    })

    await orchestrator.submit(target, makeStoryRecord())

    const payload = JSON.stringify(submit.mock.calls[0]?.[1])

    expect(payload).not.toContain(target.narration)
    expect(payload).not.toContain('statusUrl')
    expect(payload).not.toContain('requestId')
  })

  it('translates a ComposerError into a StoryError preserving retryAfter', async () => {
    const { queue, submit } = fakeQueue()
    submit.mockRejectedValueOnce(new ComposerError('provider-busy', { retryAfterSeconds: 6 }))
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    try {
      await orchestrator.submit(scene({ order: 1 }), makeStoryRecord())
      throw new Error('expected a failure')
    } catch (error) {
      expect(error).toBeInstanceOf(StoryError)
      expect((error as StoryError).code).toBe('provider-busy')
      expect((error as StoryError).retryAfterSeconds).toBe(6)
      expect((error as StoryError).status).toBe(503)
    }
  })

  it('creates an orchestrator through the factory', () => {
    const { queue } = fakeQueue()

    expect(createKeyframeOrchestrator(queue)).toBeInstanceOf(NativeKeyframeOrchestrator)
  })
})

describe('NativeKeyframeOrchestrator.poll', () => {
  it.each([
    ['IN_QUEUE', { state: 'IN_QUEUE' }],
    ['IN_PROGRESS', { state: 'IN_PROGRESS' }],
  ] as const)('maps provider status %s', async (status, expected) => {
    const { queue, getStatus } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status, queuePosition: null })
    const orchestrator = new NativeKeyframeOrchestrator(queue)
    const target = scene({
      order: 1,
      status: 'KEYFRAME_QUEUED',
      keyframeRequestId: 'request-1',
      keyframeStatusUrl: 'https://queue.fal.run/requests/request-1/status',
      keyframeResponseUrl: 'https://queue.fal.run/requests/request-1',
    })

    await expect(orchestrator.poll(target)).resolves.toEqual(expected)
  })

  it('parses the completed keyframe output', async () => {
    const { queue, getStatus, getResult } = fakeQueue()
    getStatus.mockResolvedValueOnce({ status: 'COMPLETED', queuePosition: null })
    const orchestrator = new NativeKeyframeOrchestrator(queue)
    const target = scene({
      order: 1,
      status: 'KEYFRAME_RUNNING',
      keyframeRequestId: 'request-1',
      keyframeStatusUrl: 'https://queue.fal.run/requests/request-1/status',
      keyframeResponseUrl: 'https://queue.fal.run/requests/request-1',
    })

    await expect(orchestrator.poll(target)).resolves.toEqual({
      state: 'COMPLETED',
      keyframeUrl: 'https://v3.fal.media/files/test/keyframe-flux.jpeg',
    })
    expect(getResult).toHaveBeenCalledWith(
      'https://queue.fal.run/requests/request-1',
    )
  })

  it('rejects an incomplete scene record', async () => {
    const { queue } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    try {
      await orchestrator.poll(scene({ order: 1, status: 'KEYFRAME_QUEUED' }))
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('scene-not-ready')
    }
  })

  it('translates invalid provider output and content blocks', async () => {
    for (const [payload, code] of [
      [{ images: [] }, 'provider-invalid-output'],
      [{ images: [{ url: 'https://v3.fal.media/files/test/a.jpeg' }], has_nsfw_concepts: [true] }, 'content-blocked'],
    ] as const) {
      const { queue, getStatus, getResult } = fakeQueue()
      getStatus.mockResolvedValueOnce({ status: 'COMPLETED', queuePosition: null })
      getResult.mockResolvedValueOnce(payload)
      const orchestrator = new NativeKeyframeOrchestrator(queue)

      try {
        await orchestrator.poll(scene({
          order: 1,
          status: 'KEYFRAME_RUNNING',
          keyframeRequestId: 'request-1',
          keyframeStatusUrl: 'https://queue.fal.run/requests/request-1/status',
          keyframeResponseUrl: 'https://queue.fal.run/requests/request-1',
        }))
        throw new Error('expected a failure')
      } catch (error) {
        expect((error as StoryError).code).toBe(code)
      }
    }
  })

  it('translates a polling transport failure', async () => {
    const { queue, getStatus } = fakeQueue()
    getStatus.mockRejectedValueOnce(new ComposerError('provider-error'))
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    try {
      await orchestrator.poll(scene({
        order: 1,
        status: 'KEYFRAME_QUEUED',
        keyframeRequestId: 'request-1',
        keyframeStatusUrl: 'https://queue.fal.run/requests/request-1/status',
        keyframeResponseUrl: 'https://queue.fal.run/requests/request-1',
      }))
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('provider-error')
    }
  })
})

describe('NativeKeyframeOrchestrator.cancel', () => {
  it('does nothing without a cancel URL', async () => {
    const { queue, cancel } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    await orchestrator.cancel(scene({ order: 1, status: 'KEYFRAME_QUEUED' }))

    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels using the exact provider URL', async () => {
    const { queue, cancel } = fakeQueue()
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    await orchestrator.cancel(scene({
      order: 1,
      status: 'KEYFRAME_QUEUED',
      keyframeCancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
    }))

    expect(cancel).toHaveBeenCalledWith('https://queue.fal.run/requests/request-1/cancel')
  })

  it('translates a cancel failure', async () => {
    const { queue, cancel } = fakeQueue()
    cancel.mockRejectedValueOnce(new ComposerError('cancel-failed'))
    const orchestrator = new NativeKeyframeOrchestrator(queue)

    try {
      await orchestrator.cancel(scene({
        order: 1,
        status: 'KEYFRAME_QUEUED',
        keyframeCancelUrl: 'https://queue.fal.run/requests/request-1/cancel',
      }))
      throw new Error('expected a failure')
    } catch (error) {
      expect((error as StoryError).code).toBe('cancel-failed')
    }
  })
})
