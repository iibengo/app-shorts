# Feature Specification: Story Modes — `faithful` y `creative` como contrato de producto

**Feature Branch**: `007-story-modes`

**Created**: 2026-10-22

**Status**: Draft (Checkpoint 1 pending). No code may be written until human approval.

**Input**: User description: "Quiero que el director tenga dos modos reales, no un flag escondido. `faithful` se comporta como 006: solo personajes y elementos de la premisa, invención mínima. `creative` permite al director inventar puesta en escena, giros, eventos y personajes secundarios que sirvan a la premisa, siempre con continuidad y sin cambiar el tema, el protagonista ni el conflicto principal. El modo tiene que ser un contrato visible en la UI al crear la historia, persistido en PostgreSQL, devuelto por la API y testeado. Los personajes inventados deben declararse en la Story Bible con `source: 'invented'`, aparecer al menos en una escena y no ser tratados como extras por el QC. Máximo 3 personajes en total, máximo 2 inventados, y el protagonista siempre de la premisa. La premisa sigue siendo el marco: creativo no es «cualquier cosa». No se implementa la biblia editable por el usuario; eso queda para una futura 008."

---

## Contexto y relación con 004/005/006

007 es una **extensión aditiva** de 006 (Story Continuity, implementada) y **no toca 004**.

006 resolvió la continuidad visual: Story Bible, beats con invariantes, bloque global idéntico, negativos derivados y QC de fotogramas antes del montaje. Lo que 006 **no** resolvió es que el director tenga libertad narrativa declarada: su prompt prohíbe personajes ajenos a la premisa y no existe ninguna noción de producto sobre cuánta invención se permite. 007 introduce ese contrato sin reescribir la continuidad.

### Los tres niveles del problema (solo dos entran en 007)

| Nivel | Qué es | Decisión de 007 |
|---|---|---|
| **Nivel 1 — comportamiento** | El prompt del director cambia según un modo. | **Dentro.** `storyDirectorSystemPrompt(sceneCount, mode)` con dos variantes normativas. |
| **Nivel 2 — contrato de producto** | El modo es explícito, visible, persistido, validado, devuelto por la API y testeado; `creative` permite personajes secundarios inventados con procedencia declarada. | **Dentro.** `StoryMode`, `Story.mode`, `StoryCharacter.source`, migración, DTO, UI y tests. |
| **Nivel 3 — biblia editable** | La persona edita personajes, vestuario, props o reglas de la Story Bible. | **Fuera de alcance.** Reservado para una futura 008. 007 no añade ninguna ruta, formulario ni estado de edición de la biblia. |

### Hechos verificados en el código actual (base de 007)

| Hecho | Consecuencia |
|---|---|
| `app/models/story.ts` define `StoryCharacter` con `id`, `name`, `description`, `wardrobe`, sin procedencia. | No se puede distinguir un personaje de la premisa de uno inventado, ni validarlo, ni mostrarlo. |
| `server/story/director-prompt.ts` exige «Cada personaje de la storyBible debe aparecer al menos en una escena; no añadas personajes que no actúen en la premisa ni cameos». | El director no puede inventar personajes secundarios ni siquiera cuando el producto lo pide. |
| `validateStoryBible(value)` no recibe contexto de modo y `BIBLE_CHARACTER_KEYS` no incluye `source`. | No hay invariante que rechace un personaje inventado en modo fiel. |
| `StoryCreateRequest` no tiene `mode`; `canonicalStoryBody` hashea `[premise, sceneCount, preset, referenceUrl, referenceExpiresAt]`. | Dos peticiones idénticas salvo el modo colisionarían en idempotencia. |
| `prisma/schema.prisma` no tiene `StoryMode` ni `Story.mode`. | No hay persistencia ni backfill posible. |
| `composeGlobalBlock`, `composeNegative`, `composeKeyframe` y `composeVideo` reciben la biblia y el beat. | La biblia ya es la autoridad visual; añadir `source` no obliga a cambiar sus firmas. |
| `qc-checker.ts` compara contra `expectation.characters` y `leadCharacterId`. | Un personaje inventado **ya declarado en la biblia y en el beat** no se marca como extra; 007 debe demostrarlo con tests y con el prompt de QC. |
| `parsePlan` valida con `allowLegacyBible: true` y **sin modo**. | Si se leyera una fila `creative` con la validación por defecto (`faithful`), el plan se reconstruiría y se perdería la biblia. 007 debe pasar `mode` al leer. |

### Relación con 004

| Cláusula de 004 | Efecto de 007 |
|---|---|
| `/composer`, `app/models/composer.ts`, `app/components/composer/**`, `app/composables/useComposer*`, `server/composer/**`, `server/api/composer/**` | **Intactos.** 007 no importa ni modifica nada del Composer. |
| Los **613 tests** de 004, sus fixtures y `tests/unit/server/adapters/kling-video-adapter.spec.ts` | **Intactos y en verde, sin modificaciones.** |
| `VideoInput.negativePrompt` opcional y `negative_prompt` normativo de Kling | **Sin cambios.** 007 no añade campos al adaptador ni al body de vídeo. |
| Contratos de error, cabeceras, cookie `composer_sid` y tokens de job | **Sin cambios.** |
| Story sigue sin permitir negativos escritos por el usuario | **Se mantiene.** El negativo sigue siendo derivado server-side. |

### Relación con 005 y 006

- 005 sigue siendo la base del Story Composer: rutas, estados, coste, rate limit y ciclo de vida.
- 006 sigue siendo la base de la continuidad: Story Bible, compositor de prompts, negativos, QC y recuperación.
- 007 **no añade estados, transiciones, rutas ni códigos de QC**. Añade un campo de producto (`mode`), una procedencia por personaje (`source`) y dos variantes de prompt.

### Tabla de enmienda a 006

006 conserva su texto histórico como trazabilidad. Esta tabla **prevalece** sobre las cláusulas listadas. Todo lo no listado sigue vigente sin cambios.

| Cláusula de 006 | Texto anterior (resumen) | Enmienda de 007 |
|---|---|---|
| **FR-206** | El JSON del director contiene `title`, `logline`, `storyBible` y `beats`; `storyBible` contiene exactamente `style`, `location`, `timeOfDay`, `weather`, `leadCharacterId`, `signaturePropId`, `characters`, `props`, `forbidden`, `continuityRules`. | `characters` pasa a exigir `source`. El resto de claves no cambia. |
| **FR-208** | `characters` tiene 1–3 elementos con exactamente `id`, `name`, `description` y `wardrobe`. | Cada personaje tiene exactamente `id`, `name`, `description`, `wardrobe` y `source`. Se añaden las invariantes por modo (FR-316 a FR-318). |
| **FR-210** | `leadCharacterId` es el `id` de un personaje de la biblia. | Se añade: el personaje de `leadCharacterId` MUST tener `source: 'premise'` en **todos** los modos. |
| **FR-214** | Cada personaje de la biblia aparece en al menos un beat. | Se mantiene y se aplica también a los personajes inventados. Ningún personaje puede ser un «fantasma» de la biblia. |
| **FR-220** | El prompt de sistema exige la biblia, los nueve campos del beat y prohíbe personajes extra. | El prompt pasa a ser **dependiente del modo**: variante `faithful` (equivalente a 006 + `source`) y variante `creative` (permite hasta 2 personajes inventados y giros, con el marco fijo). |
| **FR-221** | El prompt pide que el protagonista y su prop característico aparezcan en todas las escenas y que hora y clima sean constantes. | Se mantiene en ambos modos. En `creative` se añade explícitamente que la localización, la hora, el clima, el tema, el protagonista y el conflicto principal no cambian. |
| **FR-227** | El negativo se deriva de una base fija + `forbidden` + prop característico y nunca puede contradecir la biblia. | Se mantiene **sin cambios de salida**. Se explicita la invariante: ningún personaje de la biblia, sea `premise` o `invented`, puede aparecer en el negativo. El modo no altera el negativo. |
| **FR-233** | `validateDirectorPlan` reutiliza `bible-validator` con las invariantes 206–217. | `validateStoryBible` y `validateDirectorPlan` reciben el modo y validan `source`. |
| **FR-236** | `validateDirectorPlan` acepta `storyBible` ausente solo en la lectura de filas persistidas. | Se amplía al mismo camino: un plan persistido antes de 007 puede tener biblia **sin `source`**; se normaliza a `'premise'`. En creación, `source` es obligatorio. |
| **FR-243 / FR-244** | La evaluación de QC es por escena con el bloque global, las expectativas del beat y la observación anterior. | Se añade una línea determinista de **reparto canónico** que indica cuántos personajes son de la premisa y cuántos inventados, para que el evaluador no los trate como extras. El esquema del evaluador no cambia. |
| **FR-245** | El comparador emite `extra-character` cuando aparece un personaje no previsto. | Sin cambio de reglas. Se explicita que los personajes `invented` declarados en la biblia y presentes en `beat.characters` son **previstos**, no extras. |
| **FR-259** | El schema añade `QC`/`WAITING_QC` y las columnas `qcJson`/`qcCheckedAt`, y **no** se añade ninguna otra columna. | **Superseded en una columna.** Se añade `Story.mode` y el enum `StoryMode`. No se añade ninguna otra columna, tabla ni índice. |
| **FR-262** | El repositorio mapea `qcJson` y las listas de estados. | Se añade el mapeo de `mode` y la validación del plan con el modo de la fila. Un fallo de mapeo no puede reconstruir un plan `creative`. |
| **FR-275** | `GET /api/story/[id]` devuelve plan, `qc` y beats, y oculta campos internos. | Se añade `mode` al DTO. Sigue sin devolver prompts, negativos, `qcJson` crudo, `sessionId`, `leaseOwner`, `requestId` ni URLs internas. |
| **FR-277** | No se añade ningún `StoryErrorCode` nuevo. | **Superseded para un único código.** Se añade `invalid-mode` (400). No se añade ningún otro código ni ningún estado HTTP nuevo. |
| **FR-278** | La revisión muestra el bloque colapsado de la biblia y, por tarjeta, personajes, objetos, cámara y continuidad. | La revisión muestra además el **modo** de la historia y marca los personajes inventados en la biblia. |
| **FR-290** | Fixtures nuevas de plan con biblia y de QC. | Se añaden fixtures de plan `creative`, plan `faithful` con personaje inventado y biblia 006 sin `source`. |
| **Fuera de alcance de 006** | «Edición manual de la biblia o de los beats por el usuario». | **Se mantiene y se refuerza.** 007 no añade edición de la biblia; solo cambia cómo se genera. El nivel 3 queda para 008. |
| **Out of Scope de 006** | «Selección automática de personajes». | Se matiza: en `creative` el **director** puede inventar personajes secundarios, no el usuario ni un selector automático. Sigue sin haber selección manual de personajes. |

### Tabla de enmienda a 005

| Cláusula de 005 | Texto anterior (resumen) | Enmienda de 007 |
|---|---|---|
| **FR-020** | `temperature` fija en la petición a DeepSeek. | Pasa a ser una constante por modo: `0.4` en `faithful` y `0.7` en `creative`. Sigue siendo un valor del servidor, no configurable por el cliente. |
| **FR-021** | El JSON contiene exactamente `title`, `logline` y `beats`. | Ya enmendada por 006; 007 añade `source` a cada personaje de `storyBible`. |
| **FR-097** | La misma `Idempotency-Key` con el mismo body devuelve la misma respuesta; con otro body, 409. | El body canónico incluye `mode`. La misma clave con distinto modo es 409 `idempotency-conflict`. |
| **Data Contract — `StoryCreateRequest`** | `premise`, `sceneCount`, `preset`, `referenceUrl`, `referenceExpiresAt`. | Se añade `mode: StoryMode` **obligatorio**. |

### Fuera de alcance de 007

