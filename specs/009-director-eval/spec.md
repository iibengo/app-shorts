# Feature Specification: Director Eval — medición reproducible del director de planos con DeepSeek

**Feature Branch**: `009-director-eval`

**Created**: 2026-10-23

**Status**: Implemented (gate with stubs green; **not executed against the real API yet**). Real run pending explicit human authorisation.

**Input**: User description: "No hay evals de la Capa B. Quiero una eval del director de planos de la 008, solo con DeepSeek (nada de Fal). 10-15 premisas versionadas, un runner que mida JSON válido a la primera, tasa de reparación, truncados, latencia y tokens, salidas grabadas como fixtures y tests que las reproduzcan sin red. Tope de 1 USD en la primera ejecución."

## Contexto y relación con las specs previas

La 008 implementa el director real: canon → escenas → planos, con una reparación por etapa y validación en servidor. Todo está cubierto por tests deterministas con stubs, y eso garantiza el **contrato** del JSON, pero no dice nada sobre **qué produce el modelo** con premisas reales. La única medición real del pipeline hecha hasta hoy fue la de B1 (3 llamadas sueltas, ~0,002 USD), que confirmó que DeepSeek razonaba por defecto y consumía `max_tokens`.

Esta spec añade la capa que falta: una eval opt-in, barata y reproducible, que convierte una ejecución real en fixtures permanentes. No cambia el comportamiento del producto.

### Relación con 004–008

- **004/005:** no se tocan.
- **006/007:** no se tocan.
- **008:** se reutilizan `createReelNarrativeDirector`, `createReelShotDirector`, `createReelStoryDirector`, `durationPlanFor`, `validateShotList` y su stream de eventos (`DirectorLogEvent`). **No se modifica código de producción**; si el runner necesita un export adicional, se documenta en la fase correspondiente.

### Enmienda de numeración (2026-10-23)

La agenda canónica reservaba 009 para audio y 010 para consistencia de personajes. Esta spec ocupa la **009** porque valida la cadena que ya existe y desbloquea el smoke real con información previa. En consecuencia:

| Antes | Ahora |
|---|---|
| 009 — audio, voz, música y subtítulos | **010** — audio, voz, música y subtítulos |
| 010 — consistencia de personajes/3D | **011** — consistencia de personajes/3D |

`AGENTS.md` se actualiza en la fase de cierre de esta spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Medir el director con premisas reales y presupuesto acotado (Priority: P1)

Como responsable del producto, quiero ejecutar una eval con 12 premisas de referencia contra DeepSeek, con un tope duro de 1 USD, y obtener métricas por premisa y agregadas.

**Why this priority**: sin esto no hay ninguna evidencia de calidad del guion; solo contratos.

**Independent Test**: ejecutar `RUN_DIRECTOR_EVAL=1 npm run eval:director` con una clave válida y comprobar que se escribe un informe con las 12 premisas y que el coste estimado no supera 1 USD.

**Acceptance Scenarios**:

1. **Given** una clave de DeepSeek válida y 12 premisas, **When** se ejecuta el runner, **Then** se escribe `tests/fixtures/eval/director/runs/<runId>.json` con métricas por premisa y totales.
2. **Given** que el coste acumulado estimado alcanza 1 USD, **When** queda una premisa pendiente, **Then** el runner aborta, marca `budgetExhausted: true` y escribe el informe parcial.
3. **Given** que la API devuelve 401, **When** se ejecuta, **Then** el runner falla de inmediato con un mensaje estable y sin reintentos.

### User Story 2 - Reproducir la eval sin red (Priority: P1)

Como desarrollador, quiero que las respuestas grabadas se reproduzcan en la suite normal sin red, para detectar regresiones de prompt o de modelo.

**Why this priority**: una eval que solo vive en una ejecución manual no protege nada.

**Independent Test**: `npm run test:run` ejecuta el test de replay y valida los umbrales sin ninguna llamada de red.

**Acceptance Scenarios**:

1. **Given** las fixtures grabadas, **When** se ejecuta el test de replay, **Then** los 12 planes se reconstruyen y pasan `validateShotList`.
2. **Given** una fixture manipulada que introduce un `finish_reason: length`, **When** se ejecuta el replay, **Then** el test falla indicando truncamiento.

