// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StoryGraphicsPlan } from '~/models/story'
import {
  buildGraphicsArgs,
  escapeDrawText,
  geometryFor,
} from '../../../server/story/graphics-renderer'

const PLAN: StoryGraphicsPlan = {
  width: 720,
  height: 1280,
  graphics: [
    { kind: 'title', text: ['El artículo fantasma'], startSeconds: 0, endSeconds: 2.5 },
    { kind: 'terminal', text: ['npm run build', '> ok'], startSeconds: 2.5, endSeconds: 12.5 },
    { kind: 'badge', text: ['CafeAndCode'], startSeconds: 12.5, endSeconds: 15 },
  ],
}

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

function args(overrides: Partial<Parameters<typeof buildGraphicsArgs>[0]> = {}) {
  return buildGraphicsArgs({
    plan: PLAN,
    inputPath: '/tmp/in.mp4',
    outputPath: '/tmp/out.mp4',
    fontFile: FONT,
    ...overrides,
  })
}

describe('escaping', () => {
  it('escapes the characters that end a filter argument', () => {
    expect(escapeDrawText('a:b')).toBe('a\\:b')
    expect(escapeDrawText("it's")).toBe("it\\'s")
    expect(escapeDrawText('50%')).toBe('50\\%')
    expect(escapeDrawText('a\\b')).toBe('a\\\\b')
  })

  it('flattens newlines so one graphic stays one argument', () => {
    expect(escapeDrawText('uno\ndos')).toBe('uno dos')
  })

  it('cannot inject a second filter', () => {
    const escaped = escapeDrawText('text=x,drawtext=text=y')

    // A comma ends a filter; unescaped it would start a second drawtext.
    expect(escaped).toBe('text=x\\,drawtext=text=y')
    expect(escaped.replace(/\\,/g, '')).not.toContain(',')
  })

  it('escapes the brackets that open expression syntax', () => {
    expect(escapeDrawText('a[b]')).toBe('a\\[b\\]')
  })
})

describe('geometry', () => {
  it('keeps every graphic inside the vertical safe area', () => {
    const top = geometryFor('title', 720, 1280)
    const bottom = geometryFor('badge', 720, 1280)
    const terminal = geometryFor('terminal', 720, 1280)

    // 12 % of 1280 = 153 px
    expect(Number(top.y)).toBeGreaterThanOrEqual(153)
    expect(Number(terminal.x)).toBeGreaterThanOrEqual(Math.round(720 * 0.08))
    expect(bottom.y).toContain('1126')
  })

  it('centres the title horizontally', () => {
    expect(geometryFor('title', 720, 1280).x).toBe('360-text_w/2')
  })
})

describe('buildGraphicsArgs', () => {
  it('draws one filter per graphic', () => {
    const built = args()

    expect(built).not.toBeNull()
    const filter = built![built!.indexOf('-vf') + 1]!

    expect(filter.split('drawtext=').length - 1).toBe(3)
  })

  it('encodes once and copies the audio', () => {
    const built = args()!

    expect(built.filter((value) => value === '-crf')).toHaveLength(1)
    expect(built[built.indexOf('-c:a') + 1]).toBe('copy')
  })

  it('returns null when there is nothing to draw', () => {
    expect(args({ plan: { ...PLAN, graphics: [] } })).toBeNull()
  })

  it('returns null without a font, so the caller skips the encode', () => {
    expect(args({ fontFile: null })).toBeNull()
    expect(args({ fontFile: '   ' })).toBeNull()
  })

  it('uses the mono font for the terminal when one is given', () => {
    const built = args({ monoFontFile: '/fonts/mono.ttf' })!
    const filter = built[built.indexOf('-vf') + 1]!

    expect(filter).toContain("/fonts/mono.ttf")
    expect(filter).toContain('DejaVuSans-Bold.ttf')
  })

  it('is deterministic', () => {
    expect(args()).toEqual(args())
  })
})
