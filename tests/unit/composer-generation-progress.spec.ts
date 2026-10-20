import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerGenerationProgress from '~/components/composer/ComposerGenerationProgress.vue'
import type { ComposerGenerationStage } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountProgress(
  stage: ComposerGenerationStage = 'analyzing',
  progress = 15,
  attempt = 1,
) {
  return mountSuspended(ComposerGenerationProgress, {
    attachTo: document.body,
    props: { stage, progress, attempt },
  })
}

describe('ComposerGenerationProgress', () => {
  it('renders the normative heading, note and stage', async () => {
    const wrapper = await mountProgress()
    const heading = wrapper.get('[data-testid="composer-generation-heading"]')

    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Generando tu short simulado')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(normalize(wrapper.get('[data-testid="composer-generation-note"]').text())).toBe(
      'Esto es una simulación: no se está creando ningún vídeo real.',
    )
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Analizando tu idea',
    )
  })

  it('moves focus to the heading when it mounts', async () => {
    const wrapper = await mountProgress()
    const heading = wrapper.get('[data-testid="composer-generation-heading"]')

    expect(document.activeElement).toBe(heading.element)
  })

  it('marks the generation container as busy', async () => {
    const wrapper = await mountProgress()
    const container = wrapper.get('[data-testid="composer-generation"]')

    expect(container.attributes('aria-busy')).toBe('true')
    expect(container.attributes('data-attempt')).toBe('1')
  })

  it('exposes an accessible progressbar with min, max, now and text', async () => {
    const wrapper = await mountProgress('composing', 50, 2)
    const progress = wrapper.get('[data-testid="composer-generation-progress"]')

    expect(progress.attributes('role')).toBe('progressbar')
    expect(progress.attributes('aria-valuemin')).toBe('0')
    expect(progress.attributes('aria-valuemax')).toBe('100')
    expect(progress.attributes('aria-valuenow')).toBe('50')
    expect(progress.attributes('aria-valuetext')).toBe('50 % completado')
    expect(normalize(wrapper.get('[data-testid="composer-generation-percent"]').text())).toBe(
      '50 %',
    )
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Componiendo la escena',
    )
  })

  it('renders the rendering stage at 80 percent', async () => {
    const wrapper = await mountProgress('rendering', 80, 1)

    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Preparando la vista previa',
    )
    expect(wrapper.get('[data-testid="composer-generation-progress"]').attributes('aria-valuenow')).toBe(
      '80',
    )
    expect(normalize(wrapper.get('[data-testid="composer-generation-percent"]').text())).toBe(
      '80 %',
    )
  })

  it('announces the stage and percentage once in a polite status region', async () => {
    const wrapper = await mountProgress('composing', 50, 1)
    const status = wrapper.get('[role="status"]')

    expect(status.attributes('aria-live')).toBe('polite')
    expect(status.attributes('aria-atomic')).toBe('true')
    expect(normalize(status.text())).toBe('Componiendo la escena. 50 % completado.')
  })

  it('renders Cancelar as a non-submit button and emits cancel', async () => {
    const wrapper = await mountProgress()
    const cancel = wrapper.get('[data-testid="composer-cancel"]')

    expect(cancel.element.tagName).toBe('BUTTON')
    expect(cancel.attributes('type')).toBe('button')
    expect(normalize(cancel.text())).toBe('Cancelar')

    await cancel.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('gates progress animation behind motion-safe and uses no shimmer', async () => {
    const wrapper = await mountProgress()
    const bar = wrapper.get('[data-testid="composer-generation-progress"]')
    const fill = bar.element.firstElementChild
    const classes = fill?.getAttribute('class') ?? ''

    expect(classes).toContain('motion-safe:transition-[width]')
    expect(classes).not.toMatch(/\banimate-/)
    expect(classes).not.toMatch(/shimmer/)
  })
})
