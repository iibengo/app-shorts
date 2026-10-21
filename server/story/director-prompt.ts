import type { DeepSeekMessage, DirectorContext } from './director-types'
import {
  DIRECTOR_MAX_LOGLINE_LENGTH,
  DIRECTOR_MAX_NARRATION_LENGTH,
  DIRECTOR_MAX_TITLE_LENGTH,
  DIRECTOR_MAX_VISUAL_PROMPT_LENGTH,
  DIRECTOR_MIN_NARRATION_LENGTH,
  DIRECTOR_MIN_VISUAL_PROMPT_LENGTH,
} from './plan-validator'
import { renderBriefBlock } from './premise-brief'

export const DIRECTOR_JSON_SCHEMA = `{
  "title": "string (1-80)",
  "logline": "string (1-200)",
  "beats": [
    {
      "order": 1,
      "visualPrompt": "string (20-600)",
      "narration": "string (10-280)"
    }
  ]
}`

export function storyDirectorSystemPrompt(sceneCount: number): string {
  return 'Eres un director de micro-relatos verticales. Devuelve un objeto JSON con "title", "logline" y "beats". '
    + `Debe haber exactamente ${sceneCount} beats con "order" consecutivo desde 1, "visualPrompt" y "narration". `
    + 'Escribe en español, sin HTML, sin Markdown, sin texto que deba aparecer en pantalla. '
    + 'Cada visualPrompt describe una imagen vertical 9:16 coherente con las demás; cada narration es una frase breve para leer en la interfaz. '
    + `Límites: title 1-${DIRECTOR_MAX_TITLE_LENGTH} caracteres, logline 1-${DIRECTOR_MAX_LOGLINE_LENGTH}, `
    + `visualPrompt ${DIRECTOR_MIN_VISUAL_PROMPT_LENGTH}-${DIRECTOR_MAX_VISUAL_PROMPT_LENGTH}, `
    + `narration ${DIRECTOR_MIN_NARRATION_LENGTH}-${DIRECTOR_MAX_NARRATION_LENGTH}. `
    + 'No añadas campos adicionales. Devuelve solo el objeto JSON.'
}

export function storyDirectorUserMessage(
  premise: string,
  referenceUrl: string | null,
  context?: DirectorContext,
): DeepSeekMessage {
  const block = context === undefined ? '' : renderBriefBlock(context.brief)
  const blockPart = block.length > 0 ? `${block}\n\n` : ''
  const instructions = `Premisa: ${premise}\n\n${blockPart}Devuelve exactamente el JSON del esquema:\n${DIRECTOR_JSON_SCHEMA}`

  if (!referenceUrl) {
    return { role: 'user', content: instructions }
  }

  return {
    role: 'user',
    content: [
      { type: 'text', text: instructions },
      { type: 'image_url', image_url: { url: referenceUrl } },
    ],
  }
}

export function storyDirectorRepairMessages(
  sceneCount: number,
  previousContent: string,
  reason: string,
  truncated = false,
): readonly DeepSeekMessage[] {
  const truncationNote = truncated
    ? ' La respuesta anterior se truncó por el límite de tokens: acorta title, logline, visualPrompt y narration para que el JSON completo quepa en la respuesta.'
    : ''

  return [
    {
      role: 'user',
      content: `La respuesta anterior no cumple el esquema (${reason}). `
        + `Corrige el JSON para que tenga exactamente ${sceneCount} beats válidos, `
        + 'sin HTML, sin Markdown y sin campos adicionales. '
        + `Esquema:\n${DIRECTOR_JSON_SCHEMA}`
        + truncationNote,
    },
    { role: 'assistant', content: previousContent },
    {
      role: 'user',
      content: 'Devuelve únicamente el objeto JSON corregido, sin explicaciones.',
    },
  ]
}
