# Análisis comparativo: reel «Mientras yo dormía» (hecho a mano) vs. AI Shorts

**Fecha:** 2026-10-26
**Material analizado:** `examples/informe-reel-cafeandcode/` (`INFORME.md`, `scripts/montar.py`, `scripts/subs.ass`, `clips/`, `imagenes_partida/`, `final/`)
**Estado:** análisis previo a spec. **No se ha modificado código.**
**Coste de este análisis:** 0 USD (solo lecturas locales y consulta de esquemas públicos de fal.ai).

---

## 0. Resumen ejecutivo

El reel hecho a mano dura **33,4 s**, se ve **coherente de principio a fin** y costó **2,36 USD**. Nuestra última historia completa dura 30 s, costó **2,15 USD** y **no se entiende**.

La diferencia no es de modelo: **es de estructura narrativa**. Ellos tienen 6 mensajes de diálogo que cuentan una historia con un remate. Nosotros tenemos 12 descripciones visuales sin conflicto.

Pero hay una diferencia de diseño aún más importante, y es la que explica casi todo el resto:

> **Ellos hacen 5 clips y sacan 7 planos de ellos. Nosotros hacemos 12 clips para 12 planos.**

Eso significa que pagan **1,50 USD por 5 clips** y nosotros **1,60 USD por 12**. Su dinero compra clips de 5 y 10 segundos **usados enteros**; el nuestro compra clips de 6 s **usados a 2 s**. Lo mismo que la 014 acaba de empezar a arreglar, pero llevado hasta el final.

**Hay tres cosas del informe que chocan frontalmente con decisiones que ya tomamos**, y una de ellas es un acierto que deberíamos copiar de inmediato:

| # | Hallazgo | Naturaleza |
|---|---|---|
| 1 | **Una historia tiene 6-8 frases, no 12 escenas** | Choca con el perfil `shotCount` de 008 |
| 2 | **Un clip sirve para dos planos** (reutilización) | Choca con "un plano = un clip" de 008 |
| 3 | **Diálogo entre personajes** con voces distintas | Choca con "solo narrador en off" de 014 |
| 4 | **Subtítulo con palabra clave en color** | No elegido antes; mejora directa de calidad percibida |
| 5 | **Tarjetas de texto sólidas** (transición, remate, cierre) | No elegido antes; *gratis* y muy vistoso |

Los cinco son decisiones de producto, no técnicas. Ninguno requiere proveedor nuevo.

---

## 1. Fase por fase: cómo lo hace el informe y cómo lo hacemos nosotros

### 1.1 Guion

**El informe:** parte de un post real del blog. DeepSeek destila 6 frases de diálogo con una estructura clásica: **petición → respuesta literal → consecuencia cómica → remate**. Cada frase dura lo que tarda en decirse. Hay una lección explícita al final («que no te pregunte no significa que no te cuente»).

**Nuestra app hoy:** `server/story/narrative-prompt.ts` pide un canon (personajes, lugares, props) y luego N beats con `storyFunction` (`hook|complication|escalation|twist|payoff`), `action` (120-400 car.), `narration` (10-140) y ahora `stake` (12-120, añadido ayer en E1).

**El problema concreto:** el campo que debería llevar la historia es `narration`, y su prompt lo define como *"texto en pantalla: no hay audio, no hay voz, no hay música"*. **El guion está escrito para un vídeo mudo.** Con `spokenLine` (014) ya podemos escribir frases hablables, pero **el prompt del director todavía no está pensado para eso**.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Unidad | 6 frases de diálogo | 12 beats narrativos |
| ¿Hay conflicto? | Sí, explícito y con remate | `stake` lo pide desde ayer, sin probar |
| ¿Hay lección? | Sí, tarjeta final | No existe el concepto |
| ¿Quién habla? | Dos personajes | Nadie (narración en off, 014) |
| Longitud del guion | ~190 caracteres de diálogo | ~400 caracteres por beat × 12 |

**Naturaleza:** **distinto**, y es la raíz de que no se entienda.

---

### 1.2 Plan de planos

**El informe:** una tabla de 10 segmentos con `(fuente, inicio_en_fuente, duración, voz)`. Los segmentos 1, 2, 4, 5, 6, 7, 8 salen de **5 clips**:

```
s1 ← plano1.mp4 (0,0 s, 5,0 s)
s2 ← p2.mp4      (0,6 s, 2,4 s)
s4 ← p4.mp4      (0,0 s, 2,3 s)   ┐ mismo clip
s6 ← p4.mp4      (2,6 s, 1,9 s)   ┘ en dos cortes
s5 ← p5.mp4      (0,0 s, 3,0 s)   ┐ mismo clip de 10 s
s7 ← p5.mp4      (5,0 s, 3,6 s)   ┘ en dos cortes
s8 ← p8.mp4      (0,6 s, 4,2 s)
```

**Nuestro sistema:** `server/story/reel-plan-adapter.ts`. Con el perfil `standard` 30 s pide `shotCount` 9–12; el adaptador coge el máximo (**12 planos**), reparte la duración total a partes iguales (`allocateDurations`: 24 ÷ 12 = **2 s**) y **genera 12 clips**.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Clips generados | **5** | **12** |
| Planos en el vídeo | 7 de clips + 3 de montaje | 12 |
| Duración de plano | 1,8–4,2 s (la que pide la frase) | 2 s fijos |
| Reutilización | **sí, explícita** | no |
| Recorte | se elige el inicio (`-ss`) | se recorta el final |

**Naturaleza:** **distinto, y es el segundo motivo del coste y de la calidad**. La 014 ya introduce `planStoryTime`, que hace que el motor decida (3 clips de 10 s para 30 s). **Pero no contempla reutilizar un clip en dos planos.**

---

### 1.3 Imágenes de partida

**El informe:** `fal-ai/nano-banana/edit` con `image_urls` (2 referencias) y `aspect_ratio: "9:16"`. Salida **768×1344**. Encadena referencias: la primera usa la ilustración de los personajes + la habitación del post; las siguientes usan **la imagen del plano 1 como referencia de escena**. Patrones de prompt: *«in the exact style of…»*, *«the same man from both images»*, *«exactly one person»*, encuadre explícito, luz al final.

**Nuestra app:** `server/fal/adapters/nano-banana-adapter.ts` usa **el mismo endpoint**, `image_urls`, `aspect_ratio: '9:16'`, `output_format: 'jpeg'`. Referencias: hasta 3 (`protagonista + secundarios presentes`), más las referencias por personaje de la spec 012.

**Lo que tenemos igual:** el endpoint, el ratio, el mecanismo de referencias, la regla de "una referencia por plano" (011), el rechazo de keyframes con varias viñetas (`KeyframeLayoutInspector`).

**Lo que tenemos distinto:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| **Encadenado de escena** | usa la imagen del plano 1 como referencia | **no existe** |
| Resolución de salida | 768×1344 | 9:16 con la que responda |
| «exactly one person» | explícito en cada prompt | añadido ayer en E6, **sin probar** |
| Referencias | 2 (personajes + escena) | hasta 3 personajes, **sin referencia de escena** |

**Naturaleza:** **falta el encadenado de escena.** Es el truco que mantiene habitación, luz y estilo entre planos. Nosotros dependemos de que el bloque de estilo y la localización basten, y ya vimos que no.

---

### 1.4 Animación

**El informe:** `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`, `image_url` + `duration: "5" | "10"`, `cfg_scale` 0,5 por defecto. Salida **1088×1904 sin audio**, 75–95 s de cola. Prompts que **empiezan por «same style and character»** y describen **una acción en dos tiempos** para que un clip se parta en dos planos.

**Nuestra app:** motor elegido por preset en `shot-video-orchestrator.ts`: `fast → minimax-hailuo-02`, `quality → kling-2.5-turbo-pro`. `durationFor()` normaliza la duración a la del motor.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Motor | Kling 2.5 Turbo Pro **siempre** | MiniMax por defecto (`fast`) |
| Duración pedida | la que durará el plano | la del motor, recortando después |
| Prompt | acción en dos tiempos | acción continua (E3, ayer) |
| `negative_prompt` | no lo usa | **sí** en Kling |
| Cola | 75–95 s | gestionada con leases y reconciliador |

**Naturaleza:** **distinto en el motor y en el uso del clip**. Ellos pagan 0,35 USD por un clip de 5 s y lo usan entero. Nosotros pagamos 0,27 por uno de 6 s y usamos 2.

---

### 1.5 Voces

**El informe:** `fal-ai/elevenlabs/tts/multilingual-v2`. **Una petición por personaje**, con todas sus frases separadas por `... ...`. Después, `silencedetect` parte el MP3 en frases. Efecto de voz en la perra: `asetrate=48000*1.04,aresample=48000,atempo=0.97,highpass=f=120`.

