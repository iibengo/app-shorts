import { describe, expect, it } from 'vitest'
import type { StoryCharacter } from '~/models/story'
import type { FalQueueService, FalQueueStatus } from '../../../server/fal/queue-service'
import { ComposerError } from '../../../server/shared/errors'
import {
  createCharacterReferenceOrchestrator,
} from '../../../server/story/character-ref-orchestrator'

const CHARACTER: StoryCharacter = {
  id: 'pixel',
  name: 'Pixel',
  description: 'A curious low-poly cat with turquoise eyes.',
  wardrobe: 'A tiny orange scarf.',
  source: 'invented',
}
const STYLE_REFERENCE = 'https://v3.fal.media/files/test/avatar.png'
const IMAGE = 'https://v3.fal.media/files/test/pixel.png'

class FakeQueue implements FalQueueService {
  readonly submits: { readonly endpoint: string; readonly input: unknown }[] = []
  readonly cancelled: string[] = []
  status: FalQueueStatus['status'] = 'COMPLETED'
  payload: unknown = {
    images: [{ url: IMAGE, width: 1088, height: 1904 }],
  }
  submitError: Error | null = null
  statusError: Error | null = null

  async submit(endpoint: never, input: unknown) {
    if (this.submitError) throw this.submitError

    this.submits.push({ endpoint, input })

    return {
      requestId: `ref-${this.submits.length}`,
      statusUrl: 'https://queue.fal.run/test/ref/status',
      responseUrl: 'https://queue.fal.run/test/ref',
      cancelUrl: 'https://queue.fal.run/test/ref/cancel',
    }
  }

  async getStatus(): Promise<FalQueueStatus> {
    if (this.statusError) throw this.statusError

    return { status: this.status, queuePosition: null }
  }

  async getResult(): Promise<unknown> {
    return this.payload
  }

  async cancel(cancelUrl: string): Promise<void> {
    this.cancelled.push(cancelUrl)
  }
}

function submission() {
  return {
    requestId: 'ref-1',
    statusUrl: 'https://queue.fal.run/test/ref/status',
    responseUrl: 'https://queue.fal.run/test/ref',
    cancelUrl: 'https://queue.fal.run/test/ref/cancel',
  }
}

describe('character reference orchestrator', () => {
  it('uses Nano Banana with the user avatar as the style reference', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)

    await orchestrator.submit(CHARACTER, 'papercraft', STYLE_REFERENCE)

    expect(queue.submits[0]?.endpoint).toBe('fal-ai/nano-banana/edit')
    expect(queue.submits[0]?.input).toMatchObject({
      image_urls: [STYLE_REFERENCE],
      aspect_ratio: '9:16',
      num_images: 1,
    })
  })

  it('uses FLUX text-to-image at 1152x2048 without a style reference', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)

    await orchestrator.submit(CHARACTER, 'papercraft', null)

    expect(queue.submits[0]?.endpoint).toBe('fal-ai/flux/dev')
    expect(queue.submits[0]?.input).toMatchObject({
      image_size: { width: 1152, height: 2048 },
      num_images: 1,
    })
    expect(queue.submits[0]?.input).not.toHaveProperty('image_urls')
  })

  it('returns a vertical image as a ready reference', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)

    const result = await orchestrator.poll(submission(), STYLE_REFERENCE)

    expect(result).toEqual({
      state: 'COMPLETED',
      ref: { frontalUrl: IMAGE, referenceUrls: [IMAGE] },
    })
  })

  it('reports queue states without inventing progress', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)

    queue.status = 'IN_QUEUE'
    expect(await orchestrator.poll(submission(), null)).toEqual({ state: 'IN_QUEUE' })

    queue.status = 'IN_PROGRESS'
    expect(await orchestrator.poll(submission(), null)).toEqual({ state: 'IN_PROGRESS' })
  })

  it('rejects a non-vertical output as provider-invalid-output', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)
    queue.payload = {
      images: [{ url: IMAGE, width: 1000, height: 1000 }],
    }

    await expect(orchestrator.poll(submission(), STYLE_REFERENCE))
      .rejects.toMatchObject({ code: 'provider-invalid-output' })
  })

  it('maps a provider submit failure to a stable story code', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)
    queue.submitError = new ComposerError('provider-busy')

    await expect(orchestrator.submit(CHARACTER, 'papercraft', null))
      .rejects.toMatchObject({ code: 'provider-busy' })
  })

  it('maps a provider poll failure to a stable story code', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)
    queue.statusError = new ComposerError('provider-error')

    await expect(orchestrator.poll(submission(), null))
      .rejects.toMatchObject({ code: 'provider-error' })
  })

  it('cancels the provider job through its cancel url', async () => {
    const queue = new FakeQueue()
    const orchestrator = createCharacterReferenceOrchestrator(queue)

    await orchestrator.cancel(submission())

    expect(queue.cancelled).toEqual(['https://queue.fal.run/test/ref/cancel'])
  })
})
