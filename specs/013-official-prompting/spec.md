# Feature Specification: Prompts según la documentación oficial de los modelos

**Feature Branch**: `013-official-prompting`

**Created**: 2026-10-24

**Status**: Approved (2026-10-24). Aprobada por el humano tras la revisión de los repos de referencia.

**Input**: User description: "¿Por qué crea texto que no hemos pedido? ¿En qué estamos fallando? ¿Podemos arreglarlo o tenemos que cambiar de modelo?"

> Esta spec nace de una pregunta del humano y se responde con **documentación oficial de los proveedores**, no con intuición. La evidencia está abajo, con enlaces.

## Diagnóstico

El keyframe de la historia `ebddcea6` (plano 1, `establishing`, estilo `papercraft`) salió con:

- Texto inventado en la pantalla del portátil: `WHO STOLE MY ARTICLE?`.
- Dos bocadillos con `AUTHORSHIP GONE!` y `LOST CONTROL!`.
- Un primer plano a la cara donde el plan pedía un plano general.

El prompt enviado **sí decía** `no text, no subtitles, no logo, no watermark`. Y aun así el texto apareció. La causa está documentada por Google, dueño del modelo.

## Evidencia oficial

### E1 — Nano Banana no acepta prompt negativo

Esquema del endpoint `fal-ai/nano-banana/edit` (OpenAPI de Fal, consultado el 2026-10-24):

```text
seed, safety_tolerance, aspect_ratio, num_images,
limit_generations, output_format, image_urls, prompt, sync_mode
```

**No existe `negative_prompt`.** Las prohibiciones solo pueden ir dentro del prompt positivo.

### E2 — Google pide describir lo que se quiere, no lo que no

Guía oficial de Gemini Image (Nano Banana), citada por el equipo de ArcReel en su research de proveedores:

> *"Describe what you want, not what you don't."*
> Ejemplo oficial: `"no cars"` se escribe como `"an empty, deserted street with no signs of traffic"`.

Nuestro prompt encadena cuatro prohibiciones (`no text, no subtitles, no logo, no watermark`). Según la guía, **cada una nombra el concepto que se quiere evitar**.

### E3 — La referencia contamina la escena

La referencia enviada es el avatar del usuario: una foto de escritorio con portátil, taza y pantalla. El modelo **ve** una pantalla y deduce que la escena lleva texto. El `referenceUrl` está sembrando el contenido que luego intentamos prohibir.

### E4 — En imagen a vídeo, el prompt debe describir solo movimiento

Es la conclusión más unánime del research: ocho proveedores coinciden.

| Proveedor | Cita oficial |
|---|---|
| Google | `Prompt for motion only. Your source image already provides the subject, scene, and style.` |
| Alibaba (Wan) | `图像已经确定了主体、场景与风格，因此提示词主要描述动态过程及运镜需求` |
| MiniMax | `prompt describes how the scene evolves from this static image into motion` |
| OpenAI (Sora) | `The model uses the image as an anchor for the first frame, while your text prompt defines what happens next` |
| Volcengine (Seedance) | `主体 + 主体从首帧到尾帧的详细动作变化描述 + 运镜` |
| Kling | El ejemplo oficial es "la cámara se aleja, la chica sonríe" |
| Vidu | `subject motion + camera movement + scene change + style` |
| xAI | `Give it a starting image, describe the motion` |

Nuestro prompt de vídeo **repite toda la escena** (localización, hora, clima, props, personajes) y añade un bloque de prohibiciones. Va contra lo que piden los ocho.

### E5 — Qué modelo usa la referencia del sector

ArcReel, el proyecto de 5.700 estrellas, usa **Nano Banana para los keyframes**: el mismo que nosotros. No es un problema de modelo.

## Alcance

Cuatro cambios, todos en la capa de prompts y en lo que se envía como referencia. **Ningún cambio de motor, de modelo ni de coste unitario.**

