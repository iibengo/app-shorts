# Feature Specification: Estilo visual y consistencia de personajes

**Feature Branch**: `010-visual-style`

**Created**: 2026-10-23

**Status**: Implemented. **010a** (contrato, registro de estilos, bloque de estilo, capa visual en inglés) y **010b** (anclas por primer keyframe, selección FLUX/Kontext/multi y selector de UI) implementadas. Pendiente de validación con una historia completa real.

**Input**: User description: "Voy a usar esto para vídeos de personajes digitales, no realistas. Quiero poder elegir el estilo (3D cartoon, clay, anime…) desde la interfaz y que los personajes sean el mismo de escena a escena."

## Contexto y evidencia

Dos sondas reales de keyframe (fal-ai/flux/dev, ~0,03 USD cada una) con el mismo plano:

| | Sonda 1: prompt mixto ES/EN, sin estilo | Sonda 2: todo EN, estilo 3D al inicio |
|---|---|---|
| Estilo | fotorrealista | **3D cartoon** |
| Prop característico | ausente | **presente** |
| Acción (correr) | ignorada | **cumplida** |
| Longitud | 812 caracteres | 484 caracteres |

Conclusiones medidas:
1. El modelo cumple lo que está en inglés; lo que queda en español se diluye.
2. Sin estilo explícito, FLUX elige fotorrealismo.
3. El campo `storyBible.style` lo escribe el LLM y describe cámara y ritmo, no un look: no sirve como contrato de estilo.

## Relación con las specs previas

- **004/005/006/007:** sin cambios.
- **008:** el compositor de keyframe (B2) se mantiene; esta spec añade el bloque de estilo y el ancla de personaje. Se enmienda el contrato de prompts y el Data Contract.
- **009:** la eval sigue siendo la herramienta de medida; sus fixtures no cambian.
- **Renumeración (2026-10-23):** audio pasa a **011** y gráficos/overlays a **012**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Elegir el estilo del canal (Priority: P1)

Como creador, quiero elegir entre 3D cartoon, papercraft, clay, anime o fotorrealista, con 3D cartoon por defecto, sin configurar nada más.

**Acceptance Scenarios**:

1. **Given** una historia nueva sin tocar el panel avanzado, **When** se crea, **Then** `visualStyle` es `cartoon3d`.
2. **Given** que elijo `anime` o `papercraft`, **When** se generan los planos, **Then** el prompt de cada keyframe empieza por el bloque de estilo correspondiente en inglés.
3. **Given** un cliente que envía un `visualStyle` desconocido, **When** llama a `POST /api/story`, **Then** recibe 400 `invalid-visual-style`.

### User Story 2 - El mismo personaje en todos los planos (Priority: P1)

Como creador, quiero que el protagonista tenga la misma cara y proporciones en todos los planos, aunque cambie de ropa y de localización.

**Acceptance Scenarios**:

1. **Given** una historia con protagonista, **When** empieza la fase de keyframes, **Then** se genera **un ancla de identidad** por personaje relevante (máximo 2) y se persiste con su URL y caducidad.
2. **Given** un ancla disponible, **When** se genera un keyframe con un solo personaje, **Then** se usa `fal-ai/flux-pro/kontext` con esa ancla.
3. **Given** un plano con dos personajes, **When** se genera el keyframe, **Then** se usa `fal-ai/flux-pro/kontext/max/multi` con las dos anclas en `image_urls`.
4. **Given** un plano sin personajes, **When** se genera el keyframe, **Then** se usa `fal-ai/flux/dev` con el bloque de estilo.
5. **Given** que un ancla falla o caduca antes de usarse, **When** se procesa un plano, **Then** se regenera una sola vez; si vuelve a fallar, la historia falla con un código estable.

### User Story 3 - La capa visual va en inglés (Priority: P1)

Como sistema, necesito que el texto que llega al proveedor esté en inglés, y que la interfaz siga en español.

**Acceptance Scenarios**:

1. **Given** una historia en español, **When** se genera el canon, **Then** `description`, `wardrobe`, `style`, `theme`, `action`, `visualPrompt`, `subject` y las descripciones de localizaciones y props están en inglés.
2. **Given** la misma historia, **When** se muestra en la interfaz, **Then** `title`, `logline` y `narration` siguen en español.
3. **Given** un campo visual con texto en español, **When** se valida, **Then** no se rechaza por idioma: la validación no depende del idioma, solo la instrucción del prompt.

