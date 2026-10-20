import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerGenerationProgress from '~/components/composer/ComposerGenerationProgress.vue'
import type { ComposerJobStage } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountProgress(
  stage: ComposerJobStage = 'keyframe',
  options: {
    queuePosition?: number | null
    elapsedSeconds?: number
    isSlow?: boolean
    attempt?: number
  } = {},
) {
  return mountSuspended(ComposerGenerationProgress, {
    attachTo: document.body,
    props: {
      stage,
      queuePosition: options.queuePosition ?? null,
      elapsedSeconds: options.elapsedSeconds ?? 0,
      isSlow: options.isSlow ?? false,
      attempt: options.attempt ?? 1,
    },
  })
}

describe('ComposerGenerationProgress', () => {
  it('renders the normative heading, note and current stage', async () => {
    const wrapper = await mountProgress('keyframe')
    const heading = wrapper.get('[data-testid="composer-generation-heading"]')

    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Generando tu vídeo')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(normalize(wrapper.text())).toContain(
      'La generación es real y puede tardar varios minutos. Si sales de esta página, perderás el progreso.',
    )
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Creando el fotograma base',
    )
  })

  it('moves focus to the heading when it mounts', async () => {
    const wrapper = await mountProgress()

    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-generation-heading"]').element,
    )
  })

  it('marks the generation container as busy with the attempt', async () => {
    const wrapper = await mountProgress('queued', { attempt: 3 })
    const container = wrapper.get('[data-testid="composer-generation"]')

    expect(container.attributes('aria-busy')).toBe('true')
    expect(container.attributes('data-attempt')).toBe('3')
  })

  it('renders all four real stages in order and marks only the current one', async () => {
    const wrapper = await mountProgress('video')
    const items = wrapper
      .get('[data-testid="composer-generation-stages"]')
      .findAll('li')

    expect(items).toHaveLength(4)
    expect(items.map((item) => normalize(item.text()))).toEqual([
      'Creando el fotograma base',
      'En cola',
      'Generando el vídeo',
      'Preparando el resultado',
    ])
    expect(items.map((item) => item.attributes('data-state'))).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
    ])
    expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
      'Generando el vídeo',
    )
  })

  it('maps every stage to the normative label', async () => {
    for (const [stage, label] of [
      ['keyframe', 'Creando el fotograma base'],
      ['queued', 'En cola'],
      ['video', 'Generando el vídeo'],
      ['finalizing', 'Preparando el resultado'],
    ] as const) {
      const wrapper = await mountProgress(stage)
      expect(normalize(wrapper.get('[data-testid="composer-generation-stage"]').text())).toBe(
        label,
      )
    }
  })

  it('exposes an indeterminate progressbar without a percentage or ETA', async () => {
    const wrapper = await mountProgress('keyframe', { elapsedSeconds: 67 })
    const progress = wrapper.get('[data-testid="composer-generation-progress"]')
    const text = normalize(wrapper.text())

    expect(progress.attributes('role')).toBe('progressbar')
    expect(progress.attributes('aria-label')).toBe('Progreso de generación')
    expect(progress.attributes('aria-valuenow')).toBeUndefined()
    expect(progress.attributes('aria-valuemin')).toBeUndefined()
    expect(progress.attributes('aria-valuemax')).toBeUndefined()
    expect(text).not.toMatch(/\d+\s?%/)
    expect(text).not.toMatch(/\bETA\b/)
    expect(text).not.toMatch(/\bporcentaje\b/i)
  })

  it('renders elapsed time and queue position when available', async () => {
    const wrapper = await mountProgress('queued', {
      elapsedSeconds: 67,
      queuePosition: 3,
    })

    expect(normalize(wrapper.get('[data-testid="composer-generation-elapsed"]').text())).toBe(
      'Tiempo transcurrido: 1:07',
    )
    expect(normalize(wrapper.get('[data-testid="composer-generation-queue"]').text())).toBe(
      'Posición 3 en la cola',
    )
  })

  it('omits the queue position when the provider does not return it', async () => {
    const wrapper = await mountProgress('running', { queuePosition: null })

    expect(wrapper.find('[data-testid="composer-generation-queue"]').exists()).toBe(false)
  })

  it('shows the slow warning only when isSlow is true', async () => {
    const slow = await mountProgress('video', { isSlow: true, elapsedSeconds: 600 })
    expect(normalize(slow.get('[data-testid="composer-generation-slow"]').text())).toBe(
      'Está tardando más de lo habitual. Puedes seguir esperando o cancelar.',
    )

    const fast = await mountProgress('video', { isSlow: false })
    expect(fast.find('[data-testid="composer-generation-slow"]').exists()).toBe(false)
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

  it('animates only under motion-safe and never uses percentage or shimmer', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/composer/ComposerGenerationProgress.vue'),
      'utf8',
    )

    expect(source).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(source).toContain('animation: composer-indeterminate')
    expect(source).not.toMatch(/shimmer/i)
    expect(source).not.toContain('aria-valuenow')
    expect(source).not.toMatch(/\d+\s?% completado/)
  })
})
