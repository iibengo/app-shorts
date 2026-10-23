// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { selectKeyframeProvider } from '../../../server/story/anchor-selection'

const ANCHOR_A = 'https://v3.fal.media/files/a.jpg'
const ANCHOR_B = 'https://v3.fal.media/files/b.jpg'

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

  it('ignores characters that are not present or not anchored', () => {
    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara'],
      anchors: { clara: ANCHOR_A, rival: ANCHOR_B },
    })).toEqual({ kind: 'kontext', referenceUrl: ANCHOR_A })

    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara', 'rival'],
      anchors: { clara: ANCHOR_A },
    })).toEqual({ kind: 'kontext', referenceUrl: ANCHOR_A })
  })

  it('lets the user reference win and dedupes character ids', () => {
    const reference = 'https://v3.fal.media/files/user.jpg'

    expect(selectKeyframeProvider({
      userReferenceUrl: reference,
      presentCharacterIds: ['clara', 'clara'],
      anchors: { clara: ANCHOR_A },
    })).toEqual({ kind: 'kontext', referenceUrl: reference })

    expect(selectKeyframeProvider({
      userReferenceUrl: null,
      presentCharacterIds: ['clara', 'clara', 'rival'],
      anchors: { clara: ANCHOR_A, rival: ANCHOR_B },
    })).toEqual({ kind: 'kontext-multi', referenceUrls: [ANCHOR_A, ANCHOR_B] })
  })
})
