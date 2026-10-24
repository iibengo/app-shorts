# Feature Specification: Referencias propias por personaje

**Feature Branch**: `012-character-references`

**Created**: 2026-10-24

**Status**: Approved (Checkpoint 1 superado el 2026-10-24).

**Input**: User description: "Los personajes secundarios inventados salen distintos en cada plano y a veces diminutos. Quiero que cada personaje tenga su propia imagen desde el principio y que los planos se encuadren en quien hace la acción. El motor de vídeo se queda como está."

> Esta spec no inventa una idea nueva: **consolida decisiones ya validadas con llamadas reales al proveedor el 2026-10-24**. Las medidas están abajo y no se re-derivan. El objetivo es convertir esas medidas en contrato, no explorar alternativas.

## Alcance

**Dos cambios, ambos baratos.** 012 no toca el motor de vídeo ni añade pantallas:

1. **Referencia por personaje**: cada personaje sin foto del usuario recibe una imagen propia, una sola vez, al inicio de la historia (0,04 USD por personaje).
2. **N referencias en el keyframe**: el plano envía protagonista + secundarios presentes (máximo 3), nunca una rejilla, y el sujeto del plano manda el encuadre.

**Fuera de alcance y por qué** (decisiones humanas 2026-10-24):

- **Kling v3 Pro con `elements`**: funcionó en la sonda B, pero duplica el coste de vídeo (0,56 vs 0,35 por plano) y tarda ~7 min por plano. La consistencia se consigue con la referencia en el keyframe, que ya está pagada. Sonda B queda como evidencia para una spec futura.
- **Pantalla de personajes** (ver, regenerar, asignar fotos): va a `BACKLOG.md`, igual que ya existe por escena.
- **Varias fotos del usuario asignadas a varios personajes**: va a `BACKLOG.md`.

Lo que **no** cambia: el motor de vídeo, la máquina de estados, los leases, la idempotencia de la historia, el montaje por plano, el QC conservador, el canon, el modo `faithful`/`creative`, el estilo visual de 010 y la hoja en reposo de 011.

---

## Contexto y evidencia

### Lo que ya existe (011, implementado)

| Pieza | Estado |
|---|---|
| Hoja de personaje 2×2 | **En reposo** (`DORMANT_SHEET` en `reel-reconciler.ts`). El modelo copia la rejilla de la referencia y devuelve dípticos; un díptico no sirve como keyframe. |
| Referencias por plano | **Exactamente una**: la imagen subida por el usuario gana a la hoja (`anchor-selection.ts`). El prompt pide `preserve the visual style of the reference`, nunca `photorealistic`. |
| Red de seguridad del díptico | `frame-layout.ts` (heurística pura) + `keyframe-layout-inspector.ts` (muestreo con FFmpeg). Un keyframe con varias viñetas vuelve a `KEYFRAME_QUEUED` antes de pagar el vídeo. |
| Identidad del protagonista | `anchorsJson` guarda el primer keyframe con cara por personaje; la referencia del usuario siembra el ancla del protagonista al crear la historia. |

### Sonda A — personaje secundario inventado (realizada)

Generación del personaje secundario **Pixel** (gato low-poly inventado) con `fal-ai/nano-banana/edit`, usando el avatar del usuario como referencia de estilo.

| Dato | Valor medido |
|---|---|
| Endpoint | `fal-ai/nano-banana/edit` |
| Entrada | `[avatar del usuario]` + prompt de personaje |
| Resultado | `https://v3b.fal.media/files/b/0aaf9926/-TkRgSEJFxD63wVl0zDLU_Q6oDF0rA.png` |
| Coste | **0,0398 USD** por imagen |
| Ratio | Vertical, dentro de la tolerancia ±3 % de `isVerticalAspect` |

### Sonda B — inyección de elementos en el vídeo (realizada)

`fal-ai/kling-video/v3/pro/image-to-video` con `elements`, a partir del keyframe que ya contenía a Pixel.

| Dato | Valor medido |
|---|---|
| Contrato de `elements` | Cada elemento es `{ frontal_image_url, reference_image_urls }` y **ambos campos son obligatorios**. |
| Error al enviar solo `frontal_image_url` | `Either frontal_image_url and reference_image_urls or video_url must be provided`. **No se cobró** el intento fallido. |
| Referencia en el prompt | `@Element1`, `@Element2`, … |
| Otros campos del esquema | `start_image_url` (obligatorio), `prompt`, `duration` (`"1"`..`"15"`), `generate_audio`, `negative_prompt`, `cfg_scale` (0..1), `end_image_url`, `multi_prompt`, `shot_type`, `enable_safety_checker`. Un elemento también puede ser `{ video_url }`; máximo un elemento de vídeo por petición. |
| Resultado | 5 s vertical, **1088×1904**, h264, 24 fps, **sin audio** |
| Latencia | **~7 minutos** por plano de 5 s |
| Identidad | El gato mantuvo la identidad en todos los fotogramas; el estilo papercraft se mantuvo |
| **Límite observado** | El gato **ya estaba en el keyframe de arranque**. La inyección de un personaje **ausente** del keyframe **no está probada**. |
| **Límite observado** | Las instrucciones de actuación ("Ionias mira al gato") se ignoraron: los elementos dan **identidad**, no **dirección de actores**. |

### Precio y coste

012 solo añade una unidad de coste:

| Pieza | Precio medido | Coste por historia |
|---|---|---|
| Nano Banana edit (referencia de personaje) | 0,0398 USD/imagen | 3 personajes = **0,12 USD** |
| MiniMax Hailuo 02 (sin cambios, 008) | 0,35 USD por clip | 30 s ≈ 1,75 USD |

La sonda B midió además que Kling v3 Pro cuesta **0,112 USD/s** (~1,9× MiniMax). **No se adopta en 012**: duplicaría el coste de vídeo y ~7 min por plano. Queda como evidencia para una spec futura.

### Decisiones humanas aprobadas (2026-10-24)

1. Los personajes secundarios se generan **al inicio de la historia**, con su propia imagen, **una llamada por personaje**. Sin referencia visual el modelo inventa un gato distinto en cada plano.
2. Que un personaje aparezca en un keyframe lo decide **el guion y el plano**, no una regla fija.
3. ~~El vídeo recibe el keyframe más las referencias de los demás personajes (`elements`).~~ **Aplazado**: la sonda B funcionó, pero duplica el coste de vídeo. Se valida de nuevo en una spec futura. **012 no cambia el motor de vídeo.**
4. **Quien está en foco manda el encuadre**: si el gato teclea, el plano se encuadra en el gato (`close-up`/`insert`/`detail`), no un plano general de Ionias con un gato en alguna parte.
5. Los keyframes ya generados de la historia `802575b0` **se descartan y se regeneran** después del arreglo. No hay migración de medios ni backfill de URLs.

### Renumeración

`AGENTS.md` reservaba `012` para audio y `014` para gráficos. Esta spec ocupa `012` porque resuelve un bloqueo del motor visual que precede al audio. **Audio pasa a 013 y gráficos/overlays a 014.** El cambio se refleja en `AGENTS.md` al cerrar.

---

## Enmienda y supersesión de contratos previos

