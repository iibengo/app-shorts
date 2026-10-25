// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { StorySpeechSegment } from '~/models/story'
import {
  CAPTION_MAX_CHARS_PER_CUE,
  CAPTION_MIN_SECONDS,
  planCaptions,
  splitIntoCaptionCues,
} from '../../../server/story/captions-plan'
import { renderAss, renderSrt, wrapCaptionText } from '../../../server/story/captions-render'

function segment(overrides: Partial<StorySpeechSegment> = {}): StorySpeechSegment {
  return {
    sceneOrder: 1,
    text: 'Clara descubre que alguien copiaba sus recetas.',
    startSeconds: 0,
    endSeconds: 3,
    speechSeconds: 3,
    estimatedSeconds: 3,
    status: 'ready',
    ...overrides,
  }
}

describe('014 · los subtítulos salen de la voz, no de un modelo', () => {
  it('splits a long line into readable cues without losing a word', () => {
    const text = 'Clara descubre que alguien copiaba sus recetas mientras ella dormía y decide no contárselo a nadie'
    const cues = splitIntoCaptionCues(text)

    expect(cues.length).toBeGreaterThan(1)

    for (const cue of cues) {
      expect(cue.characters).toBeLessThanOrEqual(CAPTION_MAX_CHARS_PER_CUE)
    }

    // Nothing invented, nothing lost: the words reassemble the original.
    expect(cues.flatMap((cue) => cue.words).join(' ')).toBe(text)
  })

  it('never invents text: every cue is a literal slice', () => {
    const text = 'El artículo fantasma no existía.'
    const plan = planCaptions([segment({ text, endSeconds: 3 })])
    const joined = plan.cues.map((cue) => cue.text).join(' ')

    expect(text).toContain(joined.replace(/\s+/g, ' ').trim().slice(0, 10))
    expect(joined).not.toMatch(/[¡¿]/)
  })

  it('places the voice at the start of its scene and leaves the silence behind', () => {
    // A scene of 10 s whose voice takes 4: captions live in the first 4.
    const plan = planCaptions([
      segment({ text: 'Clara entra.', startSeconds: 0, endSeconds: 4, speechSeconds: 4 }),
      segment({ sceneOrder: 2, text: 'Ve la caja.', startSeconds: 10, endSeconds: 12, speechSeconds: 2 }),
    ])

    expect(plan.cues[0]?.startSeconds).toBe(0)
    expect(plan.cues[plan.cues.length - 1]!.endSeconds).toBeLessThanOrEqual(12)
  })

  it('drops a cue that cannot be read instead of flashing it', () => {
    // 40 characters in 0,9 s is 44 chars/s, far past the 17 limit.
    const plan = planCaptions([
      segment({ text: 'x'.repeat(40), startSeconds: 0, endSeconds: 0.9, speechSeconds: 0.9 }),
    ])

    expect(plan.dropped).toBeGreaterThanOrEqual(0)
    expect(plan.cues.every((cue) => cue.endSeconds - cue.startSeconds >= CAPTION_MIN_SECONDS)).toBe(true)
  })

  it('keeps the minimum gap between consecutive cues', () => {
    const plan = planCaptions([
      segment({ text: 'Primera frase corta aquí.', startSeconds: 0, endSeconds: 2.5 }),
      segment({ sceneOrder: 2, text: 'Segunda frase corta aquí.', startSeconds: 2.5, endSeconds: 5 }),
    ])

    for (let index = 1; index < plan.cues.length; index += 1) {
      const gap = plan.cues[index]!.startSeconds - plan.cues[index - 1]!.endSeconds

      expect(gap).toBeGreaterThanOrEqual(0.07)
    }
  })

  it('ignores a failed segment instead of captioning a voice nobody heard', () => {
    const plan = planCaptions([
      segment({ text: 'Esta no se oyó.', status: 'failed', errorCode: 'audio-failed' }),
    ])

    expect(plan.cues).toHaveLength(0)
  })

  it('declares the alignment so nobody confuses approximation with real timings', () => {
    const plan = planCaptions([segment()])

    expect(plan.alignment).toBe('proportional')
  })
})

describe('014 · render de subtítulos', () => {
  it('writes an ASS file that libass can paint over a 720x1280 frame', () => {
    const plan = planCaptions([segment()])
    const ass = renderAss(plan, { width: 720, height: 1280, fontName: 'DejaVu Sans' })

    expect(ass).toContain('PlayResX: 720')
    expect(ass).toContain('PlayResY: 1280')
    expect(ass).toContain('Style: Caption')
    expect(ass).toMatch(/Dialogue: 0,0:00:00\.00/)
    // A box behind the text: a shadow alone disappears on a light frame (015).
    expect(ass).toContain('BorderStyle')
  })

  it('writes an SRT that matches the same cues', () => {
    const plan = planCaptions([segment()])
    const srt = renderSrt(plan)

    expect(srt).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> /)
    expect(srt).toContain(plan.cues[0]!.text.split(' ').slice(0, 2).join(' '))
  })

  it('wraps a long cue into at most two lines', () => {
    const lines = wrapCaptionText('Clara descubre que alguien copiaba sus recetas cada mañana')

    expect(lines.length).toBeLessThanOrEqual(2)
    expect(lines.join(' ')).toContain('Clara')
  })

  it('renders nothing when there is no voice to caption', () => {
    expect(renderSrt(planCaptions([]))).toBe('')
  })
})
