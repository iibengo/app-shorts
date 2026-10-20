import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FeedPage from '~/pages/feed.vue'
import { shorts } from '~/data/shorts'

const normalize = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

async function mountFeed() {
  return mountSuspended(FeedPage, { route: '/feed' })
}

function cardAt(wrapper: Awaited<ReturnType<typeof mountFeed>>, index: number) {
  return wrapper.findAll('[data-testid="short-card"]')[index]!
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('feed page regression', () => {
  it('renders one header, one main and six shorts in fixture order', async () => {
    const wrapper = await mountFeed()
    const cards = wrapper.findAll('[data-testid="short-card"]')

    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(cards).toHaveLength(6)
    expect(cards.map((card) => card.attributes('data-short-id'))).toEqual(
      shorts.map((short) => short.id),
    )
    expect(
      cards.map((card) =>
        normalize(card.get('[data-testid="short-title"]').text()),
      ),
    ).toEqual(shorts.map((short) => short.title))
  })

  it('renders a single h1 and the final feed panel', async () => {
    const wrapper = await mountFeed()

    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(normalize(wrapper.get('h1').text())).toBe('Feed de shorts de prueba')
    expect(normalize(wrapper.get('[data-testid="feed-end-heading"]').text())).toBe(
      'Fin del feed de prueba',
    )
  })

  it('marks only the first short as active in the initial render', async () => {
    const wrapper = await mountFeed()
    const active = wrapper.findAll('[data-active="true"]')

    expect(active).toHaveLength(1)
    expect(active[0]?.attributes('data-short-id')).toBe('short-001')
    expect(active[0]?.attributes('aria-current')).toBe('true')
  })

  it('keeps the CTA as a link to the composer and removes the notice', async () => {
    const wrapper = await mountFeed()
    const cta = wrapper.get('[data-testid="feed-cta"]')
    const html = wrapper.html()

    expect(cta.element.tagName).toBe('A')
    expect(cta.attributes('href')).toBe('/composer')
    expect(normalize(cta.text())).toBe('Crear short')
    expect(cta.attributes('aria-haspopup')).toBeUndefined()

    expect(wrapper.find('[data-testid="create-short-notice"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="notice-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="notice-heading"]').exists()).toBe(false)
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0)
    expect(html).not.toContain('Próximamente')
    expect(wrapper.text()).not.toContain('Próximamente')
  })

  it('keeps the local posters and their loading priorities', async () => {
    const wrapper = await mountFeed()
    const posters = wrapper.findAll('[data-testid="short-poster"]')

    expect(posters).toHaveLength(6)

    posters.forEach((poster, index) => {
      expect(poster.attributes('src')).toBe(shorts[index]?.media.poster.src)
      expect(poster.attributes('src')).toMatch(/^\/mock\/shorts\/short-00[1-6]\.svg$/)
      expect(poster.attributes('width')).toBe('1080')
      expect(poster.attributes('height')).toBe('1920')
    })

    expect(posters[0]?.attributes('loading')).toBe('eager')
    expect(posters[0]?.attributes('fetchpriority')).toBe('high')
    for (const poster of posters.slice(1)) {
      expect(poster.attributes('loading')).toBe('lazy')
      expect(poster.attributes('fetchpriority')).toBeUndefined()
    }
  })

  it('keeps like and save independent, with static counters', async () => {
    const wrapper = await mountFeed()
    const first = cardAt(wrapper, 0)
    const second = cardAt(wrapper, 1)

    const firstLike = first.get('[data-testid="short-like"]')
    const firstSave = first.get('[data-testid="short-save"]')
    const likeCount = normalize(first.get('[data-testid="short-like-count"]').text())

    expect(firstLike.attributes('aria-pressed')).toBe('false')
    expect(firstSave.attributes('aria-pressed')).toBe('false')

    await firstLike.trigger('click')
    expect(firstLike.attributes('aria-pressed')).toBe('true')
    expect(firstSave.attributes('aria-pressed')).toBe('false')
    expect(normalize(first.get('[data-testid="short-like-count"]').text())).toBe(likeCount)

    await firstSave.trigger('click')
    expect(firstSave.attributes('aria-pressed')).toBe('true')
    expect(firstLike.attributes('aria-pressed')).toBe('true')

    const secondLike = second.get('[data-testid="short-like"]')
    const secondSave = second.get('[data-testid="short-save"]')
    expect(secondLike.attributes('aria-pressed')).toBe('false')
    expect(secondSave.attributes('aria-pressed')).toBe('true')

    await secondLike.trigger('click')
    expect(secondLike.attributes('aria-pressed')).toBe('true')
    expect(secondSave.attributes('aria-pressed')).toBe('true')
    expect(firstLike.attributes('aria-pressed')).toBe('true')
  })

  it('keeps share working through Web Share', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareMock,
    })

    const wrapper = await mountFeed()
    await wrapper.get('[data-testid="short-share"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="share-status"]').text()).toBe(
        'Enlace compartido.',
      )
    })

    expect(shareMock).toHaveBeenCalledWith({
      title: shorts[0]?.title,
      text: `${shorts[0]?.title} — AI Shorts (demo)`,
      url: `${window.location.origin}/feed`,
    })
  })

  it('updates the noscript copy and keeps no media playback', async () => {
    const wrapper = await mountFeed()
    const html = wrapper.html()

    expect(html).toContain(
      'La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. El estudio de creación también necesita JavaScript.',
    )
    expect(html).not.toContain('La creación de shorts con IA todavía no está disponible.')
    expect(wrapper.findAll('video, audio, iframe')).toHaveLength(0)
    expect(wrapper.findAll('[autoplay]')).toHaveLength(0)
  })

  it('keeps the scroll-snap container and no external media references', async () => {
    const wrapper = await mountFeed()
    const feed = wrapper.get('[data-testid="shorts-feed"]')

    expect(feed.classes()).toContain('snap-y')
    expect(feed.classes()).toContain('snap-mandatory')
    expect(feed.attributes('tabindex')).toBe('0')

    const referenced = wrapper.findAll('[src], [href]')
    for (const element of referenced) {
      for (const attribute of ['src', 'href']) {
        const value = element.attributes(attribute)
        if (value === undefined) continue
        expect(value, `${element.element.tagName} ${attribute}`).not.toMatch(
          /^(?:[a-z][a-z\d+.-]*:)?\/\//i,
        )
      }
    }
  })

  it('contains no dialogs, dead actions or creation form', async () => {
    const wrapper = await mountFeed()

    expect(wrapper.findAll('form')).toHaveLength(0)
    expect(wrapper.findAll('input, textarea, select')).toHaveLength(0)
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(0)
    expect(wrapper.findAll('[aria-modal]')).toHaveLength(0)
    expect(wrapper.findAll('[inert]')).toHaveLength(0)
  })
})