Esta tabla es normativa. Donde contradiga a 008, 010 u 011, prevalece esta spec.

| # | Contrato anterior | Origen | Contrato nuevo |
|---|---|---|---|
| 1 | "Una sola imagen por plano": el orquestador MUST enviar exactamente una URL de referencia. | 011, enmienda 2026-10-24 | **N referencias por plano**, `N = 1 protagonista + secundarios presentes`, máximo 3, **nunca una rejilla**. El motivo de la regla anterior (el modelo copia la rejilla) se conserva como prohibición de rejilla, no como límite de una imagen. |
| 2 | `DORMANT_SHEET` desactiva la hoja porque el modelo copia la cuadrícula. | 011 | `DORMANT_SHEET` **se mantiene y se formaliza**: la hoja 2×2 queda **prohibida para siempre** como referencia. La identidad la aportan las referencias por personaje. La tubería de la hoja queda inerte y sin coste, reservada a una futura conversión de fotos reales. |
| 3 | La identidad del protagonista sale del ancla (`anchorsJson`) o de la hoja. | 010, 011 | La identidad sale de `characterRefsJson`: una referencia por personaje, con `source` `user` o `generated`. Las anclas siguen como **fallback legacy** para historias anteriores a 012 y para personajes cuya referencia falló. |
| 4 | "Planos de varios personajes: una sola vista de la hoja; el segundo personaje se describe en el prompt." | 011, hallazgo `two-shot` | El segundo personaje **tiene su propia imagen** y se envía como referencia. Describirlo en el prompt ya no es el camino. |
| 5 | Precedencia de keyframe: usuario → hoja → anclas → FLUX. | 011 | **Personajes presentes con referencia → protagonista (estilo) si no hay personajes → anclas → FLUX.** La hoja sale de la precedencia. |
| 6 | `sheetFallback` se pasa al orquestador de keyframe. | 011 | Se **elimina**: la URL frontal de la hoja no entra nunca en un keyframe. |
| 7 | `consistency-check` compara con `story.characterSheet.front`; con la hoja en reposo el check nunca se ejecuta. | 011 | El check compara con `characterRefs[lead].frontalUrl`. Sigue **fuera del camino crítico**: `NUXT_STORY_CONSISTENCY_ENABLED=false` por defecto. |
| 8 | `StoryPreset` decide el adaptador: `fast` → MiniMax, `quality` → Kling 2.5. | 008, `shot-video-orchestrator.ts` | **Sin cambios.** Kling v3 Pro con `elements` queda fuera de 012; el motor de vídeo de 008 se mantiene tal cual. |
| 9 | Cada plano pide 5 s (Kling) o 6 s (MiniMax) y el montaje recorta. | 008, §"Unidad de proveedor" | **Sin cambios.** El contrato de duración de 008 se mantiene; 012 no toca el vídeo. |
| 10 | QC técnico: `expectedDurationSeconds` fijo en 5 o 6 s y `MIN_CLIP_DURATION_SECONDS = 5.5`. | 008 | **Sin cambios** en 012. |
| 11 | `StoryShot` no declara modelo de vídeo. | 008 | **Sin cambios** en 012 (se añadiría junto a Kling v3, fuera de alcance). |
| 12 | `story-budget-exhausted` dice "límite de 8 dólares". | 005 | El mensaje MUST componerse con el **cap real del perfil**. Se aplica porque 012 cambia las unidades de coste de referencia. |
| 13 | El DTO declara `characterSheetStatus` con tres valores (`none`, `ready`, `failed`), pero `toReelStoryDto` nunca lo serializa (deuda de typecheck). | 011 | Se **retira** del DTO público. La superficie observable de identidad pasa a ser `Story.characterRefs`. La hoja sigue siendo server-only. |

---

## Decisiones cerradas

| Decisión | Elección | Justificación |
|---|---|---|
| **Identidad de secundarios** | Una imagen generada por personaje al inicio de la historia, guardada por historia. | Sin referencia, el modelo inventa otro personaje en cada plano. Una imagen cuesta 0,0398 USD y se reutiliza en todos los keyframes y vídeos. |
| **Qué personajes se generan** | Todos los que aparecen en al menos una escena y **no** tienen referencia del usuario. | Es la condición que el humano aprobó: `source: 'invented'` o sin referencia. Solo el protagonista puede tener referencia del usuario (`STORY_MAX_REFERENCES = 1`). |
| **Protagonista con referencia** | **No** se genera: su referencia es la del usuario, con `source: 'user'`. | Evita gastar una imagen para rehacer lo que el usuario ya subió en el estilo final. |
| **Protagonista sin referencia** | **Sí** se genera, primero en el orden. | Es el único camino para que un protagonista sin foto tenga identidad estable; hoy FLUX le inventa una cara por plano. Cambio de comportamiento y de coste, explícito en §Coste. |
| **Número máximo** | 3 referencias generadas (el canon admite 1–3 personajes). | Límite real del canon (`canon-validator.ts`: `characters.length ∈ [1,3]`). |
| **Forma de la referencia** | Una sola imagen frontal por personaje, `frontalUrl`, con `referenceUrls = [frontalUrl]`. | Es lo que exige el contrato de `elements`: ambos campos obligatorios. Una imagen por personaje evita rejillas. |
| **Persistencia** | Columna nueva `characterRefsJson`. | `characterSheetJson` está tipada como `StoryCharacterSheet` (4 vistas de **un** personaje) y compartir columna obligaría a un discriminador en tiempo de lectura, con riesgo de romper `parseCharacterSheet`. Mapas distintos, fuentes de verdad distintas. |
| **Motor de vídeo** | **Sin cambios**: el de 008. Kling v3 Pro + `elements` queda fuera de 012. | Decisión humana 2026-10-24: duplicaba el coste de vídeo (0,56 vs 0,35 por plano) y ~7 min por plano. La consistencia se consigue con la referencia en el keyframe, que ya funciona. La sonda B queda como evidencia para una spec futura. |
| **Duración solicitada** | **Sin cambios** (5 s Kling / 6 s MiniMax de 008). | 012 no toca el vídeo. |
| **Foco** | `subject` nombra a **un** personaje; ese personaje manda el encuadre. Varios personajes = plano de conjunto, fuera de la validación. | Es la regla verificable más simple que impide que un secundario salga diminuto. |
| **Corrección de foco** | Reescritura determinista a `close-up`, no fallo ni reparación del director. | Mismo patrón que 008: reparto por escena, recorte y `sceneRole` se resuelven en código. Una reparación del modelo es lenta y varía. |
| **Fallo parcial de una referencia** | `failed` + la historia continúa. Nunca bloquea. | El humano lo aprobó: un personaje sin referencia degrada la identidad, no invalida la historia. Se registra y se muestra. |
| **Rejilla** | Prohibida en referencias, keyframes y personajes. El inspector de dípticos sigue activo. | La causa raíz de 011 fue la rejilla; con 3 referencias el riesgo de collage sube, no baja. |
| **Hoja de personaje** | Inerte (`DORMANT_SHEET = true`), sin llamada de proveedor. | Se conserva para una futura conversión de fotos reales; su retirada se decide en la spec que aborde esa conversión. |

