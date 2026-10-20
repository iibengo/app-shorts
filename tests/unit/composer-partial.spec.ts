import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ComposerPartialResult from '~/components/composer/ComposerPartialResult.vue'
import type { ComposerJobError } from '~/models/composer'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const POSTER = 'https://v3.fal.media/files/test/keyframe.jpeg'

const ERROR: ComposerJobError = {
  code: 'provider-error',
  message: 'El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
  retryable: true,
}

async function mountPartial(error: ComposerJobError = ERROR) {
  return mountSuspended(ComposerPartialResult, {
    attachTo: document.body,
    props: { posterUrl: POSTER, error },
  })
}

describe('ComposerPartialResult', () => {
  it('renders the keyframe as an image, never as a broken video', async () => {
    const wrapper = await mountPartial()
    const poster = wrapper.get('[data-testid="composer-video-poster"]')

    expect(poster.element.tagName).toBe('IMG')
    expect(poster.attributes('src')).toBe(POSTER)
    expect(poster.attributes('alt')).toBe('Fotograma base generado por IA')
    expect(wrapper.findAll('video, iframe')).toHaveLength(0)
    expect(wrapper.findAll('[autoplay]')).toHaveLength(0)
  })

  it('renders the exact heading and partial success message', async () => {
    const wrapper = await mountPartial()
    const heading = wrapper
      .get('[data-testid="composer-partial"]')
      .get('h2')

    expect(heading.element.tagName).toBe('H2')
    expect(normalize(heading.text())).toBe('Fotograma base listo')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(normalize(wrapper.text())).toContain(
      'No se pudo generar el vídeo, pero conservamos el fotograma base.',
    )
    expect(normalize(wrapper.text())).toContain(ERROR.message)
  })

  it('moves focus to the heading on mount', async () => {
    const wrapper = await mountPartial()

    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="composer-partial"]').get('h2').element,
    )
  })

  it('offers Reintentar and Editar idea and emits both', async () => {
    const wrapper = await mountPartial()
    const retry = wrapper.get('[data-testid="composer-retry"]')
    const edit = wrapper.get('[data-testid="composer-edit"]')

    expect(retry.attributes('type')).toBe('button')
    expect(edit.attributes('type')).toBe('button')
    expect(normalize(retry.text())).toBe('Reintentar')
    expect(normalize(edit.text())).toBe('Editar idea')

    await retry.trigger('click')
    await edit.trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('hides Reintentar for non-retryable errors but keeps Editar idea', async () => {
    const wrapper = await mountPartial({
      code: 'content-blocked',
      message: 'El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.',
      retryable: false,
    })

    expect(wrapper.find('[data-testid="composer-retry"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="composer-edit"]').exists()).toBe(true)
  })

  it('is terminal and does not offer publish, download or share', async () => {
    const wrapper = await mountPartial()
    const text = normalize(wrapper.text())

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(text).not.toMatch(/\b(Publicar|Descargar|Compartir)\b/)
    expect(wrapper.findAll('button')).toHaveLength(2)
  })
})
