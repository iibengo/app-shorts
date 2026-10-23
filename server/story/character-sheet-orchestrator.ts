import type { StoryCharacterSheet, StoryVisualStyle } from '~/models/story'
import type { FalQueueService } from '../fal/queue-service'
import { NanoBananaAdapter } from '../fal/adapters/nano-banana-adapter'
import type { KeyframeAdapter } from '../fal/adapters/types'
import { StoryError, toStoryError } from './errors'
import {
  SHEET_VIEWS,
  characterSheetPrompt,
  sheetUrls,
} from './character-sheet'
import { styleBlockFor } from './visual-style'

export interface CharacterSheetSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type CharacterSheetPollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly sheet: StoryCharacterSheet }

export interface CharacterSheetOrchestrator {
  /** One reference is enough: the sheet is derived from it. */
  submit(referenceUrl: string, style: StoryVisualStyle): Promise<CharacterSheetSubmission>
  poll(submission: CharacterSheetSubmission, referenceUrl: string, style: StoryVisualStyle): Promise<CharacterSheetPollResult>
}

/**
 * Nano Banana can render one image per call, so the sheet is generated as a
 * single composite: four views in one frame, which keeps them consistent with
 * each other and costs one image instead of four.
 */
export function composeSheetPrompt(style: StoryVisualStyle): string {
  return `${styleBlockFor(style)}. Use the reference image as the exact same character: keep the identical face, hair, beard, eyebrows, eyes, skin tone and outfit. Character sheet with four portraits of the same person side by side in a 2x2 grid: front view, three-quarter view turned 45 degrees, side profile, and front view with a warm smile. Identical lighting and scale in every portrait, plain light neutral background. No text, no labels, no logo. Vertical 9:16.`
}

export class NativeCharacterSheetOrchestrator implements CharacterSheetOrchestrator {
  private readonly queue: FalQueueService
  private readonly adapter: KeyframeAdapter

  constructor(queue: FalQueueService) {
    this.queue = queue
    this.adapter = new NanoBananaAdapter()
  }

  async submit(
    referenceUrl: string,
    style: StoryVisualStyle,
  ): Promise<CharacterSheetSubmission> {
    try {
      const submission = await this.queue.submit(
        this.adapter.modelId as Parameters<FalQueueService['submit']>[0],
        this.adapter.buildInput({
          prompt: composeSheetPrompt(style),
          referenceUrl,
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
    submission: CharacterSheetSubmission,
    referenceUrl: string,
    style: StoryVisualStyle,
  ): Promise<CharacterSheetPollResult> {
    try {
      const status = await this.queue.getStatus(submission.statusUrl)

      if (status.status !== 'COMPLETED') {
        return { state: status.status === 'IN_QUEUE' ? 'IN_QUEUE' : 'IN_PROGRESS' }
      }

      const payload = await this.queue.getResult(submission.responseUrl)
      const output = this.adapter.parseOutput(payload)
      const sheet = sheetFromComposite(output.imageUrl)

      return { state: 'COMPLETED', sheet }
    } catch (error) {
      throw toStoryError(error)
    }
  }
}

/**
 * A 2x2 composite still gives the model four references, because Nano Banana
 * accepts several images. The same URL is listed per view so the identity lock
 * can name the angle it needs.
 */
export function sheetFromComposite(imageUrl: string): StoryCharacterSheet {
  const sheet: Record<string, string> = {}

  for (const view of SHEET_VIEWS) sheet[view] = imageUrl

  return sheet as StoryCharacterSheet
}

export function createCharacterSheetOrchestrator(
  queue: FalQueueService,
): CharacterSheetOrchestrator {
  return new NativeCharacterSheetOrchestrator(queue)
}

export { sheetUrls, characterSheetPrompt }
