# Feature Specification: Consistencia de personaje — hoja y verificación

**Feature Branch**: `011-character-consistency`

**Created**: 2026-10-24

**Status**: Draft (Checkpoint 1 pending). No implementation code may be written until human approval.

**Input**: User description: "Los planos no respetan la foto del personaje. Quiero que en todas las escenas sea la misma persona."

## Contexto y evidencia

Cuatro keyframes reales de una historia de 15 s con un ancla válida (retrato frontal, Nano Banana) produjeron **tres personajes distintos**: uno correcto, uno sin barba y uno sin cara. El prompt ya llevaba la referencia y el bloque de identidad; no fue suficiente.

Estado del arte consultado (2026):

- El pipeline canónico es: guion → shot list → **character bible** → keyframes → **consistency check** → image-to-video → montaje.
- El paper *CineCrew* (arXiv 2609.07720) concluye que el cuello de botella es la **capa de orquestación**, que la consistencia debe ser un **objetivo persistente y explícito** y que hace falta un **crítico que detecte deriva de identidad y regenere**.

Ya tenemos el pipeline y el bloque de identidad. Faltan las dos piezas que la industria marca como obligatorias: la **hoja de personaje** y la **verificación automática**.

## Alcance

Dos cambios, ninguno reescribe el motor:

1. **Hoja de personaje** (varias vistas) generada una vez por historia y guardada como identidad.
2. **Consistency check** tras los keyframes: compara cada plano con el ancla y regenera el que derive.

## User Stories

### US1 — La misma persona en todos los planos (P1)

**Given** una historia con referencia del protagonista, **When** se generan los keyframes, **Then** cada uno se compara con el ancla y, si no coinciden, se regenera una vez.

**Acceptance**

1. Un plano que no coincide se regenera automáticamente y se registra el intento.
2. Si el segundo intento tampoco coincide, el plano queda marcado para revisión humana y la historia sigue.
3. La historia nunca se bloquea por un plano inconsistente.

### US2 — La hoja de personaje como fuente de verdad (P1)

**Given** una referencia del protagonista, **When** se crea la historia, **Then** se generan 4 vistas (frontal, tres cuartos, perfil, sonrisa) y se usan como identidad.

**Acceptance**

1. Las 4 vistas comparten cara, pelo, barba y vestuario.
2. Se persisten y se reutilizan en todos los planes y en los reintentos.
3. Si la hoja falla, la historia cae al ancla única y lo registra.

### US3 — No gastar en vídeo con un personaje roto (P1)

**Given** un keyframe marcado como inconsistente, **When** el usuario aprueba, **Then** el sistema exige resolverlo o aprobarlo explícitamente antes de gastar en vídeo.

## Requisitos

- **FR-001**: MUST existir una hoja de personaje con 4 vistas por historia, generada con `fal-ai/nano-banana/edit` desde la referencia.
- **FR-002**: La hoja MUST persistirse en `Story.characterSheetJson` (URLs por vista) con lifecycle.
- **FR-003**: Los keyframes MUST usar la hoja como referencia (varias imágenes) en lugar de una sola foto.
- **FR-004**: MUST existir `consistency-check.ts`: compara el keyframe con la hoja y devuelve `match`, `drift` o `unknown`.
- **FR-005**: El check MUST usar un modelo de visión (`deepseek-flash`), preguntas cerradas y salida JSON validada.
- **FR-006**: Un `drift` MUST regenerar el plano **una vez**; un segundo `drift` MUST marcar el plano `NEEDS_REVIEW`.
- **FR-007**: El coste del check MUST contarse dentro del cap del perfil.
- **FR-008**: Nada de esto MUST bloquear la historia ni los estados existentes.
- **FR-009**: Tests: hoja válida, fallo de la hoja, check `match`/`drift`/`unknown`, un solo reintento, marcado de revisión, coste.

## Hallazgo real (2026-10-24)

Con la hoja, **3 de 4 planos mantienen la identidad** (front, reaction, wide). El plano `two-shot` falló en bucle: se enviaban las 4 vistas de un solo personaje a un plano con dos, y el proveedor devolvía una salida que el adaptador rechazaba.

| Regla | Contrato |
|---|---|
| **Planos de un personaje** | MUST enviar la hoja completa (4 vistas). |
| **Planos de varios personajes** | MUST enviar una sola vista de la hoja; el segundo personaje se describe en el prompt. Más referencias degradan la salida. |
| **Reintentos con actividad** | El tope de inactividad no frena un bucle de intentos fallidos, porque cada intento cuenta como actividad. Pendiente: tope por número de fallos consecutivos. |

## Fuera de alcance

- Entrenamiento LoRA por personaje.
- Consistencia de dos personajes en el mismo plano (queda con `kontext/max/multi`).
- Voz y subtítulos (012) y gráficos (013).

## Coste

| Pieza | Coste por historia |
|---|---|
| Hoja (4 imágenes) | ~0,16 USD |
| Check (4-5 comparaciones) | ~0,01 USD |
| Regeneraciones | ~0,04 por plano |

Total esperado: **+0,20 USD** por historia, dentro del cap de 2,50.

## Riesgos

- El modelo de visión puede dar falsos positivos y regenerar de más: por eso solo un reintento y coste contado.
- La hoja puede heredar el estilo pero no la cara: se valida antes de usarla y se cae a la referencia única.
- Añade latencia (~20 s por historia): asumible frente a los 2-6 min del vídeo.

## Fases

1. Contrato y persistencia de la hoja.
2. Generación de la hoja con Nano Banana.
3. `consistency-check.ts` + validación del JSON.
4. Integración en el reconciliador y estados de revisión.
5. UI: ver la hoja en la revisión de keyframes.
6. Gate, una historia real y cierre.