### User Story 4 - Consistencia comprobable (Priority: P2)

Como responsable de calidad, quiero medir si el personaje se mantiene entre planos.

**Acceptance Scenarios**:

1. **Given** dos keyframes de la misma historia, **When** se comparan, **Then** el QC de visión puede evaluar rostro, vestuario y prop característico contra el canon.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: MUST existir `StoryVisualStyle = 'cartoon3d' | 'papercraft' | 'clay' | 'anime' | 'photo'` en `app/models/`.
- **FR-002**: El default MUST ser `cartoon3d`. El cliente MUST enviar un id, nunca texto de estilo.
- **FR-003**: `POST /api/story` MUST aceptar `visualStyle?` y MUST persistirlo en `Story.visualStyle`.
- **FR-004**: El servidor MUST mapear cada id a un bloque de estilo en inglés mediante un **registro** en `server/story/visual-style.ts`. Añadir un estilo nuevo MUST ser una entrada del registro, no una spec nueva; el cliente nunca envía texto.
- **FR-005**: El bloque de estilo MUST ser la **primera** parte del prompt de keyframe, antes del plano.
- **FR-006**: El prompt de vídeo MUST incluir el mismo bloque de estilo, para que el movimiento no cambie el look.
- **FR-007**: Los prompts de canon, escenas y planos MUST pedir los campos visuales en inglés; `title`, `logline` y `narration` MUST seguir en español.
- **FR-008**: El ancla MUST ser **el primer keyframe que muestra a cada personaje**, no una imagen extra: el reconciliador MUST guardar esa URL al completarse el plano y reutilizarla en el resto de la historia. Evidencia: la sonda de Kontext confirmó que el primer keyframe sirve como ancla y mantiene cara, ropa y estilo.
- **FR-009**: Las anclas MUST persistirse en `Story.anchorsJson` como mapa `characterId → url`, sin exponerse en el DTO público. No hay estado `anchorStatus`: se deriva de las claves presentes.
- **FR-010**: La selección de endpoint MUST ser determinista: `fal-ai/flux-pro/kontext` con una ancla; `fal-ai/flux-pro/kontext/max/multi` con dos anclas en `image_urls`; `fal-ai/flux/dev` sin personajes en el plano.
- **FR-010b**: El endpoint `fal-ai/flux-pro/kontext/max/multi` MUST añadirse a la allowlist de endpoints del servidor (`ComposerEndpointId`).
- **FR-011**: Un fallo del ancla MUST reintentarse una vez; después, `provider-rejected` o `provider-timeout` según corresponda.
- **FR-012**: El ancla MUST respetar el lifecycle de la referencia (misma política de caducidad) y regenerarse si caduca antes de terminar.
- **FR-013**: La UI MUST ofrecer las cuatro opciones en el panel avanzado, con `cartoon3d` preseleccionado y sin pasos extra en el camino por defecto.
- **FR-014**: Los caps por perfil MUST revisarse con la medición real: `kontext/max/multi` cuesta **0,08 USD por imagen** (verificado en la página del modelo) y `kontext` pro menos, pero más que FLUX dev. El perfil Presupuesto 15 s (cap 2,50) queda muy justo con 5 keyframes multi (~0,40) más 5 vídeos, así que el cap MUST subirse o el perfil MUST limitar los planos con dos personajes. El guardián de coste sigue siendo la autoridad.
- **FR-015**: Tests deterministas: mapeo de estilos, orden del prompt, selección de adaptador con y sin ancla, fallo y reintento del ancla, y componente del selector.

## Data Contract

```ts
export type StoryVisualStyle = 'cartoon3d' | 'clay' | 'anime' | 'photo'

export interface StoryCreateRequest {
  // ...
  readonly visualStyle?: StoryVisualStyle
}

export interface Story {
  // ...
  readonly visualStyle: StoryVisualStyle
  readonly anchorStatus: 'pending' | 'ready' | 'failed'
}
```

`anchorUrl` y `anchorExpiresAt` son server-only (no se exponen en el DTO público salvo `anchorStatus`).

## API Contract

- `POST /api/story`: nuevo campo opcional `visualStyle`; 400 `invalid-visual-style` si no es un id permitido.
- `GET /api/story/{id}`: `visualStyle` y `anchorStatus` en el DTO; nunca `anchorUrl` firmada.
- Sin rutas nuevas.