1. **Keyframe: prompt en positivo y narrativo.** Sustituir las prohibiciones por descripciones de lo que sí se quiere.
2. **Referencia limpia para el protagonista.** Dejar de enviar el avatar con escritorio cuando existe una referencia propia del personaje.
3. **Vídeo: prompt de movimiento.** El vídeo describe qué pasa, no cómo es la escena.
4. **Guardia de texto en el keyframe.** Si la imagen trae texto, se regenera antes de pagar el vídeo. Reutiliza el patrón del inspector de dípticos de 011.

## Requisitos funcionales

| ID | Requisito |
|---|---|
| FR-001 | `storyKeyframeReferencePrompt` MUST NOT contener `no text`, `no watermark`, `no logo` ni `no subtitles`. Debe describir ausencias en positivo: `clean surfaces, an unmarked screen, a plain wall`. |
| FR-002 | `KEYFRAME_STAGE_BLOCK_EN` MUST NOT enumerar prohibiciones. Su función (un solo instante, sin movimiento) se expresa de forma positiva. |
| FR-003 | El compositor MUST anteponer al cuerpo del plano una línea de **sujeto + entorno + cámara**, siguiendo el orden oficial (sujeto → entorno → luz → cámara → estilo). |
| FR-004 | Con referencia propia de personaje disponible, el orquestador MUST enviar **esa** referencia, no el `referenceUrl` del usuario. El avatar queda solo para el personaje del que es dueño. |
| FR-005 | `VIDEO_STAGE_BLOCK` MUST describir **solo movimiento y cámara**. MUST NOT repetir localización, hora, clima, props ni ropa: el primer frame ya los contiene. |
| FR-006 | `composeVideo` MUST NOT añadir la localización, la hora ni el clima al prompt de vídeo. |
| FR-007 | El prompt de vídeo MUST NOT contener prohibiciones; el movimiento y la continuidad se piden en positivo (`the subject stays in the same seat`, `the camera holds`) |
| FR-008 | MUST existir `server/story/text-in-frame.ts`, heurística pura, y `keyframe-text-inspector.ts` con muestreo FFmpeg, con el mismo contrato que `keyframe-layout-inspector.ts`. |
| FR-009 | Antes del vídeo, un keyframe con texto detectado MUST volver a `KEYFRAME_QUEUED` con evento `reel.keyframe.text-detected`, igual que el díptico. |
| FR-010 | El inspector de texto MUST fallar abierto: si no puede decodificar o ffmpeg no está, acepta la imagen. |
| FR-011 | Los prompts MUST seguir siendo deterministas y puros: mismas entradas, mismo texto. |
| FR-012 | El presupuesto de caracteres se mantiene: 900 del keyframe y 2.000 del vídeo, con la escalera de degradación existente. |

## Contrato de prompt (nuevo)

### Keyframe

```text
{estilo positivo}. {identidad si hay referencia}. {un solo instante}.
{SUJETO} in {ENTORNO}. {LUZ}. {CÁMARA: plano, encuadre}. {FOCO si aplica}.
{entidades presentes}. {superficies limpias, pantalla en blanco}.
```

| Regla | Contrato |
|---|---|
| Orden | estilo → identidad → sujeto → entorno → luz → cámara → foco → entidades → limpieza |
| Prohibiciones | **Ninguna** en el keyframe: ni `no text` ni `without logos`. Solo descripciones de lo que se ve |
| Pantallas | Cuando la escena tiene portátil, móvil o monitor, el prompt MUST describir la pantalla por lo que **se ve**, no por lo que dice: `abstract unreadable content, colour blocks and soft bars`. Una pantalla en blanco parece un error; una ilegible parece un monitor encendido |
| Estilo | El bloque de estilo positivo abre el prompt; el negativo sigue existiendo solo para modelos que lo aceptan |

### Vídeo

```text
{acción concreta y única}. {movimiento de cámara}. {continuidad en positivo}.
```

