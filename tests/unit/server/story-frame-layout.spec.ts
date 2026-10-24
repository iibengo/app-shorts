// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { looksLikeStackedPanels, rowMeans, type PixelSample } from '../../../server/story/frame-layout'

const WIDTH = 32
const HEIGHT = 96

/** A textured scene: every row has internal contrast. */
function texturedSample(): PixelSample {
  const luma: number[] = []

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      luma.push((x * 37 + y * 11) % 256)
    }
  }

  return { width: WIDTH, height: HEIGHT, luma }
}

/**
 * Two stacked panels: a thin flat seam with a visible panel border, which is
 * what a stacked diptych looks like once downscaled to the sample size.
 */
function stackedSample(): PixelSample {
  const luma: number[] = new Array<number>(WIDTH * HEIGHT).fill(0)
  const seamTop = Math.floor(HEIGHT * 0.48)
  const seamBottom = Math.floor(HEIGHT * 0.52)

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const inSeam = y >= seamTop && y < seamBottom

      const value = inSeam
        ? (x < 3 ? 5 : 128)
        : (x * 37 + y * 11) % 256

      luma[y * WIDTH + x] = value
    }
  }

  return { width: WIDTH, height: HEIGHT, luma }
}

describe('stacked panel detection', () => {
  it('accepts a single continuous frame', () => {
    expect(looksLikeStackedPanels(texturedSample())).toBe(false)
  })

  it('rejects two panels separated by a flat seam', () => {
    expect(looksLikeStackedPanels(stackedSample())).toBe(true)
  })

  it('accepts a flat background without a hard edge', () => {
    const flat: PixelSample = {
      width: WIDTH,
      height: HEIGHT,
      luma: new Array<number>(WIDTH * HEIGHT).fill(140),
    }

    expect(looksLikeStackedPanels(flat)).toBe(false)
  })

  it('ignores samples that are too small to judge', () => {
    expect(looksLikeStackedPanels({ width: 2, height: 2, luma: [1, 2, 3, 4] })).toBe(false)
  })

  it('computes one mean per row', () => {
    const means = rowMeans({
      width: 2,
      height: 2,
      luma: [0, 10, 20, 30],
    })

    expect(means).toEqual([5, 25])
  })
})