## Server Architecture / SOLID

```text
server/story/visual-style.ts            map id → bloque EN; única fuente de estilo
server/story/anchor-orchestrator.ts     genera y persiste el ancla con el adapter de keyframe
server/story/shot-keyframe-orchestrator.ts  elige Kontext si hay ancla
server/story/story-prompt-composer.ts    estilo primero, plano después
```

Reutiliza `server/fal/` (queue, adapters, storage) y el reconciler de 008. No crea transporte nuevo.

## State Machine

El ancla se genera dentro de `GENERATING_KEYFRAMES` antes del primer plano:
`anchorStatus: pending → ready` (o `failed`). No añade estados nuevos a la historia. Un fallo del ancla que agota el reintento hace fallar la historia con el código del proveedor.

## UI/UX

- Selector "Estilo" en el panel avanzado: cinco tarjetas con nombre y miniatura. `papercraft` reproduce el look low-poly de papel con paleta azul noche y neón.
- Valor por defecto `cartoon3d`; no se pide al usuario.
- Copy: "Estilo visual — 3D cartoon, Papercraft, Clay, Anime, Realista".
- Accesible: radiogroup, foco visible, `data-testid="story-style-option-<id>"`.
- El resultado MUST indicar el estilo usado.

## Security & Operations

- El cliente nunca envía texto de prompt ni un endpoint.
- El ancla es una imagen generada: mismo lifecycle y allowlist de CDN que los keyframes.
- No se registra el prompt ni el ancla en logs.

## Costes

- Ancla: 1 imagen FLUX por historia (~0,03 USD).
- Keyframes con Kontext: más caros que FLUX dev; estimación +0,10-0,25 USD por historia de 5 planos.
- Los caps actuales (2,50 / 5 / 7 / 9 / 11 / 7 / 15) se revisan con una sonda real antes de cerrar la spec.

## Test Plan

- Unit: `visual-style.ts` (ids válidos, bloque EN, longitud), orden del prompt (estilo antes del plano), matriz de selección (0 anclas → FLUX dev; 1 → kontext; 2 → max/multi), reintento del ancla, DTO sin URLs.
- Rutas: `POST /api/story` con estilo válido, inválido y ausente; `GET` expone `visualStyle`/`anchorStatus`.
- Componentes: selector, default, accesibilidad, copy.
- Replay: la eval de 009 se re-ejecuta una vez para comprobar que la capa visual en inglés no rompe la validez (objetivo ≥ 11/12).
- Sondas opt-in: 1 keyframe `cartoon3d`, 1 Kontext con ancla y 1 `max/multi` con dos anclas; cada una mide coste y calidad antes de fijar caps.

## Hallazgo del primer end-to-end (2026-10-23)

El primer run completo real (15 s, `cartoon3d`) falló en el plano 1 por `technical-aspect`: Kontext devolvió un keyframe **1152×1536** (3:4) porque hereda el formato de la referencia, y MiniMax heredó ese formato y devolvió **768×1024** (4:3). El QC lo rechazó con razón.

| Regla | Contrato |
|---|---|
| **Puerta de aspecto** | Un keyframe con ratio distinto de 9:16 (±3 %) MUST rechazarse al parsear la respuesta del proveedor, no dos etapas después. Implementado en `parseOutput` de Kontext y Kontext multi. |
| **Nunca anclar un no vertical** | El ancla MUST provenir de un keyframe validado, así que un ancla 4:3 no puede propagarse al vídeo. |
| **Diagnóstico** | El clip fallido se conserva y el error queda en `videoError` (`provider-invalid-output`), no se descarta en silencio. |
| **Reintento con keyframe inválido** | Si al reintentar un plano su keyframe guardado no es vertical, el servicio MUST leer sus dimensiones y **regenerar el keyframe** en lugar de relanzar el vídeo sobre una referencia rota. Coste: una imagen en vez de un vídeo perdido. |
| **Semilla FLUX** | El **primer keyframe de un personaje** lo genera siempre FLUX (`image_size 1152×2048`), nunca Kontext, porque Kontext hereda el ratio de la referencia. Kontext solo entra cuando todos los personajes presentes ya tienen ancla vertical validada. |

