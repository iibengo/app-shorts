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

export const DIRECTOR_SCENE_ROLE_PATTERNS: Readonly<Record<number, string>> = {
  4: 'establishing, development, climax, resolution',
  5: 'establishing, development, escalation, climax, resolution',
  6: 'establishing, development, development, escalation, climax, resolution',
}

function sceneRolePattern(sceneCount: number): string {
  return DIRECTOR_SCENE_ROLE_PATTERNS[sceneCount]
    ?? 'establishing, development, escalation, climax, resolution'
}

export function storyDirectorSystemPrompt(sceneCount: number): string {
  return 'Eres un director de micro-relatos verticales. Devuelve un objeto JSON con "title", "logline", "storyBible" y "beats". '
    + `Debe haber exactamente ${sceneCount} beats con "order" consecutivo desde 1, "sceneRole", "visualPrompt", "narration", "characters", "props", "camera", "continuityFromPrevious" y "transition". `
    + 'La storyBible es la fuente de verdad visual: estilo, localización, hora del día, clima, personajes con vestuario exacto, props, elementos prohibidos y reglas de continuidad. '
    + 'La hora del día y el clima son los mismos en toda la historia; ningún beat puede declarar hora ni clima propios. '
    + 'Valores exactos de timeOfDay: dawn|morning|noon|afternoon|golden-hour|dusk|night. '
    + 'Valores exactos de weather: clear|cloudy|overcast|light-rain|rain|storm|snow|fog|windy. '
    + 'Prohibido usar sinónimos como day, sunny, sunset, rainy o stormy en timeOfDay o weather. '
    + 'Los props son objetos móviles que un personaje lleva o usa. NO son props el entorno, el cielo, los árboles, los carteles, las rampas ni el decorado. '
    + 'Declara entre 1 y 3 props. El prop característico (signaturePropId) es el vehículo u objeto principal de la historia y no puede sustituirse por otro. '
    + 'El protagonista (leadCharacterId) y su prop característico (signaturePropId) deben aparecer en "characters" y "props" de TODAS las escenas. '
    + 'Cada personaje de la storyBible debe aparecer al menos en una escena; no añadas personajes que no actúen en la premisa ni cameos. '
    + 'Usa solo personajes y props declarados en la storyBible, por su id. '
    + 'forbidden es solo para elementos que NO deben aparecer en esta historia concreta: personajes ajenos a la biblia, vehículos u objetos distintos del prop característico, un clima o una hora distintos de los declarados, texto o watermark. Nunca incluyas lo que sí aparece en la biblia. '
    + 'Incluye entre 1 y 10 elementos en forbidden. '
    + 'Prohibido incluir en forbidden el id o el nombre del protagonista, del prop característico, del lugar, ni la hora o el clima que sí aparecen en la storyBible. '
    + 'La primera escena es "establishing"; la última es "resolution"; debe haber exactamente un "climax" entre la primera y la última. '
    + `Patrón exacto de sceneRole para ${sceneCount} escenas: ${sceneRolePattern(sceneCount)}. `
    + '"continuityFromPrevious" es null en la primera escena; en el resto debe tener al menos 20 caracteres y describir qué personajes, ropa, prop, lugar, hora y clima se conservan de la escena anterior. '
    + 'Cada "transition" es siempre "cut". '
    + 'Prohibido añadir campos adicionales en storyBible o en los beats, como negativePrompt, seed, duration o imageUrl. '
    + 'Prohibido: personajes extra o ajenos a la biblia, vehículos o props incorrectos, cambios de vestuario, cambios de clima o de hora, texto en pantalla y marcas de agua. '
    + 'Para que la respuesta completa quepa en el presupuesto de salida, sé conciso: descripciones de personaje y vestuario en una frase, idealmente ≤ 90 caracteres; descripción de prop ≤ 80 caracteres; visualPrompt ≤ 220 caracteres; narration ≤ 120 caracteres; continuityFromPrevious ≤ 100 caracteres; continuityRules máximo 3 reglas de una frase. '
    + 'No repitas la biblia, el vestuario ni los props en cada beat; los ids ya los conectan. '
    + 'Estas son instrucciones de concisión, no nuevos límites de validación. Devuelve solo el JSON, sin explicaciones. '
    + 'Escribe en español, sin HTML, sin Markdown, sin URLs y sin texto que deba aparecer en pantalla. '
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

export function storyDirectorTruncationRepairMessages(
  sceneCount: number,
  maxTokens: number,
): readonly DeepSeekMessage[] {
  return [
    {
      role: 'user',
      content: 'La respuesta anterior se truncó por el límite de tokens y no llegó a devolver un JSON completo. '
        + `Devuelve un JSON completo y conciso con exactamente ${sceneCount} beats, dentro del presupuesto de salida de ${maxTokens} tokens: `
        + 'descripciones de una sola frase, sin repetir la storyBible ni el vestuario en cada beat, y sin campos adicionales. '
        + 'Incluye title, logline, storyBible y beats, con la biblia completa una sola vez. '
        + `Esquema:\n${DIRECTOR_JSON_SCHEMA}`,
    },
  ]
}

export function storyDirectorRepairMessages(
  sceneCount: number,
  previousContent: string,
  reason: string,
  truncated = false,
): readonly DeepSeekMessage[] {  const truncationNote = truncated
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
