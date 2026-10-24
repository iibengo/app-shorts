// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryPlan } from '~/models/story'
import {
  MAX_LINE_CHARS,
  buildGraphicsPlan,
  wrapText,
} from '../../../server/story/graphics-plan'

function plan(overrides: Partial<StoryPlan> = {}): StoryPlan {
  return {
    title: 'El artículo fantasma',
    logline: 'Ionias descubre algo que no escribió.',
    tone: 'humor',
    storyBible: null,
    scenes: [
      {
        order: 1,
        sceneRole: 'establishing',
        locationId: 'desk',
        timeOfDay: 'morning',
        weather: 'clear',
        characters: ['ionias'],
        props: ['laptop'],
        storyFunction: 'hook',
        gag: null,
        narration: 'Ionias solo quería un café tranquilo.',
      },
      {
        order: 2,
        sceneRole: 'climax',
        locationId: 'roof',
        timeOfDay: 'night',
        weather: 'clear',
        characters: ['ionias'],
        props: [],
        storyFunction: 'twist',
        gag: null,
        narration: 'Alguien publicó por él.',
      },
    ],
    ...overrides,
  } as unknown as StoryPlan
}

describe('wrapText', () => {
  it('never invents words', () => {
    const lines = wrapText('Ionias solo quería un café tranquilo.', 20)

    expect(lines.join(' ')).toBe('Ionias solo quería un café tranquilo.')
  })

  it('returns nothing for empty input', () => {
    expect(wrapText('   ')).toEqual([])
  })

  it('caps the number of lines', () => {
    const lines = wrapText('palabra '.repeat(200), 40)

    expect(lines.length).toBeLessThanOrEqual(4)
    expect(lines.every((line) => line.length <= 40)).toBe(true)
  })

  it('uses the line budget by default', () => {
    const lines = wrapText('a '.repeat(200))

    expect(lines.every((line) => line.length <= MAX_LINE_CHARS)).toBe(true)
  })
})

describe('buildGraphicsPlan', () => {
  it('draws exactly two titles, at the start and at the end', () => {
    const built = buildGraphicsPlan({ plan: plan(), totalDurationSeconds: 15, width: 720, height: 1280 })
    const titles = built.graphics.filter((graphic) => graphic.kind === 'title')

    expect(titles).toHaveLength(2)
    expect(titles[0]?.startSeconds).toBe(0)
    expect(titles[1]?.endSeconds).toBe(15)
  })

  it('takes the title from the script, never from the model', () => {
    const built = buildGraphicsPlan({ plan: plan(), totalDurationSeconds: 15, width: 720, height: 1280 })
    const title = built.graphics.find((graphic) => graphic.kind === 'title')

    expect(title?.text.join(' ')).toBe('El artículo fantasma')
  })

  it('adds a terminal only when a scene shows a screen', () => {
    const withScreen = buildGraphicsPlan({
      plan: plan(),
      totalDurationSeconds: 15,
      width: 720,
      height: 1280,
    })
    const withoutScreen = buildGraphicsPlan({
      plan: plan({
        scenes: plan().scenes.map((scene) => ({ ...scene, props: [] })),
      }),
      totalDurationSeconds: 15,
      width: 720,
      height: 1280,
    })

    expect(withScreen.graphics.some((graphic) => graphic.kind === 'terminal')).toBe(true)
    expect(withoutScreen.graphics.some((graphic) => graphic.kind === 'terminal')).toBe(false)
  })

  it('keeps the terminal inside the video, clear of both titles', () => {
    const built = buildGraphicsPlan({ plan: plan(), totalDurationSeconds: 15, width: 720, height: 1280 })
    const terminal = built.graphics.find((graphic) => graphic.kind === 'terminal')

    expect(terminal?.startSeconds).toBeGreaterThan(0)
    expect(terminal?.endSeconds).toBeLessThan(15)
  })

  it('adds the badge only when there is text, once', () => {
    const withBadge = buildGraphicsPlan({
      plan: plan(),
      totalDurationSeconds: 15,
      width: 720,
      height: 1280,
      badgeText: 'CafeAndCode',
    })
    const withoutBadge = buildGraphicsPlan({
      plan: plan(),
      totalDurationSeconds: 15,
      width: 720,
      height: 1280,
    })

    expect(withBadge.graphics.filter((graphic) => graphic.kind === 'badge')).toHaveLength(1)
    expect(withoutBadge.graphics.some((graphic) => graphic.kind === 'badge')).toBe(false)
  })

  it('is deterministic', () => {
    const input = { plan: plan(), totalDurationSeconds: 15, width: 720, height: 1280 }

    expect(buildGraphicsPlan(input)).toEqual(buildGraphicsPlan(input))
  })

  it('draws nothing for a zero-length video', () => {
    const built = buildGraphicsPlan({ plan: plan(), totalDurationSeconds: 0, width: 720, height: 1280 })

    expect(built.graphics).toEqual([])
  })

  it('never exceeds the video length', () => {
    const built = buildGraphicsPlan({ plan: plan(), totalDurationSeconds: 6, width: 720, height: 1280 })

    for (const graphic of built.graphics) {
      expect(graphic.startSeconds).toBeGreaterThanOrEqual(0)
      expect(graphic.endSeconds).toBeLessThanOrEqual(6)
    }
  })
})