| Regla | Contrato |
|---|---|
| Solo movimiento | Prohibido repetir localización, hora, clima, ropa o props |
| Un movimiento de cámara | Una sola indicación por plano (`slow push in`, `the camera holds still`) |
| Pantallas | MUST pedir `abstract unreadable content, letters that never resolve into words`. En positivo: los motores de vídeo no tienen canal negativo útil |
| Cámara quieta por defecto | Si el plano no pide movimiento explícito, el prompt MUST decir que la cámara se queda fija. Medido: `one slow camera move` se interpretó como barrido al fondo y se comió medio plano |
| Continuidad | En positivo: `the subject remains seated`, `the same lighting continues` |
| Duración | La duración la fija el proveedor con su parámetro, nunca el texto |

## Detección de texto — RETIRADA (ver enmienda)

**Esta sección describe el diseño inicial. Se retiró el 2026-10-24: la heurística no distingue texto de geometría de neón. La enmienda al final del documento explica la medición.**

Heurística pura sobre el muestreo en escala de grises que ya produce el inspector de dípticos.

| Señal | Regla |
|---|---|
| Bordes verticales densos | Una banda con muchas transiciones horizontales de alto contraste entre filas de texto |
| Fila de texto | Entre 8 y 40 cambios de luminancia en un rango estrecho de filas |
| Falso positivo aceptable | Una escena con muchas líneas verticales (persianas, código) puede marcarse: se regenera, cuesta una imagen y no rompe nada |

| Constante | Valor |
|---|---|
| Muestreo | 32×96 en escala de grises (el mismo del inspector de dípticos) |
| Cambio que cuenta | Salto de luma ≥ 45 entre píxeles vecinos |
| Fila de texto | ≥ 6 cambios en una fila |
| Banda de texto | ≥ 3 filas consecutivas con esa densidad |
| Zona | Todo el frame, sin excluir bordes |

## Coste

**Sin cambios en las unidades.** El guardia de dípticos sigue gastando una imagen extra por rechazo (0,04). Con el guardia de texto retirado, una historia de 15 s vuelve a costar **0,16 en keyframes** en vez de 0,36.

| Caso | Coste |
|---|---|
| Historia 15 s con 1 secundario | 0,04 + keyframes + vídeo, igual que 012 |
| Un keyframe rechazado por texto | +0,04 |

## Archivos

```text
server/story/story-prompt-composer.ts   prompts positivos, keyframe y vídeo
server/story/shot-keyframe-orchestrator.ts  referencia propia por personaje
server/story/text-in-frame.ts           heurística pura (nuevo)
server/story/keyframe-text-inspector.ts muestreo FFmpeg (nuevo)
server/story/reel-reconciler.ts         guardia antes del vídeo
server/story/runtime.ts                 cableado del inspector
```

## Test plan

| Archivo | Casos |
|---|---|
| `story-prompt-composer.spec.ts` | Ninguna prohibición en keyframe ni vídeo; orden sujeto→entorno→cámara; pantalla descrita en positivo |
| `story-video-prompt.spec.ts` | Solo movimiento; sin localización, hora ni clima; un solo movimiento de cámara |
| `text-in-frame.spec.ts` | Fila de texto detectada; escena limpia aceptada; muestra pequeña ignorada; persianas aceptadas como falso positivo conocido |
| `story-reel-worker.spec.ts` | Keyframe con texto vuelve a `KEYFRAME_QUEUED`; el vídeo no se envía; el contador de intentos sube |
| Regresión 004–012 | Sin cambios de contrato en 004, 008 ni 012 |

## Fuera de alcance

- Cambiar de modelo o de proveedor de imagen.
- Añadir `negative_prompt` donde el proveedor no lo tiene.
- OCR real con dependencia nueva: la heurística es suficiente y no añade binarios.
- Reescritura del director de planos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los prompts positivos son más largos y no caben en 900 | Escalera de degradación existente; el bloque de foco nunca se recorta |
| La heurística de texto da falsos positivos con código en pantalla | Se regenera una imagen (0,04); el evento queda registrado para medirlo |
| Quitar la localización del prompt de vídeo puede relajar la continuidad | Se sustituye por frases de continuidad positivas; se mide en el smoke |

## Fases