---

## User Scenarios & Testing

### US1 — Cada personaje tiene una cara estable desde el primer plano (P1)

**Given** una historia con un protagonista y un secundario inventado, **When** empieza la fase de keyframes, **Then** cada personaje sin referencia del usuario recibe **una** imagen generada y se reutiliza en todos los planos.

**Acceptance**

1. Con `visualStyle: papercraft` y premisa con un gato inventado, se generan **dos** referencias (protagonista y gato) antes del primer keyframe.
2. Cada referencia se genera **una sola vez** por historia; ticks posteriores no vuelven a llamar al proveedor.
3. El keyframe de un plano con protagonista y gato envía **dos** referencias, en el orden protagonista → gato.
4. Un plano sin personajes envía **solo** la referencia del protagonista como referencia de estilo, con la instrucción de no añadir a la persona.
5. Ninguna petición de keyframe contiene una rejilla ni varias vistas del mismo personaje.

### US2 — El secundario no sale diminuto (P1)

**Given** un plano cuyo `subject` es el secundario, **When** se compone el plano, **Then** el encuadre está entre los que enfocan al personaje y el prompt declara su tamaño en el frame.

**Acceptance**

1. Un plano con `subject: "Pixel"` y `framing: "wide"` se reescribe a `close-up` y se registra el evento.
2. Un plano con `subject: "Ionias"` conserva cualquier encuadre.
3. Un plano con `subject: "Ionias y Pixel"` no se reescribe (plano de conjunto).
4. El prompt de keyframe de un plano enfocado incluye el bloque de tamaño en inglés y sigue cabiendo en 900 caracteres.

### US3 — Elementos en el vídeo (FUERA DE ALCANCE)

Descartado en 012 por decisión humana del 2026-10-24 (duplica el coste de vídeo y ~7 min por plano). Se conserva el escenario documentado en §Contexto como evidencia para una spec futura. **Ningún requisito de 012 depende de él.**

### US4 — Nada se gasta por encima del cap (P1)

**Given** una historia cuyo plan no cabe en el cap con las referencias y el motor de elementos, **When** el director devuelve el plan, **Then** la creación se rechaza **antes** de enviar cualquier referencia o vídeo.

**Acceptance**

1. El rechazo usa `story-budget-exhausted` (429) y el mensaje nombra el cap real del perfil.
2. Las referencias de personaje se cuentan en `estimate()` y en la comprobación **post-plan**; el pre-plan las excluye a propósito (§Presupuesto 15 s).
3. Un envío de vídeo que superaría el cap falla el plano y la historia **antes** de enviar (comportamiento de 008, sin cambios).
4. Si una referencia de personaje no cabe en el cap, se marca `failed`, se emite evento y la historia continúa.

### US5 — El usuario ve qué está pasando (P2)

**Given** una historia generando referencias, **When** el usuario mira el progreso, **Then** ve una entrada por personaje con su estado, sin porcentajes inventados.

**Acceptance**

1. Estados `pending` → `ready`/`failed` con `role="status"`.
2. Una referencia fallida se explica en español y no se presenta como error bloqueante.
3. La revisión de planos muestra el foco de cada plano y el motor de vídeo previsto.

---

## Requisitos funcionales

- **FR-001**: MUST existir `StoryCharacterRefStatus`, `StoryCharacterRefSource` y `StoryCharacterReference` en `app/models/story.ts`, más `Story.characterRefs`. `StoryShot` MUST NOT cambiar.
- **FR-002**: MUST existir la columna `Story.characterRefsJson` (`JSONB`, nullable) y la migración `20261024180000_story_character_refs`. Sin backfill: `null` se lee como `{}`.
- **FR-003**: MUST existir `server/story/character-refs.ts` (puro): elegibilidad, orden, parseo, serialización y construcción de elementos. Sin I/O y sin reloj.
- **FR-004**: MUST existir `server/story/character-ref-prompt.ts` (puro): prompt de personaje en inglés, con el bloque de estilo al inicio y presupuesto de 600 caracteres.
- **FR-005**: MUST existir `CharacterReferenceOrchestrator` en `server/story/character-ref-orchestrator.ts` con `submit`/`poll` por personaje. Nano Banana con `[story.referenceUrl]` si existe; FLUX dev 1152×2048 si no.
- **FR-006**: El conjunto a generar MUST ser `personajes del canon que aparecen en alguna escena` menos `leadCharacterId` cuando `story.referenceUrl !== null`. Orden determinista: protagonista primero, después el orden del canon.
- **FR-007**: La generación MUST ejecutarse dentro de `GENERATING_KEYFRAMES`, antes del primer keyframe, sin añadir estados a `StoryStatus`.
- **FR-008**: `DORMANT_SHEET` MUST seguir en `true` y `ensureCharacterSheet` MUST NOT llamar al proveedor.
- **FR-009**: `selectKeyframeProvider` MUST recibir hasta 3 referencias ordenadas y MUST NOT recibir la hoja ni `sheetFallback`.
- **FR-010**: `composeKeyframe` MUST incluir `SINGLE_FRAME_BLOCK` siempre que haya ≥1 referencia.
- **FR-011**: Todos los keyframes MUST pasar por `KeyframeLayoutInspector` antes del vídeo, con independencia del número de referencias.
- **FR-012**: MUST existir `server/story/focus-framing.ts` (puro) con `resolveFocus` y `normalizeFocusFraming`.
- **FR-013**: La reescritura de foco MUST ser determinista a `close-up` y MUST registrar `reel.shot.focus-normalized` con `shotId`, `order` y el encuadre anterior.
- **FR-014**: El prompt de keyframe MUST incluir un bloque de tamaño de foco en inglés cuando el foco se resuelve, según la tabla de §Foco.
- **FR-015**: El prompt del director de planos MUST exigir `subject` con **un solo** personaje cuando la acción la ejecuta un secundario, y MUST nombrar la restricción de encuadre.
- **FR-020**: `StoryCostConfig` MUST ganar `characterRefCostUsd`; `ReelCostGuard` MUST ganar `estimateCharacterRefs` y `estimateCharacterRefAttempt`. `estimateVideoAttempt` MUST NOT cambiar de firma.
- **FR-022**: La creación MUST hacer una comprobación **post-plan** exacta con las referencias reales del canon, y MUST rechazar con `story-budget-exhausted` antes de persistir la historia. `estimateCreationCost` MUST seguir excluyendo las referencias en el pre-plan (§Presupuesto 15 s).
- **FR-023**: El mensaje de `story-budget-exhausted` MUST nombrar el cap real del perfil.
- **FR-024**: Una referencia `pending` MUST resolverse o marcarse `failed` en un máximo de 2 intentos y 180 s de inactividad; nunca MUST bloquear la historia más allá de eso.
- **FR-025**: Las referencias MUST ser idempotentes por `characterId`: un `ready` no se vuelve a enviar.
- **FR-028**: `Story` MUST publicar `characterRefs`. `StoryShot` MUST NOT cambiar en 012.
- **FR-029**: El umbral de lentitud del cliente MUST NOT cambiar: 012 no altera la latencia del vídeo.
- **FR-030**: El check de consistencia MUST usar `characterRefs[lead].frontalUrl` y MUST seguir desactivado por defecto (`NUXT_STORY_CONSISTENCY_ENABLED=false`).