- **Nivel 3: biblia editable por el usuario** (personajes, vestuario, props, reglas, `forbidden`). Futura 008.
- Cambiar el modo de una historia ya creada (no hay ruta, no hay PATCH, no hay estado de edición).
- Selección manual de personajes o de personajes secundarios por el usuario.
- Más de 2 personajes inventados, más de 3 personajes en total o personajes sin función narrativa.
- Imágenes de referencia por personaje, hojas de personaje, consistencia por personaje con referencia dedicada, LoRA, `seed`, encadenado de keyframes o referencia de vídeo.
- Cambiar el número de escenas (4–6, por defecto 5), los 6 s, el 9:16, la ausencia de audio, texto y transiciones, o el motor de montaje.
- Cambiar el flujo, los estados, los umbrales o la configuración del QC de 006.
- Cambiar la fórmula de coste, el cap de 8 USD o el presupuesto diario.
- Detección automática de IP, moderación nueva o garantía de originalidad legal. Es un gate de producto/legal (M5), no código de 007.
- Prometer viralidad, retención o rendimiento. `creative` puede mejorar hook, escalación y payoff; **no se promete ningún resultado**.
- Publicación en el feed, descarga, compartición, audio, subtítulos, música o texto quemado.
- Nuevas dependencias npm, nuevos proveedores, nuevas tablas, caché distribuida o rate limit distribuido.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear una historia fiel con el modo por defecto (Priority: P1)

Una persona escribe una premisa, deja el modo por defecto `Fiel a la premisa` y pulsa `Crear historia`. El servidor recibe `mode: "faithful"`, pide al director un plan conservador, valida que todos los personajes sean de la premisa, persiste el modo y lo devuelve en el DTO. El camino feliz no añade ningún clic.

**Why priority**: el modo por defecto es el que usa la mayoría y el que debe conservar el comportamiento de 006.

**Independent Test**: `POST /api/story` con `mode: "faithful"` y un stub de DeepSeek que devuelve una biblia con `source: "premise"` responde 201; `GET /api/story/{id}` devuelve `mode: "faithful"`; la fila de PostgreSQL tiene `mode = 'faithful'`.

**Acceptance Scenarios**:

1. **Given** el formulario de `/story` sin tocar el selector, **When** se renderiza, **Then** `Fiel a la premisa` está seleccionado y el modo no exige ninguna interacción adicional.
2. **Given** una premisa válida y `mode: "faithful"`, **When** se crea la historia, **Then** la petición a DeepSeek usa el prompt de sistema `faithful`, `temperature: 0.4` y el esquema con `source`.
3. **Given** un plan `faithful` válido, **When** se persiste, **Then** `Story.mode = 'faithful'` y `planJson.storyBible.characters[*].source = 'premise'`.
4. **Given** una historia `faithful` creada por 007, **When** se consulta `GET /api/story/{id}`, **Then** `mode` está presente y vale `"faithful"`.
5. **Given** una historia existente de 006, **When** se lee tras la migración, **Then** `mode` vale `"faithful"` y su biblia sigue siendo válida con `source` normalizado a `"premise"`.

---

### User Story 2 - Crear una historia creativa con personajes secundarios inventados (Priority: P1)

La persona elige `Modo creativo` (un clic). El director puede inventar hasta dos personajes secundarios, declararlos en la Story Bible con `source: "invented"` y usarlos en al menos una escena manteniendo nombre, descripción y vestuario. El protagonista, el tema y el conflicto principal siguen saliendo de la premisa.

**Why priority**: es el valor nuevo de la feature. Sin personajes inventados declarados y validados, `creative` sería solo un cambio de tono.

**Independent Test**: `POST /api/story` con `mode: "creative"` y un stub que devuelve un plan con `bart` (`premise`) y `milo` (`invented`) responde 201; `GET` devuelve ambos con su `source`; los prompts de keyframe de las escenas donde aparece `milo` incluyen su nombre y vestuario.

**Acceptance Scenarios**:

1. **Given** el selector en `/story`, **When** se elige `Modo creativo`, **Then** el modo cambia con **un** clic y aparece el aviso de que pueden añadirse personajes secundarios.
2. **Given** `mode: "creative"` y un plan con 1 personaje `premise` y 2 `invented` (3 en total), **When** se valida, **Then** el plan es válido.
3. **Given** `mode: "creative"` y un plan con 3 personajes `invented`, **When** se valida, **Then** el plan es inválido por exceso de inventados y se consume el único reintento de reparación.
4. **Given** `mode: "creative"` y un plan cuyo `leadCharacterId` apunta a un personaje `invented`, **When** se valida, **Then** el plan es inválido.
5. **Given** `mode: "creative"` y un personaje `invented` que no aparece en ningún beat, **When** se valida, **Then** el plan es inválido (personaje fantasma).
6. **Given** `mode: "creative"` y un plan válido con un personaje inventado, **When** se componen los prompts de la escena donde aparece, **Then** el bloque global incluye su nombre, descripción y vestuario **igual que a los demás**, sin etiquetarlo como «inventado» ni como opcional.
7. **Given** `mode: "creative"`, **When** se inspecciona el negativo derivado, **Then** no contiene el id ni el nombre de ningún personaje de la biblia y sí mantiene la base de personajes ajenos a la biblia.

---

### User Story 3 - El modo fiel rechaza la invención de personajes (Priority: P1)

En `faithful` el director no puede inventar personajes. Si el modelo devuelve un personaje con `source: "invented"` o lo omite, el plan es inválido, se hace **una** reparación y, si vuelve a fallar, la creación termina con 502 `director-invalid-output` sin crear la historia.

**Why priority**: sin esta barrera, `faithful` sería una etiqueta sin contrato y el modo no sería verificable.

**Independent Test**: Con un stub que devuelve un plan `faithful` con un personaje `invented`, `POST /api/story` responde 502, hay exactamente 2 peticiones a DeepSeek y no se crea ninguna fila.

**Acceptance Scenarios**:

1. **Given** `mode: "faithful"` y un plan con `source: "invented"`, **When** se valida, **Then** el motivo es `storyBible.characters: personaje inventado en modo fiel` y no contiene el nombre del personaje.
2. **Given** `mode: "faithful"` y un personaje sin `source`, **When** se valida en creación, **Then** el plan es inválido (`source ausente`).
3. **Given** un plan inválido en el primer intento, **When** el director repara, **Then** se hace exactamente una segunda petición con el esquema y el motivo; nunca una tercera.
4. **Given** un segundo intento también inválido, **When** termina la creación, **Then** la respuesta es 502 `director-invalid-output` y no existe historia huérfana.

---

### User Story 4 - La revisión muestra el modo y distingue los personajes inventados (Priority: P2)

Antes de aprobar las imágenes, la persona ve el modo con el que creó la historia. Si eligió `creative` y hay personajes inventados, la biblia los identifica con una etiqueta textual, no solo con color. La persona puede decidir si esa invención le sirve.

**Why priority**: el modo es un contrato de producto; si no es visible, el usuario no puede evaluar si el resultado cumple lo que pidió.

**Independent Test**: Con una historia `creative` con `milo` (`invented`), la revisión muestra el badge `Modo creativo` y, en el bloque de personajes, `Milo · {vestuario}` seguido de `Personaje inventado`.

**Acceptance Scenarios**:

1. **Given** una historia `faithful`, **When** se abre la revisión, **Then** se muestra `Fiel a la premisa` y ningún personaje lleva la etiqueta `Personaje inventado`.
2. **Given** una historia `creative` con `milo` inventado, **When** se despliega la biblia, **Then** `Milo` aparece con `Personaje inventado`.
3. **Given** una historia legacy sin `storyBible`, **When** se abre la revisión, **Then** el bloque de la biblia no se renderiza, pero el modo `Fiel a la premisa` sigue siendo visible.
4. **Given** que la persona no despliega la biblia, **When** recorre el camino feliz, **Then** el número de clics no cambia.

---

### User Story 5 - El QC acepta los personajes inventados como canon (Priority: P1)

En `creative`, un personaje inventado que aparece con su vestuario en la escena prevista **no** es un extra. El prompt de QC recibe una línea de reparto canónico y el comparador lo compara contra la biblia, no solo contra el protagonista. Los estados, umbrales y la recuperación de QC no cambian.

**Why priority**: si el QC tratara a los personajes inventados como extras, el modo creativo quedaría bloqueado por falsos positivos y la feature sería inutilizable.

**Independent Test**: Con un `QCSceneExpectation` que incluye `milo`, una observación que devuelve `characters: ["bart", "milo"]` y `unknownCharacters: false` no produce `extra-character`; con `characters: ["bart", "milo", "nelson"]` produce `extra-character`.

**Acceptance Scenarios**:

1. **Given** una biblia `creative` con `bart` (`premise`) y `milo` (`invented`), **When** se compone el prompt de QC, **Then** incluye `REPARTO CANÓNICO: 1 personaje de la premisa y 1 inventado.` y la frase de que los inventados no son extras.
2. **Given** un beat que espera `["bart", "milo"]`, **When** el evaluador observa ambos, **Then** no hay `missing-character` ni `extra-character`.
3. **Given** el mismo beat, **When** el evaluador marca `unknownCharacters: true`, **Then** se emite `extra-character` blocking como en 006.
4. **Given** `NUXT_STORY_QC_ENABLED=false`, **When** se ejecuta el QC de una historia `creative`, **Then** el comportamiento es exactamente el de 006: solo verificación técnica, `evaluator: 'none'`, `UNAVAILABLE`.

---

### User Story 6 - Idempotencia, migración y convivencia con 004/005/006 (Priority: P1)

El modo forma parte del body canónico y de la fila. La misma `Idempotency-Key` con distinto modo es un conflicto; con el mismo modo es una repetición. La migración añade el enum y la columna con backfill `faithful` sin romper filas. Los 613 tests de 004 siguen intactos y los de 005/006 solo se actualizan donde la tabla de enmienda cambia un contrato.

**Why priority**: la suite es la red de seguridad; una feature nueva no puede reescribir las anteriores.

**Independent Test**: `npm run db:generate && npm run test:run && npm run build` en verde; `git diff` no toca ningún test de 004; las filas existentes leen `mode = 'faithful'`.

**Acceptance Scenarios**:

1. **Given** una base con historias de 006, **When** se aplica la migración, **Then** todas tienen `mode = 'faithful'` y `qcJson`/`qcCheckedAt`/plan no cambian.
2. **Given** la misma `Idempotency-Key` y el mismo body con `mode: "faithful"`, **When** se repite, **Then** 200 con el mismo `id` y sin segunda llamada a DeepSeek.
3. **Given** la misma `Idempotency-Key`, **When** la segunda petición cambia solo `mode`, **Then** 409 `idempotency-conflict`.
4. **Given** un `POST /api/story` sin `mode`, **When** se valida, **Then** 400 `invalid-mode` y no se crea historia.
5. **Given** la suite completa, **When** se ejecuta, **Then** los 613 tests de 004 pasan sin modificaciones.
6. **Given** `server/story/**` y `app/**`, **When** se inspeccionan, **Then** `server/story/**` no importa `server/composer/**` ni UI, y `app/**` no importa `server/**`, Prisma ni `node:crypto`.

---

### User Story 7 - El modo no relaja la continuidad de 006 (Priority: P1)

`creative` permite inventar personajes y giros, pero mantiene todas las invariantes de 006: 4–6 escenas, 5 por defecto, 6 s, 9:16, un `climax`, `transition: 'cut'`, hora y clima constantes, prop característico en todas las escenas, `forbidden` coherente, bloque global ≤ 2 600 caracteres y prompt de vídeo ≤ 2 000.

**Why priority**: el riesgo principal de `creative` es convertir la libertad narrativa en drift visual. La spec debe demostrar que no lo hace.

**Independent Test**: Con un plan `creative` que cambia el clima en la escena 3 o duplica el `climax`, la validación falla con el mismo motivo estable que en 006.

**Acceptance Scenarios**:

1. **Given** un plan `creative` con `weather` distinto por beat, **When** se valida, **Then** es inválido: la biblia no admite clima por beat.
2. **Given** un plan `creative` con dos `climax`, **When** se valida, **Then** es inválido.
3. **Given** un plan `creative` con un personaje inventado que aparece en la escena 2 pero no en el beat 2, **When** se valida, **Then** es inválido (personaje fantasma).
4. **Given** un plan `creative` con `forbidden` que incluye el nombre de `milo`, **When** se valida, **Then** es inválido: el negativo no puede contradecir la biblia.
5. **Given** un plan `creative` cuyo bloque global supera 2 600 caracteres, **When** se valida, **Then** es inválido y consume la reparación única.

