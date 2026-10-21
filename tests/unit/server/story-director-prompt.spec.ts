// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_JSON_SCHEMA,
  storyDirectorRepairMessages,
  storyDirectorSystemPrompt,
  storyDirectorUserMessage,
} from '../../../server/story/director-prompt'

const PREMISE = 'Una repostera descubre que sus postres pueden predecir el futuro.'
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

describe('storyDirectorSystemPrompt', () => {
  it('asks for a JSON object with exactly the requested number of beats', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain('Devuelve un objeto JSON')
    expect(prompt).toContain('"title"')
    expect(prompt).toContain('"logline"')
    expect(prompt).toContain('"storyBible"')
    expect(prompt).toContain('"beats"')
    expect(prompt).toContain('exactamente 5 beats')
    expect(prompt).toContain('"order" consecutivo desde 1')
    expect(prompt).toContain('"sceneRole"')
    expect(prompt).toContain('"visualPrompt"')
    expect(prompt).toContain('"narration"')
    expect(prompt).toContain('"characters"')
    expect(prompt).toContain('"props"')
    expect(prompt).toContain('"camera"')
    expect(prompt).toContain('"continuityFromPrevious"')
    expect(prompt).toContain('"transition"')
    expect(prompt).toContain('Escribe en español')
    expect(prompt).toContain('sin HTML')
    expect(prompt).toContain('sin Markdown')
    expect(prompt).toContain('sin texto que deba aparecer en pantalla')
    expect(prompt).toContain('vertical 9:16')
    expect(prompt).toContain('No añadas campos adicionales')
    expect(prompt).not.toContain('http')
    expect(prompt).not.toContain('<')
  })

  it('changes only the scene count between prompts', () => {
    const four = storyDirectorSystemPrompt(4)
    const six = storyDirectorSystemPrompt(6)

    expect(four).toContain('exactamente 4 beats')
    expect(six).toContain('exactamente 6 beats')
    expect(four.replace('4 beats', 'N beats')).toBe(six.replace('6 beats', 'N beats'))
  })

  it('documents the schema limits and required keys', () => {
    expect(DIRECTOR_JSON_SCHEMA).toContain('"title": "string (1-80)"')
    expect(DIRECTOR_JSON_SCHEMA).toContain('"logline": "string (1-200)"')
    expect(DIRECTOR_JSON_SCHEMA).toContain('"order": 1')
    expect(DIRECTOR_JSON_SCHEMA).toContain('"visualPrompt": "string (20-600)"')
    expect(DIRECTOR_JSON_SCHEMA).toContain('"narration": "string (10-280)"')
  })
})

describe('storyDirectorUserMessage', () => {
  it('returns a text-only user message with the premise and schema', () => {
    const message = storyDirectorUserMessage(PREMISE, null)

    expect(message.role).toBe('user')
    expect(typeof message.content).toBe('string')

    const content = message.content as string
    expect(content).toContain(`Premisa: ${PREMISE}`)
    expect(content).toContain(DIRECTOR_JSON_SCHEMA)
    expect(content).not.toContain('<')
    expect(content).not.toContain('image_url')
  })

  it('adds the validated reference as an image_url block', () => {
    const message = storyDirectorUserMessage(PREMISE, REFERENCE)

    expect(message.role).toBe('user')
    expect(Array.isArray(message.content)).toBe(true)

    const blocks = message.content as readonly {
      readonly type: string
      readonly text?: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'text' })
    expect(blocks[0]?.text).toContain(PREMISE)
    expect(blocks[1]).toEqual({
      type: 'image_url',
      image_url: { url: REFERENCE },
    })
  })

  it('treats the premise as literal text without HTML escaping escapes', () => {
    const message = storyDirectorUserMessage('Una premisa con <script>', null)
    const content = message.content as string

    expect(content).toContain('Una premisa con <script>')
  })
})

describe('storyDirectorRepairMessages', () => {
  it('includes the schema, the scene count and the validation reason', () => {
    const messages = storyDirectorRepairMessages(5, '{"bad":true}', 'beats: se esperaban exactamente 5')

    expect(messages).toHaveLength(3)
    expect(messages[0]).toMatchObject({ role: 'user' })
    expect(messages[0]?.content as string).toContain('exactamente 5 beats')
    expect(messages[0]?.content as string).toContain('beats: se esperaban exactamente 5')
    expect(messages[0]?.content as string).toContain(DIRECTOR_JSON_SCHEMA)
    expect(messages[0]?.content as string).toContain('sin HTML')
    expect(messages[0]?.content as string).toContain('sin Markdown')
    expect(messages[1]).toEqual({ role: 'assistant', content: '{"bad":true}' })
    expect(messages[2]).toMatchObject({ role: 'user' })
    expect(messages[2]?.content as string).toContain('Devuelve únicamente el objeto JSON')
  })
})