## Proveedor de keyframes con ancla (2026-10-23)

Dos sondas reales con el ancla de Ionias (`fal-ai/nano-banana/edit`, 0,0398 USD por imagen):

| Prueba | Escena | Ropa | Resultado |
|---|---|---|---|
| 1 | Mesa de café, mañana | Camiseta negra | Misma cara, estilo low-poly, sin arrastrar objetos del ancla |
| 2 | Azotea nocturna con neones | Chaqueta oscura | Misma cara, **ojos azules**, ropa nueva, estilo intacto |

| Regla | Contrato |
|---|---|
| **Nano Banana primero** | Con al menos un ancla disponible, el keyframe MUST generarse con `fal-ai/nano-banana/edit` y `aspect_ratio: 9:16`. MUST NOT usarse Kontext salvo fallback explícito. |
| **Motivo** | 0,0398 USD por imagen (más barato que Kontext), admite varias referencias, devuelve `width`/`height` y mantiene identidad y estilo con ropa y escena distintas. |
| **Formato** | El adaptador MUST rechazar una respuesta no vertical, igual que Kontext. |
| **Semilla** | FLUX sigue generando el primer keyframe cuando no hay ancla, para garantizar 1152×2048. |
| **Fallback** | Kontext y Kontext multi se conservan en el registro para los perfiles que los necesiten; Nano Banana es la opción por defecto con ancla. |

## Hallazgo del segundo end-to-end (2026-10-23)

La historia de presentación de Ionias generó 4 keyframes y **los planos 3 y 4 no eran el personaje**: uno salió sin barba y otro como un maniquí blanco. Causa: el plano 1 (un `wide` de espaldas) se guardó como ancla de Ionias, así que los planos siguientes intentaron parecerse a una nuca.

| Regla | Contrato |
|---|---|
| **Ancla desde la referencia** | Si el usuario sube una referencia, MUST usarse como ancla inicial del protagonista al crear la historia, antes de generar ningún keyframe. |
| **Ancla solo con cara** | El reconciliador MUST guardar un keyframe como ancla únicamente si su `framing` muestra la cara: `medium`, `close-up`, `extreme-close-up`, `reaction` o `two-shot`. `establishing`, `wide`, `detail`, `insert` y `over-the-shoulder` MUST NOT convertirse en ancla. |
| **Motivo** | El modelo no puede mantener una identidad que no ve. Un ancla de espaldas degrada todos los planos posteriores y se paga entera. |

## Out of Scope

- Estilo `explainer` abstracto (figuras sin cara, símbolos, planos de 17 s): pertenece a la 012 junto con la capa gráfica.
- Consistencia de varios personajes en el mismo plano (una referencia).
- LoRA o entrenamiento por personaje.
- Audio, subtítulos y gráficos (011 y 012).
- Estilo por escena: el estilo es de la historia.

## Decisiones cerradas (2026-10-23)

0. **Estilos iniciales:** `cartoon3d` (vídeo 1 de referencia) y `papercraft` (vídeo 2, low-poly con neón). `explainer` (vídeo 3) se pospone a la 012 porque depende de la capa gráfica. El registro permite añadir más sin spec nueva.
1. **Varios personajes:** soportados con `kontext/max/multi` y hasta dos anclas. Verificado en el vídeo de referencia: dos personajes en el mismo plano y cambios de ropa y localización entre escenas.
2. **El ancla es identidad, no vestuario:** cabeza y cara con fondo neutro; la ropa la pone la escena.
3. **El estilo se muestra** en el resultado como etiqueta, además del panel avanzado.
4. **Caps:** se suben tras la sonda de Kontext; no se implementa un cap nuevo a ciegas.

## Open Questions

1. ¿La segunda ancla se genera siempre o solo cuando el guion incluye un antagonista con plano propio?
2. ¿`kontext/max/multi` acepta una sola imagen? Si no, el camino de un personaje se queda en `kontext` pro.

## Implementation Phases

1. Contrato, enum, migración y validación.
2. `visual-style.ts` + compositor (estilo primero) + capa visual en inglés.
3. Ancla: orquestador, persistencia, selección de Kontext y reintento.
4. API, DTO y tests.
5. UI del selector + accesibilidad.
6. Gate, una corrida de eval y tres sondas opt-in (FLUX con estilo, Kontext, max/multi).
7. Cierre y enmienda de 008.