**Nuestra app (014, en curso):** `fal-ai/elevenlabs/tts/turbo-v2.5`, **una síntesis por escena**, medición con ffprobe para confirmar la duración.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Modelo | multilingual-v2 (0,10/1k) | turbo-v2.5 (0,05/1k) |
| Peticiones | **1 por personaje** (2 en total) | **1 por escena** (5-12) |
| Corte en frases | `silencedetect` | no hace falta |
| Voces distintas | sí (Will, Laura) | un solo narrador |
| Efecto de personaje | sí (Farai) | no |

**Hallazgo importante:** **ellos hacen 2 llamadas de TTS. Nosotros haremos 5-12.** Su técnica de `silencedetect` es más barata y da control fino del ritmo. **Es mejor que lo nuestro por 014**, siempre que haya un solo hablante por pista.

**Naturaleza:** **distinto y peor en el nuestro** para el caso de diálogo. Para narrador único, el nuestro es equivalente pero más caro en llamadas.

---

### 1.6 Montaje

**El informe:** el hallazgo más valioso del documento.

> ❌ `concat` demuxer + `-c copy`: algunos reproductores perdían el audio tras la transición.
> ❌ `concat` demuxer + `fps=30,setpts=N/30/TB`: **se perdieron fotogramas (673 de 1001)** y se rompió la sincronía.
> ✅ **Filtro `concat`** reseteando timestamps por entrada, y **verificar contando fotogramas**.

**Nuestra app:** `server/story/shot-assembly-service.ts` normaliza cada clip a 720×1280 e **une con el demuxer `concat` y `-c copy`**:

```ts
await this.runFfmpeg(['-f','concat','-safe','0','-i',listPath,'-c','copy',...])
```

**Diferencia: este es un fallo latente real.**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Unión | **filtro concat**, timestamps reseteados | **demuxer concat + -c copy** |
| Verificación de fotogramas | **obligatoria** (`-count_frames`) | solo duración |
| Resolución | 1080×1920 | 720×1280 |

**Los clips que descargamos vienen de motores distintos y pueden tener timebases distintas.** El informe documenta que con `-c copy` se pierden fotogramas y se desincroniza el audio. **Hoy no lo notamos porque no hay audio.** **En cuanto 014 meta voz, este fallo aparecerá.**

**Naturaleza:** **falta**, aunque **probado en nuestro caso el 2026-10-26 y no falla**.

**Comprobación hecha:** normalicé dos clips del propio ZIP (p2 y p5, de 2 y 2,5 s) con nuestro mismo filtro (`scale/crop/setsar/fps`) y los uní con `-c copy`. Resultado: **135 fotogramas de 135 esperados**, duración exacta 4,5 s. También con 3 clips sintéticos: 540 de 540.

**Por qué no falla en nuestro caso:** los clips se **renormalizan a un perfil idéntico** antes de unirlos (`libx264`, `30 fps`, `yuv420p`, `setsar=1`, sin audio). El informe falló porque unía **segmentos de orígenes distintos** (clips de vídeo + imágenes con `zoompan` + tarjetas de color), cada uno con su timebase.

**Conclusión:** **no es urgente portarlo a `-c copy`**, pero **sí conviene añadir la verificación por fotogramas**, porque es lo único que detectaría el fallo si algún día metemos segmentos sintéticos (tarjetas de C4).

---

### 1.7 Subtítulos

**El informe:** ASS con libass, fuente **Inter ExtraBold**, 1080×1920, `WrapStyle: 0`. Seis estilos distintos:

| Estilo | Uso | Tamaño | Detalle |
|---|---|---|---|
| `Sub` | diálogo | 78 px | blanco, borde negro 7, sombra 3, `MarginV 430` |
| `Hook` | gancho inicial | 66 px | blanco sobre caja café, arriba |
| `Card` | «A la mañana siguiente…» | 84 px | centrado |
| `Lesson` | remate | 104 px | café sobre crema, última línea naranja |
| `Brand` / `Small` / `Small2` | cierre | 52-104 px | `\pos` absoluto |

**Palabras clave en color** dentro del subtítulo: `{\c&H006EC7&}no te pares{\c&HFFFFFF&}`.

**Nuestra app (014, en curso):** `captions-plan.ts` + `captions-render.ts`. **Un solo estilo** (`Caption`), 44 px, dos líneas máximo, sin énfasis, sin posiciones absolutas. Y los gráficos de 015 (título, terminal, badge) van **por separado**, en el mismo pase.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Estilos | **6 con propósito narrativo** | 1 genérico |
| Énfasis de palabras | **sí, color** | no |
| Tarjetas de texto | sí (transición, remate, cierre) | gráficos de 015, más simples |
| Resolución base | 1080×1920 | 720×1280 |

