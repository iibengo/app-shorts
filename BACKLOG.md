# Backlog — AI Shorts

Actualizado: 2026-10-25. Ordenado por prioridad real: **primero lo que hace que el vídeo se entienda** (validación de producto), después lo que mejora la calidad, y al final la deuda que no bloquea nada.

## El criterio que manda (2026-10-25)

La primera historia completa se generó y **no se entendía**. Comparada con `examples/video4.mp4`, la diferencia no son los prompts: es que **la referencia habla y la nuestra no**.

> «La generación ha ido bien, pero le falta audio y los subtítulos no están cuadrados y no se entiende bien la historia.» — humano, 2026-10-25

**Todo lo que no contribuya a que una historia se entienda es secundario.** Las tareas están agrupadas por esa pregunta, no por área técnica.

---

## 🎯 Bloque 1 — Que la historia se entienda (antes que nada)

**Esta es la validación real.** Ninguna función nueva entra hasta que un vídeo generado por el sistema se entienda sin explicaciones.

| Orden | # | Tarea | Coste | Qué arregla |
|---|---|---|---|---|
| 1 | **E1** ✅ **HECHO 2026-10-25** | **Guion con conflicto: una frase con sustancia por plano** | 0 (código) | Hoy el director escribe *imágenes* («mira pantallas», «bebe café»); la referencia escribe un *problema que se resuelve* («alguien tomó algo y hay que devolverlo»). Es la raíz de que la historia no tenga trama. **Test de aceptación:** cada plano se resume en una frase con sujeto, acción y consecuencia, y el conjunto cuenta un cambio de estado. **Implementado:** campo `stake` (12–120) obligatorio en cada beat, validado en `canon-validator` y en `plan-validator`; va al prompt de vídeo como «What is at stake». Tests: rechaza stake de 3 caracteres y de 121; el prompt de vídeo lo lleva; los planes legacy sin stake siguen funcionando. |
| 2 | **E2** | **Audio, voz y subtítulos (spec 014)** | 15-25 h | **La tarea de producto número uno.** La referencia se entiende porque habla, no por sus prompts. Sin voz, 12 planos de acción genérica no se entienden nunca. Incluye voz por escena, subtítulos quemados con ASS y mezcla con FFmpeg. |
| 3 | **E3** ✅ **HECHO 2026-10-25** | **Vídeo largo y narrativo en el prompt de vídeo** | 0 (código) | Los prompts de ~20 palabras dejan huecos que el modelo rellena: texto en pantalla, encapuchados, clones. La referencia usa párrafos de ~90 palabras con acción continua. **Implementado:** `action` sube de 20–240 a **120–400 caracteres** (mínimo `BEAT_MIN_ACTION = 120`); `VIDEO_STAGE_BLOCK` pide «one continuous action» y prohíbe que entre nadie más al plano. Tests: el mínimo rechaza una acción de 20 caracteres; el bloque de vídeo exige acción continua. |
| 4 | **E4** ✅ **HECHO 2026-10-25** | **Marcadores `char_001` y repetir el personaje en cada frase** | 0 (código) | La referencia nombra al personaje tres veces por párrafo y usa etiquetas, no nombres. Causa probable de que el modelo escriba nombres en pantalla. **Implementado:** `characterMarker` compone `Nombre (id)` en el prompt de vídeo y `anchorActorsAtStart` repite el actor al principio, **solo si el `subject` del plano es ese personaje**: forzarlo es lo que puso a un encapuchado haciendo el papel de Clara. Tests: ancla con marcador cuando hay sujeto; no lo fuerza cuando el plano es de otro. |
| 5 | **E5** ✅ **HECHO 2026-10-25** | **Separar atmósfera del bloque de estilo** | 0 (código) | `papercraft` impone «dark navy background with neon accents» en todos los planos; el primer plano salió de día y el resto de noche. El estilo da material y forma; la luz y el fondo los pone la escena. **Implementado:** fuera «dark navy background with neon pink and blue accents» del bloque `papercraft`; el keyframe añade `Lighting: <hora> light, <clima>` desde el beat. Tests: el keyframe ya no contiene `dark navy` y sí la luz de la escena. |
| 6 | **E6** 🟡 **PARCIAL 2026-10-25** | **Personajes ajenos al guion** | ? | El modelo añadió un encapuchado, clones y figuras translúcidas. **Hecho sin coste:** el keyframe declara ahora cuántas personas hay en cuadro («Exactly one person in frame»), que es el positivo y funciona en todos los motores; el negativo ya incluía `extra characters`. **Falta medir** con una historia real: si persiste, hace falta trabajo aparte. |


### Bloque 1b — Redacción de prompts, tras comparar con el reel manual (2026-10-26)

**Origen:** `examples/informe-reel-cafeandcode/`. Análisis completo en `docs/analisis-reel-vs-app.md`.

El reel manual se entiende y el nuestro no. Parte de la diferencia es de estructura (guion, reutilización) y **parte es de cómo están escritos los prompts**. Estas cinco son redacción pura y **cuestan 0**.

