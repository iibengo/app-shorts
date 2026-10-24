// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { looksLikeTextInFrame, type PixelSample } from '../../../server/story/text-in-frame'

const WIDTH = 128
const HEIGHT = 384

/** A low-poly scene: hard facet edges, few of them per row. */
function cleanRenderSample(): PixelSample {
  const luma: number[] = []

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      // Broad bands with one hard edge every ~40 px, like flat shaded faces.
      const face = Math.floor(x / 40)
      const vertical = Math.floor(y / 60)

      luma.push(((face + vertical) % 3) * 90 + 20)
    }
  }

  return { width: WIDTH, height: HEIGHT, luma }
}

/** Rows of glyphs: high contrast, alternating every couple of pixels. */
function captionedSample(): PixelSample {
  const base = cleanRenderSample()
  const luma = [...base.luma]

  for (let y = 150; y < 170; y += 1) {
    for (let x = 10; x < 110; x += 1) {
      luma[y * WIDTH + x] = x % 3 === 0 ? 240 : 15
    }
  }

  return { width: WIDTH, height: HEIGHT, luma }
}

/** A blank wall: no meaningful edges anywhere. */
function blankSample(): PixelSample {
  return {
    width: WIDTH,
    height: HEIGHT,
    luma: new Array<number>(WIDTH * HEIGHT).fill(160),
  }
}

describe('text in frame detection', () => {
  it('accepts a low-poly scene with hard facet edges', () => {
    // The first version of this detector used a 32x96 sample and flagged this
    // as text. Calibration on real output fixed it.
    expect(looksLikeTextInFrame(cleanRenderSample())).toBe(false)
  })

  it('accepts a blank surface', () => {
    expect(looksLikeTextInFrame(blankSample())).toBe(false)
  })

  it('rejects a frame with rows of legible text', () => {
    expect(looksLikeTextInFrame(captionedSample())).toBe(true)
  })

  it('ignores a sample too small to judge', () => {
    expect(looksLikeTextInFrame({ width: 8, height: 8, luma: new Array(64).fill(0) })).toBe(false)
  })

  it('ignores a truncated buffer', () => {
    expect(looksLikeTextInFrame({
      width: WIDTH,
      height: HEIGHT,
      luma: new Array(100).fill(0),
    })).toBe(false)
  })

  it('scales the row threshold with the sample width', () => {
    // Half the width cannot hold six changes worth of 128-px glyphs by the same
    // rule, so a narrow sample of the same picture must not flip the answer.
    const half: PixelSample = {
      width: 64,
      height: HEIGHT,
      luma: cleanRenderSample().luma.filter((_, index) => index % 2 === 0),
    }

    expect(looksLikeTextInFrame(half)).toBe(false)
  })
})