**Naturaleza:** **distinto, y el nuestro es claramente inferior en impacto.** El énfasis en color es lo que hace que un subtítulo se lea de un vistazo. **Es gratis.**

---

### 1.8 Audio y mezcla

**El informe:** por frase, `atrim` con 0,05 s antes y 0,12 s después, `adelay` al inicio del segmento + retardo, `volume=2.0`, efecto de personaje. Ambiente `anoisesrc` marrón a `amplitude=0.003` y `lowpass=f=600` para que no haya silencio digital. `amix normalize=0` y `loudnorm I=-14:TP=-1.5:LRA=11`, `afade` de salida. Salida AAC 160 k a 48 kHz.

**Nuestra app (014, en curso):** `audio-mux.ts`, un solo pase con `loudnorm I=-14:TP=-1:LRA=11`, AAC 96 k a 48 kHz.

**Diferencia:**

| Aspecto | Informe | Nosotros |
|---|---|---|
| Ambiente | **`anoisesrc` marrón** | no |
| Bitrate de audio | 160 k | 96 k |
| Retardos por frase | sí, milimétricos | inicio de escena |
| Efecto de personaje | sí | no |

**Naturaleza:** **falta el ambiente**, y es un detalle que cambia mucho la percepción de «hecho con cuidado» frente a «generado». **Cuesta cero.**

---

### 1.9 Verificación

**El informe:** contar fotogramas (`ffprobe -count_frames`) y comprobar `fotogramas == round(suma(duraciones) × 30)`; medir LUFS.

**Nuestra app:** `probeAndVerify` comprueba **solo duración**, con tolerancia que crece con el número de clips (`min(1, n × 0,05)`).

**Diferencia:** **falta la verificación de fotogramas**, que es justo lo que detecta el fallo de concatenación.

---

## 2. Tabla de diferencias consolidadas

| # | Elemento | Estado |
|---|---|---|
| 1 | Endpoint de imagen (nano-banana/edit) | ✅ **igual** |
| 2 | Ratio 9:16 en imágenes | ✅ **igual** |
| 3 | Referencias por personaje | ✅ **igual** |
| 4 | Imagen → vídeo (keyframe-first) | ✅ **igual** |
| 5 | Máquina de estados, leases, reintentos | ✅ **mejor que el informe** |
| 6 | Coste guardado antes de gastar | ✅ **mejor que el informe** |
| 7 | **Encadenado de escena entre planos** | ❌ **falta** |
| 8 | **Reutilizar un clip en dos planos** | ❌ **falta** |
| 9 | **Guion de 6 frases con remate** | ❌ **falta** |
| 10 | **Tarjetas de texto** (transición, remate, cierre) | ❌ **falta** |
| 11 | **Énfasis en color de palabras clave** | ❌ **falta** |
| 12 | **Ambiente de fondo** | ❌ **falta** |
| 13 | Filtro concat en vez de `-c copy` | ✅ **no hace falta**: probado que no falla con clips normalizados |
| 14 | **Verificación por fotogramas** | ❌ **falta** |
| 15 | TTS por personaje con `silencedetect` | ⚠️ **distinto** |
| 16 | Resolución 1080×1920 | ⚠️ **distinto** (720×1280) |
| 17 | Diálogo entre dos personajes | ⚠️ **choca con 014** |

---

## 3. Choques con decisiones anteriores

### 3.1 «Solo narrador en off, sin diálogo» (spec 014, aprobada ayer)

**El informe hace diálogo entre dos personajes** con dos voces distintas y efecto de voz por personaje.

**La decisión de la 014 fue mía y con motivo:** el lip-sync fiable no existe, y una boca que no coincide se lee como error.

**Pero el informe demuestra que se puede hacer** sin sync: la perrita **no tiene boca** (es un robot), y Ion habla en planos donde **no se ve claramente la boca** o se acepta el desfase. El propio informe lo dice: *"la boca de Ion se mueve sin sincronía labial exacta, algo aceptable en este formato"*.

**Lectura:** no hay que cambiar la 014, pero **sí ampliarla**. La voz en off sigue siendo el caso base; el diálogo es una **variante** que funciona cuando el personaje que habla no muestra la boca o cuando el formato lo tolera.

