// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_JSON_SCHEMA,
  storyDirectorRepairMessages,
  storyDirectorUserMessage,
} from '../../../server/story/director-prompt'
import type { DeepSeekMessage } from '../../../server/story/director-types'
import {
  BRIEF_MAX_RENDERED_LENGTH,
  analyzePremise,
  renderBriefBlock,
} from '../../../server/story/premise-brief'

const PREMISE = 'Una repostera muy famosa'
const INACTIVE_PREMISE =
  'Una repostera descubre que sus postres predicen el futuro, aunque nadie lo sabe todavía.'
const REFERENCE = 'https://v3.fal.media/files/test/reference.webp'

function textOf(message: DeepSeekMessage): string {
  if (typeof message.content !== 'string') {
    throw new Error('expected a plain text message')
  }

  return message.content
}

function blockFor(premise: string): string {
  return renderBriefBlock(analyzePremise(premise).brief)
}

function expectedWithoutBrief(premise: string): string {
  return `Premisa: ${premise}\n\nDevuelve exactamente el JSON del esquema:\n${DIRECTOR_JSON_SCHEMA}`
}

describe('storyDirectorUserMessage byte identity', () => {
  it('keeps today string when the third argument is missing', () => {
    expect(textOf(storyDirectorUserMessage(PREMISE, null)))
      .toBe(expectedWithoutBrief(PREMISE))
  })

  it('keeps today string with an explicit undefined context', () => {
    expect(textOf(storyDirectorUserMessage(PREMISE, null, undefined)))
      .toBe(expectedWithoutBrief(PREMISE))
  })

  it('keeps today string with an inactive context', () => {
    const context = { brief: analyzePremise(INACTIVE_PREMISE).brief }

    expect(context.brief.applied).toBe(false)
    expect(textOf(storyDirectorUserMessage(INACTIVE_PREMISE, null, context)))
      .toBe(expectedWithoutBrief(INACTIVE_PREMISE))
  })

  it('keeps today text block with a reference and no context', () => {
    const message = storyDirectorUserMessage(PREMISE, REFERENCE)
    const blocks = message.content as readonly {
      readonly type: string
      readonly text?: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.text).toBe(expectedWithoutBrief(PREMISE))
    expect(blocks[1]).toEqual({ type: 'image_url', image_url: { url: REFERENCE } })
  })

  it('keeps the reference as the last block when the brief applies', () => {
    const context = { brief: analyzePremise(PREMISE).brief }
    const message = storyDirectorUserMessage(PREMISE, REFERENCE, context)
    const blocks = message.content as readonly {
      readonly type: string
      readonly text?: string
      readonly image_url?: { readonly url: string }
    }[]

    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[1]).toEqual({ type: 'image_url', image_url: { url: REFERENCE } })
  })
})

describe('storyDirectorUserMessage with a brief', () => {
  it('places the premise, then the block and then the schema', () => {
    const block = blockFor(PREMISE)
    const content = textOf(storyDirectorUserMessage(PREMISE, null, {
      brief: analyzePremise(PREMISE).brief,
    }))

    expect(content).toBe(
      `Premisa: ${PREMISE}\n\n${block}\n\nDevuelve exactamente el JSON del esquema:\n${DIRECTOR_JSON_SCHEMA}`,
    )

    const premiseIndex = content.indexOf(`Premisa: ${PREMISE}`)
    const blockIndex = content.indexOf(block)
    const schemaIndex = content.indexOf(DIRECTOR_JSON_SCHEMA)

    expect(blockIndex).toBe(premiseIndex + `Premisa: ${PREMISE}`.length + 2)
    expect(schemaIndex).toBe(blockIndex + block.length + 2 + 'Devuelve exactamente el JSON del esquema:\n'.length)
    expect(content.endsWith(DIRECTOR_JSON_SCHEMA)).toBe(true)
  })

  it('separates premise, block and schema with blank lines', () => {
    const block = blockFor(PREMISE)
    const content = textOf(storyDirectorUserMessage(PREMISE, null, {
      brief: analyzePremise(PREMISE).brief,
    }))

    expect(content).toContain(`Premisa: ${PREMISE}\n\n${block}\n\nDevuelve`)
    expect(content.split('\n\n').length).toBeGreaterThanOrEqual(3)
  })

  it('keeps the block under 500 characters', () => {
    const block = blockFor(PREMISE)

    expect(block.length).toBeGreaterThan(0)
    expect(block.length).toBeLessThanOrEqual(BRIEF_MAX_RENDERED_LENGTH)
    expect(block.length).toBeLessThanOrEqual(500)
  })

  it('does not depend on the premise content', () => {
    const premises = [
      PREMISE,
      'Otro texto completamente distinto, con dos cláusulas.',
      'a'.repeat(600),
    ]
    const blocks = premises.map((premise) => blockFor(premise))

    expect(blocks[0]).toBe(blocks[1])
    expect(blocks[0]).toBe(blocks[2])

    for (const premise of premises) {
      const content = textOf(storyDirectorUserMessage(premise, null, {
        brief: analyzePremise(premise).brief,
      }))

      expect(content.indexOf(premise)).toBe(content.lastIndexOf(premise))
      expect(blocks[0]).not.toContain(premise)
    }
  })

  it('uses no markup, backticks, headings or URLs in the block', () => {
    const block = blockFor(PREMISE)

    expect(block).not.toMatch(/[<>`]/)
    expect(block).not.toMatch(/(^|\n)\s*#/)
    expect(block).not.toMatch(/https?:\/\//)
    expect(block).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/)
  })
})

describe('storyDirectorRepairMessages optional truncation flag', () => {
  it('keeps the current messages when the flag is missing', () => {
    const legacy = storyDirectorRepairMessages(5, '{"bad":true}', 'json inválido')
    const explicit = storyDirectorRepairMessages(5, '{"bad":true}', 'json inválido', false)

    expect(legacy).toEqual(explicit)
    expect(legacy[0]?.content as string).not.toContain('truncó')
  })

  it('adds an explicit truncation note when requested', () => {
    const truncated = storyDirectorRepairMessages(5, '{"bad":true}', 'json inválido', true)
    const content = truncated[0]?.content as string

    expect(content).toContain('truncó')
    expect(content).toContain('exactamente 5 beats')
    expect(content).toContain(DIRECTOR_JSON_SCHEMA)
    expect(truncated).toHaveLength(3)
    expect(truncated[1]).toEqual({ role: 'assistant', content: '{"bad":true}' })
  })
})
