// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  MAX_KEYFRAME_REFERENCES,
  selectKeyframeProvider,
} from '../../../server/story/anchor-selection'

const ANCHOR_A = 'https://v3.fal.media/files/a.jpg'
const ANCHOR_B = 'https://v3.fal.media/files/b.jpg'
const USER = 'https://v3.fal.media/files/user.jpg'

describe('keyframe provider selection', () => {
  it('uses FLUX when nothing is anchored', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      anchors: {},
    })).toEqual({ kind: 'flux' })
  })

  it('uses Kontext with one anchor', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      anchors: { clara: ANCHOR_A },
    })).toEqual({ kind: 'kontext', referenceUrl: ANCHOR_A })
  })

  it('uses Kontext multi with two anchors', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara', 'rival'],
      anchors: { clara: ANCHOR_A, rival: ANCHOR_B },
    })).toEqual({ kind: 'kontext-multi', referenceUrls: [ANCHOR_A, ANCHOR_B] })
  })

  it('ignores characters that are not present', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      anchors: { clara: ANCHOR_A, rival: ANCHOR_B },
    })).toEqual({ kind: 'kontext', referenceUrl: ANCHOR_A })
  })

  it('dedupes character ids', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara', 'clara'],
      anchors: { clara: ANCHOR_A },
    })).toEqual({ kind: 'kontext', referenceUrl: ANCHOR_A })
  })
})

describe('character references win over anchors', () => {
  it('prefers the character own image', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      characterRefs: { clara: ANCHOR_B },
      anchors: { clara: ANCHOR_A },
      preferred: 'nano-banana',
    })).toEqual({ kind: 'nano-banana', referenceUrls: [ANCHOR_B] })
  })

  it('falls back to the anchor when the reference is missing', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      characterRefs: {},
      anchors: { clara: ANCHOR_A },
      preferred: 'nano-banana',
    })).toEqual({ kind: 'nano-banana', referenceUrls: [ANCHOR_A] })
  })

  it('sends one reference per character present, in scene order', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['ionias', 'pixel'],
      characterRefs: { ionias: ANCHOR_A, pixel: ANCHOR_B },
      anchors: {},
      preferred: 'nano-banana',
    })).toEqual({ kind: 'nano-banana', referenceUrls: [ANCHOR_A, ANCHOR_B] })
  })

  it('never sends more than three references', () => {
    const provider = selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['a', 'b', 'c', 'd'],
      characterRefs: { a: ANCHOR_A, b: ANCHOR_B, c: ANCHOR_A, d: ANCHOR_B },
      anchors: {},
      preferred: 'nano-banana',
    })

    expect(provider.kind).toBe('nano-banana')
    if (provider.kind !== 'nano-banana') return
    expect(provider.referenceUrls).toHaveLength(MAX_KEYFRAME_REFERENCES)
  })
})

describe('no character in the frame', () => {
  it('sends the user image only for its style, never as a character', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: USER,
      presentCharacterIds: [],
      anchors: {},
      preferred: 'nano-banana',
    })).toEqual({ kind: 'nano-banana', referenceUrls: [USER], styleOnly: true })
  })

  it('uses FLUX when there is neither a character nor a user image', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: [],
      anchors: {},
    })).toEqual({ kind: 'flux' })
  })
})

describe('the sheet is gone from the pipeline', () => {
  it('does not accept a sheet view as a reference', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('server/story/anchor-selection.ts', 'utf8')

    // A grid reference makes the model return grid frames. 011 and 012 both
    // failed that way, so the selector must not know about sheets at all.
    expect(source).not.toContain('characterSheet')
    expect(source).not.toContain('sheetFallback')
  })
})