### Edge Cases

- **`mode` ausente en `POST`**: 400 `invalid-mode`. No se aplica ningún default en el transporte.
- **`mode: null` o `mode: ""`**: 400 `invalid-mode`.
- **`mode: "Creative"` o `"faithful "`**: 400 `invalid-mode`; el valor es case-sensitive y no se recorta.
- **`mode` con un campo extra en el body**: 400 `invalid-request` (campos desconocidos), no `invalid-mode`.
- **`source` ausente en creación**: plan inválido, reparación única, 502 si persiste.
- **`source` ausente en fila persistida antes de 007**: se normaliza a `'premise'`; no se reconstruye el plan.
- **`source: "premise"` en un personaje que no se menciona en la premisa**: válido estructuralmente. La verificación semántica contra el texto no forma parte de 007 (FR-320).
- **`faithful` con 3 personajes `premise`**: válido (límite de 006).
- **`creative` con 3 `premise` y 0 `invented`**: válido; el director no está obligado a inventar.
- **`creative` con 2 `premise` y 1 `invented`**: válido.
- **`creative` con 1 `premise` y 2 `invented`**: válido.
- **`creative` con 0 `premise`**: inválido; el protagonista debe ser de la premisa.
- **`creative` con 3 `invented`**: inválido por límite de inventados, aunque el total sea 3.
- **`creative` con un personaje inventado sin vestuario**: inválido (10–120, como en 006).
- **Personaje inventado que solo aparece en el beat 1 como cameo**: inválido si no vuelve a aparecer y no tiene función; el prompt lo prohíbe y el QC puede marcarlo como `continuity-break` si desaparece. La validación estructural solo exige ≥ 1 escena.
- **`forbidden` con el nombre de un personaje inventado**: inválido (contradice la biblia).
- **Fila `creative` leída sin pasar el modo al validador**: el plan se reconstruiría y se perdería la biblia; cubierto por un test de regresión (FR-330).
- **Migración sobre una tabla con 0 filas**: `mode` se crea con default; no hay backfill que ejecutar.
- **Rollback tras crear historias `creative`**: `DROP COLUMN` perdería el modo; el rollback es solo de código.
- **Historia `creative` con QC desactivado**: manual, como en 006; no se inventa un PASS.
- **Dos historias con la misma premisa, una `faithful` y otra `creative`**: son peticiones distintas; la deduplicación automática no las colapsa.
- **`POST` con la misma `Idempotency-Key`, mismo modo y `referenceUrl` distinto**: 409 (comportamiento de 005).
- **Un cliente antiguo envía el body de 006 sin `mode`**: 400 `invalid-mode`; la UI nueva siempre lo envía.
- **Un plan `creative` con un personaje inventado y una referencia de imagen**: válido; la consistencia visual se mide en M2 y se revisa en QC.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Alcance, contratos y no regresión

- **FR-301**: 007 MUST NOT modificar `/composer`, `app/pages/composer.vue`, `app/components/composer/**`, `app/composables/useComposer*.ts`, `app/models/composer.ts`, `server/composer/**` ni `server/api/composer/**`. Los 613 tests de 004 MUST permanecer sin cambios y en verde.
- **FR-302**: 007 MUST NOT añadir ni cambiar estados de `StoryStatus`, estados de `SceneStatus`, transiciones, rutas de comando, códigos de QC, umbrales de QC, fórmula de coste, cap de 8 USD, presupuesto diario, TTL, leases ni concurrencia.
- **FR-303**: Los modelos compartidos MUST seguir viviendo en `app/models/story.ts`, ser `readonly`, usar uniones discriminadas y no contener `any`, `unknown` público, `File`, `Blob`, `FileList` ni barrels. Ningún archivo de `app/` puede importar `server/`, `@prisma/client` ni `node:crypto`.
- **FR-304**: Los DTOs de DeepSeek, los tipos de Prisma, el enum de Prisma y las constantes de prompt MUST vivir solo en `server/` o en `prisma/`.
- **FR-305**: 007 MUST NOT añadir dependencias npm, proveedores, tablas, índices ni variables públicas. La estructura de producto de 005/006 se mantiene: 4–6 escenas, 5 por defecto, 6 s, 9:16, sin audio, sin texto quemado, cortes secos y sin transiciones.
- **FR-306**: 007 MUST NOT implementar el nivel 3 (biblia editable). MUST NOT existir ninguna ruta, formulario, PATCH o estado de UI para editar la biblia, el modo o los personajes.

#### Contrato y persistencia

- **FR-307**: MUST existir `export type StoryMode = 'faithful' | 'creative'` en `app/models/story.ts`, y `STORY_MODES: readonly StoryMode[]` en el servidor y en `app/data/story.ts`. No se acepta ningún otro valor.
- **FR-308**: `StoryCharacter` MUST añadir `readonly source: StoryCharacterSource`, con `export type StoryCharacterSource = 'premise' | 'invented'`. En el contrato normalizado `source` es **obligatorio**; la ausencia solo se tolera al leer planes persistidos antes de 007.
- **FR-309**: `Story` MUST añadir `readonly mode: StoryMode`. El DTO de `POST /api/story` y de `GET /api/story/[id]` MUST devolverlo.
- **FR-310**: `StoryCreateRequest` MUST añadir `readonly mode: StoryMode` **obligatorio**. Un body sin `mode`, con `null`, con cadena vacía, con tipo distinto de `string` o con un valor fuera de la unión MUST devolver 400 `invalid-mode` **antes** de llamar a DeepSeek y sin crear fila.
- **FR-311**: El modo MUST ser **inmutable** después de la creación. No existe `PATCH`, comando ni campo editable. `StoryPatch` MUST NOT ganar `mode`.
- **FR-312**: El modo MUST NOT formar parte de `StoryPlan` ni de `planJson`. La autoridad es `Story.mode`. Justificación: duplicarlo en el plan crearía dos fuentes de verdad y permitiría contradicciones en filas antiguas o reparadas. `planJson` solo persiste la biblia (con `source` por personaje) y los beats.
- **FR-313**: `CreateStoryRecord` MUST añadir `readonly mode: StoryMode`; `StoryRecord` MUST añadir `readonly mode: StoryMode`. `Scene` MUST NOT ganar columnas.
- **FR-314**: `canonicalStoryBody` MUST incluir `mode` en una posición fija (después de `preset` y antes de `referenceUrl`); el tipo interno `CreateStoryInput['request']` MUST incluir `mode`. `matchesRequest` MUST comparar también `mode`. La misma `Idempotency-Key` con distinto `mode` MUST devolver 409 `idempotency-conflict`; con el mismo body MUST ser una repetición idempotente sin segunda llamada a DeepSeek.
- **FR-315**: MUST NOT persistirse prompts, prompts de sistema, negativos, variables de entorno, `sessionId` en el DTO, `requestId` ni URLs internas. `source` sí se persiste dentro de `planJson` y sí es público en el DTO, porque la UI lo necesita.

#### Reglas por modo

- **FR-316**: En `faithful`, **todos** los personajes de la biblia MUST tener `source: 'premise'`. Un solo `source: 'invented'` MUST invalidar el plan con el motivo estable `storyBible.characters: personaje inventado en modo fiel`. El número de personajes MUST seguir siendo 1–3.
- **FR-317**: En `creative`, MUST haber 1–3 personajes; como máximo 2 con `source: 'invented'`; al menos uno con `source: 'premise'`; y el personaje de `leadCharacterId` MUST tener `source: 'premise'`. Los motivos estables son `storyBible.characters: demasiados personajes inventados` y `storyBible.characters: el protagonista debe ser de la premisa`.
- **FR-318**: Cada personaje de la biblia, incluido cada `invented`, MUST aparecer en al menos un beat. Se reutiliza la invariante de 006 (`beats: personaje de la biblia sin escena`). Ningún personaje puede ser un fantasma.
- **FR-319**: El modo MUST NOT relajar ninguna invariante de 006: `sceneCount` 4–6, exactamente un `climax` entre la primera y la última escena, `transition: 'cut'`, `camera` en la unión, `continuityFromPrevious` 20–200 y `null` en la primera, `visualPrompt` 20–600, `narration` 10–280, 1–3 props, `signaturePropId` presente en todos los beats cuando no es `null`, `forbidden` 1–10 sin contradecir a la biblia, y límites de longitud de bloque global y prompts.
- **FR-320**: El modo MUST NOT cambiar el tema, el protagonista ni el conflicto principal de la premisa. En `creative` el director MAY inventar puesta en escena, giros, eventos y personajes secundarios, y MAY inventar el desenlace **solo si la premisa no lo fija**. Esta regla es **normativa en el prompt y en el QC humano**; la validación automática solo puede comprobar estructura, no semántica. La spec no promete detección automática de drift temático (gate M1).

#### Director y prompts

- **FR-321**: MUST existir `server/story/story-mode.ts`, módulo **puro** (sin I/O, sin `fetch`, sin `process.env`, sin reloj, sin aleatoriedad) que exporte `STORY_MODES`, `isStoryMode(value): value is StoryMode`, `parseStoryMode(value): StoryMode` (usado solo en lectura persistida, con fallback `faithful`) y `maxInventedCharacters(mode): 0 | 2`.
- **FR-322**: `storyDirectorSystemPrompt(sceneCount, mode)` MUST aceptar el modo como parámetro **obligatorio**. `NativeStoryDirector.createPlan` MUST recibir `mode` en su input y pasarlo al prompt, a la temperatura y a la validación; `StoryServiceImpl.create` MUST pasar `input.request.mode`. `createBriefingDirector` MUST propagar `mode` sin modificarlo.
- **FR-323**: El prompt `faithful` MUST ser equivalente a 006: conserva todas sus instrucciones, incluida «no añadas personajes que no actúen en la premisa ni cameos», y añade: cada personaje MUST declarar `source: 'premise'`, la invención se limita a puesta en escena, cámara y detalles visuales que no contradicen la premisa, y `forbidden` MUST cubrir los personajes ajenos a la premisa.
- **FR-324**: El prompt `creative` MUST sustituir la prohibición de personajes por el bloque creativo normativo: `source` obligatorio por personaje, protagonista `premise`, hasta 2 inventados con el total ≤ 3, aparición de cada inventado en al menos una escena, conservación de nombre/descripción/vestuario, marco fijo (tema, protagonista, conflicto, localización, hora, clima, desenlace si la premisa lo fija), `forbidden` limitado a personajes ajenos a la biblia (nunca un personaje de la biblia) y la instrucción `Sorprende sin contradecir la premisa ni la biblia.`
- **FR-325**: `DIRECTOR_JSON_SCHEMA` MUST añadir `"source": "premise|invented"` dentro de cada personaje. MUST NOT añadirse ningún otro campo al esquema ni al JSON. El esquema sigue siendo único y no depende del modo; la restricción por modo vive en el prompt y en el validador.
- **FR-326**: La temperatura MUST ser `0.4` en `faithful` y `0.7` en `creative`. MUST seguir siendo una constante del servidor, MUST NOT aceptarse desde el cliente y MUST NOT añadirse `seed` ni ningún parámetro nuevo a DeepSeek.
- **FR-327**: Los presupuestos de tokens MUST NOT cambiar: `5 000` (4 escenas), `6 000` (5), `7 000` (6), tope `8 000`, reparación `min(8 000, base + 800)`. `DIRECTOR_MAX_TOKENS` MUST seguir siendo `6 000`. `creative` recibe una instrucción de concisión más estricta, no más presupuesto.
- **FR-328**: La reparación MUST seguir siendo **única** (máximo 2 peticiones). Un segundo fallo MUST producir 502 `director-invalid-output` sin crear historia. Los motivos de rechazo MUST ser estables y MUST NOT contener texto del plan, del prompt ni de la premisa.
- **FR-329**: `validateStoryBible(value, options)` MUST recibir `{ mode, allowPersistedLegacySource }`. `validateDirectorPlan(value, sceneCount, options)` MUST recibir `{ mode, allowLegacyBible }` y MUST mapear `allowLegacyBible: true` a `allowPersistedLegacySource: true`. En creación, `mode` es obligatorio y `source` es obligatorio. En lectura persistida, `allowLegacyBible: true` MUST aceptar una biblia sin `source` y normalizarlo a `'premise'`.
- **FR-330**: `prisma-story-repository.ts` MUST pasar el `mode` de la fila a `validateDirectorPlan` al leer el plan. Si no lo hiciera, una fila `creative` se validaría como `faithful`, se rechazaría y el plan se reconstruiría sin biblia. Este comportamiento MUST estar cubierto por un test.
- **FR-331**: El mensaje de usuario del director (`storyDirectorUserMessage`) MUST conservar su forma y su byte-identidad con el brief. El modo viaja únicamente en el prompt de sistema. La reparación conserva su firma actual y usa el esquema actualizado.

