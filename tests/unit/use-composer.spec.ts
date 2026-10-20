import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useComposer, type UseComposerReturn } from '~/composables/useComposer'
import type {
  ComposerGenerator,
  ComposerReference,
  GeneratedShortPreview,
} from '~/models/composer'
import { buildGeneratedShortPreview } from '~/utils/composer'

const REFERENCE: ComposerReference = {
  id: 'ref-1',
  kind: 'image',
  name: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  thumbnailUrl: 'blob:foto',
  durationSeconds: null,
}

async function setupComposer(
  generator?: ComposerGenerator,
  initialReferences: readonly ComposerReference[] = [],
) {
  const references = ref<readonly ComposerReference[]>(initialReferences)
  let api!: UseComposerReturn

  const wrapper = await mountSuspended(
    defineComponent({
      setup() {
        api = useComposer({ references, ...(generator ? { generator } : {}) })
        return () => h('div')
      },
    }),
  )

  return { api, references, wrapper }
}

function advance(ms: number): void {
  vi.advanceTimersByTime(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('useComposer initial state and validation', () => {
  it('starts in idle with an empty prompt and no issues', async () => {
    const { api } = await setupComposer()

    expect(api.prompt.value).toBe('')
    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.step.value).toBe('input')
    expect(api.isGenerating.value).toBe(false)
    expect(api.issues.value).toEqual([])
    expect(api.statusMessage.value).toBe('')
    expect(api.draft.value).toEqual({ prompt: '', references: [] })
  })

  it('rejects an empty or whitespace prompt without starting generation', async () => {
    const generator = vi.fn(buildGeneratedShortPreview)
    const { api } = await setupComposer(generator)

    api.prompt.value = '   '
    api.generate()

    expect(api.issues.value).toEqual([
      {
        code: 'prompt-required',
        field: 'prompt',
        message: 'Escribe una idea para generar tu short.',
      },
    ])
    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.step.value).toBe('input')
    expect(generator).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a prompt over 280 characters without incrementing the attempt', async () => {
    const generator = vi.fn(buildGeneratedShortPreview)
    const { api } = await setupComposer(generator)

    api.prompt.value = 'a'.repeat(281)
    api.generate()

    expect(api.issues.value).toEqual([
      {
        code: 'prompt-too-long',
        field: 'prompt',
        message: 'La idea no puede superar los 280 caracteres.',
      },
    ])
    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(generator).not.toHaveBeenCalled()

    api.prompt.value = 'a'.repeat(280)
    api.generate()
    expect(api.generation.value).toMatchObject({ status: 'generating', attempt: 1 })
  })

  it('clears issues when the prompt changes', async () => {
    const { api } = await setupComposer()

    api.generate()
    expect(api.issues.value).toHaveLength(1)

    api.prompt.value = 'Una idea'
    await nextTick()
    expect(api.issues.value).toEqual([])

    api.clearIssues()
    expect(api.issues.value).toEqual([])
  })
})

