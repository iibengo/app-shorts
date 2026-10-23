// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isIdentityFraming } from '../../../server/story/reel-reconciler'

describe('identity anchor framing', () => {
  it('accepts framings where the face is visible', () => {
    for (const framing of ['medium', 'close-up', 'extreme-close-up', 'reaction', 'two-shot']) {
      expect(isIdentityFraming(framing), framing).toBe(true)
    }
  })

  it('rejects framings that cannot show a face', () => {
    for (const framing of ['establishing', 'wide', 'detail', 'insert', 'over-the-shoulder']) {
      expect(isIdentityFraming(framing), framing).toBe(false)
    }
  })
})