#### Prompt de generación, negativos y QC

- **FR-332**: `story-prompt-composer.ts` MUST conservar sus firmas públicas (`composeKeyframe`, `composeVideo`, `composeGlobalBlock`, `composeNegative`). La biblia con `source` es la autoridad; no se añade un parámetro `mode`.
- **FR-333**: Los prompts de keyframe y vídeo MUST tratar a los personajes `invented` **exactamente igual** que a los `premise`: nombre, descripción y vestuario en el bloque global, sin etiquetas de procedencia y sin marcas de opcionalidad. Justificación: `source` es metadato de producto, no una instrucción visual; etiquetarlo puede hacer que el modelo lo omita o lo trate como secundario decorativo.
- **FR-334**: El negativo derivado MUST NOT contener el `id` ni el `name` normalizado de **ningún** personaje de la biblia, sea `premise` o `invented`. Tampoco puede contener un prop de la biblia, la hora vigente ni el clima vigente. La base fija de 006 (`extra characters`, `characters not in the story bible`, props/vehículo incorrecto, ropa incorrecta, clima/hora incorrectos, texto, subtítulos, watermark, logo, baja calidad, artefactos) se mantiene.
- **FR-335**: El modo MUST NOT cambiar la salida de `composeNegative` para una misma biblia: la base fija y las reglas de contraste son las de 006. La diferencia efectiva vive en `storyBible.forbidden`, que el director redacta según el modo: en `faithful` cubre personajes ajenos a la premisa (que, al ser todos los de la biblia `premise`, coincide con «ajenos a la biblia»); en `creative` cubre personajes ajenos a la biblia y nunca un personaje de la biblia. Se documenta como decisión conservadora: un personaje mencionado en la premisa pero no declarado en la biblia también queda prohibido.
- **FR-336**: `qc-prompt.ts` MUST añadir, después del bloque global, una línea determinista `REPARTO CANÓNICO: {n} personaje(s) de la premisa y {m} inventado(s).` seguida de la frase de que los personajes inventados forman parte de la biblia, que si aparecen con su vestuario son correctos y que no son extras. La línea MUST derivarse solo de `bible.characters[*].source`; MUST NOT contener texto del usuario.
- **FR-337**: `qc-checker.ts` MUST NOT cambiar sus reglas ni sus códigos. Los personajes `invented` presentes en `expectation.characters` MUST considerarse previstos. Un personaje observado que no esté en `expectation.characters` MUST seguir produciendo `extra-character` blocking.
- **FR-338**: `QCSceneExpectation`, `StoryQCObserved`, el esquema del evaluador, los estados de QC, la agregación, el umbral, `qcEnabled` (por defecto `false`), los leases, la recuperación y los códigos `StoryQCErrorCode` MUST permanecer sin cambios.

#### API

- **FR-339**: `POST /api/story` MUST aceptar `mode` en el body JSON y MUST devolverlo en la respuesta 201/200. No se añaden endpoints.
- **FR-340**: MUST añadirse el código `invalid-mode` (HTTP 400, `retryable: false`, mensaje `El modo de la historia no es válido.`) a `StoryErrorCode` y a la tabla de errores. Es el único código nuevo de 007 y supersede FR-277 de 006 solo para este valor.
- **FR-341**: `GET /api/story/[id]` MUST devolver `mode` además del DTO actual. MUST NOT devolver prompts, negativos, `qcJson` crudo, `sessionId`, `leaseOwner`, `requestId` ni URLs internas. `mode` y `source` son públicos.
- **FR-342**: Todas las rutas MUST mantener las cabeceras comunes, el same-origin, el ownership por cookie `story_sid`, el 404 uniforme para historias ajenas, `Cache-Control: no-store` y los límites de body de 005/006.
- **FR-343**: MUST NOT existir ninguna ruta para cambiar el modo, editar la biblia, listar personajes o seleccionar personajes. La única escritura del modo es la creación.

#### UI/UX y accesibilidad

- **FR-344**: `/story` MUST mostrar un selector visible `Modo de la historia` con dos opciones: `Fiel a la premisa` y `Modo creativo`. El valor inicial MUST ser `faithful`. Elegir `creative` MUST costar exactamente **1 clic**; el camino por defecto MUST NOT añadir ningún clic.
- **FR-345**: El selector MUST ser un `fieldset` con `legend` y radios nativos dentro de un `role="radiogroup"`, reutilizando el patrón visual y de foco de `StoryPresetPicker`. Cada opción MUST tener un área interactiva de al menos 44 × 44 px, foco visible, `prefers-reduced-motion` respetado y contraste suficiente en forced-colors.
- **FR-346**: En `creative` MUST mostrarse un aviso textual de que pueden aparecer personajes que no están en la premisa. El aviso MUST estar asociado programáticamente al grupo mediante `aria-describedby`; MUST NOT ser solo color.
- **FR-347**: La revisión de imágenes (`StoryReview`) MUST mostrar el modo con un badge textual (`Fiel a la premisa` o `Modo creativo`). Si `story.plan.storyBible` contiene personajes `invented`, el bloque de personajes de `StoryBibleSummary` MUST identificarlos con la etiqueta textual `Personaje inventado`.
- **FR-348**: El modo MUST mostrarse aunque la historia sea legacy y no tenga `storyBible`; el modo viene de `story.mode`, no del plan. Si no hay biblia, el bloque de personajes no se renderiza y no se inventa contenido.
- **FR-349**: `Empezar de nuevo` MUST restaurar el modo a `faithful` junto con la premisa, el número de escenas, el preset y la referencia.
- **FR-350**: MUST NOT añadirse pantallas nuevas. La única superficie nueva es el selector en `/story` y el badge/etiqueta en `/story/[id]`. No hay edición de biblia, ni modal de personajes, ni vista de «reparto».
- **FR-351**: La UI MUST cumplir 320–1920 px sin scroll horizontal, zoom 200 %/400 %, `role="status"` para estados existentes, `role="alert"` para errores, foco visible y navegación por teclado con las flechas nativas del radiogroup.

#### Testing y documentación

- **FR-352**: Cada archivo runtime nuevo MUST tener cobertura automatizada directa o por integración, excepto los modelos type-only. Los tests MUST usar stubs y fakes; MUST NOT llamarse a DeepSeek, Fal ni FFmpeg reales en CI.
- **FR-353**: Los tests de 004 MUST NOT modificarse. Los tests de 005/006 MUST actualizarse **solo** donde la tabla de enmienda cambia un contrato; MUST documentarse archivo por archivo en el PR.
- **FR-354**: MUST existir fixtures nuevas: `tests/fixtures/deepseek/deepseek-plan-creative-2-invented.json`, `deepseek-plan-faithful-invented.json`, `deepseek-plan-creative-3-invented.json` y `tests/fixtures/story/story-bible-006-no-source.json`. Las fixtures de Fal y QC de 004/006 se reutilizan.
- **FR-355**: MUST existir smokes opt-in: `RUN_STORY_MODE_SMOKE=1` (una creación real `creative` con DeepSeek, presupuesto máximo 0,10 USD, sin Fal) y `RUN_DB_SMOKE=1` ampliado (crear `faithful` y `creative`, leer ambas, verificar el backfill y borrar). Todos saltados por defecto y nunca ejecutados en CI.
- **FR-356**: README MUST documentar `StoryMode`, `Story.mode`, `StoryCharacter.source`, los dos modos, el default de producto y la migración. `.env.example` MUST NOT cambiar salvo que se añada una variable (007 no añade ninguna).

### Data Contract

El contrato es normativo. Los tipos compartidos viven en `app/models/story.ts`; los tipos de Prisma, DeepSeek y del director viven solo en `server/`. No se crea ningún barrel.

```ts
// app/models/story.ts — ampliación de 007.
export type StoryMode = 'faithful' | 'creative'

export type StoryCharacterSource = 'premise' | 'invented'

export type StoryStatus = // …sin cambios (006)…

export interface StoryCharacter {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly wardrobe: string
  /**
   * Procedencia declarada por el director.
   * El JSON persistido antes de 007 no la contiene; al leerlo se normaliza a
   * 'premise'. En creación es obligatoria.
   */
  readonly source: StoryCharacterSource
}

export interface StoryBible {
  // …sin cambios; characters usa el nuevo StoryCharacter…
}

export interface Story {
  // …campos de 006 sin cambios…
  readonly mode: StoryMode
}

export interface StoryCreateRequest {
  readonly premise: string
  readonly sceneCount: StorySceneCount
  readonly preset: StoryPreset
  /** Obligatorio. Sin default en el transporte. */
  readonly mode: StoryMode
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
}
```

```ts
// server/story/story-mode.ts — SOLO servidor. Módulo puro.
import type { StoryMode } from '~/models/story'

export const STORY_MODES: readonly StoryMode[] = ['faithful', 'creative']

export function isStoryMode(value: unknown): value is StoryMode
export function parseStoryMode(value: unknown): StoryMode // lectura persistida; fallback 'faithful'
export function maxInventedCharacters(mode: StoryMode): 0 | 2
```

```ts
// server/story/director-types.ts — ampliación.
export interface StoryDirector {
  createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly mode: StoryMode
    readonly context?: DirectorContext
  }): Promise<DirectorPlan>
}
```

```ts
// server/story/bible-validator.ts — ampliación de firmas.
export interface BibleValidationOptions {
  readonly mode: StoryMode
  /** Solo en lectura de filas persistidas antes de 007. */
  readonly allowPersistedLegacySource?: boolean
}

export function validateStoryBible(
  value: unknown,
  options: BibleValidationOptions,
): BibleValidation

export interface ValidateDirectorPlanOptions {
  readonly mode: StoryMode
  /** Ya existente en 006; ahora también tolera personajes sin `source`. */
  readonly allowLegacyBible?: boolean
}

export function validateDirectorPlan(
  value: unknown,
  sceneCount: number,
  options: ValidateDirectorPlanOptions,
): DirectorPlanValidation
```

```ts
// server/story/repository.ts — ampliación.
export interface StoryRecord {
  // …campos de 006…
  readonly mode: StoryMode
}

export interface CreateStoryRecord {
  // …campos de 006…
  readonly mode: StoryMode
}

// StoryPatch NO gana `mode`: el modo es inmutable.
```

```ts
// server/story/qc-prompt.ts — línea determinista (sin cambiar el esquema).
export function renderCanonicalCast(bible: StoryBible): string
// "REPARTO CANÓNICO: 1 personaje de la premisa y 1 inventado. "
// + "Los personajes inventados forman parte de la biblia: si aparecen con su "
// + "vestuario, son correctos y no son extras. "
```

**Persistido, derivado y UI (no confundir)**:

