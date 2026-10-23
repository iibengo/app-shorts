// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  composeSheetPrompt,
  createCharacterSheetOrchestrator,
  sheetFromComposite,
} from '../../../server/story/character-sheet-orchestrator'
import { SHEET_VIEWS } from '../../../server/story/character-sheet'
import type { FalQueueService } from '../../../server/fal/queue-service'

class Queue implements FalQueueService {
  readonly submitted: { readonly endpoint: string; readonly input: Record<string, unknown> }[] = []

  async submit(endpoint: string, input: unknown) {
    this.submitted.push({ endpoint, input: input as Record<string, unknown> })

    return {
      requestId: 'req-1',
      statusUrl: 'https://queue.fal.run/test/req-1/status',
      responseUrl: 'https://queue.fal.run/test/req-1',
      cancelUrl: 'https://queue.fal.run/test/req-1/cancel',
    }
  }

  async getStatus() {
    return { status: 'COMPLETED' as const, queuePosition: null }
  }

  async getResult() {
    return {
      images: [{ url: 'https://v3.fal.media/files/x/sheet.jpeg', width: 1152, height: 2048 }],
    }
  }

  async cancel() {}
}

describe('character sheet orchestrator', () => {
  it('asks Nano Banana for a 2x2 sheet with the story style', () => {
    const prompt = composeSheetPrompt('papercraft')

    expect(prompt).toContain('low-poly papercraft')
    expect(prompt).toContain('2x2 grid')
    expect(prompt).toContain('exact same character')
  })

  it('submits with the reference and parses every view', async () => {
    const queue = new Queue()
    const orchestrator = createCharacterSheetOrchestrator(queue)
    const submission = await orchestrator.submit('https://v3.fal.media/files/x/ref.jpeg', 'papercraft')

    expect(queue.submitted[0]?.endpoint).toBe('fal-ai/nano-banana/edit')
    expect(queue.submitted[0]?.input.aspect_ratio).toBe('9:16')

    const result = await orchestrator.poll(submission, 'https://v3.fal.media/files/x/ref.jpeg', 'papercraft')

    expect(result.state).toBe('COMPLETED')
    if (result.state !== 'COMPLETED') return
    for (const view of SHEET_VIEWS) {
      expect(result.sheet[view]).toContain('v3.fal.media')
    }
  })

  it('maps a composite image to all four views', () => {
    const sheet = sheetFromComposite('https://v3.fal.media/files/x/sheet.jpeg')

    expect(Object.keys(sheet)).toHaveLength(4)
  })
})
