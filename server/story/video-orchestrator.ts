import type { StoryPreset } from '~/models/story'
import { KlingVideoAdapter } from '../fal/adapters/kling-video-adapter'
import { MinimaxVideoAdapter } from '../fal/adapters/minimax-video-adapter'
import type { VideoAdapter } from '../fal/adapters/types'
import type { FalQueueService } from '../fal/queue-service'
import type { ComposerEndpointId } from '../fal/types'
import { StoryError, toStoryError } from './errors'
import type { SceneRecord, StoryRecord } from './repository'

export interface VideoProviderSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type VideoPollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly videoUrl: string }

export interface VideoOrchestrator {
  submit(scene: SceneRecord, story: StoryRecord): Promise<VideoProviderSubmission>
  poll(scene: SceneRecord): Promise<VideoPollResult>
  cancel(scene: SceneRecord): Promise<void>
}

const VIDEO_ENDPOINTS: Readonly<Record<StoryPreset, ComposerEndpointId>> = {
  fast: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
  quality: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
}

const STORY_VIDEO_DURATION = 6

export function storyVideoPrompt(visualPrompt: string): string {
  return `${visualPrompt}. Vertical 9:16 short film scene, smooth natural motion, consistent subject, no text, no watermark, no logo.`
}

export class NativeVideoOrchestrator implements VideoOrchestrator {
  private readonly queue: FalQueueService
  private readonly minimax: VideoAdapter
  private readonly kling: VideoAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.minimax = new MinimaxVideoAdapter()
    this.kling = new KlingVideoAdapter()
  }

  async submit(scene: SceneRecord, story: StoryRecord): Promise<VideoProviderSubmission> {
    if (!scene.keyframeUrl) {
      throw new StoryError('scene-not-ready')
    }

    try {
      const adapter = this.adapterFor(story.preset)
      const submission = await this.queue.submit(
        VIDEO_ENDPOINTS[story.preset],
        adapter.buildInput({
          prompt: storyVideoPrompt(scene.visualPrompt),
          keyframeUrl: scene.keyframeUrl,
          durationSeconds: STORY_VIDEO_DURATION,
        }),
      )

      return {
        requestId: submission.requestId,
        statusUrl: submission.statusUrl,
        responseUrl: submission.responseUrl,
        cancelUrl: submission.cancelUrl,
      }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async poll(scene: SceneRecord): Promise<VideoPollResult> {
    if (!scene.videoRequestId || !scene.videoStatusUrl || !scene.videoResponseUrl) {
      throw new StoryError('scene-not-ready')
    }

    try {
      const status = await this.queue.getStatus(scene.videoStatusUrl)

      if (status.status === 'IN_QUEUE') {
        return { state: 'IN_QUEUE' }
      }

      if (status.status === 'IN_PROGRESS') {
        return { state: 'IN_PROGRESS' }
      }

      const payload = await this.queue.getResult(scene.videoResponseUrl)

      // MiniMax and Kling share the same output contract for `video.url`.
      const output = this.minimax.parseOutput(payload, STORY_VIDEO_DURATION)

      return { state: 'COMPLETED', videoUrl: output.videoUrl }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async cancel(scene: SceneRecord): Promise<void> {
    if (!scene.videoCancelUrl) {
      return
    }

    try {
      await this.queue.cancel(scene.videoCancelUrl)
    } catch (error) {
      throw toStoryError(error)
    }
  }

  private adapterFor(preset: StoryPreset): VideoAdapter {
    return preset === 'quality' ? this.kling : this.minimax
  }
}

export function createVideoOrchestrator(queue: FalQueueService): VideoOrchestrator {
  return new NativeVideoOrchestrator(queue)
}