### Criterios de éxito (medibles)

| Métrica | Objetivo | Cómo se comprueba |
|---|---|---|
| Referencias por personaje | 1 exacta por personaje y por historia; 0 regeneraciones entre ticks | Test del reconciliador con 3 ticks |
| Referencias por keyframe | Exactamente los personajes presentes, en orden, ≤3 | Test del selector |
| Rejillas recibidas | **0** keyframes con varias viñetas entregados al vídeo | Inspector + test con muestra sintética |
| Envíos por encima del cap | **0** | Test de coste y del servicio |
| Planos con foco en un secundario | **100 %** de los planos cuyo `subject` nombra a un **único** secundario tienen un encuadre enfocado | Test de `focus-framing` sobre el plan |
| Envíos con `elements` incompletos | **0** (un elemento sin `reference_image_urls` nunca llega a Fal) | Test del adaptador |
| Regresión 004 | 605 tests intactos | Gate |
| Identidad del secundario en el MP4 | Sin deriva visible en el smoke y el QA manual | Smoke opt-in |

---

## Data Contract

### `app/models/story.ts` (compartido)

```ts
export type StoryCharacterRefStatus = 'pending' | 'ready' | 'failed'

/** Cómo se obtuvo la imagen del personaje. */
export type StoryCharacterRefSource = 'user' | 'generated'

/** Proyección pública de una referencia. Sin request ids ni URLs de proveedor distintas de la imagen. */
export interface StoryCharacterReference {
  readonly characterId: string
  readonly source: StoryCharacterRefSource
  readonly status: StoryCharacterRefStatus
  readonly imageUrl: string | null
}

/** Motores de vídeo conocidos. `StoryModelId` es la fuente única. */
export type StoryVideoModel = StoryModelId

export interface StoryShot {
  // ...
}

export interface Story {
  // ...
  /** Orden del canon. Nunca incluye la hoja ni las anclas. */
  readonly characterRefs: readonly StoryCharacterReference[]
}
```

`StoryModelId` MUST NOT ganar valores nuevos en 012: el motor de vídeo no cambia.

`Story.characterSheetStatus` se retira del DTO (enmienda 13). `StoryCharacterSheet` permanece server-only en `reel-repository.ts`.

### `server/story/character-refs.ts` (solo servidor)

```ts
export interface StoredCharacterRef {
  readonly status: StoryCharacterRefStatus
  readonly source: StoryCharacterRefSource
  readonly frontalUrl: string | null
  /** Vistas adicionales del personaje; ≥1 cuando `status === 'ready'`. */
  readonly referenceUrls: readonly string[]
  readonly attempts: number
  readonly updatedAt: string
}

export type StoredCharacterRefs = Readonly<Record<string, StoredCharacterRef>>
```

Reglas de parseo (todas testables):

| Regla | Contrato |
|---|---|
| Claves desconocidas | Una clave que no sea un `characterId` del canon MUST descartarse al leer. |
| Entrada malformada | Sin `status` válido o con `frontalUrl` que no pase `assertFalMediaUrl` MUST descartarse la entrada, no la historia. |
| `ready` coherente | `status: 'ready'` MUST implicar `frontalUrl !== null` y `referenceUrls.length ≥ 1`. Si no, se degrada a `failed`. |
| Límite | Como máximo **3** entradas por historia. Las sobrantes se descartan por orden de canon. |
| `null` | `characterRefsJson = null` MUST leerse como `{}`. |

### Tipos de proveedor (solo servidor)

012 no define tipos de proveedor nuevos: usa el `NanoBananaAdapter` existente para generar la referencia de cada personaje.

### Interfaz `ShotVideoAdapter` (solo servidor)

**Sin cambios en la capa de vídeo.** 012 no declara `ShotVideoAdapter` ni toca los adaptadores de 008: `MinimaxVideoAdapter` y `KlingVideoAdapter` siguen produciendo el mismo JSON y el mismo `parseOutput`.

---

## Persistencia y migración

```prisma
model Story {
  // ...
  characterRefsJson Json?
}
```

Migración: `prisma/migrations/20261024180000_story_character_refs/migration.sql`

```sql
ALTER TABLE "Story" ADD COLUMN "characterRefsJson" JSONB;
```

| Regla | Contrato |
|---|---|
| Sin backfill | Las historias anteriores leen `{}`; su identidad sigue por `anchorsJson` (fallback de §Precedencia). |
| Escritura | `repository.updateStoryCharacterRefs(id, refs)` escribe el mapa **completo** bajo el lease del reconciliador, igual que `updateStoryAnchors`. |
| Repositorio | `ReelStoryRecord` gana `characterRefs: StoredCharacterRefs`; `CreateReelStoryInput` gana `characterRefs?`. |
| Prohibido en `app/` | Ningún acceso a base de datos desde `app/`. |

---

## API Contract

Sin rutas nuevas. Cambios aditivos:

| Ruta | Cambio | Códigos |
|---|---|---|
| `POST /api/story` | Sin campos nuevos en la petición. Tras el director, comprobación post-plan exacta. | `201` creada, `200` replay idempotente, `429` `story-budget-exhausted` (mensaje con el cap real), `503` `director-not-configured`. |
| `GET /api/story/{id}` | `characterRefs[]` ordenado por canon. Los `shots` no cambian. | `200`, `404` `story-not-found`, `410` `story-expired`. |
| `POST /api/story/{id}/approve` | Sin cambios de forma. Sigue comprobando el cap con `estimateVideosApproval` por plano. | `200`, `409` `story-not-ready`, `429` `story-budget-exhausted`. |
| `POST /api/story/{id}/shots/{shotId}/keyframe` | Sin cambios. El presupuesto usa el motor ya resuelto. | sin cambios |
| `POST /api/story/{id}/shots/{shotId}/retry` | Sin cambios. | sin cambios |

Invariantes de respuesta:

1. `characterRefs[].imageUrl` MUST ser `null` o una URL de `FAL_CDN_HOSTS`.
2. MUST NOT aparecer `keyframeRequestId`, `videoRequestId`, `statusUrl`, `responseUrl`, `cancelUrl` ni ningún secreto.
3. `characterRefs` MUST incluir a **todos** los personajes elegibles, también en `pending`, con `imageUrl: null`, para que la UI pueda mostrarlos antes de que exista la imagen.
4. `characterRefs` MUST estar ordenado por el canon y MUST tener como máximo 3 elementos.
6. `story-budget-exhausted` conserva código y estado `429`; solo cambia el texto, que MUST componerse con el cap real (`storyErrorMessage` acepta el cap como dato). Los tests que fijan el texto anterior se actualizan con esta enmienda, no se debilitan.

---

## Arquitectura de servidor / SOLID

