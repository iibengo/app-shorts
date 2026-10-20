import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'

vi.mock('~/utils/composer', async () => {
  const actual = await vi.importActual<typeof import('~/utils/composer')>(
    '~/utils/composer',
  )

  let calls = 0

  return {
    ...actual,
    buildGeneratedShortPreview: (request: Parameters<typeof actual.buildGeneratedShortPreview>[0]) => {
      calls += 1

      if (calls === 1) {
        throw new Error('defensive generator failure')
      }

      return actual.buildGeneratedShortPreview(request)
    },
  }
})

const { default: ComposerPage } = await import('~/pages/composer.vue')

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('composer page defensive generation error', () => {
  it('announces the error, focuses Reintentar and recovers on retry', async () => {
    const wrapper = await mountSuspended(ComposerPage, {
      route: '/composer',
      attachTo: document.body,
    })
    vi.useFakeTimers()

    await wrapper.get('[data-testid="composer-prompt-input"]').setValue('Idea que falla')
    await wrapper.get('[data-testid="composer-form"]').trigger('submit')
    await nextTick()

    vi.advanceTimersByTime(2400)
    await nextTick()
    await nextTick()

    const error = wrapper.get('[data-testid="composer-error"]')
    const retry = wrapper.get('[data-testid="composer-retry"]')

    expect(error.attributes('role')).toBe('alert')
    expect(normalize(error.get('p').text())).toBe(
      'No se pudo preparar la vista previa simulada. Inténtalo de nuevo.',
    )
    expect(wrapper.find('[data-testid="composer-preview"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="composer-form"]').exists()).toBe(true)
    expect(
      (wrapper.get('[data-testid="composer-prompt-input"]').element as HTMLTextAreaElement)
        .value,
    ).toBe('Idea que falla')
    expect(document.activeElement).toBe(retry.element)

    await retry.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="composer-generation"]').exists()).toBe(true)
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )

    vi.advanceTimersByTime(2400)
    await nextTick()

    expect(wrapper.get('[data-testid="composer-preview"]').exists()).toBe(true)
    expect(normalize(wrapper.get('[data-testid="composer-preview-attempt"]').text())).toBe(
      'Intento 2',
    )
  })
})
