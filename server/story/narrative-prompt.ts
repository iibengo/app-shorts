import type { StoryMode } from '~/models/story'
import type { DeepSeekMessage, DirectorContext } from './director-types'
import { renderBriefBlock } from './premise-brief'

export const NARRATIVE_JSON_SCHEMA = `{
  "title": "string (1-80)",
  "logline": "string (1-200)",
  "tone": "humor|aventura|absurdo|heartwarming|dramatic",
  "storyBible": {
    "style": "string (10-160)",
    "tone": "humor|aventura|absurdo|heartwarming|dramatic",
    "theme": "string (10-160)",
    "leadCharacterId": "id de un personaje premise",
    "signaturePropId": "id de un prop premise",
    "characters": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (20-160)", "wardrobe": "string (10-120)", "source": "premise|invented" }],
    "locations": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (10-160)", "source": "premise|invented" }],
    "props": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (10-120)", "source": "premise|invented" }],
    "forbidden": ["string (2-50)"],
    "continuityRules": ["string (4-140)"]
  },
  "beats": [{
    "order": 1,
    "sceneRole": "establishing|development|escalation|climax|resolution",
    "locationId": "id de la biblia",
    "timeOfDay": "dawn|morning|noon|afternoon|golden-hour|dusk|night",
    "weather": "clear|cloudy|overcast|light-rain|rain|storm|snow|fog|windy",
    "characters": ["id de la biblia"],
    "props": ["id de la biblia"],
    "action": "string (20-600)",
    "narration": "string (10-280)",
    "storyFunction": "hook|complication|escalation|twist|payoff",
    "gag": "string (4-120) o null"
  }]
}`

export function narrativeModeBlock(mode: StoryMode): string {
  return mode === 'faithful'
    ? 'Modo fiel: todos los personajes, localizaciones y props son source premise. '
      + 'No inventes canon. Cambia de escena solo con lugares y eventos que la premisa implique. '
      + 'La invención se limita a acción, cámara y detalles visuales menores.'
    : 'Modo creativo: puedes inventar hasta 2 personajes secundarios, hasta 3 localizaciones y props, con un máximo de 5 props en total y el prop característico siempre premise. '
      + 'El tema, el protagonista, el conflicto y el tono parten de la premisa. '
      + 'No cambies el tema, el protagonista ni el conflicto principal. '
      + 'Si la premisa fija el desenlace, respétalo; si no lo fija, puedes inventarlo. '
      + 'Sorprende sin contradecir la premisa.'
}

export function storyNarrativeSystemPrompt(sceneCount: number, mode: StoryMode): string {
  return 'Eres un narrador de micro-relatos verticales de 24–36 segundos. '
    + 'Escribes una historia entretenida, con humor y ritmo, en español. '
    + 'Devuelve solo el objeto JSON del esquema. No expliques nada. '
    + 'La historia debe tener un gancho en el primer segundo, un conflicto claro, una complicación, una escalada, un giro y un remate visual. '
    + 'No repitas la misma acción. Cambia de escena si aporta. '
    + 'La narración es texto en pantalla: no hay audio, no hay voz, no hay música. '
    + 'Incluye gags visuales cuando encajen. No prometas viralidad ni garantices gracia. '
    + 'El canon es la fuente de verdad: estilo, tono, tema, protagonista, prop característico, personajes, localizaciones, props, prohibiciones y reglas. '
    + 'Cada personaje, localización y prop declara source: premise|invented. '
    + 'Cada escena declara locationId, timeOfDay, weather, characters (1–3), props (0–3), action (20–600), narration (10–280), storyFunction y gag. '
    + 'El protagonista y el prop característico aparecen al menos una vez, no en todas las escenas. '
    + 'Cada personaje, localización y prop del canon aparece al menos una vez. '
    + 'forbidden solo contiene elementos ajenos al canon; nunca un personaje, localización o prop del canon ni una hora o clima que aparezca en la historia. '
    + 'Valores de tone: humor|aventura|absurdo|heartwarming|dramatic. '
    + 'Valores de storyFunction: hook|complication|escalation|twist|payoff. '
    + 'El primer beat es hook; el último payoff; hay exactamente un twist en el beat de climax. '
    + `Hay exactamente ${sceneCount} beats. En 5–6 escenas incluye al menos una complicación y al menos una escalada. `
    + 'Escribe en español, sin HTML, sin Markdown, sin URLs y sin texto que deba aparecer en pantalla fuera de narration. '
    + 'Sé conciso: descripciones de personaje ≤ 90 caracteres, vestuario ≤ 80, localización ≤ 80, prop ≤ 60, action ≤ 220, narration ≤ 120, continuityFromPrevious ≤ 100 y máximo 3 reglas. '
    + 'El canon completo debe caber en el bloque global y el JSON en el presupuesto de salida. '
    + narrativeModeBlock(mode)
}

export function storyNarrativeUserMessage(
  premise: string,
  referenceUrl: string | null,
  context?: DirectorContext,
): DeepSeekMessage {
  const block = context === undefined ? '' : renderBriefBlock(context.brief)
  const blockPart = block.length > 0 ? `${block}\n\n` : ''
  const text = `Premisa: ${premise}\n\n${blockPart}Devuelve exactamente el JSON del esquema:\n${NARRATIVE_JSON_SCHEMA}`

  if (referenceUrl === null) return { role: 'user', content: text }

  return {
    role: 'user',
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: referenceUrl } },
    ],
  }
}

export function storyNarrativeRepairMessages(
  reason: string,
  previousContent: string | null,
): readonly DeepSeekMessage[] {
  const assistant = previousContent === null
    ? []
    : [{ role: 'assistant' as const, content: previousContent }]

  return [
    ...assistant,
    {
      role: 'user',
      content: `La respuesta anterior no cumple el esquema (${reason}). `
        + 'Corrige el JSON completo y conciso, con el canon y los beats narrativos exactos. '
        + 'Sin HTML, sin Markdown, sin URLs y sin campos adicionales. '
        + `Esquema:\n${NARRATIVE_JSON_SCHEMA}`,
    },
  ]
}

export function storyNarrativeTruncationRepairMessages(maxTokens: number): readonly DeepSeekMessage[] {
  return [{
    role: 'user',
    content: 'La respuesta anterior se truncó por el límite de tokens. '
      + `Devuelve un JSON completo y conciso dentro del presupuesto de salida de ${maxTokens} tokens: `
      + 'descripciones de una frase, canon completo una sola vez, sin repetir el canon en cada beat. '
      + `Esquema:\n${NARRATIVE_JSON_SCHEMA}`,
  }]
}
