// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  consistencyMessages,
  parseConsistency,
} from '../../../server/story/consistency-check'

const GOOD = JSON.stringify({
  samePerson: true,
  sameHair: true,
  sameBeard: true,
  sameOutfit: true,
  confidence: 0.9,
  problems: [],
})

describe('consistency parser', () => {
  it('accepts a confident match', () => {
    expect(parseConsistency(GOOD).verdict).toBe('match')
  })

  it('treats a false flag as drift and keeps the reasons', () => {
    const result = parseConsistency(JSON.stringify({
      samePerson: true,
      sameHair: false,
      sameBeard: false,
      sameOutfit: true,
      confidence: 0.8,
      problems: ['different beard'],
    }))

    expect(result.verdict).toBe('drift')
    expect(result.reasons).toContain('different beard')
  })

  it('never regenerates on doubt', () => {
    expect(parseConsistency(JSON.stringify({
      samePerson: true,
      sameHair: true,
      sameBeard: true,
      sameOutfit: true,
      confidence: 0.3,
    })).verdict).toBe('unknown')

    expect(parseConsistency('not json').verdict).toBe('unknown')
    expect(parseConsistency('{}').verdict).toBe('unknown')
  })

  it('strips code fences', () => {
    expect(parseConsistency(`\`\`\`json\n${GOOD}\n\`\`\``).verdict).toBe('match')
  })

  it('sends both images with the reference first', () => {
    const messages = consistencyMessages('https://v3.fal.media/a.jpg', 'https://v3.fal.media/b.jpg', 'front')
    const user = messages[1]!

    expect(Array.isArray(user.content)).toBe(true)
    const parts = user.content as readonly { readonly type: string; readonly image_url?: { readonly url: string } }[]

    expect(parts.filter((part) => part.type === 'image_url')).toHaveLength(2)
    expect(parts[1]?.image_url?.url).toBe('https://v3.fal.media/a.jpg')
    expect(parts[2]?.image_url?.url).toBe('https://v3.fal.media/b.jpg')
  })
})
