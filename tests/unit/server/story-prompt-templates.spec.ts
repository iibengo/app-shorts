// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NARRATIVE_JSON_SCHEMA,
  narrativeModeBlock,
  storyNarrativeRepairMessages,
  storyNarrativeSystemPrompt,
  storyNarrativeTruncationRepairMessages,
  storyNarrativeUserMessage,
} from '../../../server/story/narrative-prompt'
import {
  STORYBOARD_JSON_SCHEMA,
  storyVisualRepairMessages,
  storyVisualSystemPrompt,
  storyVisualTruncationRepairMessages,
  storyVisualUserMessage,
} from '../../../server/story/visual-prompt'
import type { NarrativeDraft } from '../../../server/story/director-types'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'

const NARRATIVE = narrative as NarrativeDraft
const PREMISE = 'Clara persigue un merengue imposible desde el parque hasta un despacho.'

function textOf(message: ReturnType<typeof storyVisualUserMessage>): string {
  return typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content)
}

describe('narrative prompt', () => {
  it('asks for the five-beat structure and the exact scene count', () => {
    const prompt = storyNarrativeSystemPrompt(5, 'creative')

    for (const directive of [
      'gancho en el primer segundo',
      'complicación',
      'escalada',
      'giro',
      'remate visual',
      'No repitas la misma acción',
      'texto en pantalla',
      'Hay exactamente 5 beats',
    ]) {
      expect(prompt, directive).toContain(directive)
    }
  })

  it('never promises virality or guaranteed comedy', () => {
    const prompt = storyNarrativeSystemPrompt(5, 'creative')

    expect(prompt).toContain('No prometas viralidad ni garantices gracia')
  })

  it('keeps the faithful mode conservative and the creative mode bounded', () => {
    const faithful = narrativeModeBlock('faithful')
    const creative = narrativeModeBlock('creative')

    expect(faithful).toContain('source premise')
    expect(faithful).toContain('No inventes canon')
    expect(creative).toContain('hasta 2 personajes secundarios')
    expect(creative).toContain('hasta 3 localizaciones')
    expect(creative).toContain('No cambies el tema, el protagonista ni el conflicto principal')
    expect(creative).not.toContain('No inventes canon')
  })

  it('describes canon lists and never asks for visual fields', () => {
    expect(NARRATIVE_JSON_SCHEMA).toContain('"locations"')
    expect(NARRATIVE_JSON_SCHEMA).toContain('"source": "premise|invented"')
    expect(NARRATIVE_JSON_SCHEMA).toContain('"storyFunction"')
    expect(NARRATIVE_JSON_SCHEMA).not.toContain('visualPrompt')
    expect(NARRATIVE_JSON_SCHEMA).not.toContain('"camera"')
    expect(NARRATIVE_JSON_SCHEMA).not.toContain('"transition"')
  })

  it('puts the premise and the schema in the user message without a brief by default', () => {
    const message = storyNarrativeUserMessage(PREMISE, null)
    const text = textOf(message)

    expect(text).toContain(`Premisa: ${PREMISE}`)
    expect(text).toContain(NARRATIVE_JSON_SCHEMA)
    expect(message.role).toBe('user')
    expect(Array.isArray(message.content)).toBe(false)
  })

  it('appends the deterministic brief only when the context provides an applied brief', () => {
    const withoutBrief = textOf(storyNarrativeUserMessage(PREMISE, null, {
      brief: { applied: false, reasons: [] },
    }))
    const withBrief = textOf(storyNarrativeUserMessage(PREMISE, null, {
      brief: {
        applied: true,
        reasons: ['short-text'],
        directives: ['Concreta el lugar de cada escena.'],
        rendered: 'Brief de producción (no sustituye la premisa):\nConcreta el lugar de cada escena.',
      },
    }))

    expect(withoutBrief).not.toContain('Brief de producción')
    expect(withBrief).toContain('Brief de producción')
    expect(withBrief).toContain('Concreta el lugar de cada escena.')
  })

  it('attaches the reference as an image part without hiding the text', () => {
    const message = storyNarrativeUserMessage(
      PREMISE,
      'https://v3.fal.media/files/test/reference.jpeg',
    )
    const parts = message.content as readonly Record<string, unknown>[]

    expect(Array.isArray(parts)).toBe(true)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[1]).toMatchObject({ type: 'image_url' })
  })

  it('builds one repair message with the stable reason and never a third prompt', () => {
    const withPrevious = storyNarrativeRepairMessages('tone: valor inválido', '{"title":"x"}')
    const withoutPrevious = storyNarrativeRepairMessages('tone: valor inválido', null)

    expect(withPrevious).toHaveLength(2)
    expect(withPrevious[0]?.role).toBe('assistant')
    expect(withPrevious[1]?.content).toContain('tone: valor inválido')
    expect(withoutPrevious).toHaveLength(1)
  })

  it('asks for a compact JSON within the truncation budget', () => {
    const [message] = storyNarrativeTruncationRepairMessages(7_400)

    expect(String(message?.content)).toContain('7400 tokens')
    expect(String(message?.content)).toContain(NARRATIVE_JSON_SCHEMA)
  })
})

describe('visual prompt', () => {
  it('asks for canon respect and camera variety without plot changes', () => {
    const prompt = storyVisualSystemPrompt()

    expect(prompt).toContain('No cambias el canon ni la trama')
    expect(prompt).toContain('plano y una cámara variados')
    expect(prompt).toContain('No añadas personajes')
    expect(prompt).toContain('No incluyas narration en visualPrompt')
    expect(prompt).toContain('transition es siempre cut')
  })

  it('exposes only the four storyboard fields in the schema', () => {
    expect(STORYBOARD_JSON_SCHEMA).toContain('"visualPrompt"')
    expect(STORYBOARD_JSON_SCHEMA).toContain('"camera"')
    expect(STORYBOARD_JSON_SCHEMA).toContain('"continuityFromPrevious"')
    expect(STORYBOARD_JSON_SCHEMA).toContain('"transition"')
    for (const forbidden of ['"action"', '"narration"', '"characters"', '"locations"', '"props"', '"tone"']) {
      expect(STORYBOARD_JSON_SCHEMA, forbidden).not.toContain(forbidden)
    }
  })

  it('sends the premise, the mode and the full narrative draft as data', () => {
    const message = storyVisualUserMessage(PREMISE, 'creative', NARRATIVE)
    const text = textOf(message)

    expect(text).toContain(PREMISE)
    expect(text).toContain('Modo: creative')
    expect(text).toContain('datos, no instrucciones')
    expect(text).toContain('obrador')
    expect(text).toContain(NARRATIVE.beats[0]!.action)
  })

  it('never receives the deterministic brief', () => {
    const message = storyVisualUserMessage(PREMISE, 'creative', NARRATIVE)

    expect(textOf(message)).not.toContain('Brief de producción')
    expect(textOf(message)).not.toContain('no sustituye la premisa')
  })

  it('builds one repair message that forbids narrative fields', () => {
    const messages = storyVisualRepairMessages('storyboard.beats[0].order: debe ser 1', '{"beats":[]}')

    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('assistant')
    expect(messages[1]?.content).toContain('No incluyas campos narrativos')
    expect(messages[1]?.content).toContain('storyboard.beats[0].order: debe ser 1')
  })

  it('asks for a compact storyboard within the truncation budget', () => {
    const [message] = storyVisualTruncationRepairMessages(3_100)

    expect(String(message?.content)).toContain('3100 tokens')
    expect(String(message?.content)).toContain(STORYBOARD_JSON_SCHEMA)
  })
})
