import type { StoryCharacter, StoryVisualStyle } from '~/models/story'
import type { FalQueueService } from '../fal/queue-service'
import { FluxImageAdapter } from '../fal/adapters/flux-image-adapter'
import { NanoBananaAdapter } from '../fal/adapters/nano-banana-adapter'
import type { KeyframeAdapter, KeyframeOutput } from '../fal/adapters/types'
import { isVerticalAspect } from './aspect-ratio'
import { StoryError, toStoryError } from './errors'
import { characterReferencePrompt } from './character-ref-prompt'

export interface CharacterReferenceSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export interface CharacterReferenceImage {
  readonly frontalUrl: string
  readonly referenceUrls: readonly string[]
}

export type CharacterReferencePollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly ref: CharacterReferenceImage }

export interface CharacterReferenceOrchestrator {
  /**
   * One image for one character. With a style reference the model keeps the
   * channel look; without it the text-to-image model renders the canon
   * description in the chosen style.
   */
  submit(
    character: StoryCharacter,
    style: StoryVisualStyle,
    styleReferenceUrl: string | null,
  ): Promise<CharacterReferenceSubmission>
  poll(
    submission: CharacterReferenceSubmission,
    styleReferenceUrl: string | null,
  ): Promise<CharacterReferencePollResult>
  cancel(submission: CharacterReferenceSubmission): Promise<void>
}

function assertVerticalOutput(output: KeyframeOutput): void {
  if (output.width === null || output.height === null) return

  if (!isVerticalAspect(output.width, output.height)) {
    throw new StoryError('provider-invalid-output')
  }
}

export class NativeCharacterReferenceOrchestrator implements CharacterReferenceOrchestrator {
  private readonly queue: FalQueueService
  private readonly flux: KeyframeAdapter
  private readonly nanoBanana: KeyframeAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.flux = new FluxImageAdapter()
    this.nanoBanana = new NanoBananaAdapter()
  }

  async submit(
    character: StoryCharacter,
    style: StoryVisualStyle,
    styleReferenceUrl: string | null,
  ): Promise<CharacterReferenceSubmission> {
    const adapter = styleReferenceUrl === null ? this.flux : this.nanoBanana
    const prompt = characterReferencePrompt(character, style, {
      hasStyleReference: styleReferenceUrl !== null,
    })

    try {
      const submission = await this.queue.submit(
        adapter.modelId as Parameters<FalQueueService['submit']>[0],
        adapter.buildInput({
          prompt,
          referenceUrl: styleReferenceUrl,
          ...(styleReferenceUrl === null
            ? {}
            : { referenceUrls: [styleReferenceUrl] }),
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

  async poll(
    submission: CharacterReferenceSubmission,
    styleReferenceUrl: string | null,
  ): Promise<CharacterReferencePollResult> {
    void styleReferenceUrl

    try {
      const status = await this.queue.getStatus(submission.statusUrl)

      if (status.status !== 'COMPLETED') {
        return { state: status.status === 'IN_QUEUE' ? 'IN_QUEUE' : 'IN_PROGRESS' }
      }

      const payload = await this.queue.getResult(submission.responseUrl)
      const output = this.nanoBanana.parseOutput(payload)

      assertVerticalOutput(output)

      return {
        state: 'COMPLETED',
        ref: {
          frontalUrl: output.imageUrl,
          referenceUrls: [output.imageUrl],
        },
      }
    } catch (error) {
      throw toStoryError(error)
    }
  }

  async cancel(submission: CharacterReferenceSubmission): Promise<void> {
    try {
      await this.queue.cancel(submission.cancelUrl)
    } catch (error) {
      throw toStoryError(error)
    }
  }
}

export function createCharacterReferenceOrchestrator(
  queue: FalQueueService,
): CharacterReferenceOrchestrator {
  return new NativeCharacterReferenceOrchestrator(queue)
}