| Capa | Campos |
|------|--------|
| **Persistido en PostgreSQL** | `Story.mode` (enum `StoryMode`), `planJson.storyBible.characters[*].source`, y todo lo de 005/006. No se persiste ningún prompt, negativo ni etiqueta de UI. |
| **Derivado en el servidor** | `source` normalizado a `'premise'` al leer filas sin él; `REPARTO CANÓNICO` contado desde `source`; `mode` del DTO tomado de la fila; temperatura y prompt de sistema elegidos por modo. |
| **Solo UI** | Modo seleccionado en el borrador, badge del modo, etiqueta `Personaje inventado`, foco, `aria-describedby`, copy. |
| **Nunca compartido** | `sessionId`, `leaseOwner`, `requestId`, prompts de sistema, prompts compuestos, negativos, `qcJson` crudo, clave de DeepSeek, `DATABASE_URL`. |

**Invariantes**:

- `Story.mode` MUST ser `'faithful'` o `'creative'`; no existe `null` ni cadena vacía persistida.
- `Story.plan.storyBible.characters[*].source` MUST existir en el contrato normalizado.
- `mode === 'faithful'` ⇒ todos los personajes tienen `source === 'premise'`.
- `mode === 'creative'` ⇒ `characters.length` 1–3, `invented ≤ 2`, al menos un `premise` y el `leadCharacterId` con `source === 'premise'`.
- `plan.beats.length === sceneCount` y cada personaje de la biblia aparece en ≥ 1 beat, incluidos los inventados.
- `Story.mode` MUST NOT aparecer en `StoryPlan` ni en `planJson`.
- Un plan persistido no puede reconstruirse por un desacuerdo de modo: la lectura usa el `mode` de la fila.
- `app/models/story.ts` MUST NOT contener `File`, `Blob`, `FileList`, `any` ni `unknown` público.

## API Contract

Se mantienen las cabeceras comunes, el same-origin, el ownership por cookie `story_sid` y `Cache-Control: no-store` de 005/006. 007 **no añade rutas**.

### POST `/api/story` — ampliación

**Request**:

```json
{
  "premise": "Una repostera descubre que sus postres pueden predecir el futuro.",
  "sceneCount": 5,
  "preset": "fast",
  "mode": "creative",
  "referenceUrl": null,
  "referenceExpiresAt": null
}
```

**Validación de `mode`**:

| Caso | Resultado |
|---|---|
| `"faithful"` o `"creative"` | Válido. |
| Ausente | 400 `invalid-mode`. |
| `null`, `""`, `123`, `"Creative"`, `"faithful "` | 400 `invalid-mode`. |
| Campo desconocido en el body | 400 `invalid-request` (se evalúa antes que el modo). |

**Response 201** (extracto; el resto del DTO es el de 006):

```json
{
  "id": "clx0story0001",
  "status": "GENERATING_KEYFRAMES",
  "premise": "Una repostera descubre que sus postres pueden predecir el futuro.",
  "mode": "creative",
  "preset": "fast",
  "sceneCount": 5,
  "plan": {
    "title": "Postres que predicen",
    "logline": "…",
    "storyBible": {
      "characters": [
        { "id": "lucia", "name": "Lucía", "description": "…", "wardrobe": "…", "source": "premise" },
        { "id": "milo", "name": "Milo", "description": "…", "wardrobe": "…", "source": "invented" }
      ]
    }
  }
}
```

**Idempotencia**:

| Primera petición | Segunda con la misma `Idempotency-Key` | Resultado |
|---|---|---|
| `faithful`, body B | `faithful`, body B | 200, mismo `id`, sin DeepSeek |
| `creative`, body B | `creative`, body B | 200, mismo `id`, sin DeepSeek |
| `faithful`, body B | `creative`, body B | 409 `idempotency-conflict` |
| `creative`, body B | `faithful`, body B | 409 `idempotency-conflict` |
| cualquiera | mismo `mode`, otra premisa o preset | 409 `idempotency-conflict` |
| — | sin `mode` | 400 `invalid-mode`; no consume clave ni crea fila |

### GET `/api/story/{id}` — ampliación

`mode` se añade al DTO. Extracto:

```json
{
  "id": "clx0story0001",
  "status": "WAITING_APPROVAL",
  "mode": "creative",
  "plan": {
    "storyBible": {
      "characters": [
        { "id": "lucia", "name": "Lucía", "description": "…", "wardrobe": "…", "source": "premise" },
        { "id": "milo", "name": "Milo", "description": "…", "wardrobe": "…", "source": "invented" }
      ]
    }
  }
}
```

Sin cambios en el resto: `qc`, escenas, `pollAfterMs`, `version`, errores y ownership.

### Tabla de errores (adiciones)

| HTTP | Código | Retryable | Mensaje normativo |
|------|--------|-----------|-------------------|
| 400 | `invalid-mode` | false | `El modo de la historia no es válido.` |
| 409 | `idempotency-conflict` | false | `La solicitud entra en conflicto con otra anterior.` (sin cambios) |

No se añade ningún otro código ni ningún estado HTTP nuevo. `invalid-mode` supersede FR-277 de 006 **solo** para este valor.

## Prisma / Data Model

### Cambios (007)

```prisma
enum StoryMode {
  faithful
  creative
}

model Story {
  // …campos de 006 sin cambios…
  mode StoryMode @default(faithful)
}
```

Decisiones:

- **Enum nativo, no `String`**: el valor solo puede ser uno de los dos y la base lo garantiza. `preset` sigue siendo `String` por compatibilidad histórica; 007 no lo migra.
- **Valores en minúsculas**: coinciden byte a byte con la unión de TypeScript (`'faithful' | 'creative'`), sin tabla de traducción.
- **`@default(faithful)`**: es un mecanismo de **backfill** para filas existentes y de seguridad ante inserciones manuales. La API **no** usa el default: exige `mode` explícito en cada creación. Esta distinción es deliberada.

### Migración

```bash
npx prisma validate
npx prisma migrate dev --name story_mode    # local
npm run db:generate
npm run test:run
npm run build
npm run db:deploy                           # producción (DIRECT_URL)
```

SQL esperado:

```sql
CREATE TYPE "StoryMode" AS ENUM ('faithful', 'creative');
ALTER TABLE "Story" ADD COLUMN "mode" "StoryMode" NOT NULL DEFAULT 'faithful';
```

Reglas:

- No hay `UPDATE` de backfill: en PostgreSQL 11+ `ADD COLUMN ... DEFAULT` rellena las filas existentes y no reescribe la tabla.
- No se añaden columnas a `Scene`, ni tablas, ni índices. Los índices de 005/006 cubren las consultas.
- `Story.mode` es `NOT NULL`. No se acepta `NULL` ni cadena vacía.
- Rollback: solo de código. `DROP COLUMN "mode"` perdería el modo de las historias `creative` creadas después; en producción se conserva la columna y el enum. En local se puede recrear la base.
- Las filas creadas antes de 007 quedan en `faithful` y se leen como legacy: su biblia no tiene `source` y se normaliza a `'premise'`.

### Repositorio

- `StoryRecord` gana `mode: StoryMode`.
- `CreateStoryRecord` gana `mode: StoryMode` y `createStory` lo escribe.
- `StoryPatch` **no** gana `mode`.
- `mapStory` usa `parseStoryMode(row.mode)` (defensivo: cualquier valor inesperado cae a `'faithful'`) y pasa el modo a `parsePlan`.
- `parsePlan` llama a `validateDirectorPlan(value, sceneCount, { mode: parseStoryMode(story.mode), allowLegacyBible: true })`.
- El enum de Prisma se importa con alias (`StoryMode as PrismaStoryMode`) para no colisionar con el modelo compartido `StoryMode`.

## Server Architecture / SOLID

### Estructura normativa (nuevos y modificados)

| Archivo | Responsabilidad |
|---------|-----------------|
| `server/story/story-mode.ts` | **Nuevo.** Módulo puro: unión, allowlist, parseo persistido y límite de inventados. |
| `server/story/director-prompt.ts` | **Modificado.** `storyDirectorSystemPrompt(sceneCount, mode)` con bloques `faithful`/`creative`; esquema con `source`. |
| `server/story/director.ts` | **Modificado.** `createPlan` recibe `mode`; temperatura por modo; validación con modo. |
| `server/story/director-types.ts` | **Modificado.** `mode` en el input de `StoryDirector`. |
| `server/story/briefing-director.ts` | **Modificado.** Propaga `mode` sin transformarlo. |
| `server/story/bible-validator.ts` | **Modificado.** `source` en `BIBLE_CHARACTER_KEYS`; invariantes por modo; tolerancia legacy. |
| `server/story/plan-validator.ts` | **Modificado.** `mode` en opciones y delegación. |
| `server/story/validation.ts` | **Modificado.** `validateStoryMode`; `mode` en `CREATE_FIELDS` y en `validateCreateRequest`. |
| `server/story/story-service.ts` | **Modificado.** `canonicalStoryBody` y `matchesRequest` con modo; `persistStory` escribe `mode`; `toStoryDto` devuelve `mode`. |
| `server/story/repository.ts` | **Modificado.** `mode` en `StoryRecord` y `CreateStoryRecord`. |
| `server/story/prisma-story-repository.ts` | **Modificado.** Mapeo de `mode`; `parsePlan` con el modo de la fila. |
| `server/story/qc-prompt.ts` | **Modificado.** Línea `REPARTO CANÓNICO`; esquema sin cambios. |
| `server/story/qc-checker.ts` | **Sin cambios de lógica.** Se cubre con tests la aceptación de `invented`. |
| `server/api/story/index.post.ts` | **Sin cambios estructurales.** El modo viaja por `validateCreateRequest` y `StoryCreateRequest`. |
| `server/api/story/[id].get.ts` | **Sin cambios estructurales.** El DTO ya incluye `mode`. |
| `prisma/schema.prisma` + `prisma/migrations/<timestamp>_story_mode/` | **Nuevo.** Enum, columna y migración. |
| `app/models/story.ts` | **Modificado.** `StoryMode`, `StoryCharacterSource`, `StoryCharacter.source`, `Story.mode`, `StoryCreateRequest.mode`. |
| `app/data/story.ts` | **Modificado.** `STORY_DEFAULT_MODE`, `STORY_MODES` (label/description), `STORY_MODE_LABELS`, `STORY_INVENTED_CHARACTER_LABEL`, copy. |
| `app/utils/story.ts` | **Modificado.** Helper de etiqueta de modo y de personaje inventado. |
| `app/components/story/StoryModePicker.vue` | **Nuevo.** Selector accesible con aviso creativo. |
| `app/components/story/StoryCreateForm.vue` | **Modificado.** Slot `mode` entre la premisa y las escenas. |
| `app/pages/story/index.vue` | **Modificado.** Estado `mode`, envío y reset. |
| `app/components/story/StoryReview.vue` | **Modificado.** Badge del modo. |
| `app/components/story/StoryBibleSummary.vue` | **Modificado.** Etiqueta `Personaje inventado`. |
| `app/composables/useStory.ts` / `useStoryApi.ts` | **Sin cambios de flujo.** El tipo de request ya transporta `mode`. |
| `tests/**`, `README.md` | **Nuevos y actualizados** según el Test Plan. |

Reglas:

- `server/api/story/**` MUST seguir siendo fino: parsear, validar, autorizar, delegar y serializar. Sin lógica de proveedor, Prisma ni FFmpeg.
- `server/story/story-mode.ts` MUST ser puro y testeable sin mocks.
- `server/story/**` MUST NOT importar `server/composer/**`, `app/components/**`, `app/composables/**`, `app/pages/**` ni `app/utils/**`.
- `app/**` MUST NOT importar `server/**`, `@prisma/client` ni `node:crypto`.
- Sin `any`. `unknown` solo en la frontera del proveedor y del JSON no confiable, estrechado con type guards.

### Plantillas normativas de prompt

El prompt de sistema conserva todo el contenido de 006 y sustituye únicamente el bloque de reparto y añade el bloque de modo.

```text
CAST_BLOCK('faithful') =
  "Cada personaje de la storyBible debe existir en la premisa y declarar \"source\": \"premise\". "
  + "No inventes personajes secundarios, extras con nombre ni cameos. "
  + "La invención se limita a la puesta en escena, la cámara y los detalles visuales que no contradicen la premisa. "
  + "En forbidden incluye los personajes ajenos a la premisa, pero nunca un personaje de la storyBible. "
  + "Cada personaje de la storyBible debe aparecer al menos en una escena. "
```

