// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BEATS_JSON_SCHEMA,
  CANON_JSON_SCHEMA,
  narrativeModeBlock,
  storyBeatsRepairMessages,
  storyBeatsSystemPrompt,
  storyBeatsTruncationRepairMessages,
  storyBeatsUserMessage,
  storyCanonRepairMessages,
  storyCanonSystemPrompt,
  storyCanonTruncationRepairMessages,
  storyCanonUserMessage,
} from '../../../server/story/narrative-prompt'
import {
  STORYBOARD_JSON_SCHEMA,
  storyVisualRepairMessages,
  storyVisualSystemPrompt,
  storyVisualTruncationRepairMessages,
  storyVisualUserMessage,
} from '../../../server/story/visual-prompt'
import type { DeepSeekMessage, NarrativeDraft } from '../../../server/story/director-types'
import narrative from '../../fixtures/deepseek/narrative-creative-3-locations.json'

const NARRATIVE = narrative as NarrativeDraft
const PREMISE = 'Clara persigue un merengue imposible desde el parque hasta un despacho.'

function textOf(message: DeepSeekMessage): string {
  return typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content)
}

describe('canon prompt', () => {
  it('asks only for canon and the tightened limits', () => {
    const prompt = storyCanonSystemPrompt('creative')

    for (const directive of [
      'Primera etapa',
      'canon narrativo',
      'No incluyas beats',
      'style y theme 10–120',
      'descripciones de personaje 20–90',
      'máximo 6 prohibiciones',
    ]) {
      expect(prompt, directive).toContain(directive)
    }
    expect(prompt).not.toContain('visualPrompt')
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

  it('describes canon lists and never asks for beats or visual fields', () => {
    expect(CANON_JSON_SCHEMA).toContain('"locations"')
    expect(CANON_JSON_SCHEMA).toContain('"source": "premise|invented"')
    expect(CANON_JSON_SCHEMA).toContain('"forbidden"')
    expect(CANON_JSON_SCHEMA).not.toContain('"beats"')
    expect(CANON_JSON_SCHEMA).not.toContain('visualPrompt')
    expect(CANON_JSON_SCHEMA).not.toContain('"camera"')
    expect(CANON_JSON_SCHEMA).not.toContain('"transition"')
  })

  it('puts the premise, schema and optional brief in the canon user message', () => {
    const withoutBrief = textOf(storyCanonUserMessage(PREMISE, null, {
      brief: { applied: false, reasons: [] },
    }))
    const withBrief = textOf(storyCanonUserMessage(PREMISE, null, {
      brief: {
        applied: true,
        reasons: ['short-text'],
        directives: ['Concreta el lugar de cada escena.'],
        rendered: 'Brief de producción (no sustituye la premisa):\nConcreta el lugar de cada escena.',
      },
    }))

    expect(withoutBrief).toContain(`Premisa: ${PREMISE}`)
    expect(withoutBrief).toContain(CANON_JSON_SCHEMA)
    expect(withoutBrief).not.toContain('Brief de producción')
    expect(withBrief).toContain('Brief de producción')
    expect(withBrief).toContain('Concreta el lugar de cada escena.')
  })

  it('attaches the reference image only in the canon message', () => {
    const message = storyCanonUserMessage(
      PREMISE,
      'https://v3.fal.media/files/test/reference.jpeg',
    )
    const parts = message.content as readonly Record<string, unknown>[]

    expect(Array.isArray(parts)).toBe(true)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[1]).toMatchObject({ type: 'image_url' })
  })

  it('builds separate canon repair and truncation prompts', () => {
    const withPrevious = storyCanonRepairMessages('tone: valor inválido', '{"title":"x"}')
    const withoutPrevious = storyCanonRepairMessages('tone: valor inválido', null)
    const [truncated] = storyCanonTruncationRepairMessages(3_400)

    expect(withPrevious).toHaveLength(2)
    expect(withPrevious[0]?.role).toBe('assistant')
    expect(withPrevious[1]?.content).toContain('tone: valor inválido')
    expect(withPrevious[1]?.content).toContain(CANON_JSON_SCHEMA)
    expect(withoutPrevious).toHaveLength(1)
    expect(String(truncated?.content)).toContain('3400 tokens')
    expect(String(truncated?.content)).toContain(CANON_JSON_SCHEMA)
  })
})

describe('beats prompt', () => {
  it('asks for the exact scene count and the five-beat structure', () => {
    const prompt = storyBeatsSystemPrompt(5, 'creative')

    for (const directive of [
      'Segunda etapa',
      'No cambies el canon',
      'No añadas campos visuales',
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
    const prompt = storyBeatsSystemPrompt(5, 'creative')

    expect(prompt).toContain('No prometas viralidad ni garantices gracia')
  })

  it('exposes only narrative beat fields and no canon or visual fields', () => {
    expect(BEATS_JSON_SCHEMA).toContain('"beats"')
    expect(BEATS_JSON_SCHEMA).toContain('"locationId"')
    expect(BEATS_JSON_SCHEMA).toContain('"storyFunction"')
    expect(BEATS_JSON_SCHEMA).not.toContain('"storyBible"')
    expect(BEATS_JSON_SCHEMA).not.toContain('visualPrompt')
    expect(BEATS_JSON_SCHEMA).not.toContain('"camera"')
    expect(BEATS_JSON_SCHEMA).not.toContain('"transition"')
  })

  it('sends the premise and validated canon without a reference image', () => {
    const canonJson = JSON.stringify({ title: 'El azúcar lo sabe', storyBible: { id: 'x' } })
    const text = textOf(storyBeatsUserMessage(PREMISE, canonJson))

    expect(text).toContain(`Premisa: ${PREMISE}`)
    expect(text).toContain(canonJson)
    expect(text).toContain(BEATS_JSON_SCHEMA)
    expect(text).not.toContain('image_url')
  })

  it('builds separate beats repair and truncation prompts', () => {
    const withPrevious = storyBeatsRepairMessages('beats: se esperaban exactamente 5', '{"beats":[]}')
    const [truncated] = storyBeatsTruncationRepairMessages(5_400)

    expect(withPrevious).toHaveLength(2)
    expect(withPrevious[0]?.role).toBe('assistant')
    expect(withPrevious[1]?.content).toContain('beats: se esperaban exactamente 5')
    expect(withPrevious[1]?.content).toContain(BEATS_JSON_SCHEMA)
    expect(String(truncated?.content)).toContain('5400 tokens')
    expect(String(truncated?.content)).toContain(BEATS_JSON_SCHEMA)
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