describe('useComposer deterministic timeline', () => {
  it('runs analyzing 15 -> composing 50 -> rendering 80 -> ready', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Un short sobre luz natural'

    api.generate()

    expect(api.generation.value).toEqual({
      status: 'generating',
      stage: 'analyzing',
      progress: 15,
      attempt: 1,
    })
    expect(api.step.value).toBe('generating')
    expect(api.isGenerating.value).toBe(true)
    expect(vi.getTimerCount()).toBe(3)

    advance(799)
    expect(api.generation.value).toMatchObject({ stage: 'analyzing', progress: 15 })

    advance(1)
    expect(api.generation.value).toMatchObject({ stage: 'composing', progress: 50 })

    advance(800)
    expect(api.generation.value).toMatchObject({ stage: 'rendering', progress: 80 })

    advance(799)
    expect(api.generation.value).toMatchObject({ status: 'generating', progress: 80 })

    advance(1)
    expect(api.generation.value.status).toBe('ready')
    expect(api.step.value).toBe('preview')
    expect(api.isGenerating.value).toBe(false)
    expect(api.statusMessage.value).toBe('Vista previa lista.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('builds the preview from the normalized prompt, references and attempt', async () => {
    const { api } = await setupComposer(undefined, [REFERENCE])
    api.prompt.value = '  Un short sobre luz natural  '

    api.generate()
    advance(2400)

    const state = api.generation.value
    expect(state.status).toBe('ready')
    if (state.status !== 'ready') return

    expect(state.result.prompt).toBe('Un short sobre luz natural')
    expect(state.result.referenceCount).toBe(1)
    expect(state.result.attempt).toBe(1)
    expect(state.result.id).toMatch(/^preview-[0-9a-f]{8}-1$/)
  })

  it('produces the same result for identical input in two fresh sessions', async () => {
    const first = await setupComposer()
    first.api.prompt.value = 'Un short sobre luz natural'
    first.api.generate()
    advance(2400)

    const second = await setupComposer()
    second.api.prompt.value = 'Un short sobre luz natural'
    second.api.generate()
    advance(2400)

    expect(second.api.generation.value).toEqual(first.api.generation.value)
  })

  it('uses the injected generator exactly once at 2400 ms', async () => {
    const generator = vi.fn(buildGeneratedShortPreview)
    const { api } = await setupComposer(generator)
    api.prompt.value = 'Idea'

    api.generate()
    advance(2399)
    expect(generator).not.toHaveBeenCalled()

    advance(1)
    expect(generator).toHaveBeenCalledTimes(1)
    expect(api.generation.value.status).toBe('ready')
  })
})

describe('useComposer duplicate submissions', () => {
  it('ignores repeated generate calls while generating', async () => {
    const generator = vi.fn(buildGeneratedShortPreview)
    const { api } = await setupComposer(generator)
    api.prompt.value = 'Idea'

    api.generate()
    api.generate()
    api.generate()

    expect(vi.getTimerCount()).toBe(3)
    advance(2400)
    expect(generator).toHaveBeenCalledTimes(1)
    expect(api.generation.value).toMatchObject({ status: 'ready' })
    if (api.generation.value.status === 'ready') {
      expect(api.generation.value.result.attempt).toBe(1)
    }
  })
})

describe('useComposer cancel and edit', () => {
  it('cancels back to idle, preserves the draft and ignores old timers', async () => {
    const { api, references } = await setupComposer(undefined, [REFERENCE])
    api.prompt.value = 'Borrador conservado'

    api.generate()
    advance(800)
    expect(api.generation.value).toMatchObject({ stage: 'composing' })

    api.cancel()

    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.step.value).toBe('input')
    expect(api.prompt.value).toBe('Borrador conservado')
    expect(references.value).toEqual([REFERENCE])
    expect(api.draft.value).toEqual({
      prompt: 'Borrador conservado',
      references: [REFERENCE],
    })
    expect(api.statusMessage.value).toBe('Generación cancelada.')
    expect(vi.getTimerCount()).toBe(0)

    advance(5000)
    expect(api.generation.value).toEqual({ status: 'idle' })
  })

  it('only cancels while generating', async () => {
    const { api } = await setupComposer()

    api.cancel()
    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.statusMessage.value).toBe('')

    api.prompt.value = 'Idea'
    api.generate()
    advance(2400)
    api.cancel()
    expect(api.generation.value.status).toBe('ready')
  })

  it('does not decrement the attempt when a generation is cancelled', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Idea'

    api.generate()
    expect(api.generation.value).toMatchObject({ attempt: 1 })
    api.cancel()

    api.generate()
    expect(api.generation.value).toMatchObject({
      status: 'generating',
      attempt: 2,
    })
  })

  it('edits back to idle preserving the draft but not resetting the attempt', async () => {
    const { api, references } = await setupComposer(undefined, [REFERENCE])
    api.prompt.value = 'Idea editable'

    api.generate()
    advance(2400)
    expect(api.generation.value.status).toBe('ready')

    api.edit()

    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.step.value).toBe('input')
    expect(api.prompt.value).toBe('Idea editable')
    expect(api.draft.value.references).toEqual([REFERENCE])
    expect(references.value).toEqual([REFERENCE])

    api.generate()
    expect(api.generation.value).toMatchObject({ status: 'generating', attempt: 2 })
  })

  it('ignores edit unless the state is ready', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Idea'

    api.edit()
    expect(api.generation.value).toEqual({ status: 'idle' })

    api.generate()
    api.edit()
    expect(api.generation.value.status).toBe('generating')
  })
})

