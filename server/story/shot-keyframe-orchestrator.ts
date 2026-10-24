import type { StoryBeat, StoryCharacterSheet } from '~/models/story'
import type { FalQueueService } from '../fal/queue-service'
import { FluxImageAdapter } from '../fal/adapters/flux-image-adapter'
import { FluxKontextAdapter } from '../fal/adapters/flux-kontext-adapter'
import { FluxKontextMultiAdapter } from '../fal/adapters/flux-kontext-multi-adapter'
import { NanoBananaAdapter } from '../fal/adapters/nano-banana-adapter'
import type { KeyframeAdapter } from '../fal/adapters/types'
import { StoryError, toStoryError } from './errors'
import type { ReelSceneRecord, ReelShotRecord, ReelStoryRecord } from './reel-repository'
import {
  STORY_PROMPT_MAX_LENGTH,
  storyPromptComposer,
} from './story-prompt-composer'
import { selectKeyframeProvider } from './anchor-selection'
import { sheetUrls } from './character-sheet'

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
    /** Fresh sheet read in the same tick; never trust the record's copy. */
    characterSheet?: StoryCharacterSheet | null,
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
  private readonly kontextMulti: KeyframeAdapter
  private readonly nanoBanana: KeyframeAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.flux = new FluxImageAdapter()
    this.kontext = new FluxKontextAdapter()
    this.kontextMulti = new FluxKontextMultiAdapter()
    this.nanoBanana = new NanoBananaAdapter()
  }

  async submit(
    shot: ReelShotRecord,
    scene: ReelSceneRecord,
    story: ReelStoryRecord,
    characterSheet?: StoryCharacterSheet | null,
  ): Promise<ShotProviderSubmission> {
    const sheet = characterSheet ?? story.characterSheet
    // One reference frame per shot: several views, and above all a 2x2 sheet,
    // make the model copy the grid and return stacked panels, which the video
    // stage would animate as a split screen.
    // The user's own image is the reference for every shot: it already carries
    // the face and the look, and one image is also the only thing that does not
    // provoke grid output. The sheet stays as a stored fallback for photos that
    // still need a style conversion, but it never wins here.
    const provider = selectKeyframeProvider({
      characterSheet: null,
      userReferenceUrl: story.referenceUrl,
      presentCharacterIds: scene.scene?.characters ?? [],
      anchors: story.anchors,
      preferred: 'nano-banana',
      sheetFallback: sheet === null ? null : [sheet.front],
    })
    const adapter = provider.kind === 'flux'
      ? this.flux
      : provider.kind === 'kontext'
        ? this.kontext
        : provider.kind === 'kontext-multi'
          ? this.kontextMulti
          : this.nanoBanana
    const beat = storyBeatForShot(shot, scene)
    const composed = storyPromptComposer.composeKeyframe({
      bible: story.plan.storyBible,
      beat,
      hasReference: provider.kind !== 'flux',
      visualStyle: story.visualStyle,
      withIdentityLock: provider.kind !== 'flux',
      maxLength: STORY_PROMPT_MAX_LENGTH,
    })

    try {
      const submission = await this.queue.submit(
        adapter.modelId as Parameters<FalQueueService['submit']>[0],
        adapter.buildInput({
          prompt: composed.prompt,
          referenceUrl: provider.kind === 'kontext' ? provider.referenceUrl : null,
          ...(provider.kind === 'kontext-multi' || provider.kind === 'nano-banana'
            ? { referenceUrls: provider.referenceUrls }
            : {}),
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
      // Both adapters validate the vertical ratio before the URL leaves this
      // method, so a landscape keyframe never becomes a video reference.
      const output = this.kontext.parseOutput(payload)

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