```text
server/story/character-refs.ts              puro: elegibilidad, orden, parseo, elementos
server/story/character-ref-prompt.ts        puro: prompt de personaje en inglés
server/story/character-ref-orchestrator.ts  Nano Banana/FLUX + queue; sin env ni HTTP propio
server/story/focus-framing.ts               puro: resolución de foco y reescritura de encuadre
server/story/shot-video-adapter.ts          interfaz de Story para los tres adaptadores
server/story/reel-reconciler.ts             fases: referencias → keyframes → vídeos
server/story/shot-keyframe-orchestrator.ts  N referencias; nunca hoja
server/story/shot-video-orchestrator.ts     SIN CAMBIOS en 012
server/story/reel-cost.ts                   unidades por personaje y por segundo
```

| Frontera | Regla |
|---|---|
| Ruta | Valida, delega y serializa. No conoce el proveedor ni el adaptador. |
| Orquestador | Conoce la cola y el adaptador. No conoce `useRuntimeConfig` ni Prisma. |
| Adaptador | Construye la entrada y valida la salida. No decide el motor ni el coste. |
| Reconciliador | Orquesta fases y persiste. No compone prompts. |
| Compositor de prompts | Puro y determinista. No conoce proveedores. |

Reutiliza `server/fal/` (queue, storage, allowlist), `server/shared/` (errores, rate limit) y el reconciliador de 008. No se duplica el motor.

**No se reutiliza `character-sheet-orchestrator.ts`**: su contrato es `StoryCharacterSheet` (cuatro vistas de **un** personaje) y su entrada no identifica al personaje. Forzarlo obligaría a un tipo unión en la salida y a un adaptador de vuelta a una sola imagen. Se mantiene inerte y cubierto por un test que verifica que no llama al proveedor. El orquestador nuevo habla de **un personaje** desde la firma.

---

## Contratos de prompt

### Keyframe (N referencias)

| Regla | Contrato |
|---|---|
| Orden de referencias | `presentCharacterIds` (orden de escena, deduplicado) → `characterRefs[id]` → `anchors[id]` como fallback. Máximo 3. |
| Sin personajes | Se envía **solo** la referencia del protagonista como referencia de estilo y el cuerpo pide `Use the reference only for its visual style and palette. Do not add the person to this frame.` |
| Sin referencias | FLUX text-to-image con el bloque de estilo (sin cambios de 010). |
| Rejilla | `SINGLE_FRAME_BLOCK` MUST estar presente con ≥1 referencia. Una rejilla MUST NOT enviarse nunca. |
| Orden de bloques | Estilo → identidad → `SINGLE_FRAME_BLOCK` → plano (encuadre + sujeto + acción) → bloque de foco → composición → entidades presentes → localización/hora/clima → estilo corto. |
| Presupuesto | 900 caracteres con la escalera de degradación de 008; el bloque del plano y el de foco nunca se recortan. |
| Inglés | El cuerpo va en inglés; `narration` nunca entra en el prompt. |
| Prohibido | `Avoid:` en el prompt positivo (FLUX/Kontext no tienen canal negativo). |

### Vídeo con elementos

| Regla | Contrato |
|---|---|
| Etiquetas | `@Element1` es el protagonista si está presente; después los secundarios en orden de canon. |
| Correspondencia | `elements[i].frontal_image_url` ↔ `@Element{i+1}`. MUST ser biyectiva. |
| Elemento no mencionado | MUST NOT enviarse: se filtra antes de construir la entrada. |
| Texto de identidad | Con ≥1 elemento, el prompt MUST incluir `Keep the identity of @Element1, @Element2 exactly as in their reference images.` |
| Elementos vacíos | Sin elementos se conserva el prompt de 008 al completo. |
| Rejilla | Igual que en el keyframe: `SINGLE_FRAME_BLOCK` sigue presente y el keyframe ya validado es la única imagen de arranque. |
| Actuación | El prompt MUST NOT pedir interpretación al elemento: la sonda B demostró que los elementos no dirigen actores. El movimiento se describe en el cuerpo del prompt como en 008. |

### Resolución

`resolveFocus(shot, scene, bible)` es puro y determinista:

1. Normaliza `shot.subject` (minúsculas, sin diacríticos, espacios colapsados).
2. Busca nombres de personajes del canon contenidos en el sujeto.
3. **0 coincidencias** → `null` (sin validación ni bloque de foco).
4. **1 coincidencia** → ese personaje es el foco.
5. **≥2 coincidencias** → plano de conjunto: `null` (sin validación).

### Encuadres admitidos

| Foco | Encuadres que MUST aceptarse sin cambios | Encuadres que MUST reescribirse |
|---|---|---|
| Protagonista (`leadCharacterId`) | Todos | Ninguno |
| Secundario | `close-up`, `extreme-close-up`, `insert`, `detail`, `reaction` | `establishing`, `wide`, `medium`, `two-shot`, `over-the-shoulder` → **`close-up`** |

`FOCUSED_FRAMINGS = ['close-up','extreme-close-up','insert','detail','reaction']`
`FOCUS_FALLBACK_FRAMING = 'close-up'`

### Bloque de tamaño en el prompt

| Encuadre | Bloque en inglés |
|---|---|
| `close-up`, `reaction` | `The {name} occupies about two thirds of the frame width and is in sharp focus.` |
| `extreme-close-up`, `detail`, `insert` | `The frame is filled by {name} and the action described; nothing else competes for attention.` |
| `medium` | `The {name} occupies about one third of the frame width and is in sharp focus.` |
| `wide`, `establishing`, `two-shot`, `over-the-shoulder` | Sin bloque: el personaje no es el foco. |

### Fallback

| Caso | Comportamiento |
|---|---|
| Secundario en foco con encuadre no enfocado | Reescritura a `close-up`; el `camera` no cambia; evento `reel.shot.focus-normalized`. |
| El sujeto no resuelve | No se valida y no se reescribe. Se registra `reel.shot.focus-unresolved` a nivel de log. |
| La reescritura reduce la variedad de encuadres de la escena | Se acepta: la variedad es criterio de calidad (008), el foco es corrección de composición. |
| Varios personajes nombrados | Plano de conjunto: sin reescritura. Limitación declarada en §Riesgos. |

---

## Motor de vídeo (fuera de alcance)

**012 no cambia el motor de vídeo.** Se conserva el de 008:

| Preset | Adaptador | Coste por plano |
|---|---|---|
| `fast` | MiniMax Hailuo 02 | `videoFastCostUsd` (0,35) |
| `quality` | Kling 2.5 Turbo Pro | `videoQualityShortCostUsd` (0,35) |

Kling v3 Pro con `elements` (0,112 USD/s, ~7 min por plano de 5 s) queda **fuera de 012** por decisión humana del 2026-10-24: duplica el coste de vídeo y la consistencia ya se resuelve con la referencia en el keyframe. La sonda B de §Contexto queda como evidencia medida para una spec futura, sin código asociado.

| Invariante | Contrato |
|---|---|
| Sin adaptador nuevo | 012 MUST NOT añadir `fal-ai/kling-video/v3/pro/image-to-video` a la allowlist ni a `server/fal/adapters/`. |
| Sin dependencia | El coste de vídeo por historia no cambia. |

---

## Coste y cap

### Unidades nuevas

| Unidad | Default | Fuente |
|---|---|---|
| `characterRefCostUsd` | **0,04** | 0,0398 medido (Nano Banana, sonda A) |

