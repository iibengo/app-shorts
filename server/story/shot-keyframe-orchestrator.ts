import type { StoryBeat } from '~/models/story'
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
import { normalizeFocusFraming, resolveFocus } from './focus-framing'

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
  ): Promise<ShotProviderSubmission> {
    // 012: one reference per character present, maximum 3, never a sheet grid.
    // A character with its own image wins; the anchor is the legacy fallback.
    const present = scene.scene?.characters ?? []
    const provider = selectKeyframeProvider({
      userReferenceUrl: story.referenceUrl,
      presentCharacterIds: present,
      characterRefs: characterReferenceUrls(story.characterRefs),
      anchors: story.anchors,
      preferred: 'nano-banana',
    })
    const adapter = provider.kind === 'flux'
      ? this.flux
      : provider.kind === 'kontext'
        ? this.kontext
        : provider.kind === 'kontext-multi'
          ? this.kontextMulti
          : this.nanoBanana
    const beat = storyBeatForShot(shot, scene)
    // 012: whoever acts in the shot must be big enough to read. A secondary
    // character in a wide shot dissolves into the background.
    const focus = resolveFocus(beat.subject, story.plan.storyBible)
    const framing = normalizeFocusFraming(
      beat.framing,
      focus,
      story.plan.storyBible?.leadCharacterId ?? null,
    ).framing
    const focusFraming: StoryBeat = { ...beat, framing }
    const styleOnly = provider.kind === 'nano-banana' && provider.styleOnly === true
    const composed = storyPromptComposer.composeKeyframe({
      bible: story.plan.storyBible,
      beat: focusFraming,
      hasReference: provider.kind !== 'flux',
      visualStyle: story.visualStyle,
      withIdentityLock: provider.kind !== 'flux',
      maxLength: STORY_PROMPT_MAX_LENGTH,
      focusCharacterName: focus.characterName,
      styleOnlyReference: styleOnly,
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

/**
 * Only a ready reference with an image can be sent. A pending or failed one
 * falls back to the legacy anchor instead of breaking the shot.
 */
function characterReferenceUrls(
  refs: ReelStoryRecord['characterRefs'],
): Readonly<Record<string, string>> | null {
  if (refs === null || refs === undefined) return null

  const urls: Record<string, string> = {}

  for (const [id, ref] of Object.entries(refs)) {
    if (ref.status === 'ready' && ref.frontalUrl !== null && ref.frontalUrl.length > 0) {
      urls[id] = ref.frontalUrl
    }
  }

  return urls
}