### User Story 3 - Ver la calidad por etapa, no solo el resultado (Priority: P1)

Como responsable técnico, quiero saber si el JSON es válido a la primera, cuántas reparaciones se consumen y cuánto tarda y cuesta cada llamada.

**Independent Test**: el informe incluye `firstPassValid`, `repairs`, `truncations`, `latencyMs` por llamada, tokens (prompt, completion, reasoning) y coste estimado.

**Acceptance Scenarios**:

1. **Given** una premisa que necesita reparación en escenas, **When** termina, **Then** el informe registra `repairs: 1` y el `stage: 'scenes'` afectado.
2. **Given** una respuesta con `finish_reason: length`, **When** termina, **Then** se incrementa `truncations` y se registra la etapa.

### User Story 4 - No filtrar secretos ni datos de usuario (Priority: P1)

**Independent Test**: revisar el informe y las fixtures y comprobar que no contienen la clave, cabeceras de autorización ni datos de usuarios reales.

**Acceptance Scenarios**:

1. **Given** una ejecución completa, **When** se inspeccionan los ficheros generados, **Then** no aparece la clave ni la cabecera `Authorization`.
2. **Given** el log del runner, **When** se ejecuta en modo normal, **Then** solo imprime ids de premisa y métricas, nunca la premisa completa ni los prompts.

### Edge Cases

- Sin `NUXT_DEEPSEEK_KEY`: el runner no arranca y explica qué falta.
- El modelo devuelve `content_filter`: se cuenta como fallo terminal de la premisa, sin reparación.
- El modelo devuelve JSON válido pero el plan no pasa `validateShotList`: se cuenta como inválido y se registra el motivo.
- Una premisa tarda más de 300 s en total (timeout del director): se registra como fallo y se continúa con la siguiente.
- Reparación que también falla: la premisa se marca inválida con la etapa y el motivo.
- El informe ya existe para ese `runId`: se escribe un sufijo, nunca se sobrescribe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: MUST existir `tests/fixtures/eval/director-premises.json`, versionado, con **12 premisas** y el esquema del Data Contract.
- **FR-002**: Las premisas MUST cubrir 3 en modo `faithful` y 9 en `creative`, y las duraciones 15/30/45 s con perfiles `budget` y `standard`.
- **FR-003**: Ninguna premisa MUST usar referencia de imagen: `hasReference` es siempre `false` porque esta eval no toca Fal.
- **FR-004**: MUST existir un runner opt-in en `tests/eval/director-eval.spec.ts` que solo se ejecute con `RUN_DIRECTOR_EVAL=1`. Sin la variable, el fichero MUST saltarse (no fallar).
- **FR-005**: El runner MUST construir el director real con `createReelNarrativeDirector`, `createReelShotDirector` y `createReelStoryDirector`, sin pasar por rutas HTTP ni por PostgreSQL.
- **FR-006**: El runner MUST usar `deepseek-flash` con `thinking: { type: 'disabled' }` (B1). MUST NOT usar Fal, FFmpeg, Prisma ni base de datos.
- **FR-007**: El runner MUST envolver el `DeepSeekClient` para medir latencia por llamada, y MUST usar el stream `DirectorLogEvent` para atribuir etapa, intento, `finishReason` y tokens.
- **FR-008**: El informe MUST incluir por premisa: `id`, `ok`, `firstPassValid`, `repairs`, `truncations`, `latencyMs`, `tokens{prompt,completion,reasoning}`, `costUsd`, `scenes`, `shots` y, si falla, `failure{stage, code}`.
- **FR-009**: El informe MUST incluir totales: premisas ejecutadas, llamadas, coste estimado, `p50Ms` y `p95Ms`.
- **FR-010**: El runner MUST aplicar un tope duro de **1,00 USD** por ejecución, calculado con los tokens reales devueltos y una tabla de precios en constantes. Al alcanzarlo MUST abortar antes de la siguiente llamada.
- **FR-011**: El runner MUST registrar cada petición y respuesta en `tests/fixtures/eval/director/recorded-latest.json`, sin cabeceras ni clave.
- **FR-012**: MUST existir `tests/unit/server/director-eval-replay.spec.ts`, determinista y sin red, que reproduzca `recorded-latest.json` con un `fetch` stub y valide los umbrales de FR-013.
- **FR-013**: Umbrales del replay: **12/12** planes válidos, **0** truncamientos, **≤ 6** reparaciones de 36 etapas y **≥ 9/12** premisas válidas a la primera.
- **FR-014**: El replay MUST validar cada plan con `validateShotList` y el `DurationPlan` de su premisa.
- **FR-015**: El runner MUST NOT escribir nada fuera de `tests/fixtures/eval/director/`.
- **FR-016**: El informe MUST usar un `runId` ISO 8601 y MUST NOT sobrescribir ejecuciones anteriores.
- **FR-017**: Cualquier fallo del runner MUST producir un código estable (`eval-not-configured`, `eval-budget-exhausted`, `eval-provider-unauthorized`), nunca un mensaje crudo del proveedor.
- **FR-018**: `package.json` MUST exponer `npm run eval:director`, que ejecuta el fichero opt-in; la variable de entorno se documenta en el README y en la spec, no se fija en el script.

