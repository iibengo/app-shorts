import type { FalQueueService } from '../fal/queue-service'
import { FluxImageAdapter } from '../fal/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../fal/adapters/flux-kontext-adapter'
import type { KeyframeAdapter } from '../fal/adapters/types'
import { StoryError, toStoryError } from './errors'
import type { SceneRecord, StoryRecord } from './repository'
import {
  storyBeatForScene,
  storyPromptComposer,
} from './story-prompt-composer'

export {
  storyKeyframeFluxPrompt,
  storyKeyframeKontextPrompt,
} from './story-prompt-composer'

export interface ProviderSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type KeyframePollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly keyframeUrl: string }

export interface KeyframeOrchestrator {
  submit(scene: SceneRecord, story: StoryRecord): Promise<ProviderSubmission>
  poll(scene: SceneRecord): Promise<KeyframePollResult>
  cancel(scene: SceneRecord): Promise<void>
}

export class NativeKeyframeOrchestrator implements KeyframeOrchestrator {
  private readonly queue: FalQueueService
  private readonly flux: KeyframeAdapter
  private readonly kontext: KeyframeAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.flux = new FluxImageAdapter()
    this.kontext = new FluxKontextAdapter()
  }

  async submit(scene: SceneRecord, story: StoryRecord): Promise<ProviderSubmission> {
    const adapter = this.selectAdapter(story)
    const beat = storyBeatForScene(
      story.plan,
      {
        order: scene.order,
        visualPrompt: scene.visualPrompt,
        narration: scene.narration,
      },
      story.scenes.length,
    )
    const composed = storyPromptComposer.composeKeyframe({
      bible: story.plan?.storyBible ?? null,
      beat,
      hasReference: story.referenceUrl !== null,
    })

    try {
      const submission = await this.queue.submit(
        adapter.modelId,
        adapter.buildInput({
          prompt: composed.prompt,
          referenceUrl: story.referenceUrl,
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

  async poll(scene: SceneRecord): Promise<KeyframePollResult> {
    if (
      !scene.keyframeRequestId
      || !scene.keyframeStatusUrl
      || !scene.keyframeResponseUrl
    ) {
      throw new StoryError('scene-not-ready')
    }

    try {
      const status = await this.queue.getStatus(scene.keyframeStatusUrl)

      if (status.status === 'IN_QUEUE') {
        return { state: 'IN_QUEUE' }
      }

      if (status.status === 'IN_PROGRESS') {
        return { state: 'IN_PROGRESS' }
      }

      const payload = await this.queue.getResult(scene.keyframeResponseUrl)
      const output = this.flux.parseOutput(payload)

      return { state: 'COMPLETED', keyframeUrl: output.imageUrl }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async cancel(scene: SceneRecord): Promise<void> {
    if (!scene.keyframeCancelUrl) {
      return
    }

    try {
      await this.queue.cancel(scene.keyframeCancelUrl)
    } catch (error) {
      throw toStoryError(error)
    }
  }

  private selectAdapter(story: StoryRecord): KeyframeAdapter {
    return story.referenceUrl ? this.kontext : this.flux
  }
}

export function createKeyframeOrchestrator(queue: FalQueueService): KeyframeOrchestrator {
  return new NativeKeyframeOrchestrator(queue)
}
