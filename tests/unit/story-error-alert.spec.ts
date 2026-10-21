import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { h } from 'vue'
import StoryErrorAlert from '~/components/story/StoryErrorAlert.vue'
import AppButton from '~/components/ui/AppButton.vue'
import type { StoryJobError } from '~/models/story'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const ERROR: StoryJobError = {
  code: 'keyframe-failed',
  message: 'No se pudieron crear todas las imágenes de la historia.',
  retryable: false,
}

async function mountAlert(error: StoryJobError = ERROR) {
  return mountSuspended(StoryErrorAlert, {
    attachTo: document.body,
    props: { error },
  })
}

describe('StoryErrorAlert', () => {
  it('renders a single alert region with the exact message', async () => {
    const wrapper = await mountAlert()
    const alert = wrapper.get('[data-testid="story-error"]')

    expect(alert.element.tagName).toBe('DIV')
    expect(alert.attributes('role')).toBe('alert')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(normalize(alert.text())).toBe(ERROR.message)
  })

  it('renders no action container without a slot', async () => {
    const wrapper = await mountAlert()
    const alert = wrapper.get('[data-testid="story-error"]')

    expect(alert.findAll('button')).toHaveLength(0)
    expect(alert.classes()).toContain('forced-colors:border')
  })

  it('renders the slotted recovery actions', async () => {
    const wrapper = await mountSuspended(StoryErrorAlert, {
      attachTo: document.body,
      props: { error: ERROR },
      slots: {
        default: () => h(AppButton, { 'data-testid': 'story-start-over' }, () => 'Empezar de nuevo'),
      },
    })
    const alert = wrapper.get('[data-testid="story-error"]')

    expect(alert.findAll('button')).toHaveLength(1)
    expect(normalize(alert.get('button').text())).toBe('Empezar de nuevo')
  })

  it('renders each retryable error message without internal details', async () => {
    for (const error of [
      {
        code: 'assembly-failed' as const,
        message: 'No se pudo montar el vídeo final. Puedes reintentar el montaje.',
        retryable: true,
      },
      {
        code: 'story-expired' as const,
        message: 'Esta historia ya no está disponible. Empieza de nuevo.',
        retryable: false,
      },
    ]) {
      const wrapper = await mountAlert(error)

      expect(normalize(wrapper.text())).toBe(error.message)
      expect(wrapper.html()).not.toContain('stack')
      expect(wrapper.html()).not.toContain('SQL')
    }
  })
})
