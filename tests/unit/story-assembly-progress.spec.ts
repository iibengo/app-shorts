import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import StoryAssemblyProgress from '~/components/story/StoryAssemblyProgress.vue'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountProgress(elapsedSeconds = 12) {
  return mountSuspended(StoryAssemblyProgress, {
    attachTo: document.body,
    props: { elapsedSeconds },
  })
}

describe('StoryAssemblyProgress', () => {
  it('renders the assembly heading with focus management', async () => {
    const wrapper = await mountProgress()
    const heading = wrapper.get('[data-testid="story-assembly-heading"]')

    expect(normalize(heading.text())).toBe('Montando el vídeo final')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    expect(wrapper.get('[data-testid="story-assembling"]').attributes('aria-busy')).toBe('true')
  })

  it('renders the three real steps in order', async () => {
    const wrapper = await mountProgress()
    const steps = wrapper.findAll('[data-testid="story-assembly-step"]')

    expect(steps).toHaveLength(3)
    expect(steps.map((step) => step.attributes('data-step'))).toEqual([
      'download',
      'concat',
      'upload',
    ])
    expect(steps.map((step) => normalize(step.text()))).toEqual([
      'Descargando los vídeos',
      'Uniendo las escenas',
      'Subiendo el resultado',
    ])
  })

  it('renders the normative assembly note', async () => {
    const wrapper = await mountProgress()

    expect(normalize(wrapper.text())).toContain(
      'Estamos uniendo las escenas con cortes secos. Sin música, voz ni texto en pantalla.',
    )
  })

  it('renders an indeterminate progress bar without percentages', async () => {
    const wrapper = await mountProgress()
    const bar = wrapper.get('[role="progressbar"]')

    expect(bar.attributes('aria-label')).toBe('Montaje del vídeo final')
    expect(wrapper.text()).not.toMatch(/\d+\s?%/)
    expect(wrapper.find('[aria-valuenow]').exists()).toBe(false)
    expect(wrapper.get('.story-assembly-bar').exists()).toBe(true)
  })

  it('renders the elapsed time in m:ss', async () => {
    const wrapper = await mountProgress(72)

    expect(normalize(wrapper.get('[data-testid="story-elapsed"]').text())).toBe(
      'Tiempo transcurrido: 1:12',
    )
  })

  it('only animates the bar under motion-safe media queries', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/story/StoryAssemblyProgress.vue'),
      'utf8',
    )

    expect(source).toContain('prefers-reduced-motion: no-preference')
    expect(source).toContain('@media (prefers-reduced-motion: no-preference)')
  })

  it('keeps 44px rows and forced-colors limits', async () => {
    const wrapper = await mountProgress()

    for (const step of wrapper.findAll('[data-testid="story-assembly-step"]')) {
      expect(step.classes()).toContain('min-h-11')
    }

    expect(wrapper.get('[role="progressbar"]').classes()).toContain('forced-colors:border')
  })
})
