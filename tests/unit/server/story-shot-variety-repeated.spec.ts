// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectRepeatedFraming } from '../../../server/story/shot-variety'

describe('repeated framing detection', () => {
  it('flags the same framing in the same location twice in a row', () => {
    const advisories = detectRepeatedFraming([
      { order: 1, framing: 'medium', locationId: 'desk' },
      { order: 2, framing: 'medium', locationId: 'desk' },
      { order: 3, framing: 'wide', locationId: 'desk' },
    ])

    expect(advisories).toHaveLength(1)
    expect(advisories[0]).toEqual({
      previousShotOrder: 1,
      shotOrder: 2,
      framing: 'medium',
      locationId: 'desk',
    })
  })

  it('accepts the same framing in a different location', () => {
    expect(detectRepeatedFraming([
      { order: 1, framing: 'medium', locationId: 'desk' },
      { order: 2, framing: 'medium', locationId: 'roof' },
    ])).toHaveLength(0)
  })

  it('accepts a change of framing in the same location', () => {
    expect(detectRepeatedFraming([
      { order: 1, framing: 'medium', locationId: 'desk' },
      { order: 2, framing: 'close-up', locationId: 'desk' },
    ])).toHaveLength(0)
  })

  it('flags each repeated pair in a long run', () => {
    expect(detectRepeatedFraming([
      { order: 1, framing: 'medium', locationId: 'desk' },
      { order: 2, framing: 'medium', locationId: 'desk' },
      { order: 3, framing: 'medium', locationId: 'desk' },
    ])).toHaveLength(2)
  })
})
