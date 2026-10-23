import type { StoryBeat } from '~/models/story'
import type { FalQueueService } from '../fal/queue-service'
import { FluxImageAdapter } from '../fal/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../fal/adapters/flux-kontext-adapter'
import type { KeyframeAdapter } from '../fal/adapters/types'
import { StoryError, toStoryError } from './errors'
import type { ReelSceneRecord, ReelShotRecord, ReelStoryRecord } from './reel-repository'
import {
  STORY_PROMPT_MAX_LENGTH,
  storyPromptComposer,
} from './story-prompt-composer'

export interface ShotProviderSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type ShotKeyframePollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly keyframeUrl: string }

export interface ShotKeyframeOrchestrator {
  submit(
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
    story: ReelStoryRecord,
  ): Promise<ShotProviderSubmission>
  poll(shot: ReelShotRecord): Promise<ShotKeyframePollResult>
  cancel(shot: ReelShotRecord): Promise<void>
}

export function storyBeatForShot(
  shot: ReelShotRecord,
  scene: ReelSceneRecord,
): StoryBeat {
  const narrative = scene.scene

  return {
    order: shot.order,
    sceneRole: narrative?.sceneRole ?? 'development',
    locationId: shot.locationId,
    timeOfDay: narrative?.timeOfDay ?? 'morning',
    weather: narrative?.weather ?? 'clear',
    characters: narrative?.characters ?? [],
    props: narrative?.props ?? [],
    action: shot.action,
    narration: narrative?.narration ?? scene.narration,
    storyFunction: narrative?.storyFunction ?? 'complication',
    gag: narrative?.gag ?? null,
    visualPrompt: shot.visualPrompt,
    camera: shot.camera,
    continuityFromPrevious: narrative?.continuityFromPrevious ?? null,
    transition: 'cut',
    subject: shot.subject,
    framing: shot.framing,
  }
}

export class NativeShotKeyframeOrchestrator implements ShotKeyframeOrchestrator {
  private readonly queue: FalQueueService
  private readonly flux: KeyframeAdapter
  private readonly kontext: KeyframeAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.flux = new FluxImageAdapter()
    this.kontext = new FluxKontextAdapter()
  }

  async submit(
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
    story: ReelStoryRecord,
  ): Promise<ShotProviderSubmission> {
    const adapter = story.referenceUrl ? this.kontext : this.flux
    const beat = storyBeatForShot(shot, scene)
    const composed = storyPromptComposer.composeKeyframe({
      bible: story.plan.storyBible,
      beat,
      hasReference: story.referenceUrl !== null,
      visualStyle: story.visualStyle,
      maxLength: STORY_PROMPT_MAX_LENGTH,
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

  async poll(shot: ReelShotRecord): Promise<ShotKeyframePollResult> {
    if (
      !shot.keyframeRequestId
      || !shot.keyframeStatusUrl
      || !shot.keyframeResponseUrl
    ) {
      throw new StoryError('shot-not-found')
    }

    try {
      const status = await this.queue.getStatus(shot.keyframeStatusUrl)

      if (status.status === 'IN_QUEUE') return { state: 'IN_QUEUE' }
      if (status.status === 'IN_PROGRESS') return { state: 'IN_PROGRESS' }

      const payload = await this.queue.getResult(shot.keyframeResponseUrl)
      const output = this.flux.parseOutput(payload)

      return { state: 'COMPLETED', keyframeUrl: output.imageUrl }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async cancel(shot: ReelShotRecord): Promise<void> {
    if (!shot.keyframeCancelUrl) return

    try {
      await this.queue.cancel(shot.keyframeCancelUrl)
    } catch (error) {
      throw toStoryError(error)
    }
  }
}

export function createShotKeyframeOrchestrator(
  queue: FalQueueService,
): ShotKeyframeOrchestrator {
  return new NativeShotKeyframeOrchestrator(queue)
}