El motor de vídeo no cambia, así que las unidades de vídeo de 008 se mantienen: `videoFastCostUsd` 0,35 y `videoQualityShortCostUsd` 0,35.

`estimate(story)` suma `referencias listas o intentadas × characterRefCostUsd`.

### Aritmética por perfil

Total = vídeo (motor de 008) + keyframes (`planos × 0,08` con referencia, `0,05` sin) + director 0,032 + referencias (0,04 c/u).

| Perfil | Planos máx. | Vídeo | Keyframes | Referencias (2) | Total estimado | Cap | ¿Cabe? |
|---|---|---|---|---|---|---|---|
| `standard` 15 s | 6 | 2,10 | 0,48 | 0,08 | **2,69** | 5 | Sí |
| `standard` 30 s | 12 | 4,20 | 0,96 | 0,08 | **5,27** | 7 | Sí |
| `standard` 45 s | 16 | 5,60 | 1,28 | 0,08 | **6,99** | 9 | Sí |
| `standard` 60 s | 22 | 7,70 | 1,76 | 0,08 | **9,57** | 11 | Sí |
| `production` 90 s | 30 | 10,50 | 2,40 | 0,08 | **13,01** | 15 | Sí |
| `budget` 15 s | 4–5 | 1,40–1,75 | 0,25–0,32 | 0,08 | **2,10–2,18** | 2,50 | Sí |
| `budget` 90 s | 15 | 5,25 | 1,20 | 0,08 | **6,56** | 7 | Sí |

### Presupuesto 15 s: el caso exacto

`budget` 15 s es el perfil más ajustado. Aritmética con `estimateCreationCost` de `reel-service.ts`:

| Caso | Keyframes | Vídeo | Reserva de reintento | Director | Referencias | Total | Cap 2,50 |
|---|---|---|---|---|---|---|---|
| Con referencia, 4 planos, 1 secundario | 0,32 | 1,40 | 0,35 | 0,032 | 0,04 | **2,14** | Cabe |
| Con referencia, 4 planos, 2 secundarios | 0,32 | 1,40 | 0,35 | 0,032 | 0,08 | **2,18** | Cabe |
| Sin referencia, 5 planos, 1 personaje | 0,25 | 1,75 | 0,35 | 0,032 | 0,04 | **2,42** | Cabe |
| Sin referencia, 5 planos, 2 personajes | 0,25 | 1,75 | 0,35 | 0,032 | 0,08 | **2,46** | Cabe |
| Sin referencia, 5 planos, 3 personajes | 0,25 | 1,75 | 0,35 | 0,032 | 0,12 | **2,50** | Cabe (justo) |

| Regla | Contrato |
|---|---|
| Pre-plan | `estimateCreationCost` MUST seguir reservando **0** unidades de referencia: sumar `3 × 0,04` en el pre-plan rechazaría casi todas las historias de `budget` 15 s sin referencia antes de saber cuántos personajes hay. |
| Post-plan | La comprobación post-plan MUST contar las referencias **reales** del canon a 0,04 c/u. |
| Margen | El peor caso (`budget` 15 s, sin referencia, 3 personajes, 5 planos) queda **exactamente en 2,50**, igual al cap: cabe, sin margen. Cualquier subida de `keyframeCostUsd`, `videoFastCostUsd`, `characterRefCostUsd` o `directorCostUsd` lo deja fuera y obliga a enmienda explícita. El test MUST fijar esta aritmética al centavo. |
| Sin cambio de cap | 012 **no** modifica `capUsd` de ningún perfil: al quedar fuera Kling v3, los caps de 008 ya cubren el coste nuevo. |

### Reglas del guardián

| Regla | Contrato |
|---|---|
| Antes de una referencia | `assertWithinCap(story, estimateCharacterRefAttempt(story, id))`. Si no cabe: `failed` + evento `reel.character-ref.budget-skipped`; la historia continúa. |
| Antes de un vídeo | Sin cambios respecto a 008: `assertWithinCap` y `story-budget-exhausted` si no cabe. |
| Antes de aprobar | `estimateVideosApproval` sin cambios respecto a 008. |
| Post-plan | Estimación exacta con el plan real; rechaza la creación antes de gastar medios. |
| Asimetría declarada | Una referencia que no cabe degrada la identidad; un vídeo que no cabe produciría un vídeo incorrecto. Por eso una se salta y el otro falla. |

---

## Máquina de estados y recuperación

No hay estados nuevos en `StoryStatus`. La fase de referencias vive dentro de `GENERATING_KEYFRAMES`.

```text
GENERATING_KEYFRAMES
  ├─ ensureCharacterReferences
  │    ├─ pending  → se envía (≤3 en paralelo)
  │    ├─ pending  → se consulta cada tick
  │    ├─ ready    → se persiste; nunca se regenera
  │    ├─ failed   → 1 reintento automático en un tick posterior; luego definitivo
  │    └─ todas ready|failed → continúa
  ├─ keyframes por plano (N referencias)
  ├─ layoutInspector antes del vídeo
  └─ WAITING_APPROVAL | GENERATING_VIDEOS
```

| Regla | Contrato |
|---|---|
| Idempotencia | Un `ready` MUST NOT volver a enviarse. La clave es `characterId`. |
| Reintentos | Máximo 2 intentos por personaje. Sin reintento manual en el MVP. |
| Inactividad | 180 s sin cambio de estado ⇒ `failed`, evento `reel.character-ref.timeout`, la historia continúa. |
| Reinicio del proceso | Los `requestId` viven en memoria (mapa por `characterId`, como `sheetSubmissions`). Un `pending` persistido sin envío en memoria se reenvía si `attempts < 2`; si no, pasa a `failed`. |
| Fallo del proveedor | `failed` con el código mapeado; nunca tumba la historia. |
| Cancelación | `cancel` de la historia MUST cancelar los envíos de referencia en curso, best-effort. |
| Caducidad de la referencia del usuario | Si `referenceExpiresAt <= now` al enviar el vídeo, el elemento `source: 'user'` MUST omitirse y registrarse `reel.character-ref.expired`. Los `generated` no caducan antes que la historia. |
| Re-encolado por díptico | Volver a `KEYFRAME_QUEUED` MUST NOT tocar `characterRefsJson` ni volver a llamar al proveedor de referencias. |
| Aprobación | La aprobación no espera referencias: si el usuario llega a `WAITING_APPROVAL`, todas están `ready` o `failed`. |

---

## Seguridad, secretos, lifecycle e idempotencia