```text
CAST_BLOCK('creative') =
  "Cada personaje de la storyBible debe declarar \"source\": \"premise\" si aparece en la premisa o \"invented\" si lo has inventado. "
  + "El protagonista (leadCharacterId) debe tener \"source\": \"premise\". "
  + "Puedes inventar hasta 2 personajes secundarios que sirvan a la premisa; el total de personajes no puede superar 3. "
  + "Los personajes inventados deben aparecer al menos en una escena y mantener nombre, descripción y vestuario en toda la historia. "
  + "Ningún personaje puede ser un cameo decorativo: todos deben tener una función narrativa. "
  + "Puedes inventar puesta en escena, giros y eventos, pero no cambies el tema, el protagonista ni el conflicto principal de la premisa. "
  + "Si la premisa fija el desenlace, respétalo; si no lo fija, puedes inventarlo. "
  + "La localización, la hora y el clima se eligen una vez y no cambian en ninguna escena. "
  + "En forbidden incluye los personajes ajenos a la storyBible, pero nunca un personaje de la biblia. "
  + "Sorprende sin contradecir la premisa ni la biblia. "
```

```text
DIRECTOR_JSON_SCHEMA (fragmento de characters) =
  "characters": [
    {
      "id": "minúsculas, empieza por letra, 2-24: ^[a-z][a-z0-9-]{1,23}$",
      "name": "string (1-40)",
      "description": "string (20-160)",
      "wardrobe": "string (10-120)",
      "source": "premise|invented"
    }
  ]
```

Reglas:

- El prompt `faithful` MUST contener todas las frases normativas de 006 (roles, props, `forbidden`, continuidad, concisión, idioma, límites) y los bloques de arriba. No se elimina ninguna instrucción de 006.
- El prompt `creative` MUST conservar las mismas frases salvo la prohibición de personajes ajenos a la premisa, que se sustituye por `CAST_BLOCK('creative')`.
- El esquema es único y no depende del modo. La restricción `faithful` se expresa en el prompt y en el validador.
- El mensaje de usuario y el brief MUST permanecer byte-idénticos; el modo no se interpola en la premisa.
- La temperatura MUST ser `0.4` (`faithful`) y `0.7` (`creative`). Sin `seed`.
- Los presupuestos de tokens no cambian (FR-327).

## State Machine

007 **no añade ni cambia estados ni transiciones**. El modo es un atributo inmutable de la historia y no participa en la máquina de estados.

| Aspecto | Decisión |
|---|---|
| Estados | Los 11 de 006, sin cambios. |
| Transiciones | Las de 005/006, sin cambios. |
| `QC` / `WAITING_QC` | Sin cambios. `qcEnabled` sigue por defecto `false`. |
| Comandos | `approve`, `retry`, `recover`, `qc/retry`, `qc/approve`, `assemble`, `cancel` no leen ni escriben `mode`. |
| Recuperación | Sin cambios: reintentos, override, cancelación y expiración funcionan igual en ambos modos. |
| Inmutabilidad | `mode` no cambia nunca después de la creación; ninguna transición lo modifica. |

Invariantes de estado respecto al modo:

- Un cambio de estado MUST NOT alterar `mode` ni `source`.
- Un `recover`/`retry` MUST conservar el modo y la biblia; el nuevo keyframe usa el mismo compositor y la misma biblia.
- Una historia `creative` en `WAITING_QC` ofrece exactamente las mismas acciones que una `faithful`.

## UI/UX Contract

### Estructura de pantalla (adiciones)

```text
/story
  form:
    h2: Tu historia
    label + textarea: Premisa
    fieldset[story-mode-group]: Modo de la historia
      legend: Modo de la historia
      radio[story-mode-faithful]: Fiel a la premisa
        descripción: Solo aparecen los personajes y elementos de tu premisa.
      radio[story-mode-creative]: Modo creativo
        descripción: El director puede añadir personajes secundarios y giros que sirvan a tu premisa.
      p[story-mode-help]: ayuda del modo seleccionado
      p[story-mode-creative-notice] (solo creativo):
        En modo creativo pueden aparecer personajes que no están en tu premisa.
    fieldset: Escenas
    fieldset: Calidad de vídeo
    Imagen de referencia (opcional)
    privacidad
    Crear historia

/story/[id]
  [review]
    h2: Revisa las imágenes
    p[story-review-mode]: badge Fiel a la premisa | Modo creativo
    details[story-bible] (sin cambios)
      Personajes:
        Lucía · {vestuario}
        Milo · {vestuario} [Personaje inventado]
```

### Copy Deck (adiciones normativas)

Los textos MUST aparecer exactamente como se escriben.

| Slot | Texto exacto |
|------|--------------|
| Leyenda del selector | `Modo de la historia` |
| Opción fiel | `Fiel a la premisa` |
| Descripción fiel | `Solo aparecen los personajes y elementos de tu premisa.` |
| Opción creativa | `Modo creativo` |
| Descripción creativa | `El director puede añadir personajes secundarios y giros que sirvan a tu premisa.` |
| Ayuda fiel | `El guion se ciñe a lo que escribiste.` |
| Ayuda creativa | `Puede añadir hasta 2 personajes secundarios. El protagonista, el tema y el conflicto salen de tu premisa.` |
| Aviso creativo | `En modo creativo pueden aparecer personajes que no están en tu premisa.` |
| Badge fiel | `Fiel a la premisa` |
| Badge creativo | `Modo creativo` |
| Marcador de personaje inventado | `Personaje inventado` |
| Error de modo | `El modo de la historia no es válido.` |

**Sin cambios**: el aviso de privacidad de 006 se mantiene literal. No se promete ningún resultado creativo ni viralidad. No se añade copy que afirme que el modo creativo «garantiza» originalidad, calidad o éxito.

### Stable data-testid Hooks (adiciones)

| `data-testid` | Elemento / uso |
|---------------|----------------|
| `story-mode-group` | `role="radiogroup"` del selector. |
| `story-mode-faithful` | Radio `Fiel a la premisa`. |
| `story-mode-creative` | Radio `Modo creativo`. |
| `story-mode-help` | Párrafo de ayuda del modo. |
| `story-mode-creative-notice` | Aviso visible solo en creativo. |
| `story-review-mode` | Badge del modo en la revisión; `data-mode`. |
| `story-bible-character` | `li` de personaje; `data-source="premise|invented"`. |
| `story-bible-character-invented` | Etiqueta `Personaje inventado`. |

### Presupuesto de clics (actualizado)

| Recorrido | Clics | Detalle |
|-----------|-------|---------|
| Camino feliz `faithful` (entrada + crear + aprobar) | 3 | Sin cambios; el modo por defecto no añade clic. |
| Camino feliz `creative` | 4 | +1 por elegir `Modo creativo`. |
| Desplegar la biblia en revisión | +1 | Opcional. |
| Recuperación (reintentos, QC, cancelar) | +1 a +3 | Sin cambios respecto a 006. |

### Design Contract (adiciones)

| Concern | Decisión |
|---------|----------|
| Selector | Mismo patrón que `StoryPresetPicker`: `fieldset` + radios `sr-only` + tarjeta `peer-checked` con borde `brand-fuchsia`. |
| Layout | 1 columna a 320 px; 2 columnas desde `sm`; ocupa el ancho del formulario. |
| Altura táctil | `min-h-11` (44 px) en cada tarjeta y en el `summary`. |
| Aviso creativo | Bloque `rounded-2xl border border-white/10 bg-brand-ink p-3 text-xs text-brand-muted`; texto, no solo color. |
| Badge de modo | `inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs font-medium`. |
| Etiqueta inventado | `ml-1 rounded-full bg-brand-fuchsia/10 px-2 py-0.5 text-[11px] text-brand-text`. |
| Foco | `focus-visible:ring-2 ring-brand-fuchsia ring-offset-2 ring-offset-brand-surface`. |
| Motion | Solo transiciones de color de 150 ms bajo `motion-safe:`. |
| Forced colors | Borde `ButtonText` en tarjetas y badge. |
| Responsive | 320–1920 px sin scroll horizontal; zoom 200 %/400 % sin recortes. |

## Security & Operations

| Amenaza | Mitigación | Riesgo residual |
|---------|------------|-----------------|
| Inyección por `mode` | Allowlist estricta (`faithful`/`creative`); 400 antes de DeepSeek; nunca se interpola en el prompt como texto libre. | Ninguno relevante. |
| Inyección por `source` | Allowlist estricta (`premise`/`invented`); forma exacta del objeto de personaje. | Ninguno relevante. |
| Inyección vía premisa hacia el prompt creativo | La premisa sigue siendo **contenido**, no instrucciones; el prompt delimita el marco y el validador rechaza campos extra y marcas. | Un modelo que obedezca una instrucción embebida; el QC y el humano lo revisan. |
| Drift temático en `creative` | Prompt con marco fijo, `source` obligatorio, límite de 3 personajes, QC y revisión humana. | El validador no verifica semántica; gate M1. |
| Personaje inventado tratado como extra por el QC | Línea de reparto canónico y comparación contra `expectation.characters`; test dedicado. | Un evaluador que ignore la línea; produce un falso bloqueo, nunca un falso PASS. |
| Fuga de contenido a logs | Allowlist de logs; se añade `mode` y se mantiene prohibido premisa, biblia, beats, prompts, negativos, observaciones y `source` por personaje. | Un proxy externo; se configura redacción. |
| Fuga de secretos | `NUXT_DEEPSEEK_KEY`, `NUXT_FAL_KEY`, `DATABASE_URL`, `DIRECT_URL` siguen server-only. 007 no añade variables públicas. | Sin cambios. |
| Coste adicional | `creative` no añade llamadas a proveedores; mismo número de keyframes/vídeos y mismo cap. Solo cambia el prompt y la temperatura. | Más reparaciones si el JSON creativo es inestable; acotado por el cap y M1. |
| Abuso de creación | Rate limit de 005 intacto (3/h por sesión, 2 activas, presupuesto diario). | Sin cambios. |
| Enumeración de historias | `cuid` + cookie + 404 uniforme. | Sin cambios. |
| IP/legal en premisas y personajes inventados | No se detecta IP automáticamente; se documenta como gate de producto/legal (M5). | Un usuario puede pedir una historia basada en una obra protegida; fuera del alcance técnico de 007. |

### Observabilidad (adiciones)

- Eventos existentes sin cambios. Se añade `mode` como campo permitido en `story.create.start`, `story.create.ok`, `story.create.failed` y `story.plan.*`.
- Campos permitidos adicionales: `mode`.
- Campos prohibidos (sin cambios): premisa, biblia, beats, `visualPrompt`, `narration`, prompts, negativos, observaciones, `framesUrl`, strips, `qcJson`, `source` por personaje, `requestId`, `sessionId`, IP en claro.

### Lifecycle (adiciones)

| Recurso | TTL | Comportamiento |
|---------|-----|----------------|
| `Story.mode` | Igual que la historia (24 h) | Se borra con la fila. |
| `planJson.storyBible.characters[*].source` | Igual que la historia | Se borra con la fila. |
| Prompts/temperatura | No persistidos | Se derivan en cada llamada. |

## Costes y latencia (adiciones)

007 **no cambia la fórmula de coste**, el cap ni el presupuesto diario.

| Modo | Llamadas a DeepSeek | Llamadas a Fal | Coste estimado |
|------|---------------------|----------------|----------------|
| `faithful` | 1 (o 2 si repara) | Las mismas que 006 | Idéntico a 006 |
| `creative` | 1 (o 2 si repara) | Las mismas que 006 | Idéntico a 006 |

| Escenario | Escenas | Coste |
|-----------|---------|-------|
| `creative`, rápido, sin referencia, base | 5 | El de 006 (2,11 USD con QC) |
| `creative`, rápido, con 2 inventados | 5 | El mismo; no hay llamadas extra |
| `creative`, calidad, base | 5 | El de 006 (3,86 USD con QC) |

