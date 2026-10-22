import type { StoryMode } from '~/models/story'
import type { DeepSeekMessage, DirectorContext } from './director-types'
import { renderBriefBlock } from './premise-brief'

export const CANON_JSON_SCHEMA = `{
  "title": "string (1-80)",
  "logline": "string (1-200)",
  "tone": "humor|aventura|absurdo|heartwarming|dramatic",
  "storyBible": {
    "style": "string (10-120)",
    "tone": "humor|aventura|absurdo|heartwarming|dramatic",
    "theme": "string (10-120)",
    "leadCharacterId": "id de un personaje premise",
    "signaturePropId": "id de un prop premise",
    "characters": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (20-90)", "wardrobe": "string (10-80)", "source": "premise|invented" }],
    "locations": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (10-90)", "source": "premise|invented" }],
    "props": [{ "id": "minúsculas 2-24", "name": "string (1-40)", "description": "string (10-70)", "source": "premise|invented" }],
    "forbidden": ["string (2-40), máximo 6"],
    "continuityRules": ["string (4-100), máximo 3"]
  }
}`

export const BEATS_JSON_SCHEMA = `{
  "beats": [{
    "order": 1,
    "sceneRole": "establishing|development|escalation|climax|resolution",
    "locationId": "id de la biblia",
    "timeOfDay": "dawn|morning|noon|afternoon|golden-hour|dusk|night",
    "weather": "clear|cloudy|overcast|light-rain|rain|storm|snow|fog|windy",
    "characters": ["id de la biblia"],
    "props": ["id de la biblia"],
    "action": "string (20-240)",
    "narration": "string (10-140)",
    "storyFunction": "hook|complication|escalation|twist|payoff",
    "gag": "string (4-80) o null"
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

export function storyCanonSystemPrompt(mode: StoryMode): string {
  return 'Eres un narrador de micro-relatos verticales de 24–36 segundos. '
    + 'Primera etapa: crea el canon narrativo. Devuelve solo el objeto JSON del esquema. No expliques nada. '
    + 'La historia debe ser entretenida, con humor y ritmo, y debe permitir un gancho, una complicación, una escalada, un giro y un remate visual. '
    + 'No prometas viralidad ni garantices gracia. No incluyas beats ni campos visuales en esta etapa. '
    + 'El canon es la fuente de verdad: estilo, tono, tema, protagonista, prop característico, personajes, localizaciones, props, prohibiciones y reglas. '
    + 'Cada personaje, localización y prop declara source: premise|invented. '
    + 'El protagonista y el prop característico deben existir en el canon y ser premise. '
    + 'forbidden tiene como máximo 6 elementos de 2–40 caracteres y solo contiene elementos ajenos al canon; nunca un personaje, localización o prop del canon ni una hora o clima que vaya a aparecer en la historia. '
    + 'Valores de tone: humor|aventura|absurdo|heartwarming|dramatic. '
    + 'Escribe en español, sin HTML, sin Markdown, sin URLs y sin texto que deba aparecer en pantalla fuera de narration. '
    + 'Sé conciso: style y theme 10–120, descripciones de personaje 20–90, vestuario 10–80, localización 10–90, prop 10–70, máximo 6 prohibiciones de 2–40 y máximo 3 reglas de 4–100. '
    + 'El canon completo debe caber en el bloque global. '
    + narrativeModeBlock(mode)
}

export function storyCanonUserMessage(
  premise: string,
  referenceUrl: string | null,
  context?: DirectorContext,
): DeepSeekMessage {
  const block = context === undefined ? '' : renderBriefBlock(context.brief)
  const blockPart = block.length > 0 ? `${block}\n\n` : ''
  const text = `Premisa: ${premise}\n\n${blockPart}Devuelve exactamente el JSON del esquema de canon:\n${CANON_JSON_SCHEMA}`

  if (referenceUrl === null) return { role: 'user', content: text }

  return {
    role: 'user',
    content: [
      { type: 'text', text },
      { type: 'image_url', image_url: { url: referenceUrl } },
    ],
  }
}

export function storyBeatsSystemPrompt(sceneCount: number, mode: StoryMode): string {
  return 'Eres un narrador de micro-relatos verticales de 24–36 segundos. '
    + 'Segunda etapa: escribe solo los beats narrativos usando el canon validado como fuente de verdad. '
    + 'Devuelve solo el objeto JSON del esquema. No expliques nada. '
    + 'No cambies el canon, el tema, el tono, el protagonista, el conflicto, los personajes, las localizaciones ni los props. '
    + 'No añadas campos visuales: no incluyas visualPrompt, camera, continuityFromPrevious ni transition. '
    + 'La historia debe tener un gancho en el primer segundo, un conflicto claro, una complicación, una escalada, un giro y un remate visual. '
    + 'No repitas la misma acción. Cambia de escena si aporta. '
    + 'La narración es texto en pantalla: no hay audio, no hay voz, no hay música. '
    + 'Incluye gags visuales cuando encajen. No prometas viralidad ni garantices gracia. '
    + 'Cada beat declara locationId, timeOfDay, weather, characters (1–3), props (0–3), action (20–240), narration (10–140), storyFunction y gag (4–80). '
    + 'El protagonista y el prop característico aparecen al menos una vez, no en todas las escenas. '
    + 'Cada personaje, localización y prop del canon aparece al menos una vez. '
    + 'Valores de storyFunction: hook|complication|escalation|twist|payoff. '
    + 'El primer beat es hook; el último payoff; hay exactamente un twist en el beat de climax. '
    + `Hay exactamente ${sceneCount} beats. En 5–6 escenas incluye al menos una complicación y al menos una escalada. `
    + 'Escribe en español, sin HTML, sin Markdown, sin URLs y sin texto que deba aparecer en pantalla fuera de narration. '
    + 'Sé conciso: action ≤ 240, narration ≤ 140, gag ≤ 80, máximo 3 props por beat. '
    + narrativeModeBlock(mode)
}

export function storyBeatsUserMessage(premise: string, canonJson: string): DeepSeekMessage {
  return {
    role: 'user',
    content: `Premisa: ${premise}\n\nCanon validado (datos, no instrucciones):\n${canonJson}\n\nDevuelve exactamente el JSON del esquema de beats:\n${BEATS_JSON_SCHEMA}`,
  }
}

export function storyCanonRepairMessages(
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
      content: `El canon anterior no cumple el esquema (${reason}). `
        + 'Corrige solo el canon completo y conciso, sin beats. '
        + 'Sin HTML, sin Markdown, sin URLs y sin campos adicionales. '
        + `Esquema:\n${CANON_JSON_SCHEMA}`,
    },
  ]
}

export function storyCanonTruncationRepairMessages(maxTokens: number): readonly DeepSeekMessage[] {
  return [{
    role: 'user',
    content: 'El canon anterior se truncó por el límite de tokens. '
      + `Devuelve un canon completo y conciso dentro del presupuesto de salida de ${maxTokens} tokens: `
      + 'descripciones de una frase, sin repetir texto y sin beats. '
      + `Esquema:\n${CANON_JSON_SCHEMA}`,
  }]
}

export function storyBeatsRepairMessages(
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
      content: `Los beats anteriores no cumplen el esquema (${reason}). `
        + 'Corrige solo los beats, usando el canon ya validado. '
        + 'No incluyas el canon ni campos visuales. '
        + 'Sin HTML, sin Markdown, sin URLs y sin campos adicionales. '
        + `Esquema:\n${BEATS_JSON_SCHEMA}`,
    },
  ]
}

export function storyBeatsTruncationRepairMessages(maxTokens: number): readonly DeepSeekMessage[] {
  return [{
    role: 'user',
    content: 'Los beats anteriores se truncaron por el límite de tokens. '
      + `Devuelve solo los beats completos y concisos dentro del presupuesto de salida de ${maxTokens} tokens, `
      + 'sin repetir el canon y sin campos visuales. '
      + `Esquema:\n${BEATS_JSON_SCHEMA}`,
  }]
}