| Área | Contrato |
|---|---|
| Secretos | `NUXT_FAL_KEY` sigue solo en `runtimeConfig.falKey`. La generación de referencias es server-side; el cliente nunca ve la key. |
| Endpoint | `fal-ai/kling-video/v3/pro/image-to-video` MUST estar en la allowlist del servidor. El cliente no elige endpoint ni modelo. |
| URLs | `frontalUrl` y `referenceUrls` MUST pasar `assertFalMediaUrl` (`FAL_CDN_HOSTS`, https, sin credenciales ni fragmento, ≤2 048 caracteres). |
| Lifecycle | Las referencias generadas usan la misma política que los keyframes (URLs de Fal CDN). No se re-suben a Storage; no hay binario en Nitro. |
| Logs | Se registra `characterId`, `attempt`, `stage`, `latencyMs`, `errorCode` y coste. **Nunca** la key, el prompt completo, la URL firmada ni la IP en claro. |
| Rate limit | Sin rutas nuevas de cliente, sin ventana nueva. Los envíos entran en el cap por historia y en el presupuesto diario existente. |
| Idempotencia | `POST /api/story` conserva `idempotencyKey`; las referencias usan `characterId` como clave natural. |
| Contenido | La generación de personajes usa el mismo mapeo de errores (`content-blocked`, `provider-rejected`). Un personaje bloqueado no bloquea la historia. |

---

## UI/UX y copy deck

### Copy (español, `app/data/story.ts`)

```ts
export const STORY_CHARACTER_REF_COPY = {
  title: 'Personajes',
  pending: 'Preparando a {name}…',
  ready: 'Imagen lista',
  failed: 'Referencia no disponible',
  failedNote: 'La historia continúa, pero {name} puede cambiar entre planos.',
  count: '{n} personajes con imagen propia',
  focus: 'En foco: {name}',
} as const
```

### Superficies

| Pantalla | Cambio | ARIA / testid |
|---|---|---|
| Progreso de keyframes | Sub-fase `Personajes` con una entrada por personaje y miniatura al estar lista. | `role="status"` en la lista; `data-testid="story-character-refs"`, `story-character-ref-<characterId>`, `story-character-ref-status-<characterId>`, `story-character-ref-image-<characterId>` |
| Revisión de planos | Línea `En foco: {name}`. | `data-testid="story-shot-focus"` |

> **Sin pantalla propia de personajes en 012.** Ver, regenerar y asignar fotos a un personaje (equivalente a lo que ya se hace por escena) queda en `BACKLOG.md`. 012 solo muestra el estado durante el progreso y el foco en la revisión. El motor de vídeo no se muestra porque no cambia.

### Reglas de UI

1. Sin porcentajes ni ETAs inventados (Constitución I).
2. Una referencia `failed` no se muestra como error bloqueante: `role="status"`, nunca `role="alert"`.
3. Sin pasos extra en el camino por defecto: el usuario no configura personajes ni referencias.
4. El foco es informativo; no se edita en esta spec.
5. Contraste y foco visible según las primitivas de `app/components/ui/`.

---

## Impacto en configuración y documentación

### `nuxt.config.ts` (`runtimeConfig.story`)

| Clave | Default | Efecto |
|---|---|---|
| `costCharacterRefUsd` | `0.04` | Unidad de coste por referencia de personaje. |
| `consistencyEnabled` | `false` | Activa `consistency-check` con la referencia del protagonista. |

### `.env.example`

```dotenv
NUXT_STORY_COST_CHARACTER_REF_USD=0.04
NUXT_STORY_CONSISTENCY_ENABLED=false
```

### Otros documentos

| Documento | Cambio |
|---|---|
| `README.md` | Sección de 012: referencias por personaje y coste por referencia. |
| `AGENTS.md` | Estado de 012 y renumeración 012/013/014. |
| `.opencode/skills/fal-deepseek-pipeline` | Referencia por personaje con Nano Banana; **sonda B de `elements` documentada como no adoptada**. |
| `.opencode/skills/prisma-leases` | `characterRefsJson`, idempotencia por `characterId`, recuperación tras reinicio. |
| `.opencode/skills/story-test-harness` | Stubs de Nano Banana para la referencia de personaje. |
| `.opencode/skills/ffmpeg-media` | Clips de 1,5–6 s en QC y montaje. |

---

## Test plan

### Unit

| Fichero | Casos |
|---|---|
| `tests/unit/server/story-character-refs.spec.ts` | Elegibilidad (protagonista con referencia excluido; sin referencia incluido; inventado incluido; personaje sin escenas excluido); orden canónico; máximo 3; parseo de `null`, entradas malformadas y claves desconocidas; `ready` incoherente → `failed`; construcción de elementos (orden, biyección). |
| `tests/unit/server/story-character-ref-prompt.spec.ts` | Inglés; bloque de estilo al inicio; `no grid`; `single character`; ≤600 caracteres; sin texto ni logo. |
| `tests/unit/server/story-character-ref-orchestrator.spec.ts` | `submit` con y sin referencia del usuario; parseo vertical; salida no vertical → `provider-invalid-output`; fallo mapeado; idempotencia por `characterId`; 2 intentos. |
| `tests/unit/server/story-anchor-selection.spec.ts` | N referencias ordenadas; máximo 3; sin hoja; sin `sheetFallback`; sin personajes → referencia del protagonista con instrucción de estilo; sin nada → FLUX. |
| `tests/unit/server/story-focus-framing.spec.ts` | 0/1/≥2 coincidencias; secundario + `wide` → `close-up`; secundario + `insert` intacto; protagonista intacto; acentos y mayúsculas; sujeto desconocido. |
| `tests/unit/server/story-prompt-composer.spec.ts` | Bloque de foco por encuadre; orden estilo→identidad→single-frame→plano→foco→composición; ≤900 con 3 referencias; `@ElementN` en el prompt de vídeo; elemento no mencionado no se envía. |
| `tests/unit/server/story-reel-cost.spec.ts` | Unidad por personaje; rechazo antes de enviar; referencia que no cabe se salta; mensaje con el cap real; aritmética exacta de `budget` 15 s (2,14 / 2,18 / 2,50) y pre-plan sin unidades de referencia. |
| `tests/unit/server/story-qc-frames.spec.ts` | Clip de 2 s y de 6 s; `expectedDurationSeconds` por clip; timestamps dentro del clip. |
| `tests/unit/server/story-reconciler.spec.ts` | Referencias antes del primer keyframe; fallo parcial no bloquea; timeout 180 s; reinicio con `pending`; díptico re-encolado sin tocar referencias; idempotencia entre ticks. |

### Rutas

| Caso | Esperado |
|---|---|
| `POST /api/story` sin campos nuevos | `201`; el cuerpo no cambia |
| `POST /api/story` con plan que no cabe | `429` `story-budget-exhausted`; mensaje con el cap real; sin llamadas de medios |
| `GET /api/story/{id}` | `characterRefs` ordenado ≤3; sin request ids |
| `GET` con referencia fallida | `status: 'failed'`, `imageUrl: null`, historia `200` |
| Fugas | Ni `NUXT_FAL_KEY`, ni `statusUrl`, ni `cancelUrl` en ninguna respuesta |

### Componentes

| Componente | Casos |
|---|---|
| Progreso de keyframes | Estados `pending`/`ready`/`failed`; copy; `role="status"`; testids |
| `StoryShotCard` | Línea de foco; motor de vídeo; sujeto |
| Progreso de vídeos | Sin cambios respecto a 008; sin porcentajes inventados |
| Accesibilidad | Foco visible, sin `role="alert"` para una referencia fallida |

### Acceptance

