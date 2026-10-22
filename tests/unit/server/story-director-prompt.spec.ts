// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_JSON_SCHEMA,
  DIRECTOR_SCENE_ROLE_PATTERNS,
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

  it('uses the exact sceneRole pattern for each supported scene count', () => {
    for (const [count, pattern] of Object.entries(DIRECTOR_SCENE_ROLE_PATTERNS)) {
      const prompt = storyDirectorSystemPrompt(Number(count))

      expect(prompt).toContain(`exactamente ${count} beats`)
      expect(prompt).toContain(`Patrón exacto de sceneRole para ${count} escenas: ${pattern}.`)
    }

    expect(DIRECTOR_SCENE_ROLE_PATTERNS[4])
      .toBe('establishing, development, climax, resolution')
    expect(DIRECTOR_SCENE_ROLE_PATTERNS[5])
      .toBe('establishing, development, escalation, climax, resolution')
    expect(DIRECTOR_SCENE_ROLE_PATTERNS[6])
      .toBe('establishing, development, development, escalation, climax, resolution')
  })

  it('enumerates the exact timeOfDay and weather values and rejects synonyms', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain(
      'Valores exactos de timeOfDay: dawn|morning|noon|afternoon|golden-hour|dusk|night.',
    )
    expect(prompt).toContain(
      'Valores exactos de weather: clear|cloudy|overcast|light-rain|rain|storm|snow|fog|windy.',
    )
    expect(prompt).toContain(
      'Prohibido usar sinónimos como day, sunny, sunset, rainy o stormy en timeOfDay o weather.',
    )
  })

  it('defines mobile props, forbids scenery props and bounds the list to 1-3', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain(
      'Los props son objetos móviles que un personaje lleva o usa.',
    )
    expect(prompt).toContain(
      'NO son props el entorno, el cielo, los árboles, los carteles, las rampas ni el decorado.',
    )
    expect(prompt).toContain('Declara entre 1 y 3 props.')
    expect(prompt).toContain(
      'El prop característico (signaturePropId) es el vehículo u objeto principal de la historia y no puede sustituirse por otro.',
    )
    expect(prompt).not.toContain('Homer')
    expect(prompt).not.toContain('Springfield')
    expect(prompt).not.toContain('patinete')
  })

  it('requires the lead and signature prop in every scene and no extra characters', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain(
      'El protagonista (leadCharacterId) y su prop característico (signaturePropId) deben aparecer en "characters" y "props" de TODAS las escenas.',
    )
    expect(prompt).toContain(
      'Cada personaje de la storyBible debe aparecer al menos en una escena; no añadas personajes que no actúen en la premisa ni cameos.',
    )
    expect(prompt).toContain(
      '"continuityFromPrevious" es null en la primera escena; en el resto debe tener al menos 20 caracteres y describir qué personajes, ropa, prop, lugar, hora y clima se conservan de la escena anterior.',
    )
  })

  it('forbids contradictory forbidden entries and additional provider fields', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain(
      'Prohibido incluir en forbidden el id o el nombre del protagonista, del prop característico, del lugar, ni la hora o el clima que sí aparecen en la storyBible.',
    )
    expect(prompt).toContain(
      'forbidden es solo para elementos que NO deben aparecer',
    )
    expect(prompt).toContain(
      'Prohibido añadir campos adicionales en storyBible o en los beats, como negativePrompt, seed, duration o imageUrl.',
    )
    expect(prompt).toContain('no añadas personajes que no actúen en la premisa ni cameos')
  })

  it('asks for a concise response that fits the output budget', () => {
    const prompt = storyDirectorSystemPrompt(5)

    expect(prompt).toContain('Para que la respuesta completa quepa en el presupuesto de salida')
    expect(prompt).toContain('descripciones de personaje y vestuario en una frase')
    expect(prompt).toContain('≤ 90 caracteres')
    expect(prompt).toContain('descripción de prop ≤ 80 caracteres')
    expect(prompt).toContain('visualPrompt ≤ 220 caracteres')
    expect(prompt).toContain('narration ≤ 120 caracteres')
    expect(prompt).toContain('continuityFromPrevious ≤ 100 caracteres')
    expect(prompt).toContain('continuityRules máximo 3 reglas de una frase')
    expect(prompt).toContain('los ids ya los conectan')
    expect(prompt).toContain('Devuelve solo el JSON, sin explicaciones')
    expect(prompt).toContain('no nuevos límites de validación')
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
