import { describe, expect, it } from 'vitest'
import type { FalQueueService } from '../../../server/fal/queue-service'
import type { ComposerEndpointId } from '../../../server/fal/types'
import {
  createShotKeyframeOrchestrator,
  storyBeatForShot,
} from '../../../server/story/shot-keyframe-orchestrator'
import { createShotVideoOrchestrator } from '../../../server/story/shot-video-orchestrator'
import {
  KEYFRAME_PROMPT_MAX_CHARS,
  composeKeyframe,
} from '../../../server/story/story-prompt-composer'
import { makeReelNarrative, makeReelShotList } from '../../helpers/reel-fixtures'
import { FakeReelStoryRepository } from '../../helpers/story-reel'

const NOW = new Date('2026-10-22T12:00:00.000Z')

class FakeQueue implements FalQueueService {
  readonly submissions: { endpoint: ComposerEndpointId; input: unknown }[] = []

  async submit(endpointId: ComposerEndpointId, input: unknown) {
    this.submissions.push({ endpoint: endpointId, input })
    return {
      requestId: 'request-1',
      statusUrl: 'https://queue.fal.run/test/request-1/status',
      responseUrl: 'https://queue.fal.run/test/request-1',
      cancelUrl: 'https://queue.fal.run/test/request-1/cancel',
    }
  }

  async getStatus() {
    return { status: 'COMPLETED' as const, queuePosition: null }
  }

  async getResult(url: string) {
    if (url.includes('video')) {
      return { video: { url: 'https://v3.fal.media/files/test/video.mp4' } }
    }

    return {
      images: [{
        url: 'https://v3.fal.media/files/test/image.jpg',
        width: 1152,
        height: 2048,
      }],
    }
  }

  async cancel(): Promise<void> {}
}

async function record(preset: 'fast' | 'quality' = 'fast') {
  const fixture = makeReelNarrative('standard', 30, false)
  const repository = new FakeReelStoryRepository()
  const story = await repository.createStory({
    sessionId: 'story-session-orchestrator',
    status: 'GENERATING_KEYFRAMES',
    premise: fixture.canon.logline,
    title: fixture.canon.title,
    logline: fixture.canon.logline,
    referenceUrl: null,
    referenceExpiresAt: null,
    preset,
    mode: 'faithful',
    platform: 'tiktok',
    costMode: 'standard',
    targetDurationSeconds: 30,
    maxDurationSeconds: 30,
    plan: fixture.narrative,
    shotPlan: makeReelShotList(fixture.narrative, fixture.plan),
    idempotencyKey: null,
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  })
  const shot = story.shots[0]!
  const scene = story.scenes.find((item) => item.id === shot.sceneId)!

  return { story, shot, scene }
}

describe('shot orchestrators', () => {
  it('bounds a huge canon instead of failing or truncating the shot text', async () => {
    const ctx = await record()
    const beat = storyBeatForShot(ctx.shot, ctx.scene)
    const giantBible = {
      ...ctx.story.plan.storyBible!,
      style: 'Estilo visual detallado '.repeat(300),
      theme: 'Tema narrativo larguisimo '.repeat(200),
    }

    const constrained = composeKeyframe({
      bible: giantBible,
      beat,
      hasReference: false,
      maxLength: 4_000,
    })

    expect(constrained.prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
    expect(constrained.prompt).not.toContain('Estilo visual detallado Estilo visual detallado Estilo visual detallado Estilo visual detallado')

    const queue = new FakeQueue()
    const orchestrator = createShotKeyframeOrchestrator(queue)
    const story = {
      ...ctx.story,
      plan: { ...ctx.story.plan, storyBible: giantBible },
    }

    const submission = await orchestrator.submit(ctx.shot, ctx.scene, story)
    expect(submission.requestId).toBe('request-1')
    expect(queue.submissions).toHaveLength(1)
  })

  it('submits a keyframe for the shot prompt', async () => {
    const queue = new FakeQueue()
    const ctx = await record()
    const orchestrator = createShotKeyframeOrchestrator(queue)
    const submission = await orchestrator.submit(ctx.shot, ctx.scene, ctx.story)
    const input = queue.submissions[0]?.input as {
      readonly prompt: string
      readonly image_size: { readonly width: number; readonly height: number }
    }

    expect(submission.requestId).toBe('request-1')
    expect(queue.submissions[0]?.endpoint).toBe('fal-ai/flux/dev')
    expect(input.image_size).toEqual({ width: 1152, height: 2048 })
    expect(input.prompt.length).toBeLessThanOrEqual(KEYFRAME_PROMPT_MAX_CHARS)
    expect(input.prompt).toContain(ctx.shot.visualPrompt.slice(0, 20))

    const poll = await orchestrator.poll({
      ...ctx.shot,
      keyframeRequestId: submission.requestId,
      keyframeStatusUrl: submission.statusUrl,
      keyframeResponseUrl: submission.responseUrl,
    })
    expect(poll).toEqual({
      state: 'COMPLETED',
      keyframeUrl: 'https://v3.fal.media/files/test/image.jpg',
    })
  })

  it('submits a compact video prompt ≤ 2000 chars for fast and quality', async () => {
    for (const preset of ['fast', 'quality'] as const) {
      const queue = new FakeQueue()
      const ctx = await record(preset)
      const shot = {
        ...ctx.shot,
        keyframeUrl: 'https://v3.fal.media/files/test/kf.jpg',
      }
      const orchestrator = createShotVideoOrchestrator(queue)
      const submission = await orchestrator.submit(shot, ctx.scene, ctx.story)
      const input = queue.submissions[0]?.input as {
        readonly prompt: string
        readonly image_url: string
        readonly duration: string
      }

      expect(submission.requestId).toBe('request-1')
      expect(queue.submissions[0]?.endpoint).toBe(
        preset === 'quality'
          ? 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
          : 'fal-ai/minimax/hailuo-02/standard/image-to-video',
      )
      expect(input.image_url).toBe(shot.keyframeUrl)
      expect(input.duration).toBe(preset === 'quality' ? '5' : '6')
      expect(input.prompt.length).toBeLessThanOrEqual(2_000)

      const poll = await orchestrator.poll({
        ...shot,
        videoRequestId: submission.requestId,
        videoStatusUrl: submission.statusUrl,
        videoResponseUrl: `${submission.responseUrl}?video=1`,
      })
      expect(poll).toEqual({
        state: 'COMPLETED',
        videoUrl: 'https://v3.fal.media/files/test/video.mp4',
      })
    }
  })
})