### Non-goals (explícitos)

- **FR-019**: Esta spec MUST NOT modificar código de producción. Si un export falta, se abre una enmienda antes de tocarlo.
- **FR-020**: Esta spec MUST NOT ejecutarse en `npm run test:run`. El replay sí, el runner no.
- **FR-021**: Esta spec MUST NOT evaluar keyframes, vídeo, QC, prompts de B2 ni coste de Fal.

## Data Contract

Ficheros de test, no contratos de `app/models/`. No hay DTO compartido ni ruta HTTP nueva.

### `tests/fixtures/eval/director-premises.json`

```json
{
  "version": 1,
  "premises": [
    {
      "id": "p01",
      "premise": "Un repartidor descubre que el paquete que lleva contiene un gato que habla.",
      "mode": "faithful",
      "costMode": "budget",
      "durationSeconds": 15,
      "preset": "fast",
      "hasReference": false
    }
  ]
}
```

Reglas: `id` único `^p[0-9]{2}$`; `premise` 10–600 caracteres; `mode` ∈ `faithful|creative`; `costMode` ∈ `budget|standard`; `durationSeconds` ∈ `15|30|45`; `preset` ∈ `fast|quality`; `hasReference` siempre `false`.

### `tests/fixtures/eval/director/runs/<runId>.json`

```json
{
  "runId": "2026-10-23T10:00:00.000Z",
  "model": "deepseek-flash",
  "thinking": "disabled",
  "budgetUsd": 1.0,
  "budgetExhausted": false,
  "totals": { "premises": 12, "calls": 38, "costUsd": 0.041, "p50Ms": 3200, "p95Ms": 7400 },
  "premises": []
}
```

### `tests/fixtures/eval/director/recorded-latest.json`

```json
{
  "version": 1,
  "runId": "2026-10-23T10:00:00.000Z",
  "calls": [
    {
      "premiseId": "p01",
      "index": 0,
      "request": { "model": "deepseek-flash", "messages": [], "response_format": { "type": "json_object" }, "temperature": 0.4, "max_tokens": 8000, "thinking": { "type": "disabled" }, "stream": false },
      "response": { "choices": [], "usage": {} }
    }
  ]
}
```

Regla: `request` es el body exacto enviado, **sin cabeceras**.

## API Contract

No hay rutas nuevas ni cambios en las existentes. El runner es un test, no un endpoint.

## Server Architecture / SOLID

```text
tests/
  eval/
    director-eval.spec.ts          runner opt-in; importa directores reales de server/story
  fixtures/eval/
    director-premises.json         premisas versionadas
    director/recorded-latest.json  grabación reproducible
    director/runs/<runId>.json     informes
  unit/server/
    director-eval-replay.spec.ts   replay determinista con stub
```

- El runner importa `server/story/*` como cualquier test; no introduce capa nueva ni duplica el cliente.
- La medición vive en el runner (`RecordingDeepSeekClient`), no en producción.
- `server/story/` no cambia. Si hiciera falta un export, es enmienda aparte.

## Security & Operations

