import type { StoryPreset } from '~/models/story'
import { KlingVideoAdapter } from '../fal/adapters/kling-video-adapter'
import { MinimaxVideoAdapter } from '../fal/adapters/minimax-video-adapter'
import type { VideoAdapter } from '../fal/adapters/types'
import type { FalQueueService } from '../fal/queue-service'
import type { ComposerEndpointId } from '../fal/types'
import { StoryError, toStoryError } from './errors'
import type { ReelSceneRecord, ReelShotRecord, ReelStoryRecord } from './reel-repository'
import { storyBeatForShot } from './shot-keyframe-orchestrator'
import {
  STORY_VIDEO_PROMPT_MAX_LENGTH,
  storyPromptComposer,
  storyVideoLegacyPrompt,
} from './story-prompt-composer'

const VIDEO_ENDPOINTS: Readonly<Record<StoryPreset, ComposerEndpointId>> = {
  fast: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
  quality: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
}

function providerClipSeconds(preset: StoryPreset): 5 | 6 {
  return preset === 'quality' ? 5 : 6
}

export interface ShotVideoProviderSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type ShotVideoPollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly videoUrl: string }

export interface ShotVideoOrchestrator {
  submit(
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
    story: ReelStoryRecord,
  ): Promise<ShotVideoProviderSubmission>
  poll(shot: ReelShotRecord): Promise<ShotVideoPollResult>
  cancel(shot: ReelShotRecord): Promise<void>
}

function compactPrompt(prompt: string): string {
  if (prompt.length <= STORY_VIDEO_PROMPT_MAX_LENGTH) return prompt

  return prompt.slice(0, STORY_VIDEO_PROMPT_MAX_LENGTH - 1).trimEnd()
}

export class NativeShotVideoOrchestrator implements ShotVideoOrchestrator {
  private readonly queue: FalQueueService
  private readonly minimax: VideoAdapter
  private readonly kling: VideoAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.minimax = new MinimaxVideoAdapter()
    this.kling = new KlingVideoAdapter()
  }

  async submit(
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
    story: ReelStoryRecord,
  ): Promise<ShotVideoProviderSubmission> {
    if (!shot.keyframeUrl) throw new StoryError('shot-not-found')

    try {
      const adapter = story.preset === 'quality' ? this.kling : this.minimax
      const beat = storyBeatForShot(shot, scene)
      let prompt: string
      let negativePrompt: string

      try {
        const composed = storyPromptComposer.composeVideo({
          bible: story.plan.storyBible,
          beat,
          preset: story.preset,
          visualStyle: story.visualStyle,
        })
        prompt = compactPrompt(composed.prompt)
        negativePrompt = composed.negativePrompt
      } catch (error) {
        if (!(error instanceof StoryError) || error.code !== 'invalid-visual-prompt') {
          throw error
        }

        prompt = compactPrompt(storyVideoLegacyPrompt(shot.visualPrompt))
        negativePrompt = 'blur, distortion, flicker, text, watermark, logo, low quality'
      }

      if (prompt.length > STORY_VIDEO_PROMPT_MAX_LENGTH) {
        throw new StoryError('invalid-visual-prompt')
      }

      const submission = await this.queue.submit(
        VIDEO_ENDPOINTS[story.preset],
        adapter.buildInput({
          prompt,
          keyframeUrl: shot.keyframeUrl,
          durationSeconds: providerClipSeconds(story.preset),
          ...(story.preset === 'quality' ? { negativePrompt } : {}),
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

  async poll(shot: ReelShotRecord): Promise<ShotVideoPollResult> {
    if (!shot.videoRequestId || !shot.videoStatusUrl || !shot.videoResponseUrl) {
      throw new StoryError('shot-not-found')
    }

    try {
      const status = await this.queue.getStatus(shot.videoStatusUrl)

      if (status.status === 'IN_QUEUE') return { state: 'IN_QUEUE' }
      if (status.status === 'IN_PROGRESS') return { state: 'IN_PROGRESS' }

      const payload = await this.queue.getResult(shot.videoResponseUrl)
      const output = this.minimax.parseOutput(payload, 6)

      return { state: 'COMPLETED', videoUrl: output.videoUrl }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async cancel(shot: ReelShotRecord): Promise<void> {
    if (!shot.videoCancelUrl) return

    try {
      await this.queue.cancel(shot.videoCancelUrl)
    } catch (error) {
      throw toStoryError(error)
    }
  }
}

export function createShotVideoOrchestrator(
  queue: FalQueueService,
): ShotVideoOrchestrator {
  return new NativeShotVideoOrchestrator(queue)
}