1. `text-in-frame.ts` + inspector + tests.
2. Guardia en el reconciliador + tests.
3. Prompts de keyframe en positivo + tests.
4. Prompts de vídeo de movimiento + tests.
5. Referencia propia por personaje en el orquestador + test.
6. Gate completo y una historia real de 15 s (0,36 USD) para comparar con `ebddcea6`.

## Resultado medido (2026-10-24)

Dos historias reales, `budget` 15 s, `papercraft`, mismas premisas.

| Métrica | Antes (012) `ebddcea6` | Después (013) `9d241a89` |
|---|---|---|
| Titular inventado en pantalla | **Sí**: `WHO STOLE MY ARTICLE?` + 2 bocadillos en inglés | **No** |
| Titular inventado en pantalla (2.ª carrera) | **Sí**: `¡Un administrador excesivo descubre que su popono...!` | **No** |
| Logo quemado | `CaféAndCode` en la mesa | **No** |
| Planos con texto detectable | 4 de 4 | 1 de 4, y es una etiqueta técnica pequeña (`DEVICE Q003`) |
| Regeneraciones automáticas | 0 (no había guardia) | 2 (planos 2 y 3) |
| Coste de keyframes | 0,32 | 0,48 (4 + 2 regeneraciones) |

El guardia de texto se ejecutó en producción real: `reel.keyframe.text-detected` dos veces, ambas con regeneración correcta y sin pagar vídeo.

**Conclusión:** el diagnóstico de la documentación oficial era correcto. Las prohibiciones en el prompt positivo activaban el concepto que se quería evitar.

**Deuda declarada:** el detector marca texturas finas de alta frecuencia (etiquetas, rejillas de rack). Aceptable: cuesta una imagen y nunca rompe la historia.

## Bugs encontrados durante la validación real

La prueba end-to-end con vídeo destapó dos fallos de estado que la suite no cubría. Ambos ocurrieron con una historia real (`9d241a89`), no en un test.

| Bug | Síntoma | Causa | Arreglo |
|---|---|---|---|
| **Plano atascado sin salida** | El plano 3 quedó en `KEYFRAME_QUEUED` con `requestId = null` y `attempts = 2`, y la historia nunca salió de `GENERATING_VIDEOS` | `processKeyframeShot` hacía `return` cuando `attempts >= 2` sin cerrar el plano | Se marca `KEYFRAME_FAILED` y se emite `reel.keyframe.failed` |
| **Rechazo en la fase de vídeos** | El guardia de texto devolvió un plano a `KEYFRAME_QUEUED` cuando la historia ya estaba en `GENERATING_VIDEOS`, y nadie lo reconstruía | `processKeyframeShot` solo se invoca desde la fase de keyframes | `rebuildPendingKeyframes` al final de cada tick de vídeo |
| **Intentos insuficientes** | Un rechazo automático consumía el presupuesto completo y el plano moría sin segundas | El tope de 2 se fijó antes de existir los guardias | `KEYFRAME_MAX_ATTEMPTS = 3` (0,12 USD peor caso) |

| Regla | Contrato |
|---|---|
| Sin estados colgados | Un plano MUST NOT quedarse en un estado activo sin trabajo en vuelo. Si no quedan intentos, MUST cerrarse como fallido |
| Recuperación entre fases | La fase de vídeos MUST reconstruir los planos que la fase de keyframes dejó pendientes |
| Presupuesto de intentos | El tope MUST contar tanto los fallos del proveedor como los rechazos de los guardias |

Cada arreglo tiene un test que se verificó **en ambos sentidos**: falla sin el arreglo y pasa con él. Se comprobó revirtiendo temporalmente el cambio.

## Enmienda — el guardia de texto se retira (2026-10-24)

La heurística de texto **no se implanta**. Se midió dos veces sobre la misma familia de imágenes y no separa los casos:

| Muestra | Contenido real | 128×384 | 160×480 | 192×576 |
|---|---|---|---|---|
| Plano general con monitor de neón | **Sin texto** | 17 filas | 0 | 0 |
| Plano general limpio | Sin texto | 0 | 0 | 0 |
| Plano con titular inventado | **Con texto** | 4 filas | 0 | 0 |
| Escena low-poly limpia | Sin texto | 0 | 0 | 0 |