- Clave solo desde `NUXT_DEEPSEEK_KEY`; nunca en fixtures, informes ni logs.
- Los informes y fixtures contienen premisas sintéticas y salidas del modelo; **no** datos de usuarios reales.
- El runner imprime solo `premiseId` y métricas; nunca la premisa completa ni los prompts.
- Sin Fal, sin FFmpeg, sin PostgreSQL, sin red más allá de `api.deepseek.com`.
- El tope de 1 USD es un guardrail de coste, no una estimación: se calcula con tokens reales.

## Costes y latencia

- Precios usados en el runner: **0,15 USD/M tokens de entrada** y **0,60 USD/M de salida** (lista de modelos de OpenCode para `deepseek/deepseek-flash`; si DeepSeek publica otros, se ajustan las constantes).
- Estimación: 12 premisas × ~3,2 llamadas ≈ 38 llamadas; ~0,03–0,10 USD por ejecución.
- Tope duro: **1,00 USD**. Con 4,25 USD de saldo, quedan ≥ 3,25 USD de margen.
- Latencia: informativa, no umbral de fallo en la primera ejecución.

## Test Plan

### Gate

`npm run db:generate` · `npx prisma validate` · `npm run test:run` · `npm run build`. El runner opt-in no forma parte del gate.

### Tests deterministas

- `director-eval-replay.spec.ts`: 12 planes válidos, 0 truncamientos, ≤ 6 reparaciones, ≥ 9/12 a la primera.
- `director-eval-replay.spec.ts`: fixture manipulada con `finish_reason: length` → el test falla.
- `director-eval-replay.spec.ts`: petición grabada con `thinking: { type: 'disabled' }` en todas las llamadas.
- Validación del esquema de `director-premises.json`: ids únicos, modos y duraciones permitidos, `hasReference: false`.
- Guarda de secretos: ningún fichero de `tests/fixtures/eval/` contiene la clave ni `Authorization`.

### Opt-in

- `RUN_DIRECTOR_EVAL=1 npm run eval:director` — primera ejecución autorizada con tope de 1 USD.

### Comprobaciones manuales

- Leer los 12 planes generados y anotar si la historia se entiende y si el número de planos encaja con la duración.

## Constitution Check

- **I. Simplicidad:** no cambia el producto ni la UI; la eval es herramienta.
- **II. SDD:** esta es la Fase 1; no hay código hasta Checkpoint 1.
- **III. Secretos:** la clave sigue en servidor; las fixtures no guardan cabeceras.
- **IV. Modularidad:** el runner vive en `tests/`, reutiliza los directores y no toca `server/`.
- **V. Tests:** replay determinista en la suite; runner opt-in y con tope.
- **VI. Cierre:** la spec quedará en `Implemented` al mergear; `Validated` solo tras la ejecución real aprobada.
- **VII. Economía de tests:** el runner no entra en `test:run`.
- **VIII. Compatibilidad:** no hay contratos de producto modificados; solo se añade la enmienda de numeración.

## Assumptions

- La clave de DeepSeek del proyecto tiene saldo suficiente para ~0,05 USD.
- `deepseek-flash` con `thinking` desactivado mantiene la calidad observada en la medición de B1.
- Los precios de la lista de OpenCode son una aproximación válida para el guardrail.

## Out of Scope

- Fal, keyframes, vídeo, FFmpeg, QC, montaje y lifecycle.
- Evaluación de calidad visual o de historia por humanos más allá de la lectura manual.
- Umbrales de latencia como fallo.
- Comparación entre modelos o proveedores.
- CI: el repositorio no tiene pipeline.

## Open Questions

1. ¿Los umbrales de FR-013 son los correctos para la primera ejecución, o preferís empezar solo midiendo sin fallar el replay?
2. ¿La tabla de precios debe parametrizarse por entorno o quedarse en constantes del runner?

## Implementation Phases

1. **Fase 0:** premisas, esquema y validación del fichero.
2. **Fase 1:** runner con `RecordingDeepSeekClient`, métricas y guarda de presupuesto.
3. **Fase 2:** replay determinista y umbrales.
4. **Fase 3:** script `eval:director`, documentación y cierre.

## Exit Criteria

- Replay en verde dentro de `npm run test:run`.
- Gate completo en verde.
- Primera ejecución autorizada, informe commiteado y coste real registrado.
- `AGENTS.md`, README y enmienda de numeración actualizados.