### 3.2 «Una referencia por plano» (spec 011, enmienda)

**El informe pasa 2 referencias** en cada imagen: personajes **+ escena**.

**Nuestra regla** nació porque una rejilla 2×2 devolvía dípticos. Pero la regla dice *"una imagen de personaje"*, no *"una imagen en total"*. **Una referencia de personaje + una referencia de escena son roles distintos**, y el informe demuestra que funciona.

**Lectura:** la enmienda de 011 debe precisar que el límite es **de referencias de personaje**, no de imágenes.

### 3.3 «Planos = clips» (spec 008)

**El informe reutiliza clips** para dos planos, y lo llama *"truco de ahorro"*.

**Nuestra 008 asume un clip por plano.** La 014 (en curso) reduce el número de clips, pero sigue asumiendo uno por plano.

**Lectura:** hay que separar **`Clip`** (lo que se paga) de **`Shot`** (lo que se ve). Un clip puede alimentar varios shots con distintos `trim{start, duration}`. Es exactamente el modelo de datos que propone el informe.

### 3.4 «Duración desde el motor» (014, ayer)

**No hay choque, hay confirmación.** El informe pide clips de 5 o 10 s porque son los que hay, y usa lo que duran. **Es el mismo principio que `planShotTime`**, pero ellos lo aplican también a la reutilización.

---

## 4. Verificación de endpoints y parámetros contra el esquema real

Consultados el **2026-10-26** en `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`. Los cuatro responden **200**.