No existe umbral que acepte el monitor de neón y rechace el titular: **la geometría de neón y las líneas de texto producen la misma señal** en escala de grises a cualquier resolución.

| Decisión | Contrato |
|---|---|
| Retirada | `text-in-frame.ts`, `keyframe-text-inspector.ts` y su test MUST eliminarse. El reconciliador MUST NOT inspeccionar texto |
| Lo que queda | El guardia de **dípticos** sigue activo: se validó con datos reales y nunca dio un falso positivo |
| Coste | Una historia de 15 s vuelve a costar ~0,16 USD de keyframes en vez de 0,36 |
| Alternativa futura | OCR real (tesseract) o un modelo de visión. Ninguno entra sin spec propia y presupuesto |

**Por qué se retira en vez de aflojarse:** un guardia que no distingue texto de decoración gasta dinero en regeneraciones correctas y no protege de nada. La medida de que costaba el doble (9 imágenes para 4 planos) es la prueba.

Lo que **sí** resolvió el problema real sigue en pie: los prompts en positivo. El texto inventado pasó de 4 de 4 planos a 0 de 4 en las imágenes finales.

## Validación end-to-end (2026-10-24) — primer MP4 completo

Historia `bf1ffb3f`: 15 s, `budget`, `papercraft`, 4 planos, Ionias desde el avatar y Pixel generado.

| Métrica | Valor |
|---|---|
| Keyframes | **4 imágenes, un intento cada uno** (0,16 USD). Con el guardia de texto eran 9 |
| Vídeos | 4 de 4 en el primer intento (1,40 USD) |
| Montaje | 15,0 s exactos, 720×1280, 30 fps, h264 |
| Coste total | **1,56 USD** |
| Consistencia de Ionias | Correcta en los cuatro planos |
| Movimiento | Real: camina, gira, cambia de postura |

### Hallazgo: el vídeo inventa texto que el keyframe no tenía

Los keyframes salieron limpios, pero el modelo de vídeo **añade rótulos al animar pantallas**: titulares en español sobre el monitor, un cartel `UNPUBLISHED` y subtítulos quemados. MiniMax asume que un monitor debe mostrar algo y lo inventa.

| Regla | Contrato |
|---|---|
| El guardia de texto no se reimplanta en el keyframe | El keyframe ya estaba limpio; el texto aparece **después**, en el vídeo |
| Ataque en el prompt de vídeo | El prompt de movimiento MUST nombrar que las pantallas siguen como en el primer frame. Pendiente de medir |
| Alternativa si el prompt no basta | Elegir escenas sin pantallas, o cambiar de motor de vídeo. Ninguna entra sin spec y presupuesto |

**Estado:** 013 queda `Implemented`, no `Validated`. El pipeline completo funciona y está medido; el texto inventado por el motor de vídeo es deuda declarada, no un fallo oculto.

## El texto del vídeo: resuelto con una frase en positivo (2026-10-24)

El MP4 completo (`bf1ffb3f`) salió con titulares inventados sobre el monitor aunque los keyframes estaban limpios. La causa: el motor de vídeo reescribe cualquier pantalla que anime.

Ni MiniMax ni Kling exponen un canal negativo útil (comprobado en sus esquemas OpenAPI). La solución fue la misma que en imagen: **describir el estado deseado**.

> *"Every screen and surface keeps exactly the image it has in the first frame, unchanged, static and blank where it was blank."*

| Prueba | Plano | Resultado |
|---|---|---|
| Sin la frase (historia `bf1ffb3f`) | 2 | Titulares en español, cartel `UNPUBLISHED`, subtítulos quemados |
| Con la frase (sonda directa, 0,28 USD) | 1 | **Cero texto**; la pantalla queda idéntica los 6 s; movimiento suave y coherente |

| Regla | Contrato |
|---|---|
| Frase de superficie | `VIDEO_STAGE_BLOCK` MUST nombrar que las pantallas conservan la imagen del primer frame |
| En positivo | MUST NOT introducir prohibiciones: los motores de vídeo no tienen canal negativo fiable |
| Sin coste oculto | La frase sustituye al silencio, no añade una llamada |

