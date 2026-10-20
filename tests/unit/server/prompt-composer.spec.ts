// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { PromptComposer } from '../../../server/composer/prompt-composer'

const composer = new PromptComposer()
const PROMPT = 'Un short sobre luz natural'

describe('PromptComposer templates', () => {
  it('builds the exact FLUX keyframe template', () => {
    expect(composer.keyframeFlux(PROMPT)).toBe(
      'Cinematic vertical 9:16 keyframe for a short video. Un short sobre luz natural. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.',
    )
  })

  it('builds the exact Kontext keyframe template', () => {
    expect(composer.keyframeKontext(PROMPT)).toBe(
      'Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short video. Un short sobre luz natural. Preserve the subject identity, clothing and color palette. No text, no watermark, no logo.',
    )
  })

  it('builds the exact video template', () => {
    expect(composer.videoPrompt(PROMPT)).toBe(
      'Un short sobre luz natural. Vertical 9:16 short video, smooth natural motion, consistent subject, no text, no watermark, no logo.',
    )
  })

  it('inserts the user prompt literally', () => {
    const prompt = '<script>alert("x")</script>\nsegunda línea'

    expect(composer.videoPrompt(prompt)).toContain(prompt)
    expect(composer.keyframeFlux(prompt)).toContain(prompt)
  })

  it('hashes prompts with sha256 and never logs the prompt', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const hash = composer.hashPrompt(PROMPT)

    expect(hash).toBe(createHash('sha256').update(PROMPT).digest('hex'))
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(PROMPT)
    expect(composer.hashPrompt(PROMPT)).toBe(hash)
    expect(composer.hashPrompt(`${PROMPT} `)).not.toBe(hash)

    expect(log).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