| Endpoint del informe | Existe | Parámetros verificados |
|---|---|---|
| `fal-ai/nano-banana/edit` | ✅ | `prompt`, `image_urls`, `aspect_ratio`, `num_images`, `output_format`, `seed`, `sync_mode`, `safety_tolerance`, `limit_generations` |
| `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | ✅ | `prompt`, `image_url`, `duration` (enum **`["5","10"]`**), `cfg_scale` (def. 0,5), `negative_prompt`, `tail_image_url`, `enable_safety_checker` |
| `fal-ai/elevenlabs/tts/multilingual-v2` | ✅ | `text`, `voice`, `language_code`, `stability`, `similarity_boost`, `style`, `speed`, `timestamps`, `apply_text_normalization`, `previous_text`, `next_text` |
| `fal-ai/elevenlabs/tts/turbo-v2.5` | ✅ | idénticos al anterior |

**Discrepancias encontradas en el informe:**

| Punto del informe | Realidad verificada |
|---|---|
| «Kling salida 1088×1904» | **coincide** con los clips del ZIP (verificado con ffprobe) |
| «nano-banana salida 768×1344» | el esquema **no fija resolución de salida**; depende de `aspect_ratio`. El valor es lo que devolvió **su** llamada, no un contrato |
| «`duration: "5"` o `"10"`» | ✅ **confirmado** (strings, no números) |
| «desactivar streaming para obtener MP3» | `turbo-v2.5` y `multilingual-v2` **no tienen parámetro de streaming** en el esquema. El MP3 es la salida por defecto |
| «ElevenLabs 0,10 \$/1000 caracteres» | **no verificado en esta sesión**; el informe avisa de que hay que comprobarlo |
| «Kling 0,35 \$ (5 s) / 0,70 \$ (10 s)» | coincide con nuestra ficha `engine-capabilities.ts` (`costPerSecondUsd: 0.07`, 5 s → 0,35) |

**Uno que conviene corregir en nuestra ficha:** el informe afirma que Kling 2.5 Pro **sí tiene `negative_prompt`** y lo verifica el esquema. **Nuestra `engine-capabilities` lo tiene listado** (`inputs: [..., 'negative-prompt']`), así que estamos bien.

---

## 5. Orden propuesto de cambios, por impacto en calidad

Ordenado por **impacto visible ÷ coste**. Ninguno requiere proveedor nuevo.

### Nivel 1 — Gratis y cambia todo (código puro)

| # | Cambio | Por qué | Coste por vídeo |
|---|---|---|---|
| **C1** | **Verificación por fotogramas** (el filtro `concat` **no hace falta**: probado que `-c copy` funciona con clips normalizados) | Es lo único que detectaría una pérdida de fotogramas si entran segmentos sintéticos (tarjetas de C4) | **0** |
| **C2** | **Reutilizar un clip en dos planos** (`trim{start,duration}`) | 5 clips en vez de 12 para el mismo vídeo. **−60 % de coste de vídeo** | **0** (−1,05) |
| **C3** | **Énfasis en color de palabras clave** en el subtítulo | Lo que hace legible un subtítulo de un vistazo | **0** |
| **C4** | **Tarjetas de texto** (transición, remate, cierre) | Convierte un vídeo en un reel con cierre de marca | **0** |
| **C5** | **Ambiente de fondo** (`anoisesrc` marrón) | Diferencia «generado» de «cuidado» | **0** |

**Total nivel 1: 0 USD de coste nuevo, −1,05 USD de coste por vídeo.**

### Nivel 2 — Cambia el producto, requiere decisión

| # | Cambio | Por qué | Coste por vídeo |
|---|---|---|---|
| **C6** | **Guion de 6-8 frases con remate**, en vez de 12 escenas | La historia se entiende porque tiene estructura, no porque tenga planos | **0** |
| **C7** | **Encadenado de escena**: la imagen del plano 1 es referencia de los demás | Mantiene habitación, luz y estilo | **0** |
| **C8** | **TTS por personaje + `silencedetect`** | 2 llamadas en vez de 5-12. Control fino del ritmo | **−0,01** |
| **C9** | **Diálogo entre dos personajes** | Es lo que hace el informe y es el formato viral | ~+0,02 (una voz más) |

### Nivel 3 — Calidad de imagen, cuesta más

| # | Cambio | Por qué | Coste por vídeo |
|---|---|---|---|
| **C10** | **1080×1920** en lugar de 720×1280 | El informe sale a 1080 y se ve mejor en móvil | **0** (es FFmpeg) o +0 si el motor ya da 1088×1904 |
| **C11** | **Motor Kling siempre** (no MiniMax en `fast`) | El informe solo usa Kling; es la calidad que se ve | **+0,50** aprox. |

---

## 6. Lo que NO copiaría del informe

| Punto del informe | Por qué no |
|---|---|
| `@fal-ai/client` con `fal.subscribe()` | **Bloquea la petición HTTP.** Nuestra arquitectura ya tiene cola, leases y reconciliador, que es superior |
| Modelo de datos `Project/Shot/VoiceTrack/Render` | Es un borrador; el nuestro (Story/Scene/Shot) ya existe y tiene estados |
| `fluent-ffmpeg` | Dependencia nueva sin necesidad: ya lanzamos FFmpeg directamente |
| URLs de WordPress como referencia | En producción hay que subirlas a nuestro storage |
| Guion escrito a mano | El informe lo hizo a mano; nosotros necesitamos que lo escriba DeepSeek |

---

## 7. Lo que propongo para la spec nueva

Una **spec 017: guion, reutilización de clips y acabado de reel**, que cubra C1-C5 (nivel 1, gratis) y deje C6-C9 para decisión explícita.

No propongo tocar 014: está a medio implementar y sus cimientos (voz medida, subtítulos desde la voz, muxeo en un pase) son correctos. **La 017 se apoyaría en ella.**

---

## 8. Lo que necesito que decidas

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | **¿Guion de 6-8 frases con remate?** Cambia el número de escenas de 12 a 6 | **Sí.** Es la causa de que no se entienda |
| 2 | **¿Reutilizar clips entre planos?** | **Sí.** −60 % de coste, sin perder planos |
| 3 | **¿Diálogo o solo narrador?** | **Empezar con narrador** (014), ampliar a diálogo después |
| 4 | **¿Tarjetas de texto y énfasis en color?** | **Sí.** Gratis y muy visible |
| 5 | **¿1080×1920 o 720×1280?** | **1080**, si el tiempo de montaje no se dispara |
| 6 | **¿Añadir verificación de fotogramas?** | **Sí**, pero no por el `concat`: por las tarjetas de texto |

---

## 9. Limitaciones de este análisis

- **No se ha ejecutado ningún montaje** con los cambios propuestos.
- **No se ha medido** el tiempo de encode a 1080×1920 con 12 clips.
- **Los precios de ElevenLabs del informe no se han verificado** contra su página de precios; solo se ha comprobado que el endpoint y sus parámetros existen.
- **La comparación de calidad visual es cualitativa**, hecha mirando el MP4 de referencia y nuestra entrega del 2026-10-25.
- **No se ha medido el impacto real de `-c copy` en nuestros montajes actuales**: el informe documenta el fallo en *su* caso, no en el nuestro. Habría que reproducirlo con nuestros clips.

---

*Análisis preparado el 2026-10-26. Sin cambios en el código. Coste: 0 USD.*