| # | Cambio | Hoy | Cómo lo escribe el reel | Archivo |
|---|---|---|---|---|
| **R1** | **Anclar el estilo a la referencia, no al adjetivo** | `low-poly papercraft 3D render, faceted shapes…` | `in the exact style of the reference image: faceted shapes like folded paper, soft warm light` | `visual-style.ts` |
| **R2** | **Describir el personaje en cada prompt, no solo etiquetarlo** | `Clara (clara) abre el horno` | `the same woman from the reference images (short dark hair, apron, grey shirt) opens the oven` | `story-prompt-composer.ts` |
| **R3** | **Frase de cierre de marca en todos los prompts** | `Screens and surfaces keep the same look as the first frame` | `Clean smooth surfaces, only shapes and colors.` (prohíbe textura y detalle en positivo) | `story-prompt-composer.ts` |
| **R4** | **Componer el negativo dentro del positivo cuando importa** | negativo aparte, que Kling acepta y MiniMax no | `no dog visible in this shot`, `sitting alone` | `story-prompt-composer.ts` |
| **R5** | **Escribir la acción pensando en el corte** | `one continuous action… let it finish inside the shot` | una acción **en dos tiempos**, para partir un clip en dos planos | `narrative-prompt.ts` + `reel-plan-adapter.ts` |

**Por qué importan:** R1 y R2 atacan **F5** (personajes ajenos) y la deriva de identidad. R3 ataca **F4/F6** (texto y detalle inventado). R4 es lo único que hará daño a los duplicados en MiniMax, que no acepta negativo. R5 es **el prerrequisito de S2** (reutilizar clips).

**Riesgo:** `story-prompt-composer.ts` es de los archivos que más historias generaron. Cada cambio va con test en ambos sentidos y con el presupuesto de caracteres comprobado (`KEYFRAME_PROMPT_MAX_CHARS = 900`).

**Ninguno gasta dinero.** Todos van antes de la próxima historia real.

**E1, E3, E4 y E5 son código puro y coste cero.** E2 es el trabajo grande. **E6 se decide cuando se vea el resultado de E3/E4.**

### Fallos observados en el vídeo del 2026-10-25

**Lo que se vio al reproducir la historia entregada**, con su causa y su tarea. Sin esta lista, «el vídeo no se entiende» no se puede atacar.

| # | Fallo visible en el vídeo | Causa conocida | Dónde se arregla |
|---|---|---|---|
| **F1** | **No hay voz ni audio**: el vídeo es mudo | No existe la capa de audio | **E2** |
| **F2** | **No hay subtítulos**: el texto es solo título, terminal y badge, no las frases de la historia | No existe la capa de subtítulos | **E2** |
| **F3** | **No se entiende la trama**: sale un fantasma, luego clones, y no se sabe qué pasa | El guion describe imágenes, no un conflicto | **E1** |
| **F4** | **Texto inventado en pantalla**: «10 tips», «1,2K», «PUBLISH», «CaféAndCode Office» | Prompts de vídeo cortos dejan huecos que el modelo rellena | **E3** (y E4) |
| **F5** | **Personajes que no existen**: un encapuchado, clones, figuras translúcidas | El prompt no ata quién está en escena | **E3**, **E4**; si persiste, **E6** |
| **F6** | **Pantallas con contenido inventado**: un portátil con una manzana que no pedimos | El modelo rellena las pantallas | **E3** |
| **F7** | **Planos repetidos por parejas**: encuadres casi idénticos seguidos | El director no varía encuadre | **S1** (se mide tras E1) |
| **F8** | **Fondo incoherente**: el primer plano es de día y luminoso, el resto nocturno con neón | El bloque de estilo impone fondo fijo | **E5** |
| **F9** | **12 planos de 2 s** recortados, cuando el motor hace clips de 6 y 10 s | Desalineación entre guion y capacidad del motor | **S2** (decisión de producto) |
| **F10** | **La identidad deriva entre planos**: la cara cambia de uno a otro | El prompt etiqueta al personaje, no lo describe; no hay referencia de escena | **R2**, **C7** |
| **F11** | **El estilo se aplica al conjunto pero no ata nada**: cada plano tiene su propia luz | El bloque de estilo es un adjetivo, no una referencia concreta | **R1** |

**F1 y F2 son los que más pesan.** Sin ellos, el resto son matices: la referencia se entiende porque habla.

**Estado:** ninguno cerrado. **F1–F2 → E2. F3 → E1. F4–F6 → E3/E4. F7 → S1. F8 → E5. F9 → S2. F10 → R2/C7. F11 → R1.**

---

## 🎯 Bloque 2 — Decidir si las escenas y los planos son el problema

**Duda abierta del humano (2026-10-25):** *"no sé si las escenas…"*. **No se toca todavía.** Primero E1–E5, porque si el problema es el guion o la voz, cambiar la estructura de escenas no arregla nada y cuesta días.