Latencia: sin cambios. `creative` puede añadir tokens de salida dentro del mismo presupuesto; no añade una etapa. La temperatura más alta puede aumentar la tasa de reparación; se mide en M1.

## Test Plan

La baseline es la de 006 (**1505 passed / 7 skipped opt-in / 96 archivos**) más los archivos nuevos, con los **613 tests de 004 intactos**.

### Gate de calidad

```bash
npm run db:generate
npm run test:run
npm run build
```

### Tests unitarios nuevos

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/server/story-mode.spec.ts` | `STORY_MODES`; `isStoryMode` con `undefined`, `null`, `''`, mayúsculas, espacios y objetos; `parseStoryMode` con fallback `faithful`; `maxInventedCharacters` 0/2; pureza y determinismo. |
| `tests/unit/story-mode-picker.spec.ts` | Render del `fieldset`/`legend`; dos radios; `faithful` seleccionado por defecto; un clic emite `creative`; ayuda por modo; aviso creativo visible y asociado por `aria-describedby`; 44 px; foco; teclado. |
| `tests/unit/server/story-mode-prompt.spec.ts` | `faithful` contiene todas las frases normativas de 006 y el bloque `faithful`; `creative` contiene el bloque creativo y no la prohibición de personajes; el esquema incluye `source`; el mensaje de usuario y el brief son byte-idénticos; el modo nunca se interpola en la premisa. |
| `tests/unit/server/story-mode-validator.spec.ts` | Biblia `faithful` válida; `faithful` con un `invented` inválido; `creative` con 0, 1 y 2 inventados válidos; `creative` con 3 inventados inválido; `creative` sin `premise` inválido; `leadCharacterId` inventado inválido; `source` ausente en creación inválido; `source` ausente con legacy válido y normalizado; motivos estables sin contenido. |

### Tests unitarios actualizados (solo por cambio de contrato)

| Test | Motivo |
|------|--------|
| `tests/unit/server/story-bible-validator.spec.ts` | `source` y reglas por modo; tolerancia legacy. |
| `tests/unit/server/story-plan-validator.spec.ts` | `mode` en opciones; esquema con `source`. |
| `tests/unit/server/story-director-prompt.spec.ts` | Firma con `mode`; variantes de prompt; `source` en el esquema. |
| `tests/unit/server/story-director.spec.ts` | `mode` en la petición; `temperature` 0.4/0.7; reparación única con error de modo. |
| `tests/unit/server/story-director-context.spec.ts` y `story-director-brief-prompt.spec.ts` | Llamadas actualizadas; byte-identidad del mensaje de usuario intacta. |
| `tests/unit/server/story-validation.spec.ts` | `validateStoryMode`; `invalid-mode`; campo requerido; interacción con campos desconocidos. |
| `tests/unit/server/story-service.spec.ts` | `canonicalStoryBody` con modo; `matchesRequest` con modo; persistencia de `mode`; DTO. |
| `tests/unit/server/story-repository.spec.ts` | `mode` en `StoryRecord`/`CreateStoryRecord`; round-trip. |
| `tests/unit/server/story-prisma.spec.ts` | Mapeo de `mode`; plan `creative` leído con su modo (no se reconstruye); legacy sin `source`; backfill. |
| `tests/unit/server/story-prompt-composer.spec.ts` | Personaje inventado en el bloque global con el mismo trato; negativo sin su id/nombre; salida `faithful` byte-idéntica a 006. |
| `tests/unit/server/story-qc-checker.spec.ts` | `invented` esperado no es `extra-character`; desconocido sí. |
| `tests/unit/server/story-qc-evaluator.spec.ts` | Prompt con `REPARTO CANÓNICO`; esquema sin cambios; sin fuga. |
| `tests/unit/story-models.spec.ts` | `StoryMode`; `Story.mode`; `StoryCharacter.source`; `StoryCreateRequest.mode`. |
| `tests/unit/story-data.spec.ts` | `STORY_DEFAULT_MODE`; opciones; labels; copy exacto. |
| `tests/unit/story-review.spec.ts` | Badge de modo; legacy. |
| `tests/unit/story-bible-summary.spec.ts` | Etiqueta `Personaje inventado`; `data-source`; sin etiqueta en `premise`. |
| `tests/unit/use-story.spec.ts` y `use-story-api.spec.ts` | `mode` en el body y en el estado. |
| `tests/unit/story-guards.spec.ts` | Inventario con `StoryModePicker.vue`; sin `mode` en `planJson`; sin imports prohibidos. |

Los archivos de 004 (`tests/unit/server/adapters/**`, `tests/acceptance/composer-*`, `tests/acceptance/feed-route.spec.ts`, `tests/acceptance/landing-route.spec.ts`) **no se modifican**.

**Helpers y fixtures compartidos**: `tests/helpers/story.ts` MUST añadir `mode` a los registros y a los DTO de prueba, y `source` a las biblias de fixture. Cualquier test que construya un `CreateStoryRecord`, un `StoryRecord` o un body de `POST /api/story` MUST actualizarse para el nuevo contrato; el compilador es la primera red de seguridad. `tests/acceptance/story-e2e-smoke.spec.ts`, `story-api-create-brief.spec.ts` y `story-api-uploads.spec.ts` MUST revisarse por el mismo motivo y documentarse en el PR si cambian.

### Tests de rutas y aceptación

| Test | Cobertura mínima |
|------|------------------|
| `tests/acceptance/story-api-mode.spec.ts` | 201 `faithful`; 201 `creative`; `mode` en la respuesta; 400 por ausente/`null`/`''`/mayúsculas/tipo; 400 por campo desconocido (no `invalid-mode`); sin llamada a DeepSeek en los 400; `GET` devuelve `mode`; ownership y 404. |
| `tests/acceptance/story-api-create.spec.ts` (actualizado) | Body de 006 + `mode`; idempotencia con modo; 409 por cambio de modo; `source` en la biblia; 502 si el plan `faithful` trae un inventado. |
| `tests/acceptance/story-api-detail.spec.ts` (actualizado) | `mode` presente; `source` público; sin prompts, negativos, `sessionId` ni URLs internas. |
| `tests/acceptance/story-004-regression.spec.ts` | **Sin cambios.** `/composer`, `/feed`, `/` intactos; 613 tests de 004. |
| `tests/acceptance/story-006-faithful-regression.spec.ts` | **Nuevo.** Una historia `faithful` produce el mismo prompt de sistema normativo de 006 (frases presentes) y el mismo negativo para una biblia fija; los estados y el QC no cambian. |
| `tests/acceptance/story-route.spec.ts` (actualizado) | El selector aparece en el SSR inicial con `faithful`; el formulario no envía sin JavaScript. |
| `tests/acceptance/story-detail-route.spec.ts` (actualizado) | El SSR de `/story/[id]` no filtra `mode` de otra sesión ni datos internos. |

### Tests de componentes

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/story-mode-picker.spec.ts` | Copy exacto; roles; foco; 44 px; aviso; teclado. |
| `tests/unit/story-create-form.spec.ts` (actualizado) | Slot `mode` entre premisa y escenas; orden visual; el submit no cambia. |
| `tests/unit/story-review.spec.ts` (actualizado) | Badge `Fiel a la premisa`/`Modo creativo`; legible con lector de pantalla; legacy. |
| `tests/unit/story-bible-summary.spec.ts` (actualizado) | `Personaje inventado` solo en `invented`; texto, no color; 7 filas intactas. |

### Smokes opt-in

- `RUN_STORY_MODE_SMOKE=1`: crea una historia real `creative` contra DeepSeek (sin Fal), valida el plan, imprime el reparto y comprueba `source`; presupuesto máximo 0,10 USD. Nunca en CI.
- `RUN_DB_SMOKE=1` (ampliado): aplica `story_mode`, crea una `faithful` y una `creative`, lee ambas, verifica el backfill de una fila insertada antes de la migración y borra.
- `RUN_STORY_QC_VISION_SMOKE=1` (sin cambios): no se amplía a personajes inventados en CI.

### Comprobaciones manuales obligatorias

1. Crear una historia sin tocar el selector y comprobar `faithful`, `source: 'premise'` y el badge `Fiel a la premisa`.
2. Crear una historia `creative` con una premisa que admita un secundario y comprobar que el director declara `source: 'invented'`.
3. Forzar un plan `faithful` con un personaje inventado y comprobar la reparación única y el 502.
4. Forzar un plan `creative` con 3 inventados y comprobar el rechazo y la reparación.
5. Forzar un `leadCharacterId` inventado y comprobar el rechazo.
6. Inspeccionar los prompts de una historia `creative`: el personaje inventado aparece con el mismo trato que el protagonista y no lleva la etiqueta «inventado».
7. Inspeccionar el negativo: no contiene el id ni el nombre de ningún personaje de la biblia.
8. Comprobar `REPARTO CANÓNICO` en el prompt de QC y que un personaje inventado no genera `extra-character`.
9. Repetir `POST` con la misma clave y distinto modo y comprobar 409; con el mismo modo y comprobar 200.
10. Enviar `mode` ausente, `null`, `''` y `"Creative"` y comprobar 400 `invalid-mode` sin llamada a DeepSeek.
11. Aplicar la migración sobre datos de 006 y comprobar `mode = 'faithful'` y que los planes no se reconstruyen.
12. Comprobar que una fila `creative` se lee sin reconstruir el plan (test y comprobación manual en local).
13. Auditar teclado, lector de pantalla, 44 px, 320–1920 px, zoom 200 %/400 %, reduced motion y forced-colors del selector y del badge.
14. Revisar logs: aparece `mode`, no aparecen premisa, biblia, `source` por personaje, prompts ni negativos.
15. Comprobar que `/composer`, `/feed` y `/` no cambian y que los 613 tests de 004 pasan.

## Gates de investigación

Ninguno de estos gates bloquea el contrato de esta spec, pero cada uno bloquea su fase. Un gate fallido **no** se resuelve inventando datos: se aplica el fallback declarado. Los gates de 007 usan el prefijo **M** para no colisionar con los gates **G1–G8** de 006, que siguen vigentes y no se renumeran.

| Gate | Pregunta | Bloquea | Fallback si falla | Propietario |
|------|----------|---------|-------------------|-------------|
| **M1** | ¿`creative` con `temperature: 0.7` mantiene una tasa de `director-invalid-output` ≤ 10 % y no cambia el tema, el protagonista ni el conflicto en ≥ 20 historias reales de 4–6 escenas? | Fase 1 (temperatura y prompt creativo) | Bajar a `0.5`, reforzar `Sorprende sin contradecir la premisa` o añadir una frase de «no cambies el conflicto» al mensaje de usuario. Nunca relajar el validador. | Arquitecto + humano con créditos |
| **M2** | ¿Se mantienen los personajes inventados sin referencia de imagen? Medir `wrong-wardrobe`, `extra-character`, `missing-character` y `continuity-break` en QC sobre ≥ 20 clips de ≥ 5 historias `creative`. Objetivo: ≤ 1 issue blocking por historia de media. | Fase 3 (UI) y lanzamiento de `creative` en producción | Reducir el máximo de inventados a 1, exigir un vestuario más contrastado en el prompt o mantener `creative` como opción avanzada. El default de UI sigue siendo `faithful`. | Humano con créditos |
| **M3** | ¿Dos historias `creative` con la misma premisa difieren en puesta en escena y secundarios sin diferir en el marco? Revisión ciega de 5 pares. | Fase 4 (calidad percibida) | Ajustar la temperatura o añadir una instrucción de variación; no se añade `seed`. | Producto |
| **M4** | ¿`CREATE TYPE` + `ALTER TABLE ... ADD COLUMN ... DEFAULT` convive con `prisma migrate deploy`, PostgreSQL 17 local y el pooler de Supabase, sin bloquear la tabla más de lo aceptable? | Fase 0 | Dividir en dos migraciones (`CREATE TYPE` y `ADD COLUMN`) y aplicar con `DIRECT_URL`; verificar el pooler en staging. | Arquitecto + operaciones |
| **M5** | ¿Acepta producto/legal que un usuario pueda pedir una historia basada en una obra protegida y que el director invente personajes que se parezcan a los originales? | Lanzamiento público de `creative` | Añadir aviso de responsabilidad, moderación de premisas o desactivar `creative` en el producto. Es un gate de producto/legal; no se resuelve con código en 007. | Producto + legal |

## Assumptions

- `deepseek-flash` sigue aceptando `response_format: json_object` y el esquema con un campo más; el gate G1 de 006 ya está cubierto por la operación actual.
- El director declara `source` de forma razonablemente fiable. La validación es **estructural**, no semántica: 007 no hace NER ni compara nombres contra el texto de la premisa.
- Un personaje mencionado en la premisa pero no declarado en la biblia se considera fuera del canon y se prohíbe. Es una decisión conservadora y consistente con «la biblia es la autoridad».
- El máximo de 3 personajes de 006 es suficiente para un micro-relato de 24–36 s; 2 inventados es el techo de producto.
- La temperatura `0.7` es un punto de partida calibrable; no cambia el contrato.
- No hay rate limit distribuido; el modo no añade una dimensión de rate limit.
- Las historias creadas antes de 007 son `faithful` y su biblia se normaliza a `source: 'premise'`; expiran en 24 h.
- El QC con visión sigue desactivado por defecto (`qcEnabled=false`) hasta cerrar G1/G2 de 006; 007 no cambia ese default.
- La referencia de imagen sigue siendo opcional y única; no hay referencia por personaje.

## Out of Scope

Todo lo de 005/006 sigue fuera de alcance, más:

- **Nivel 3: biblia editable** (personajes, vestuario, props, reglas, `forbidden`). Futura 008.
- Editar el modo después de crear la historia.
- Selección manual de personajes o de secundarios.
- Más de 2 inventados, más de 3 personajes o personajes sin función.
- Referencias por personaje, hojas de personaje, `seed`, LoRA, multi-referencia o referencia de vídeo.
- Cambios en el flujo, estados, umbrales o configuración del QC.
- Audio, subtítulos, música, texto quemado, transiciones, duración distinta de 6 s o escenas fuera de 4–6.
- Cambios de coste, cap, presupuesto diario, rate limit o lifecycle.
- Detección de IP, moderación nueva o garantía de originalidad legal.
- Publicación, descarga, compartición y feed.
- Nuevas dependencias npm, Tailwind v4, nuevos proveedores, nuevas tablas o índices.
- Prometer viralidad, retención o calidad del resultado.

## Open Questions

Las decisiones de producto están cerradas. Las siguientes son verificaciones:

1. **Temperatura creativa**: `0.7` es una estimación inicial; M1 puede fijar `0.5` o `0.6`. Cambiarla no requiere enmienda de contrato (es una constante del servidor), pero sí actualizar la tabla de riesgo.
2. **Máximo de inventados**: el contrato fija 2. Si M2 demuestra que la consistencia visual sin referencia es insuficiente, se reducirá a 1 mediante una enmienda explícita, no cambiando la validación en silencio.
3. **Modo en el resultado**: 007 lo muestra en la revisión y lo devuelve en el DTO. Mostrarlo también en `/story/[id]` cuando está `READY` queda como mejora de producto, sin cambio de contrato.
4. **Puntero en 006**: tras la aprobación, conviene añadir una línea en la cabecera de `specs/006-story-continuity/spec.md` que remita a esta tabla de enmienda. En 007 no se modifica ningún otro archivo.

## Implementation Phases

### Fase 0 — Contrato, schema y migración

- `app/models/story.ts` (`StoryMode`, `StoryCharacterSource`, `source`, `Story.mode`, `StoryCreateRequest.mode`).
- `server/story/story-mode.ts`; `repository.ts`; `prisma/schema.prisma`; migración `story_mode`.
- `bible-validator.ts` y `plan-validator.ts` con `mode` y `source`.
- **Exit criteria**: `prisma validate` y `db:generate` correctos; migración aplicada en local; backfill `faithful`; los tipos compilan; 004 intacto. Gate **M4**.

### Fase 1 — Director y prompts

- `director-prompt.ts` (variantes y esquema), `director.ts` (modo y temperatura), `director-types.ts`, `briefing-director.ts`.
- `validation.ts` (`validateStoryMode`), `story-service.ts` (body canónico y persistencia).
- Fixtures nuevas y actualización de los tests de contrato de 006.
- **Exit criteria**: prompt `faithful` equivalente a 006; prompt `creative` normativo; una sola reparación; temperatura por modo; sin `seed`. Gate **M1** (medición inicial).

### Fase 2 — Negativos, QC y repositorio

- `qc-prompt.ts` con `REPARTO CANÓNICO`; tests de `qc-checker` con inventados.
- `prisma-story-repository.ts` con `mode` y `parsePlan` por modo.
- **Exit criteria**: un personaje inventado no es extra; negativos sin personajes de la biblia; fila `creative` no se reconstruye. Gate **M2** (medición inicial).

### Fase 3 — API y DTO

- `server/api/story/index.post.ts` (modo requerido), `GET` con `mode`, `invalid-mode` en `errors.ts`.
- Tests de rutas: 201, 400, 409, idempotencia, ownership y ausencia de fugas.
- **Exit criteria**: contrato exacto de la sección API; ningún endpoint nuevo; 004 intacto.

### Fase 4 — UI, copy, accesibilidad y cierre

- `StoryModePicker.vue`, `StoryCreateForm.vue`, `pages/story/index.vue`, `StoryReview.vue`, `StoryBibleSummary.vue`, `data/story.ts`, `utils/story.ts`.
- README; guardas estáticas; smokes opt-in; comprobaciones manuales.
- **Exit criteria**: selector visible y accesible; default sin clic extra; badge y etiqueta; `npm run db:generate && npm run test:run && npm run build` en verde; 613 tests de 004 intactos; gates cerrados o con fallback documentado. Gates **M3** y **M5**.

## Success Criteria *(mandatory)*

- **SC-031 (Contrato)**: `StoryMode` existe con exactamente dos valores; el modo viaja en request, persistencia y DTO; un valor inválido o ausente devuelve 400 `invalid-mode` sin llamar a DeepSeek.
- **SC-032 (Fiel)**: toda historia `faithful` tiene todos los personajes con `source: 'premise'`; un plan con un inventado se rechaza tras una única reparación.
- **SC-033 (Creativo)**: `creative` admite 0–2 personajes inventados, con 1–3 en total, protagonista `premise` y cada inventado en al menos un beat.
- **SC-034 (Procedencia)**: `StoryCharacter.source` se persiste en `planJson` y se devuelve en el DTO; el modo **no** se duplica en el plan.
- **SC-035 (Prompts)**: `faithful` conserva las instrucciones de 006; `creative` incluye el bloque creativo; el esquema incluye `source`; el mensaje de usuario y el brief son byte-idénticos.
- **SC-036 (Negativos)**: ningún personaje de la biblia aparece en el negativo; la base de 006 se mantiene; el modo no cambia la salida para la misma biblia.
- **SC-037 (QC)**: un personaje inventado de la biblia no produce `extra-character`; uno desconocido sí; estados y umbrales no cambian.
- **SC-038 (UI)**: el selector es visible y accesible; `faithful` es el default y no añade clics; `creative` cuesta 1 clic; la revisión muestra el modo y marca los inventados.
- **SC-039 (Idempotencia)**: la misma clave y el mismo body con el mismo modo es 200 sin segunda llamada; con distinto modo es 409.
- **SC-040 (Migración)**: la migración añade el enum y la columna con backfill `faithful`, sin romper filas, y una fila `creative` se lee sin reconstruir su plan.
- **SC-041 (No regresión)**: los 613 tests de 004 pasan sin modificar; los tests de 005/006 solo cambian donde la tabla de enmienda lo exige, documentados archivo por archivo.
- **SC-042 (Calidad)**: `npm run db:generate`, `npm run test:run` y `npm run build` terminan correctamente; cada archivo runtime nuevo tiene cobertura; los smokes son opt-in y no se ejecutan en CI.
- **SC-043 (Seguridad)**: ninguna respuesta, HTML o log contiene claves, premisa, biblia, prompts, negativos, `source` por personaje, `sessionId`, `requestId` ni `DATABASE_URL`.
- **SC-044 (Accesibilidad)**: el selector y el badge cumplen foco, roles, 44 px, reduced motion, forced-colors y 320–1920 px sin scroll horizontal.

## Constitution Check

Confirmación explícita contra `.specify/memory/constitution.md` v1.2.0.

- **I. Simplicity First (1-to-3-Clicks UX)**: `faithful` es el default y no añade ningún clic; `creative` cuesta un clic explícito. El selector es una elección de producto, no configuración técnica. No hay pantallas nuevas, ni modales, ni dead ends. No se promete ningún resultado ni se muestran porcentajes. La edición de la biblia (nivel 3) queda fuera para no convertir el camino feliz en un editor.
- **II. Spec-Driven Development**: esta es la Fase 1 de 007. El entregable es solo esta spec; no se escribe código hasta el Checkpoint 1. La tabla de enmienda a 006 y a 005 es explícita; 004 no se enmienda. Las specs históricas conservan su texto.
- **III. Server-Side Security for AI & Secrets**: `mode` y `source` son allowlists del servidor; la temperatura y el prompt se eligen en servidor; DeepSeek, Fal, Prisma y FFmpeg siguen en `server/`; no hay claves nuevas ni públicas. No se añaden llamadas a proveedores ni rutas que acepten binarios. El rate limit, la idempotencia, el presupuesto y el lifecycle de 005/006 se mantienen.
- **IV. Modular Architecture & Reusability**: se extienden `server/story/` y `app/` sin duplicar compositores, validadores, repositorios ni adaptadores. `story-mode.ts` es un módulo puro y pequeño. El compositor de prompts conserva sus firmas y la biblia sigue siendo la única autoridad visual. Los contratos compartidos siguen en `app/models/story.ts`, `readonly` y sin `any`.
- **V. Test-First & Quality Gates**: se especifican tests unitarios por archivo runtime nuevo, tests de rutas, componentes, aceptación, regresión de 004/006, guardas estáticas y smokes opt-in. El gate es `db:generate` + `test:run` + `build`. Los gates de investigación tienen fallback honesto y no bloquean el contrato.
- **Tailwind 3.4.x**: se reutilizan tokens y el patrón de `StoryPresetPicker`; no se modifica `tailwind.config.ts` ni se usa Tailwind v4.
- **Nuxt 4 / Node 22**: rutas por archivos, `server/api/`, `runtimeConfig` privado, Nitro y proceso Node persistente; sin `nuxt generate` para Story.
- **PWA**: `NetworkOnly` para `/api/**` y hosts de Fal; el modo no añade caché ni datos offline.
- **Media**: sin cambios; 007 no toca FFmpeg ni el montaje.

**Desviaciones explícitas**:

1. **`source` obligatorio en el contrato normalizado**: 006 no lo tenía. La compatibilidad se resuelve normalizando `'premise'` **solo** al leer filas persistidas; en creación es estricto. No se reescribe el plan ni se pierde la biblia.
2. **`mode` fuera de `planJson`**: se evita una segunda fuente de verdad. La fila es la autoridad y el plan solo contiene la biblia y los beats.
3. **Temperatura distinta por modo**: es un cambio de comportamiento del director, no de contrato de proveedor. Se mantiene como constante del servidor y se calibra en M1.
4. **`invalid-mode` como código nuevo**: supersede FR-277 de 006 solo para este valor. Se prefiere un error específico a reutilizar `invalid-request`, porque el cliente debe poder distinguir un modo ausente de un body mal formado.
5. **El negativo no cambia por modo**: se mantiene la salida de 006 y la biblia como autoridad. Cambiarlo por modo rompería la byte-identidad y no mejoraría la seguridad visual.
6. **Sin verificación semántica de la premisa**: 007 valida estructura (`source`), no si un nombre aparece literalmente en la premisa. Se documenta como límite consciente y se cubre con prompt, QC y revisión humana.