describe('useComposer regenerate and retry', () => {
  it('regenerates with attempt + 1 and changes poster, title and duration', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Misma idea'

    api.generate()
    advance(2400)
    const first = api.generation.value
    expect(first.status).toBe('ready')
    if (first.status !== 'ready') return

    api.regenerate()
    expect(api.generation.value).toMatchObject({
      status: 'generating',
      stage: 'analyzing',
      progress: 15,
      attempt: 2,
    })

    advance(2400)
    const second = api.generation.value
    expect(second.status).toBe('ready')
    if (second.status !== 'ready') return

    expect(second.result.attempt).toBe(2)
    expect(second.result.poster.src).not.toBe(first.result.poster.src)
    expect(second.result.title).not.toBe(first.result.title)
    expect(second.result.durationSeconds).not.toBe(first.result.durationSeconds)
  })

  it('ignores regenerate unless the state is ready', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Idea'

    api.regenerate()
    expect(api.generation.value).toEqual({ status: 'idle' })

    api.generate()
    api.regenerate()
    expect(api.generation.value).toMatchObject({ status: 'generating', attempt: 1 })
  })

  it('surfaces the defensive generator error, preserves the draft and retries with attempt + 1', async () => {
    let shouldThrow = true
    const generator = vi.fn((request: Parameters<ComposerGenerator>[0]): GeneratedShortPreview => {
      if (shouldThrow) throw new Error('defensive failure')
      return buildGeneratedShortPreview(request)
    })
    const { api, references } = await setupComposer(generator, [REFERENCE])
    api.prompt.value = 'Idea con error'

    api.generate()
    advance(2400)

    expect(api.generation.value).toEqual({
      status: 'error',
      message: 'No se pudo preparar la vista previa simulada. Inténtalo de nuevo.',
      attempt: 1,
    })
    expect(api.step.value).toBe('input')
    expect(api.isGenerating.value).toBe(false)
    expect(api.prompt.value).toBe('Idea con error')
    expect(references.value).toEqual([REFERENCE])
    expect(generator).toHaveBeenCalledTimes(1)

    shouldThrow = false
    api.retry()

    expect(api.generation.value).toMatchObject({
      status: 'generating',
      stage: 'analyzing',
      progress: 15,
      attempt: 2,
    })

    advance(2400)
    expect(api.generation.value.status).toBe('ready')
    if (api.generation.value.status === 'ready') {
      expect(api.generation.value.result.attempt).toBe(2)
    }
  })

  it('ignores retry unless the state is error', async () => {
    const { api } = await setupComposer()
    api.prompt.value = 'Idea'

    api.retry()
    expect(api.generation.value).toEqual({ status: 'idle' })

    api.generate()
    api.retry()
    expect(api.generation.value).toMatchObject({ status: 'generating', attempt: 1 })
  })

  it('returns to idle and clears the error when the prompt is edited', async () => {
    const generator = vi.fn(() => {
      throw new Error('defensive failure')
    })
    const { api } = await setupComposer(generator)
    api.prompt.value = 'Idea'

    api.generate()
    advance(2400)
    expect(api.generation.value.status).toBe('error')

    api.prompt.value = 'Idea corregida'
    await nextTick()

    expect(api.generation.value).toEqual({ status: 'idle' })
    expect(api.issues.value).toEqual([])
  })
})

describe('useComposer cleanup and persistence', () => {
  it('clears timers and invalidates the run on unmount', async () => {
    const generator = vi.fn(buildGeneratedShortPreview)
    const { api, wrapper } = await setupComposer(generator)
    api.prompt.value = 'Idea'

    api.generate()
    expect(vi.getTimerCount()).toBe(3)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)

    advance(5000)
    expect(generator).not.toHaveBeenCalled()
    expect(api.generation.value).toMatchObject({ status: 'generating' })
  })

  it('does not write to storage during the flow', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { api } = await setupComposer()
    api.prompt.value = 'Idea'

    api.generate()
    advance(2400)

    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
