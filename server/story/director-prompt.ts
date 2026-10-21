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
  "storyBible": {
    "style": "string (10-160)",
    "location": { "name": "string (1-60)", "description": "string (10-160)" },
    "timeOfDay": "dawn|morning|noon|afternoon|golden-hour|dusk|night",
    "weather": "clear|cloudy|overcast|light-rain|rain|storm|snow|fog|windy",
    "leadCharacterId": "id de un personaje de la biblia",
    "signaturePropId": "id de un prop de la biblia o null",
    "characters": [
      {
        "id": "minúsculas, empieza por letra, 2-24: ^[a-z][a-z0-9-]{1,23}$",
        "name": "string (1-40)",
        "description": "string (20-160)",
        "wardrobe": "string (10-120)"
      }
    ],
    "props": [
      {
        "id": "minúsculas, empieza por letra, 2-24: ^[a-z][a-z0-9-]{1,23}$",
        "name": "string (1-40)",
        "description": "string (10-120)"
      }
    ],
    "forbidden": ["string (2-50)"],
    "continuityRules": ["string (4-140)"]
  },
  "beats": [
    {
      "order": 1,
      "sceneRole": "establishing|development|escalation|climax|resolution",
      "visualPrompt": "string (20-600)",
      "narration": "string (10-280)",
      "characters": ["id de la biblia"],
      "props": ["id de la biblia"],
      "camera": "wide|medium|close-up|low-angle|high-angle|tracking|over-the-shoulder|detail",
      "continuityFromPrevious": "null en la primera escena; string (20-200) en el resto",
      "transition": "cut"
    }
  ]
}`

export function storyDirectorSystemPrompt(sceneCount: number): string {
  return 'Eres un director de micro-relatos verticales. Devuelve un objeto JSON con "title", "logline", "storyBible" y "beats". '
    + `Debe haber exactamente ${sceneCount} beats con "order" consecutivo desde 1, "sceneRole", "visualPrompt", "narration", "characters", "props", "camera", "continuityFromPrevious" y "transition". `
    + 'La storyBible es la fuente de verdad visual: estilo, localización, hora del día, clima, personajes con vestuario exacto, props, elementos prohibidos y reglas de continuidad. '
    + 'El protagonista (leadCharacterId) y su prop característico (signaturePropId) deben aparecer en todas las escenas. '
    + 'La hora del día y el clima son los mismos en toda la historia; ningún beat puede declarar hora ni clima propios. '
    + 'Usa solo personajes y props declarados en la storyBible, por su id. Cada personaje de la biblia debe aparecer en al menos una escena. '
    + 'Prohibido: personajes extra o ajenos a la biblia, vehículos o props incorrectos, cambios de vestuario, cambios de clima o de hora, texto en pantalla y marcas de agua. '
    + 'La primera escena es "establishing"; la última es "resolution"; debe haber exactamente un "climax" entre la primera y la última. '
    + 'Cada "transition" es siempre "cut". "continuityFromPrevious" es null en la primera escena y describe la continuidad en el resto. '
    + 'Escribe en español, sin HTML, sin Markdown y sin texto que deba aparecer en pantalla. '
    + 'Todas las imágenes son de formato vertical 9:16. '
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
    ? ' La respuesta anterior se truncó por el límite de tokens: acorta title, logline, storyBible, visualPrompt y narration para que el JSON completo quepa en la respuesta.'
    : ''

  return [
    {
      role: 'user',
      content: `La respuesta anterior no cumple el esquema (${reason}). `
        + `Corrige el JSON para que tenga exactamente ${sceneCount} beats válidos, una storyBible completa y las invariantes de continuidad. `
        + 'sin HTML, sin Markdown, sin URLs y sin campos adicionales. '
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