## Pantallas ilegibles en lugar de blancas (2026-10-24)

La primera frase pedía pantallas **en blanco**. El humano corrigió el objetivo durante la validación:

> *"No tiene que leerse claramente, porque para eso tenemos la capa de gráficos. No sé si me entiendes."*

Tiene razón y cambia el diseño: una pantalla en blanco parece un error de render; una pantalla con contenido ilegible parece un monitor encendido. Y el texto real pertenecerá a la **capa de gráficos** (spec 015), no al modelo.

| Frase | Resultado medido |
|---|---|
| `blank where it was blank` | Cero texto, pero la pantalla queda vacía y artificial |
| `abstract unreadable content: colour blocks, soft bars, blurry shapes, letters that never resolve into words` | Formas, rejillas y barras de color **sin palabras legibles**. Es el estado elegido |

**Hallazgo del mismo experimento:** con `one slow camera move`, el modelo barrió la cámara hacia la ventana y **perdió al sujeto los últimos 3 segundos**. El movimiento de cámara es tan inventable como el texto.

## Estado final de 013

| Pieza | Estado |
|---|---|
| Prompts de keyframe en positivo | **Implementado** |
| Prompt de vídeo solo de movimiento | **Implementado** |
| Pantallas abstractas ilegibles | **Implementado**, medido en sonda real |
| Guardia de texto en el keyframe | **Retirado** (no distingue neón de texto) |
| Guardia de dípticos | **Activo** (validado, nunca dio falso positivo) |
| Tres bugs de estado | **Cerrados** con test verificado en ambos sentidos |
| Cámara quieta por defecto | **Pendiente de aplicar en código** (ver deuda) |

### Deuda declarada

| Deuda | Impacto | Coste de cierre |
|---|---|---|
| `one slow camera move` sigue en el bloque de vídeo y provoca barridos no pedidos | Medio: medio plano perdido en una de cada tres pruebas | Cambiar el texto y medir en una sola tirada (0,28) |
| El texto puede aparecer cuando el encuadre enfoca el monitor de cerca | Medio: depende de la escena | Elegir planos que no enfoquen la pantalla, o cambiar de motor |
| La calidad visual es la del modelo | Alto: no es un bug | Fuera de esta spec: depende del motor y de la capa de gráficos |

**013 queda `Implemented`, no `Validated`.** La validación real cubre claveframes, vídeo y montaje; la calidad visual y el control fino de cámara siguen abiertos.

## Enmienda de 008 — el tope de intentos de keyframe pasa de 2 a 3 (2026-10-24)

Esta spec sube `KEYFRAME_MAX_ATTEMPTS` de 2 a 3. **Supersede el FR-561/604 de 008**, que fijaba el tope en 2 para todos los perfiles.

| # | Contrato anterior | Origen | Contrato nuevo |
|---|---|---|---|
| 1 | `keyframeAttempts` va de 0 a 2; **no puede existir un tercer intento en ningún perfil** | 008 FR-561/604 | **Tres intentos** en todos los perfiles, contando fallos del proveedor **y** rechazos de los guardias automáticos |
| 2 | Un plano con 2 intentos es terminal | 008 | Un plano con 3 intentos es terminal |

| Regla | Contrato |
|---|---|
| Motivo | El guardia de dípticos consume un intento cada vez que rechaza una imagen. Con dos, un plano cuyo primer envío falló por el proveedor moría al primer rechazo del guardia |
| Coste | Peor caso por plano: 3 × 0,08 = **0,24 USD**, no 0,12. El guardián lo impide antes de enviar |
| Error honesto | Al agotar, el plano queda `KEYFRAME_FAILED` con `provider-invalid-output`. `POST …/keyframe` devuelve 409 `keyframe-limit-reached` |
| Deuda | El servicio y la UI siguen mostrando el tope de 2 en su copy. Se corrige en el cierre, no cambia el comportamiento del motor |