| Caso | Esperado |
|---|---|
| Historia con secundario inventado y stubs | 2 referencias, 1 sola vez; keyframe con 2 URLs; vídeo de 008 sin cambios; 0 llamadas reales |
| Historia `fast` con secundario | MiniMax; sin `elements` |
| `NUXT_STORY_KLING_V3_ENABLED` | **No existe en 012** (Kling v3 fuera de alcance) |
| Regresión 004 | 605 tests intactos y en verde |
| Regresión 008/010/011 | Keyframe ≤900, sin `Avoid:`, sin hoja, anclas intactas |

### Smoke real opt-in

`RUN_CHARACTER_REF_SMOKE=1` (además de `NUXT_FAL_KEY` y `DATABASE_URL`), **presupuesto duro 1,00 USD**, nunca en CI:

1. Crea una historia 15 s `standard`, `preset: 'quality'`, `visualStyle: 'papercraft'`, con un secundario inventado en la premisa.
2. Espera las referencias: **≥2** `ready`; apunta coste y latencia.
3. Espera `WAITING_APPROVAL`; verifica que ningún keyframe es díptico.
4. Aprueba; verifica que al menos un envío usa `fal-ai/kling-video/v3/pro/image-to-video` con `elements` y `duration` exacta.
5. Espera el MP4 final; imprime `{ storyId, refs, engine, plannedSeconds, finalSeconds, spentUsd }`.
6. **Sonda dedicada del caso no probado** (presupuesto aparte, ~0,60 USD): toma un keyframe real de la misma historia que **no** contenga al secundario; envía Kling v3 con `start_image_url` = ese keyframe y **solo** el elemento del secundario, con un prompt que pida su aparición en la acción. Revisa a mano si el personaje aparece con la identidad de su referencia. Este resultado es **QA manual** y es el que decide si 012 puede llegar a `Validated`.
7. Mide la facturación real de un plano de 2 s y de uno de 6 s para confirmar el modelo por segundo.

Presupuesto total del smoke: **1,00 USD** para los pasos 1–5 y **0,60 USD** para la sonda 6. Sin autorización humana explícita no se ejecuta.

Sin estos pasos, 012 se queda en `Implemented`.

---

## Fuera de alcance

- Entrenamiento LoRA o fine-tuning por personaje.
- Subida de varias imágenes por el usuario (`STORY_MAX_REFERENCES = 1` sigue vigente).
- Subida o edición manual de la referencia de un personaje secundario.
- **Kling v3 Pro y `elements`** (decisión humana 2026-10-24): el motor de vídeo no cambia en 012. La sonda B queda como evidencia medida para una spec futura.
- **Pantalla de personajes**: ver, regenerar y asignar fotos por personaje va a `BACKLOG.md`, igual que ya se hace por escena.
- **Varias fotos del usuario**: `STORY_MAX_REFERENCES = 1`. Detectar qué foto corresponde a qué personaje con visión, asignarla y mencionarla va a `BACKLOG.md`.
- Conversión de fotos reales al estilo: la hoja 2×2 sigue inerte.
- Audio, voz, música y subtítulos (013).
- Gráficos y overlays (014).
- Publicación, descarga o persistencia del resultado más allá del TTL actual.
- Regenerar los keyframes de `802575b0` automáticamente: se descartan y el usuario crea la historia de nuevo.

---

## Riesgos y supuestos no probados

| Riesgo | Estado | Mitigación |
|---|---|---|
| Un plano de conjunto puede dejar al secundario diminuto | Limitación de la regla de foco (≥2 nombres no se valida). | El prompt del director exige un sujeto único cuando el secundario actúa; se registra `focus-unresolved`. |
| La referencia generada no se parece al personaje descrito | No probado en historias reales; la sonda A dio un gato coherente con el estilo papercraft. | El prompt de personaje usa la descripción del canon; el usuario puede regenerar la historia. La pantalla de personajes queda en backlog. |
| 3 referencias provocan collage | Riesgo estructural: la causa raíz de 011 era la rejilla. | `SINGLE_FRAME_BLOCK` obligatorio + inspector de dípticos antes del vídeo. |
| Referencia del usuario caducada (1 h) en historias largas | Real para `production` 90 s. | El elemento caducado se omite con evento; el vídeo no se bloquea. |
| Rechazo post-plan perceptible | El usuario gasta ~0,03 USD de director antes del rechazo. | Mensaje honesto con el cap real; el coste entra en el presupuesto diario. |
| Deriva de identidad no detectada | `consistency-check` desactivado por defecto. | Se reactiva con `NUXT_STORY_CONSISTENCY_ENABLED=true` cuando el smoke lo justifique. |
| Vídeo mudo | Motor de 008, sin audio. | El audio es 013; no se presenta como si existiera. |

---

## Fases de implementación

| Fase | Alcance | Evidencia de salida |
|---|---|---|
| 1 | Contrato en `app/models/story.ts`, `characterRefsJson`, migración, parseo y repositorio. | Migración aplicada; tests de parseo y de DTO. |
| 2 | `character-refs.ts`, `character-ref-prompt.ts`, `character-ref-orchestrator.ts`. | Tests unitarios con stubs; 0 llamadas reales. |
| 3 | Integración en el reconciliador: fase de referencias, idempotencia, intentos, timeout y recuperación. | Tests del reconciliador; una historia con stubs completa. |
| 4 | N referencias en keyframes, eliminación de `sheetFallback`, `focus-framing.ts` y bloque de foco, prompt del director. | Tests de composición y de selector; keyframe ≤900. |
| 5 | Coste por referencia de personaje y comprobación post-plan. | Tests de coste y de cap. |
| 6 | UI y copy: referencias y foco. | Tests de componente y de accesibilidad. |
| 7 | Gate completo (`npm run test:run`, `npm run build`) y regresión 004. | Recuentos exactos. |
| 8 | Smoke opt-in con presupuesto 1,00 USD: 15 s `fast` con una referencia generada y QA manual de los keyframes. | Informe con coste y resultado. Solo entonces el humano puede marcar `Validated`. |

---

## Criterios de cierre

1. Spec en `Implemented` con commit, fecha, recuentos exactos de tests y build, y desviaciones declaradas.
2. `Validated` **solo** con el smoke opt-in y el QA manual de los keyframes aprobados por el humano.
3. `AGENTS.md` con el estado real y la renumeración 012/013/014.
4. `README.md`, `.env.example`, `nuxt.config.ts` y los cuatro skills sincronizados con los defaults.
5. Tests de 004 intactos y en verde; ningún test debilitado.
6. Resumen explícito de smokes: ejecutados, saltados o pendientes, con el gasto real.
7. `git status --short`, `git diff --stat` y `git diff --check` en el resumen de cierre.
8. Aprobación humana antes del commit.

---

## Open Questions

1. ¿Un `medium` de un secundario solo en el plano es aceptable como encuadre enfocado? Hoy se reescribe a `close-up`; se revisa con la primera historia real.
2. ¿El coste medido de Nano Banana (0,0398) se mantiene con 1 referencia de estilo y prompt largo? El smoke lo mide.
3. ¿Se necesita un reintento manual de una referencia `failed` en el MVP? Hoy no hay ruta; sigue en `BACKLOG.md` junto a la pantalla de personajes.