| # | Tarea | Coste | Cuándo |
|---|---|---|---|
| **S1** | **Planos repetidos por parejas** | 2-4 h | Se mide tras E1: si el guion tiene conflicto, el director debería variar encuadres solo. Si no, reglas de variedad de encuadre por escena. |
| **S2** | **Alinear la duración del plano con el motor (9g)** | 3 h | La referencia usa 2 tomas largas; nosotros 12 planos de 2 s. Encaja con E3, pero cambia el producto. **Decisión de producto, no técnica.** |
| **S3** | **Guion por escenas vs. por planos** | 3-5 días | Solo si E1–E5 no bastan. Hoy no hay evidencia de que haga falta. |

---

## 🎯 Bloque 3 — Entregar el vídeo (hecho)

| # | Tarea | Estado |
|---|---|---|
| **D1** | **El proveedor borra los MP4 en minutos** | **HECHO 2026-10-25.** Dos historias quedaron `READY` con URL 404. Ahora se copia a `.data/story-output/<storyId>.mp4` **antes** de subir, y `GET /api/story/:id/download` lo sirve comprobando sesión. |
| **D2** | **Almacenamiento persistente para despliegue** | Pendiente. `.data/` no sobrevive a un contenedor. Necesita disco persistente o bucket (S3/R2) antes de desplegar. |

---

## 🔴 Bloque 4 — Deuda que muerde (sin producto nuevo)

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 0a | ~~`assembly-failed` con historias largas~~ **CAUSA: saldo agotado** | — | El montaje nunca estuvo roto; el 403 de saldo se traducía como «servicio no disponible». Corregido a `provider-balance-exhausted`. |
| 0 | ~~El vídeo inventa texto sobre pantallas~~ **HECHO (013)** | — | Frase en positivo en `VIDEO_STAGE_BLOCK`. Medido: cero texto. |
| 1 | ~~**Terminar y ver la historia con hoja de personaje**~~ **HECHO (V1)** | — | Primera historia completa el 2026-10-25. |
| 3 | ~~**Cerrar la spec 011**~~ **HECHO** | 0 | Cerrada con sus enmiendas. |
| **P1** | **`isDatabaseError` marca cualquier error `Prisma*` como caída** | 1 h | Un error de validación se reportó como «base de datos no disponible» durante horas. Debe mirar el código, no el nombre. |
| **P2** | **Referencia de personaje falla si la descripción pasa de 600 caracteres** | 2 h | `ghostwriter` falló con `invalid-visual-prompt`. Debe recortar u omitir en vez de fallar. |
| **P3** | **Typecheck: 306 errores** | 1-2 días | No está en el gate. Se arregla en un pase propio. |
| **P4** | **`legacy: true`** | 3-5 h | Retirarlo o dejar condición de retirada explícita. |

---

## 🟢 Bloque 5 — Producto, cuando haya algo que publicar

| # | Tarea | Coste | Por qué |
|---|---|---|---|
| 4 | ~~Estilo `voxel`~~ **HECHO (013)** | — | El look del vídeo 4. |
| 6 | ~~Gráficos y overlays~~ **HECHO (015)** | — | Título, terminal y badge con FFmpeg. |
| 9g | **Conectar ficha del motor con adaptador** | 3 h | Solo la duración se lee de la ficha; el resto sigue a mano en cada adaptador. |
| 9a | **Pantalla de personajes** — parcial | 2-3 h | Falta asignar una foto propia a un personaje concreto. |
| 9b | **Varias fotos del usuario, una por personaje** | 6-10 h | Cambia el contrato del formulario (`STORY_MAX_REFERENCES = 1`). |
| 7 | **Notas del director** | 2-4 h | Contexto técnico sin dictar planos. |
| 8 | **Estilo `explainer`** | 5-8 h | Estilo del vídeo 3. |
| 9 | **Rúbrica de calidad + juez** | 4-6 h | Medir si las historias son buenas, no solo válidas. **Cobra sentido después de E-series.** |
| 9c | **Kling v3 con `elements`** | — | Probado y descartado por coste (0,56 vs 0,35 por plano, ~7 min/plano). Evidencia conservada. |
| 9h | **Series con personajes reutilizables** | ? | Futuro. |
| 9i | **Versiones de assets** | ? | Futuro. |

---

## Estado de la validación

| Hito | Estado |
|---|---|
| **Cadena completa hasta `READY`** | ✅ 2026-10-25 |
| **MP4 entregado y abrible** | ✅ 2026-10-25 (tras D1) |
| **El vídeo se entiende** | ❌ Bloque 1 |
| **Vale para publicar** | ❌ Bloque 1 |

**Ninguna spec está `Validated`.** `Validated` significa que el humano ve un vídeo y dice «esto lo publico». Ese listón no se mueve.

---

## Descartado

**Cupo de concurrencia y cancelación** (revisado 2026-10-24): `PrismaReelStoryRepository.cancel` ya marca los planos activos como `CANCELLED` dentro de la misma transacción. Los 6 jobs huérfanos vinieron de cancelaciones hechas con `UPDATE` directo en SQL, que no pasan por la transacción. No es un defecto del producto.
