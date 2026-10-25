# Feature Specification: Voz, subtítulos y duración nacida del guion

**Feature Branch**: `014-story-audio-narration-captions`

**Created**: 2026-10-25

**Status**: `Draft`. Checkpoint 1 pendiente. Sin código antes de la aprobación humana. Este documento **no decide proveedor de TTS, idioma ni formato de subtítulo**: presenta las opciones, recomienda y deja la decisión en la última sección.

**Input**: User description: "La primera historia completa ya sale entera y no se entiende. Comparada con `examples/video4.mp4`, la diferencia no son los prompts: la referencia habla y la nuestra no. Quiero voz en off de narrador, subtítulos que se lean, y que la duración de cada momento salga de la frase que se dice, no de dividir los segundos entre doce planos."

---

## Por qué esta spec existe

El 2026-10-25 el motor cerró la primera historia completa: 12 keyframes, 12 vídeos, montaje, gráficos y entrega, ~2,15 USD. **La cadena funciona; el producto no.** Reproducido el MP4 junto a `examples/video4.mp4`, el diagnóstico no es de estilo ni de prompt: es que la referencia **tiene una voz que cuenta algo** y la nuestra es un pase de diapositivas mudo.

| Fallo (BACKLOG) | Qué se ve | Causa real en el código |
|---|---|---|
| **F1** | El vídeo es mudo | No existe capa de audio: `shot-assembly-service.ts` normaliza cada clip con `-an` y el MP4 final no tiene pista de sonido |
| **F2** | No hay subtítulos | El único texto es el de 015 (`title`, `terminal`, `badge`); no hay capa de captions ni tiempos de voz |
| **F9** | 12 planos de 2 s, cada clip pagado dura 6 s | `allocateDurations()` hace `Math.floor(target / shots)`: la duración **nace de una división**, no del contenido |
| F3 | No se entiende la trama | Guion descriptivo; `stake` de E1 no llega al camino de 008 (ver §3.4) |

La cadena causal que hay que romper:

```text
perfil de coste → nº de planos (12) → 24 s ÷ 12 = 2 s por plano
      → el motor hace clips de 6 s → se paga 6 y se usa 2 → el vídeo no dice nada
```

**Esta spec invierte el orden:** primero se escribe lo que se dice, después se mide cuánto dura decirlo, y el vídeo se dimensiona sobre esa medida. La duración deja de ser una división y pasa a ser una consecuencia.

| Decisión | Contrato |
|---|---|
| **Voz en off de narrador**, no diálogo | Fase 1. Un modelo de vídeo no sincroniza labios de forma fiable; el diálogo con lip-sync es otra spec |
| **El texto audible es exactamente el del guion** | Ni el modelo lo dibuja ni el TTS improvisa: el guion es la fuente única |
| **El subtítulo lo pinta FFmpeg** | `libass`/ASS en local, mismo patrón y mismo motivo que 015: el modelo no sabe escribir y no debe intentarlo |
| **La duración del vídeo la manda la voz** | Estimada al escribir, **medida** con ffprobe después de sintetizar, y el reparto de planos se ajusta a la medida |
| **Coste del audio: céntimos** | 0,01–0,05 USD por historia de 30 s frente a 2,15 USD de vídeo. La razón para no escatimar en voz |

---

## Alcance del MVP

1. **Guion hablable:** una frase por escena que se pueda decir en voz alta, con presupuesto de palabras derivado del tiempo asignado a la escena.
2. **Presupuesto de tiempo antes de escribir:** el servidor reparte los clips que el motor puede producir y le dice al director cuántos segundos y cuántas palabras tiene por escena.
3. **TTS en servidor** por escena, con un `TtsAdapter` de dominio, medición real con ffprobe y una sola reparación acotada.
4. **Reajuste del reparto** de planos a la duración medida, antes de gastar un céntimo en keyframes.
5. **Subtítulos ASS** generados desde los tiempos reales, quemados en el mismo pase que los gráficos de 015.
6. **Mezcla y mux** de la voz sobre el MP4 montado: AAC 48 kHz, −14 LUFS, −1 dBTP.
7. **Entrega**: MP4 con voz y subtítulos, SRT descargable, DTO con el desglose de voz por escena.

**Fuera del MVP:** música, efectos de sonido, diálogo entre personajes, sincronización labial, clonación de voz, traducción, locución multi-idioma, editor de voz en la UI, regenerar el audio de una escena concreta desde la UI.

---

## Decisiones cerradas

| Decisión | Elección | Motivo |
|---|---|---|
| **Quién habla** | Un narrador en off, tercera persona, sin diálogo | Un plano con un personaje moviendo la boca y una voz que no le corresponde se lee como un error, no como una elección. El lip-sync fiable no existe en los motores que usamos |
| **Granularidad de la voz** | **Una síntesis por escena**, no por plano | La escena es la unidad narrativa y ya tiene `narration`; sintetizar por plano multiplicaría llamadas y produciría 12 entonaciones distintas sin frase completa. Los subtítulos sí se reparten por palabra dentro de la escena |
| **Autoridad de la duración** | La voz medida. La estimación solo sirve para escribir | Si la estimación mandase, se recortaría voz real en el montaje, que es peor que un plano corto |
| **Recorte de clips** | Un clip **nunca** se recorta por debajo de su frase. Solo el último plano de la historia puede recortarse para aterrizar en la duración objetivo | Cierra F9: el segundos pagados y los usados dejan de divergir. La excepción del último plano evita pagar 16 s para un reel de 15 |
| **Duración por plano** | Es **exactamente una duración que el motor acepte** (6/10 s MiniMax; 5/10 s Kling) | `durationFor()` ya existe en `engine-capabilities.ts`; el valor no se inventa. Elimina el recorte sistemático |
| **Subtítulos** | ASS quemado por defecto **y** SRT descargable | El vídeo se ve en un feed silenciado; el SRT permite corregir o reutilizar. Ambos salen del mismo texto y los mismos tiempos |
| **Fallo de voz** | Degradación declarada: el vídeo se entrega **sin voz y marcado**, sin subtítulos | Un vídeo mudo es un vídeo; un vídeo con subtítulos inventados o con una voz que no cabe es una mentira |
| **Modo mudo** | Deja de ser el comportamiento. Pasa a ser un interruptor de servidor (`NUXT_STORY_AUDIO_ENABLED`), nunca visible al cliente | Un despliegue con la voz rota debe poder desactivarla sin revertir código, y el cliente no debe poder pedir "sin voz" para saltarse la capa |
| **Historias ya entregadas** | No se reaudio ni se regeneran | Retrofit fuera de alcance: implicaría volver a montar vídeos ya pagados |

---

## 1. Contexto y relación con 004–016

| Spec | Relación con 014 |
|---|---|
| **004 Composer** | Intacta. 014 no toca `server/composer/**`, ni sus rutas, ni sus 605 tests |
| **005 Story Composer** | Aporta rutas, ownership, sesión anónima, idempotencia, leases, lifecycle, presupuesto y montaje. 014 añade un paso entre la planificación y los keyframes y una pista de audio al MP4 |
| **006 Continuidad** | Aporta QC y "nunca un PASS falso". 014 **no** añade QC de audio en el MVP; deja la puerta abierta a un `audio-qc` futuro |
| **007 Modos** | Aporta el canon, el modo `faithful`/`creative` y el compositor. Intacta |
| **008 Reel Engine** | Es el motor sobre el que se actúa. 014 cambia **la autoridad de la duración**, el recuento de planos y el verificador de streams. Máquina de estados, ownership, leases, jobs, reintentos y entrega no se reescriben |
| **010/012 Estilo y referencias** | Intactas: la voz no cambia el look ni la identidad de los personajes |
| **013 Prompts** | Intacta. La voz no se pide al modelo de vídeo. Se prohíbe explícitamente cualquier prompt que pida "hablar" o "mover la boca" |
| **015 Gráficos** | Se reutiliza el patrón (plan puro → argumentos FFmpeg → pase único con degradación declarada). 014 **comparte el pase** de 015 en lugar de añadir otro encode |
| **016 Capacidades de motor** | Se conecta lo que quedó a medias: `planShotDurations()` existe y **no está llamada desde ningún sitio del pipeline**. 014 la pone en el camino crítico |

### 1.1 Lo que se reutiliza tal cual

| Pieza existente | Uso en 014 |
|---|---|
| `server/story/ffmpeg-runner.ts` | Único módulo que lanza procesos. La síntesis, el probe y el mux pasan por él |
| `server/fal/http-client.ts` + allowlists (`FAL_API_ORIGINS`) | El adaptador de TTS es un cliente HTTP más, con endpoint allowlisted |
| `server/fal/media-storage.ts` | Subida de MP4, M4A de voz y SRT con lifecycle de 24 h |
| `server/story/media-downloader.ts` + `assertFalMediaUrl` | Descarga del audio de proveedor a temporal. Necesita extensión y límites propios (ver §9) |
| `server/story/reel-cost.ts` | El audio entra en la estimación y **bajo el mismo cap duro** |
| `server/story/reel-reconciler.ts` + leases | El TTS ocurre dentro del lease de planificación. No hay sistema de exclusión nuevo |
| `server/story/shot-assembly-service.ts` | Se extiende con voz, captions y un verificador que admite una pista de audio |
| `server/story/graphics-painter.ts` | Se convierte en el pase final único (gráficos + captions + audio) |
| `server/story/delivered-file.ts` + `GET /api/story/:id/download` | La entrega sobrevive al borrado del proveedor. 014 añade dos assets |

---

## 2. User scenarios y criterios de aceptación

### US-1 — La historia se entiende sin mirar (P1)

Una persona escribe una premisa, no toca nada y recibe un reel de 30 s con una voz que cuenta el conflicto y subtítulos legibles. Puede verlo en silencio y entenderlo, y puede oírlo sin mirar y entenderlo.

**Test independiente:** `POST /api/story` sin campos nuevos → 201. Al terminar, `GET /api/story/{id}` devuelve `audio.status === 'ready'`, `audio.segments.length === sceneCount`, cada segmento con `text`, `startSeconds`, `endSeconds` y `speechSeconds` > 0, y `captionsUrl` no nulo. El MP4 tiene exactamente una pista de audio AAC 48 kHz y su duración es la del vídeo ±0,2 s.

1. **Given** una historia en `READY` con voz, **When** se inspecciona el MP4, **Then** tiene una pista `aac`, 48 000 Hz, y `audio.status === 'ready'`.
2. **Given** la misma historia, **When** se lee el ASS generado, **Then** cada línea de subtítulo es un fragmento literal de un `spokenLine` del plan, sin una palabra añadida.
3. **Given** el SRT descargado, **When** se compara con los segmentos del DTO, **Then** los tiempos coinciden al centésimo.
4. **Given** la UI de resultado, **When** la voz está lista, **Then** se ofrece descarga del SRT y no aparece ninguna nota de degradación.

### US-2 — La duración sale de la frase (P1)

El plan de 30 s no reparte 24 s entre 12 planos. Reparte 5 clips de 6 s entre 4 escenas, y cada escena recibe un presupuesto de voz (por ejemplo 6, 6, 6 y 12 s). El director escribe una frase por escena que quepa en ese presupuesto. El TTS la mide. Ningún plano se recorta salvo el último, y solo para aterrizar en la duración objetivo.

**Test independiente:** con un stub de TTS que devuelve audios de duración conocida, el plan resultante tiene `Σ shot.durationSeconds === Σ engine.durationSeconds` (sin recortes intermedios), y cada `spokenLine` cumple `estimateSpeechSeconds(line) ≤ sceneBudget − 0,3`.

1. **Given** un perfil `standard` 30 s con `preset: fast`, **When** se planifica, **Then** el reparto son 5 clips de 6 s y `plannedDurationSeconds === 30`.
2. **Given** un clip de 6 s y una escena de 6 s, **When** se monta, **Then** no se recorta ni un fotograma de ese clip y su duración final es 6 s ±0,1.
3. **Given** una escena de 12 s, **When** se reparte en planos, **Then** produce 2 planos de 6 s, nunca 4 de 3.
4. **Given** una frase estimada en 7 s dentro de una escena de 6 s, **When** se valida el plan, **Then** es inválido con motivo `scene-budget-exceeded` y consume la reparación del director, **antes** de llamar al TTS.
5. **Given** una historia de 15 s con `preset: fast` y motor MiniMax, **When** se planifica, **Then** el reparto es 6 + 6 + 3, donde el 3 es el recorte del **último** plano contra una duración objetivo de 15.
6. **Given** una duración pagada de 30 s y una planificada de 30 s, **When** termina el montaje, **Then** `paidSecondsUsedRatio === 1` y el informe de coste lo publica.

### US-3 — Si la voz no llega, se sabe (P1)

El proveedor de TTS devuelve 503 en dos ocasiones. La historia no se bloquea: los keyframes y los vídeos siguen, el MP4 se entrega **sin voz**, sin subtítulos, y la UI lo dice. `audio.status === 'missing'` y `errorCode === 'audio-failed'`. No hay subtítulos inventados ni una pista de audio vacía.

1. **Given** dos fallos consecutivos del TTS en una escena, **When** termina la historia, **Then** `audio.status === 'missing'`, `captionsUrl === null`, `audioUrl === null`, el MP4 no tiene pista de audio y la historia está `READY` con nota.
2. **Given** una historia con `audio.status === 'missing'`, **When** se abre el resultado, **Then** se ve `Este vídeo no tiene voz. El resto está completo.` en un aviso discreto, no en un error rojo.
3. **Given** un TTS que devuelve un archivo que ffprobe no puede leer, **When** se valida, **Then** el error es `audio-invalid`, se reintenta una vez y se degrada como en el caso 1.
4. **Given** `NUXT_STORY_AUDIO_ENABLED=false`, **When** se crea una historia, **Then** no se llama al TTS, `audio.status === 'skipped'` y el MP4 se entrega mudo igual que antes de 014.

### US-4 — La voz no rompe el contrato de duración (P1)

La frase de la escena 3 se mide en 6,7 s cuando el presupuesto era 6. El servidor intenta tres cosas, en este orden: recortar aire de otras escenas, añadir un clip a esa escena si el total no supera el máximo, y reescribir la frase (una vez) con un presupuesto menor. Si ninguna funciona, la historia falla **antes** de pagar keyframes.

1. **Given** una escena medida 0,4 s por encima de su presupuesto y aire suficiente en el total, **When** se reajusta, **Then** la escena crece con el aire disponible y el total no cambia.
2. **Given** una escena que necesita un clip más y el total ya está en el máximo, **When** se reajusta, **Then** se reescribe solo esa frase y se resintetiza solo esa escena.
3. **Given** una segunda medida que sigue sin caber, **When** se cierra, **Then** la historia falla con `audio-too-long` y el coste gastado se reporta tal cual.
4. **Given** un reajuste que añade un clip, **When** se generan keyframes, **Then** el conteo de planos del DTO incluye el nuevo plano y no hay plano huérfano.

---

## 3. Guion hablable

### 3.1 El campo nuevo

`StoryNarrativeScene` gana `spokenLine`: **lo que dice el narrador, literal**. Los tres campos de prosa quedan así:

| Campo | Para qué | Quién lo lee | Longitud |
|---|---|---|---|
| `action` | Lo que se ve y se mueve, en inglés | Prompts de keyframe y vídeo | 120–400 (E3) |
| `narration` | Lo que ocurre, descriptivo, en español | Tarjetas de revisión, terminal de 015, contexto de QC | 10–280 |
| `stake` | Qué está en juego: quién quiere qué y qué pierde | Prompt de vídeo (E1) | 12–120 |
| **`spokenLine`** | **Lo que se oye**, una frase dicha | **TTS, subtítulos, revisión** | **24–140** |

**Por qué un campo y no reutilizar `narration`:** el vídeo ya entregado demuestra que `narration` es descriptiva ("mira las pantallas", "bebe café"). Cambiarle el significado en silencio rompería los planes existentes y la propia UI, que la muestra como "Narración (solo en pantalla)". Un campo nuevo, validado y con su propio presupuesto, deja el histórico intacto y hace imposible confundirlos.

**Por qué no reutilizar `stake`:** `stake` es la intención (qué está en juego); `spokenLine` es la formulación oral de esa intención. Exigir que sean iguales fuerza frases de 120 caracteres con estructura de nota, no de narración. Sí están ligados: ver §3.3.

### 3.2 Reglas de forma (deterministas y validables)

| Regla | Contrato |
|---|---|
| Una sola frase | Un `spokenLine` MUST tener exactamente una oración principal: un único terminador final (`.` `?` `!` `…`) y ningún terminador intermedio salvo abreviatura |
| Sujeto y verbo | MUST contener al menos un verbo conjugado de una lista cerrada de formas frecuentes (ver §3.5); no se acepta un sintagma nominal |
| Consecuencia | MUST contener un conector de consecuencia o cambio de estado (`y`, `pero`, `porque`, `cuando`, `hasta que`, `aunque`, `mientras`) o un verbo en pasado/presente de acción. Sin conector ni cambio, es una etiqueta, no una frase |
| Nada de lenguaje visual | MUST NOT contener `plano`, `encuadre`, `cámara`, `vemos`, `se ve`, `primer plano`, `zoom`, `fundido`, ni corchetes, paréntesis escénicos ni acotaciones |
| Nada de cifras ambiguas | Los números MUST escribirse con letras (`tres`, no `3`); el TTS lee mal los dígitos sueltos y los años |
| Español y voz activa | MUST estar en español, sin siglas inventadas, sin emojis, sin HTML, sin Markdown, sin URLs |
| Nombre del protagonista | MAY aparecer; si aparece, MUST ser el `name` del canon, nunca el `id` |
| Longitud | 24–140 caracteres y, además, `estimateSpeechSeconds(line) ≤ sceneBudget − 0,3` |
| Aire al final | La escena MUST reservar ≥ 0,30 s de silencio tras la última palabra |

Una frase válida: *"Clara esconde el merengue, pero el fantasma ya sabe dónde está."*
Una frase inválida: *"Primer plano de Clara mirando la pantalla."* (lenguaje visual, sin consecuencia).

### 3.3 Relación con `stake`

`stake` es el contrato de sentido; `spokenLine` es su forma oral. El prompt pide derivar uno del otro y el validador comprueba lo comprobable:

| Comprobación | Tipo | Qué hace |
|---|---|---|
| `spokenLine` no es igual a `stake` | Determinista | Si son idénticos, se acepta: el modelo encontró la forma oral exacta. No se penaliza |
| `spokenLine` contiene al menos una palabra de contenido de `stake` (≥ 4 caracteres, sin stopwords) | Determinista | Evita que la voz cuente una historia distinta de la que el vídeo representa |
| El sentido (que la frase realmente exprese el conflicto) | **No determinista** | No se valida. Se mide en el smoke real y, si falla, se endurece el prompt en una enmienda. Aquí no se promete lo que no se comprueba |

### 3.4 Hallazgo: el `stake` de E1 no llega al camino de 008

Verificado en el árbol el 2026-10-25, antes de escribir esta spec:

| Hecho | Consecuencia |
|---|---|
| `StoryNarrativeScene.stake` existe y `canon-validator.ts` lo valida (12–120) **en el camino de 007** | El campo existe, pero en el camino que no se usa |
| `REEL_SCENE_KEYS` (008) **no incluye** `stake`; `validateReelScenes` construye la escena sin él | Las historias de 008 **no tienen stake**: llega `undefined` |
| `storyBeatForShot()` no copia `stake` y `StoryBeat` **no lo declara** | El bloque "What is at stake" del prompt de vídeo nunca se emite |
| `npm run typecheck` reporta `TS2339: Property 'stake' does not exist on type 'StoryBeat'` (4 veces) | La propia compilación lo delata: **312 errores** en total, no 0 |

**Consecuencia para 014:** la primera fase es arreglar la tubería del `stake` **y** añadir `spokenLine` en la misma pasada. Sin eso, el guion hablable se construiría sobre un campo que el producto no está rellenando.

### 3.5 Lista cerrada de formas verbales

Para no meter un analizador morfológico ni una dependencia nueva, la comprobación de "tiene verbo" usa una lista explícita de ~120 formas frecuentes del español narrativo (presente, pretérito perfecto simple, imperfecto, perífrasis `va a`, `empieza a`, `deja de`, `tiene que`) más la terminación `-ó`, `-óse`, `-aba`, `-ía`, `-aron`, `-ieron`, `-ando`, `-iendo`. La lista vive en `server/story/speech-rules.ts`, es determinista y está cubierta por tests. **Limitación declarada:** es una heurística, no gramática. Su función es rechazar etiquetas ("La pantalla del café"), no juzgar estilo.

---

## 4. De la frase a la duración

### 4.1 El reparto se hace antes de escribir

El motor decide qué duraciones existen. Por eso el servidor calcula el **plan de tiempo** y se lo impone al director:

```text
target 30 s, preset fast (MiniMax: unidades 6 y 10)
→ planShotDurations(capacity, 30, maxShots) → [6,6,6,6,6]
→ 5 clips, 30 s planificados, 30 s pagados
→ reparto en escenas según el perfil (3–5): 6 + 6 + 6 + 12, por ejemplo
→ presupuesto de voz por escena: floor((6 − 0,4) × 2,6) = 14 palabras; floor((12 − 0,4) × 2,6) = 30 palabras
```

Reglas de reparto, en orden y deterministas:

| # | Regla |
|---|---|
| **R1** | Las duraciones de plano MUST ser valores de `ENGINE_CAPACITIES[engine].durationsSeconds`. Nunca un 2, un 3 o un 4 inventados |
| **R2** | El número de planos MUST salir de `planShotDurations(capacity, targetSeconds, maxShots)`. `allocateDurations()` deja de usarse |
| **R3** | Si `planShotDurations` devuelve `null` (no hay combinación exacta), se sube el objetivo al siguiente múltiplo alcanzable y se recorta **solo el último plano de la historia** hasta `target`. Ejemplo: 15 s → 6 + 6 + 3 |
| **R4** | Cada escena recibe uno o más clips completos. Una escena de 12 s son dos de 6, nunca cuatro de 3 |
| **R5** | El presupuesto de voz de una escena es `Σ clip − 0,4 s`. El director recibe el número de palabras permitido |
| **R6** | Suma planificada = suma pagada, salvo el recorte del último plano. `paidSecondsUsedRatio = planned / paid` MUST ser ≥ 0,90 y se publica |
| **R7** | Un plano MUST durar al menos 5 s, con cualquier preset, salvo el último de la historia. Se acaba el "clip de 6 s recortado a 2 s" |
| **R8** | Si el perfil no admite el reparto resultante (demasiados o muy pocos planos), se ajusta el **número de escenas**, no la duración de los planos |

**Consecuencia honesta:** un reel de 30 s pasa de 12 planos a 5, y un 90 s `production` de 26–30 planos a 15. Es una pérdida de densidad de corte y una ganancia de coherencia, coste y voz. La alternativa (mantener 12 cortes de 2 s) es exactamente F9. **Se elige la voz**; si el humano quiere más cortes, se compran más clips, no se recortan.

### 4.2 Estimación del habla (antes del TTS)

```ts
// server/story/speech-rate.ts — puro, sin I/O
export const SPEECH_WORDS_PER_SECOND = 2.6   // ≈155 ppm, narración neutra a velocidad 1.0
export const SPEECH_SENTENCE_PAUSE = 0.25    // s por terminador
export const SPEECH_CLAUSE_PAUSE = 0.12      // s por coma, punto y coma o dos puntos
export const SPEECH_MIN_SECONDS = 0.8

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const sentences = (text.match(/[.!?…]+/g) ?? []).length
  const clauses = (text.match(/[,;:]/g) ?? []).length
  return Math.max(SPEECH_MIN_SECONDS, words / SPEECH_WORDS_PER_SECOND
    + sentences * SPEECH_SENTENCE_PAUSE + clauses * SPEECH_CLAUSE_PAUSE)
}

export function wordsForSeconds(seconds: number): number {
  return Math.max(1, Math.floor((seconds - 0.4) * SPEECH_WORDS_PER_SECOND))
}
```

Equivalencia de control: **≈15,6 caracteres por segundo** con palabras de 6,0 caracteres incluido el espacio. Sirve para detectar una frase imposible antes de llamar a nadie.

**Estado de la constante:** no medida con este pipeline todavía. Se calibra en la fase 6 con audios reales y se anota en `speech-rate.ts` con `verifiedAt` y el desvío observado, igual que `engine-capabilities.ts`. Hasta entonces, la constante es una **estimación declarada**, y por eso la medición real manda.

### 4.3 La medición real manda

```text
1. TTS por escena (paralelo, ≤ escenas llamadas)
2. Descarga a temporal y `ffprobe -show_format` → duración real
3. Si real + 0,30 ≤ presupuesto de la escena → cabe
4. Si no cabe → reajuste en este orden:
   a. tomar aire de las escenas posteriores que lo tengan de sobra
   b. añadir un clip a esa escena si total + clip ≤ maxDurationSeconds
   c. reescribir SOLO esa frase con presupuesto menor (1 reparación DeepSeek) y resintetizar SOLO esa escena
   d. FAILED `audio-too-long`, antes de cualquier keyframe
5. Con el reparto cerrado, se escriben las duraciones de `Shot` y arrancan los keyframes
```

Nunca se acelera la voz (`speed > 1,0`) para hacerla caber, y nunca se corta el audio a mitad de palabra. Si la voz no cabe, se cambia el vídeo o se cambia la frase; la voz no se deforma.

### 4.4 Ejemplo trabajado: historia de 30 s, `standard`, `fast`

| Paso | Resultado |
|---|---|
| Perfil | `standard`, 30 s, `preset: fast`, MiniMax (6/10 s) |
| Plan de tiempo | `[6,6,6,6,6]` → 30 s pagados, 30 planificados |
| Escenas | 4 (perfil 3–5): 6, 6, 6, 12 |
| Presupuesto de voz | 14, 14, 14, 30 palabras |
| Frases | 4 frases de 12–14, 12–14, 12–14 y 26–30 palabras |
| Caracteres TTS | ≈380 (6,0 car/palabra) |
| Coste de voz | 0,019 USD (ElevenLabs Turbo v2.5 @ 0,05/1k) · 0,038 USD (MiniMax HD @ 0,10/1k) |
| Coste de vídeo | 5 × 0,27 = 1,35 USD (MiniMax 768P @ 0,045/s) |
| Keyframes | 5 × 0,05 = 0,25 USD (sin referencia) |
| **Total estimado** | **≈1,62–1,64 USD**, frente a 2,15 USD del run de 12 planos |

El audio es el 1,2 % del coste y sube el precio final **bajando** el de vídeo: menos clips, menos keyframes, menos reintentos.

---

## 5. TTS en servidor

### 5.1 Interfaz de dominio

```ts
// server/story/tts-adapter.ts — server-only
export type StoryTtsProviderId =
  | 'fal-elevenlabs-turbo-v2-5'
  | 'fal-minimax-speech-02-hd'
  | 'fal-kokoro'

export interface TtsSynthesisRequest {
  readonly text: string
  readonly providerVoiceId: string
  readonly language: StoryVoiceLanguage
  readonly speed: 1.0          // nunca otro valor en la fase 1
}

export interface TtsSynthesisResult {
  /** URL del proveedor, validada contra la allowlist antes de salir de aquí. */
  readonly audioUrl: string
  readonly contentType: 'audio/mpeg' | 'audio/wav'
  readonly provider: StoryTtsProviderId
  readonly characters: number
  readonly costUsd: number
}

export interface TtsAdapter {
  readonly id: StoryTtsProviderId
  synthesize(input: TtsSynthesisRequest): Promise<TtsSynthesisResult>
}
```

Reglas de la interfaz:

- La ruta y el servicio dependen de `TtsAdapter`, nunca del transporte HTTP de un proveedor.
- El adaptador **no** lee `useRuntimeConfig`, **no** descarga, **no** mide y **no** conoce Prisma. Solo habla con el proveedor y devuelve URL, tipo, caracteres y coste.
- El adaptador MUST validar `audioUrl` con `assertFalMediaUrl` antes de devolverla.
- El adaptador MUST NOT aceptar un `voiceId` del cliente sin pasar por el registro de voces del servidor (§5.4).
- Timeout 60 s por síntesis, 90 s para el conjunto de una historia. Los errores se mapean a `StoryError` con códigos estables.

### 5.2 Ficha de proveedor (mismo patrón que 016)

```ts
// server/story/tts-capabilities.ts
export interface TtsCapacity {
  readonly id: StoryTtsProviderId
  readonly endpoint: string
  readonly costPerThousandCharsUsd: number
  readonly languages: readonly StoryVoiceLanguage[]
  readonly maxCharsPerRequest: number
  readonly outputFormats: readonly string[]
  readonly returnsWordTimings: boolean
  readonly verifiedAt: string
}
```

Precios de lista leídos el **2026-10-25** en las páginas de precios del proveedor. Son precios de tarifa, no una promesa: se confirman con una llamada real de sonda antes de fijar el cap.

| Proveedor | Coste / 1 000 car. | Español | Latencia típica | Timings por palabra | Valoración |
|---|---|---|---|---|---|
| **Fal · ElevenLabs Turbo v2.5** | 0,05 USD | Sí (multilingüe) | 1–3 s | No por REST simple | **Recomendado**: prosodia claramente superior por 2,5× menos que HD |
| **Fal · MiniMax Speech-02 HD** | 0,10 USD | Sí (30+ idiomas) | 2–5 s | Sí en algunos endpoints | Mejor timbre, el doble de precio; segunda opción |
| **Fal · Kokoro** | 0,02 USD | Sí (voces `ef_dora`, `em_alex`) | <1 s | No | El más barato; entonación plana, sirve para `budget` |
| ElevenLabs directo | 0,04–0,08 USD | Sí | 1–3 s | Sí (`/with-timestamps`) | Mejor precio/calidad y timings reales, pero **proveedor nuevo**: clave nueva, allowlist nueva, revisión de seguridad nueva |
| Azure / OpenAI TTS | ≈0,015–0,016 USD | Sí | 1–2 s | Parcial | Barato, pero otra clave y otra cuota que auditar |
| **Piper / Kokoro local** | 0 USD | Sí (voces `es_*`) | <1 s | No | Coste cero y determinista en CI, pero +60–100 MB de modelos en la imagen, binario nativo que distribuir y calidad inferior |

**Recomendación:** `fal-elevenlabs-turbo-v2-5` como adaptador por defecto, construido sobre el `FalHttpClient` y la allowlist que ya existen. Motivos, en orden:

1. **No añade una clave ni un proveedor nuevo.** El `NUXT_FAL_KEY`, su allowlist de hosts, su rate limit y su lifecycle ya están auditados. Un proveedor nuevo exige spec de seguridad propia (constitución III) y la cuenta ya está sin saldo: no es el momento.
2. El coste real por historia (2 céntimos) hace irrelevante optimizar a la mitad.
3. `Kokoro` (0,02/1k) queda como alternativa barata tras la misma interfaz, para `budget`, sin tocar el resto del sistema.

**No se decide aquí el proveedor definitivo.** El checkpoint 1 cierra la elección; el adaptador se escribe contra la interfaz para que cambiar de modelo sea configuración, no refactor.

### 5.3 Flujo de síntesis y medición

```text
ensureAudio(story):
  if !config.audioEnabled            → audio.status = 'skipped'
  if story.audioJson.status = ready  → no-op (idempotente)
  assertWithinAudioCap(story)        → coste estimado ≤ audioCapUsdFor(target)
  for each scene (concurrencia 3):
     request = { text: scene.spokenLine, voice, language, speed: 1.0 }
     result  = adapter.synthesize(request)      // 1 reintento inmediato
     guardar en temp: <storyId>/voice-<order>.<ext>
     measured = ffprobe(duration)
     if measured ≤ 0.2 ó !finite          → audio-invalid
  medir, reajustar (§4.3), persistir segmentos
```

- La concurrencia es 3 y el orden de las escenas no cambia: el montaje va por `order`, no por llegada.
- Un fallo en una escena **no** cancela las demás: se recogen todas las que se puedan y se decide el estado agregado.
- El audio descargado vive en el directorio temporal del paso y se borra en `finally`. La copia que sobrevive es la pista mezclada dentro del MP4 y el M4A subido (§6.4).
- `ffprobe` es obligatorio: sin él no hay medición y el TTS se considera fallido (`ffmpeg-not-configured`). No se estima la duración de un audio real.

### 5.4 Registro de voces

El cliente envía un **id semántico**, no un id de proveedor (mismo patrón que `visualStyle` en 010):

```ts
// app/models/story.ts
export type StoryVoiceId = 'neutro' | 'calido' | 'energico'
export const STORY_VOICES: readonly StoryVoiceId[] = ['neutro', 'calido', 'energico']
export const DEFAULT_STORY_VOICE: StoryVoiceId = 'neutro'

export type StoryVoiceLanguage = 'es-419' | 'es-ES'
export const DEFAULT_STORY_VOICE_LANGUAGE: StoryVoiceLanguage = 'es-419'
```

```ts
// server/story/voice-registry.ts — server-only
// Mapea id semántico → id de proveedor + idioma + descripción de uso.
// Cambiar de proveedor no cambia el contrato público.
```

El `voiceId` se guarda en la historia al crearla. Cambiarlo a mitad de historia está fuera de alcance: obligaría a resintetizar todo y a recomponer el montaje.

### 5.5 Cap de audio

El cap de 008 es duro y por perfil. El audio entra en la **misma** estimación (`reel-cost.ts`), y además tiene su propio techo para que un bucle de TTS no se coma el presupuesto de vídeo:

```ts
export function audioCapUsdFor(targetDurationSeconds: number): number {
  return roundUsd(0.06 + 0.004 * targetDurationSeconds)
}
// 15 s → 0,12 · 30 s → 0,18 · 45 s → 0,24 · 60 s → 0,30 · 90 s → 0,42
```

Con el adaptador recomendado, una historia de 30 s gasta ≈0,02 USD de los 0,18 disponibles: el cap solo se toca si algo va mal, que es exactamente para lo que existe.

---

## 6. Subtítulos

### 6.1 De dónde salen los tiempos

| Nivel | Fuente | Precisión |
|---|---|---|
| Escena | `audio.segments[].speechSeconds` medidas con ffprobe | ±0,05 s |
| Dentro de la escena | Reparto proporcional por palabras sobre la duración medida | ±0,2 s |
| Palabra | Solo si el proveedor devuelve timings (`returnsWordTimings`) | ±0,05 s |

**Se declara la limitación:** sin alineación forzada no hay tiempos por palabra. Repartir por palabras dentro de una frase de 6 s es una aproximación que se nota poco y no inventa texto. El sistema MUST usar los timings del proveedor cuando existan y MUST marcar `captions.alignment: 'proportional' | 'provider'` en el DTO, para que nadie confunda una cosa con la otra.

`startSeconds` de cada escena = suma de duraciones de las escenas anteriores **en el vídeo montado**, no en el audio: la voz se coloca al inicio de su escena y el silencio que sobra va detrás. Así los subtítulos no se desfasan aunque el TTS sea más rápido de lo estimado.

### 6.2 Formato

- **ASS** generado en servidor (`server/story/captions-plan.ts`, puro y determinista) y pintado con el filtro `ass` de libass.
- **SRT** como sidecar, generado desde el mismo plan, para descarga y para reutilización.
- **Nunca** se inventa texto: cada línea es un `slice` literal de `spokenLine`, cortado por espacios. Cero puntuación añadida, cero mayúsculas forzadas, cero corrección ortográfica.

| Regla | Valor | Motivo |
|---|---|---|
| Resolución del ASS | `PlayResX 720`, `PlayResY 1280` | Coincide con el MP4 final; libass no reescala |
| Tipografía | Misma lista que 015 (`DejaVuSans-Bold` y respaldos) | Ya resuelta en servidor, nunca una ruta del cliente |
| Tamaño | 44 px (≈3,4 % de la altura) | Legible en móvil sin tapar la cara |
| Caja | `BorderStyle=3`, `BackColour=&H80000000&`, `Outline=0`, `Shadow=0` | Lección de 015: la sombra sola desaparece sobre fondo claro |
| Zona segura | `MarginV=154` (12 % de 1280), `MarginL/R=58` (8 %) | Nunca bajo la UI de la plataforma |
| Líneas | Máximo 2 por subtítulo | 3 líneas tapan al personaje |
| Caracteres por línea | Máximo 32 | Ancho medido sobre 84 % del frame |
| Palabras por subtítulo | Máximo 7 | Ritmo de lectura, no de frase |
| Velocidad de lectura | ≤ 17 car/s | Por encima, no se lee; el plan parte en trozos |
| Duración mínima | 0,8 s por subtítulo | Evita parpadeo |
| Hueco entre subtítulos | ≥ 0,08 s | Evita que dos se solapen |
| Idioma | El del guion. No se traduce | Traducción fuera de alcance |

### 6.3 Dónde se pintan

En el **mismo pase** que los gráficos de 015, sobre el MP4 ya montado:

```text
-vf "ass=/tmp/…/captions.ass,drawtext=…(título),drawtext=…(terminal)"
-c:v libx264 -crf 18 -preset veryfast
-c:a aac -b:a 96k -ar 48000
```

Un solo encode para gráficos + subtítulos + mux. Añadir un pase por capa degradaría el vídeo dos veces y multiplicaría el tiempo de montaje.

### 6.4 Entrega

| Asset | Formato | Dónde | Lifecycle |
|---|---|---|---|
| Vídeo final | MP4 H.264 720×1280 30 fps + AAC 48 kHz | `.data/story-output/<id>.mp4` **y** CDN | 24 h en CDN; el local es la copia que sobrevive |
| Voz aislada | M4A AAC 48 kHz mono | CDN | 24 h |
| Subtítulos | SRT UTF-8 | CDN | 24 h |

`audioUrl` y `captionsUrl` en el DTO apuntan a la copia del proveedor de storage; el `download` de la historia sigue sirviendo el MP4 desde la copia local (D1). El SRT se sirve por la misma ruta con `?asset=captions`.

### 6.5 Colisión con los gráficos de 015

| Gráfico | Con subtítulos activos | Motivo |
|---|---|---|
| `title` | Se mantiene | Está arriba, no choca |
| `terminal` | Se mantiene, pero solo si la escena tiene pantalla | Es contenido diegético, no texto de narración |
| `badge` | **Se omite** | Compite por la franja inferior con el subtítulo. Primero se lee la historia, después la marca |

---

## 7. Mezcla y montaje

### 7.1 Orden de pasos

```text
1. normalize   cada clip a su duración de plano, 720×1280, 30 fps, -an      (ya existe)
2. concat      cortes secos, -c copy                                        (ya existe)
3. voice track por escena → silencio de relleno hasta la duración del vídeo → concat
4. loudnorm    dos pasadas: medir I/TP/LRA y aplicar -14 LUFS / -1 dBTP
5. pase único  ass + drawtext + -c:a aac 96k -ar 48000 → MP4 final
6. verify      ffprobe: vídeo 720×1280@30 h264 yuv420p, 1 pista AAC 48 kHz,
               duración del vídeo ±0,3 s, duración de audio ±0,2 s de la del vídeo
7. upload      MP4, M4A y SRT; copia local del MP4
```

### 7.2 Reglas de mezcla (fase 1, sin música)

| Regla | Contrato |
|---|---|
| Prioridad | La voz es la única pista; no hay mezcla que balancear. La música entra en otra spec **con ducking obligatorio** |
| Loudness | −14 LUFS integrado, −1 dBTP, LRA 11. Dos pasadas de `loudnorm`; si la medición falla, se aplica un valor conservador y `loudnessLufs: null` |
| Códec | AAC 48 kHz, mono, 96 kbps. Nunca MP3 en el MP4 |
| Silencio | Relleno digital a −inf, no ruido. Nunca se estira la voz para llenar la escena |
| Deriva | El audio total MUST cuadrar con el vídeo ±0,2 s. Si no cuadra, se falla el montaje: un desfase de 300 ms se nota en los subtítulos |
| Sin voz | Si `audio.status` no es `ready`, el paso 3–5 se salta la parte de audio y el MP4 sale `-an` como hoy |
| Recorte del último plano | Si R3 recorta el último plano, el audio se recorta solo con el vídeo; un `atrim` explícito, nunca un `-shortest` a ciegas |

### 7.3 Compatibilidad con el verificador actual

`probeAndVerify()` hoy rechaza **cualquier** stream que no sea vídeo (`extra.length > 0` → `assembly-failed`). Con voz eso fallaría siempre. La regla nueva:

| Streams | Aceptación |
|---|---|
| 1 vídeo, 0 audio | Válido solo con `audio.status !== 'ready'` |
| 1 vídeo, 1 audio `aac` 48 kHz | Válido con voz |
| Cualquier otro extra (subtítulos embebidos, datos) | `assembly-failed` |

---

## 8. Máquina de estados y recuperación

**No se añaden estados al enum.** La síntesis ocurre dentro de la transición `PLANNING → GENERATING_KEYFRAMES`, bajo el mismo lease:

| Punto | Contrato |
|---|---|
| Dónde | `ensureAudio` se ejecuta al cerrar el plan, antes de escribir el primer `Shot` en `KEYFRAME_QUEUED` |
| Lease | El lease de planificación sube de 60 s a **180 s** (`planningLeaseMs`), porque el TTS añade hasta 90 s. Enmienda a 008 |
| Progreso | `story.audio.started` / `story.audio.scene.ready` / `story.audio.ready` / `story.audio.failed`. La UI muestra "Grabando la voz" como etapa real, sin porcentaje |
| Idempotencia | Si `audioJson.status === 'ready'`, no se vuelve a llamar al proveedor. Reensamblar reutiliza los segmentos guardados |
| Cancelación | Cancelar durante la síntesis aborta las peticiones en vuelo (best-effort), borra temporales y no deja `audioJson` a medias |
| Reintentos | Un reintento inmediato por escena. Fallos de proveedor 429/5xx cuentan para el rate limit y para el cap |
| Reconciliador | No cambia. Si el proceso muere a mitad de planning, el lease expira y se reintenta el paso completo; los segmentos ya medidos se conservan |

### 8.1 Tabla de fallos

| Situación | Estado final | `audio.status` | Código | Subtítulos | Vídeo |
|---|---|---|---|---|---|
| TTS 5xx/timeout tras 1 reintento | `READY` | `missing` | `audio-failed` | No | Se entrega mudo, marcado |
| TTS devuelve audio ilegible o de 0 s | `READY` | `missing` | `audio-invalid` | No | Se entrega mudo, marcado |
| Falta `ffprobe` | `READY` | `missing` | `ffmpeg-not-configured` | No | Se entrega mudo, marcado |
| La frase no cabe y no hay reajuste | `FAILED` | `missing` | `audio-too-long` | No | **No se genera**: falla antes de keyframes |
| `ass` no está en el FFmpeg del sistema | `READY` | `ready` | `captions-unavailable` | No | Se entrega con voz, sin subtítulos |
| Falla el pase de subtítulos | `READY` | `ready` | `captions-failed` | Solo SRT si se pudo generar | Se entrega con voz, sin quemar |
| `audioEnabled = false` | `READY` | `skipped` | — | No | Se entrega mudo (comportamiento previo) |
| Historia de 008 ya entregada | `READY` | `missing` | — | No | No se reaudio |

**Nunca** se entrega un MP4 con una pista de audio en silencio, ni subtítulos de texto que no esté en el guion, ni `audio.status: 'ready'` sin medición. Un estado `ready` es una afirmación verificada con ffprobe.

---

## 9. Contrato de datos

### 9.1 `app/models/story.ts`

```ts
/** Voz del canal. El cliente envía el id; el id de proveedor vive en servidor. */
export type StoryVoiceId = 'neutro' | 'calido' | 'energico'
export type StoryVoiceLanguage = 'es-419' | 'es-ES'

export type StoryAudioStatus = 'pending' | 'ready' | 'missing' | 'skipped'
export type StoryCaptionsMode = 'burned' | 'sidecar' | 'none'
export type StoryCaptionAlignment = 'proportional' | 'provider'

/** Voz de una escena, ya medida. Origen único de los subtítulos. */
export interface StorySpeechSegment {
  readonly sceneOrder: number
  /** Texto exacto que se sintetizó. Nunca se reescribe después. */
  readonly text: string
  /** Posición en la línea de tiempo del vídeo final. */
  readonly startSeconds: number
  readonly endSeconds: number
  /** Duración real medida con ffprobe. */
  readonly speechSeconds: number
  /** Duración estimada antes de sintetizar, para comparar desvío. */
  readonly estimatedSeconds: number
  readonly status: 'ready' | 'failed'
  readonly errorCode?: StoryErrorCode
}

export interface StoryAudio {
  readonly status: StoryAudioStatus
  readonly voiceId: StoryVoiceId | null
  readonly voiceLanguage: StoryVoiceLanguage | null
  readonly provider: string | null
  readonly speechSeconds: number | null
  readonly segments: readonly StorySpeechSegment[]
  /** Pista de voz aislada. `null` si no se conservó. */
  readonly audioUrl: string | null
  readonly captionsUrl: string | null
  readonly captionsMode: StoryCaptionsMode
  readonly captionsBurned: boolean
  readonly captionAlignment: StoryCaptionAlignment | null
  readonly loudnessLufs: number | null
  readonly truePeakDbtp: number | null
  readonly usedRatio: number | null
  /** Por qué se degradó, con código estable. Nunca un mensaje de proveedor. */
  readonly degradedReason: StoryErrorCode | null
}
```

`StoryNarrativeScene` gana `readonly spokenLine: string`. `Story` gana `readonly audio: StoryAudio`. `StoryCreateRequest` gana dos campos opcionales:

```ts
readonly voiceId?: StoryVoiceId          // default: DEFAULT_STORY_VOICE
readonly captionsMode?: StoryCaptionsMode // default: 'burned'
```

`StoryErrorCode` gana: `invalid-voice`, `invalid-language`, `invalid-captions-mode`, `audio-not-configured`, `audio-failed`, `audio-invalid`, `audio-too-long`, `audio-unavailable`, `captions-failed`, `captions-unavailable`.

**Sin `File`/`Blob`, sin URLs de proveedor distintas de los assets públicos, sin ids de voz de proveedor.**

### 9.2 Persistencia

```prisma
model Story {
  // …
  voiceId            String?
  voiceLanguage      String?
  audioJson          Json?
  // …
}
```

Migración `20261026120000_story_audio`. `audioJson` guarda el objeto `StoryAudio` completo **sin** URLs firmadas de proveedor más allá de los assets publicados. `null` se lee como `audio.status = 'missing'` (historias anteriores a 014).

- `spokenLine` vive en `planJson.scenes[]`: es narrativa, y la narrativa tiene una sola fuente de verdad (008, §Decisiones).
- `Shot.durationSeconds` no cambia de tipo (`2..6` sigue siendo válido), pero el pipeline solo escribe los valores del motor (`5`/`6`/`10`).
- Sin tabla nueva. Sin migración de datos: las historias existentes quedan `missing` por lectura, no por backfill.

---

## 10. Contrato de API

| Ruta | Cambio |
|---|---|
| `POST /api/story` | Acepta `voiceId` y `captionsMode` opcionales. 400 `invalid-voice` / `invalid-captions-mode` si el id no está en la lista. `voiceId` entra en el cuerpo canónico de idempotencia |
| `GET /api/story/:id` | `audio: StoryAudio` y `plan.scenes[].spokenLine` en el DTO |
| `GET /api/story/:id/download` | Acepta `?asset=video\|audio\|captions` (default `video`). 400 `invalid-request` con un asset desconocido. 404 `story-not-ready` si el asset no existe. Misma comprobación de sesión que hoy |
| `GET /api/story/voices` | Nuevo. Lista `{ id, label, language }` desde el registro del servidor. Sin proveedor, sin precios |

Estados HTTP nuevos: ninguno. Los errores de audio no son errores de API: son estados de la historia. `audio-too-long` se entrega como `502` en el `POST` solo si ocurre dentro de la petición de creación (no ocurre: el planning es asíncrono), así que en la práctica llega por `GET` como `story.error.code`.

**Eventos de log** (`story.audio.*`, `story.captions.*`): nunca `spokenLine`, ni URL firmada, ni texto sintetizado. Solo `storyId`, `sceneOrder`, `characters`, `costUsd`, `providerId`, `speechSeconds` y `reason`.

---

## 11. Arquitectura server-side

```text
server/api/story/voices.get.ts           ruta fina: sesión, serializa el registro
server/api/story/[id]/download.get.ts    amplía asset
server/api/story/index.post.ts           valida voiceId/captionsMode

server/story/
  speech-rate.ts          puro: estimación y presupuesto de palabras + tests
  speech-rules.ts         puro: forma de la frase hablable (verbo, conector, visual) + tests
  time-plan.ts            puro: planShotDurations → reparto de clips por escena + tests
  voice-registry.ts       server-only: id semántico → id de proveedor
  tts-capabilities.ts     ficha por proveedor con precio y fecha
  tts-adapter.ts          interfaz + errores
  fal-tts-adapter.ts      transporte HTTP por Fal; sin env, sin descarga
  audio-orchestrator.ts   sintetiza, descarga, mide, reajusta y persiste segmentos
  captions-plan.ts        puro: segmentos → ASS y SRT + tests
  captions-renderer.ts    argumentos de FFmpeg/ASS y escapado + tests
  audio-mix.ts            puro: construcción de la pista de voz y args de loudnorm + tests
  voice-track.ts          concat de voz + silencio, invoca ffmpeg por el runner

server/story/shot-assembly-service.ts    pasos 3–6 de §7.1, verificador con audio
server/story/reel-cost.ts               audio en estimate() y audioCapUsdFor()
server/story/reel-reconciler.ts         llama ensureAudio antes de los keyframes
server/story/reel-service.ts            DTO con audio
```

Límites que se respetan:

- La ruta no conoce Fal ni FFmpeg.
- El adaptador no conoce `useRuntimeConfig` ni Prisma.
- El orquestador no compone argumentos de FFmpeg: se los pide a `voice-track`/`captions-renderer`.
- Los módulos puros (estimación, forma, plan de tiempo, ASS/SRT, mix) no tienen I/O y se testean sin mocks.
- Se prefiere extender `shot-assembly-service` a crear un segundo ensamblador.

---

## 12. Seguridad, coste y lifecycle

| Regla | Contrato |
|---|---|
| Secretos | Se reutiliza `runtimeConfig.falKey`. No hay clave nueva si el adaptador es Fal. Si el humano elige ElevenLabs directo, hace falta clave nueva + allowlist + revisión de seguridad |
| Proveedor solo en servidor | El cliente nunca ve un id de proveedor, ni un endpoint, ni un precio por carácter |
| Endpoint | Allowlisted en `tts-capabilities.ts`; el cliente no puede elegirlo |
| Texto del usuario | `spokenLine` lo escribe DeepSeek, no el usuario; aun así se valida forma y longitud antes de enviarlo. Nada de HTML/Markdown/URLs |
| Rate limit | La síntesis consume el `createLimit` existente y un contador propio `audioLimit` (20/hora por sesión) para que un bucle no vacíe el saldo |
| Presupuesto | `audioCapUsdFor(target)` duro + cap de perfil de 008. Ambos se comprueban **antes** de cada llamada |
| Idempotencia | Por `(storyId, sceneOrder, hash(spokenLine + voiceId + provider))`. Reintentar la misma entrada no vuelve a cobrar |
| Lifecycle | Audio descargado: temporal, borrado en `finally`. M4A y SRT: 24 h en CDN. MP4: 24 h + copia local |
| Derechos | Solo voces del catálogo del proveedor. **Sin clonación, sin voces de famosos, sin imitaciones.** Queda escrito porque es la puerta que no se abre por accidente |
| Inyección en FFmpeg | El SSML/texto no entra en argumentos: entra en el cuerpo HTTP del proveedor. Para ASS, el texto se escapa (`{`, `}`, `\`, saltos) como en `escapeDrawText` |
| Logs | Prohibido `spokenLine`, audio, URL firmada, clave. Permitido `characters`, `speechSeconds`, `costUsd`, `providerId` |

---

## 13. UI/UX y copy deck

Camino por defecto: **2 clics** (crear y esperar). La voz no se configura para el camino feliz.

| Superficie | Cambio | Testid |
|---|---|---|
| `StoryCreateForm` | Ninguno visible. `neutro` + `es-419` + subtítulos quemados por defecto | `story-create-form` |
| Panel avanzado (colapsado) | Selector de voz (3 opciones) y de subtítulos (`Quemados`, `Archivo aparte`, `Sin subtítulos`) | `story-voice-picker` |
| `StoryPlanProgress` | Etapa real "Grabando la voz" con `role="status"` | `story-audio-progress` |
| `StoryReview` | Cada escena muestra la frase que se dirá, separada de la descripción | `story-scene-spoken-line` |
| `StoryResult` | `<video controls playsinline poster>` ya existe. Añade `<track kind="captions">` cuando hay SRT | `story-final-video` |
| `StoryResult` | Enlace `Descargar subtítulos` si `captionsUrl` | `story-captions-download` |
| `StoryResult` | Aviso discreto si `audio.status === 'missing'` | `story-audio-note` |
| `StoryResult` | Etiqueta de voz usada en la ficha técnica | `story-result-voice` |

**Copy exacto:**

| Clave | Texto |
|---|---|
| `spokenLineLabel` | `Lo que se dice` |
| `narrationLabel` (cambia) | `Lo que se ve` |
| `audioStage` | `Grabando la voz` |
| `audioNoteMissing` | `Este vídeo no tiene voz. El resto está completo.` |
| `audioNoteSkipped` | `La voz está desactivada en este entorno.` |
| `captionsNoteUnavailable` | `Los subtítulos no se pudieron añadir; el vídeo está completo.` |
| `captionsDownload` | `Descargar subtítulos (.srt)` |
| `voiceNeutro` | `Neutra` |
| `voiceCalido` | `Cálida` |
| `voiceEnergico` | `Enérgica` |
| `captionsBurned` | `Quemados en el vídeo` |
| `captionsSidecar` | `Archivo aparte` |
| `captionsNone` | `Sin subtítulos` |
| `assemblyNote` (cambia) | `Estamos uniendo los planos, grabando la voz y cuadrando los subtítulos.` |

Nunca un error rojo si el vídeo es válido. `role="alert"` solo para el fallo que bloquea (`audio-too-long`).

---

## 14. Tabla de enmiendas

### 14.1 A 008 (TikTok Reel Engine)

| Cláusula de 008 | Texto anterior | Enmienda de 014 |
|---|---|---|
| **Decisión "Duración por plano"** | 2–5 s; 6 s solo con `fast` y ≤20 % de los planos | **Sustituida.** Un plano dura exactamente lo que el motor entrega (5, 6 o 10 s). Se prohíbe planificar por debajo de 5 s salvo el último plano de la historia |
| **Decisión "Duración planificada"** | `planned ∈ [target−1, max]` | **Ampliada.** `planned = Σ clips del motor`, con `planned ∈ [target−1, max]`; si la rejilla no alcanza el objetivo, se sube al múltiplo siguiente y se recorta el último plano |
| **Decisión "Recorte por duración"** | Recortar planos desde el final, hasta 2 s cada uno, si `Σ > max` | **Sustituida.** No se recorta ningún plano intermedio. Solo el último, y solo contra `target`, nunca contra `max` |
| **Perfiles de coste** | `shotMin`/`shotMax` por perfil (9–12 planos en 30 s, 26–30 en 90 s producción) | **Ampliado.** Los recuentos pasan a ser **derivados**: `planShotDurations()` decide. Las cifras de la tabla quedan como cotas de aviso, no como validación. 30 s `standard` → 5 planos; 90 s `production` → 15 |
| **Reglas R7/R8** | Gancho de 2–3 s, dos primeros planos ≤6 s, ≤25 % de planos ≥5 s | **Suspendidas cuando hay voz.** La primera frase y su clip mandan. La variedad de encuadre (R1–R6) se mantiene |
| **FR-428 / `transition='cut'`** | Sin audio | **Superseded.** El MP4 final lleva una pista AAC. El vídeo por plano sigue mudo |
| **Verificador de montaje** | Rechaza cualquier stream que no sea vídeo | **Ampliado.** Admite exactamente 1 audio AAC 48 kHz cuando `audio.status === 'ready'` |
| **`Shot.durationSeconds` 2–6** | Rango del validador | **Ampliado a 2–10**, con la regla de que el pipeline solo escribe valores del motor |
| **Lease de planificación** | 60 s | **180 s** por la síntesis |
| **Niveles del problema: "Nivel 3 — audio, subtítulos"** | Fuera de 008, spec 009 | **Superseded.** Es el objeto de 014 |
| **FR-505 (no audio)** | Prohibido implementar audio y subtítulos | **Superseded.** 014 los implementa |

### 14.2 A 013 (prompts oficiales)

| Cláusula | Enmienda |
|---|---|
| Prompts en positivo, sin canal negativo | **Se mantiene.** Se añade una regla: ningún prompt de keyframe o vídeo puede pedir "hablar", "mover la boca", "decir" ni "labios". La voz no existe para el modelo; dibujarla sería el mismo error que dibujar titulares (015) |

### 14.3 A 015 (gráficos)

| Cláusula | Enmienda |
|---|---|
| `terminal` con el texto de `narration` | **Se mantiene**, pero `narration` deja de ser "lo que se dice" y pasa a ser "lo que se ve". Se añade que la terminal MUST NOT usar `spokenLine` |
| `badge` en la franja inferior | **Se omite** cuando hay subtítulos quemados |
| Un solo pase sobre el MP4 montado | **Se mantiene y se amplía**: el pase ahora incluye `ass` y el mux de audio |
| Fallo de gráficos no bloquea | **Se mantiene** y se aplica igual a los subtítulos: si `ass` falla, el vídeo sale con voz y sin subtítulos |

### 14.4 A 016 (capacidades de motor)

| Cláusula | Enmienda |
|---|---|
| `planShotDurations()` existe y no se usa | **Conectada.** Pasa a ser la autoridad del reparto de planos (§4.1 R2) |
| `durationFor()` para el adaptador | **Se mantiene** y se extiende: el valor devuelto es también la duración **planificada**, no solo la pedida |

### 14.5 A 005/006

| Cláusula | Enmienda |
|---|---|
| "El MP4 es mudo por diseño" | **Superseded** |
| QC sin audio | **Se mantiene.** 014 no añade QC de voz; no se promete lo que no se mide |
| `StoryCreateRequest` de 005 | Ampliado con `voiceId` y `captionsMode` opcionales |

### 14.6 Al código de reparto

| Archivo | Acción |
|---|---|
| `server/story/reel-plan-adapter.ts` → `allocateDurations()` | **Retirada del camino.** Se queda solo para el adaptador legacy y con un test que documenta su retirada |
| `server/story/reel-plan-adapter.ts` → `buildShotPlan()` | Reescrito: recibe el tiempo del motor y el presupuesto de escenas, no una división |
| `server/story/cost-profiles.ts` | `shotDurationMin` pasa a 5; `shotMin/shotMax` a cotas de aviso; `capUsd` no cambia |
| `server/story/duration-plan.ts` → `plannedRange()` | Se mantiene; `trimToMaxDuration()` deja de usarse en el camino nuevo |
| `server/story/shot-plan-validator.ts` | Acepta 5 planos en 30 s; añade `scene-budget-exceeded` |
| `server/story/shot-assembly-service.ts` | Pasos de audio y captions; verificador ampliado |
| `server/story/story-prompt-composer.ts` | `StoryBeat` declara `stake` y `spokenLine`; el bloque de vídeo deja de leer un campo inexistente |

### 14.7 Skills afectadas

| Skill | Cambio |
|---|---|
| `ffmpeg-media` | "no audio until 009" deja de ser cierto: audio **después** del montaje, un solo pase, verificación con 1 pista AAC |
| `fal-deepseek-pipeline` | Añade TTS al inventario de proveedores, su ficha y su cap |
| `story-test-harness` | Añade fakes de TTS y audio sintético |

---

## 15. Impacto en configuración

### `nuxt.config.ts` (`runtimeConfig.story`)

```ts
audioEnabled: true,               // interruptor de servidor. false = modo mudo de antes
ttsProvider: 'fal-elevenlabs-turbo-v2-5',
ttsVoiceLanguage: 'es-419',
ttsTimeoutMs: 60_000,
ttsConcurrency: 3,
ttsMaxAttemptsPerScene: 2,
costTtsPerThousandCharsUsd: 0.05,
audioCapBaseUsd: 0.06,
audioCapPerSecondUsd: 0.004,
captionsEnabled: true,            // kill switch de subtítulos
captionsMode: 'burned',
captionsMaxCharsPerLine: 32,
captionsMaxWordsPerCue: 7,
captionsMaxCps: 17,
loudnessTargetLufs: -14,
truePeakDbtp: -1,
planningLeaseMs: 180_000,
voiceTrackBitrateKbps: 96,
```

### `.env.example`

```bash
# --- Voz y subtítulos (Spec 014) ---
# Interruptor de servidor. false deja el MP4 mudo como antes de 014.
NUXT_STORY_AUDIO_ENABLED=true
# Proveedor de TTS y voz por defecto. El id de proveedor vive en servidor.
NUXT_STORY_TTS_PROVIDER=fal-elevenlabs-turbo-v2-5
NUXT_STORY_TTS_VOICE_LANGUAGE=es-419
NUXT_STORY_TTS_TIMEOUT_MS=60000
NUXT_STORY_TTS_CONCURRENCY=3
# Cap propio de audio, además del cap por perfil.
NUXT_STORY_AUDIO_CAP_BASE_USD=0.06
NUXT_STORY_AUDIO_CAP_PER_SECOND_USD=0.004
NUXT_STORY_COST_TTS_PER_1K_CHARS_USD=0.05
# Subtítulos y mezcla.
NUXT_STORY_CAPTIONS_ENABLED=true
NUXT_STORY_CAPTIONS_MODE=burned
NUXT_STORY_LOUDNESS_TARGET_LUFS=-14
NUXT_STORY_TRUE_PEAK_DBTP=-1
NUXT_STORY_PLANNING_LEASE_MS=180000
```

### README

- El producto entrega voz y subtítulos por defecto; "sin audio" deja de ser una característica y pasa a ser un interruptor de operación.
- Tabla nueva con el coste de la voz por duración (15/30/45/60/90) y el cap de audio.
- Nota de que el SRT se descarga desde el resultado y que el MP4 se copia en local porque el proveedor borra sus ficheros.

---

## 16. Coste

| Concepto | Fórmula | 15 s | 30 s | 45 s | 60 s | 90 s |
|---|---|---|---|---|---|---|
| Palabras dichas | ≈`target × 0,87 × 2,6` | 34 | 68 | 102 | 136 | 204 |
| Caracteres TTS | ≈palabras × 6,0 | 204 | 408 | 612 | 816 | 1 224 |
| Voz · ElevenLabs Turbo (0,05/1k) | — | 0,010 | 0,020 | 0,031 | 0,041 | 0,061 |
| Voz · MiniMax HD (0,10/1k) | — | 0,020 | 0,041 | 0,061 | 0,082 | 0,122 |
| Voz · Kokoro (0,02/1k) | — | 0,004 | 0,008 | 0,012 | 0,016 | 0,024 |
| Cap de audio | `0,06 + 0,004 × target` | 0,12 | 0,18 | 0,24 | 0,30 | 0,42 |
| Peso de la voz sobre el vídeo | — | ≈1 % | ≈1 % | ≈1 % | ≈1 % | ≈1 % |

**Labrado de la estimación:** 87 % del tiempo objetivo es voz; el resto es aire entre frases. Es una previsión de producto, no una promesa: el coste real depende de las palabras que escriba el director, del proveedor elegido y de los reintentos.

| Regla | Contrato |
|---|---|
| Cap duro | Se rechaza cualquier llamada de TTS que deje el gasto por encima de `audioCapUsdFor(target)` o del cap del perfil |
| Reintentos | Cuentan. Un bucle de TTS no puede superar el cap: se detiene y degrada |
| Fail-fast | `audio-too-long` ocurre **antes** de cualquier keyframe: el gasto se corta donde es barato |
| Estimación visible | La UI muestra coste y duración antes de crear, con el rango `[target−1, max]` |

---

## 17. Plan de test

| Archivo | Casos |
|---|---|
| `speech-rate.spec.ts` | Estimación por palabras, pausas por terminador y coma, recorte a mínimo, `wordsForSeconds` inverso, frase vacía, caracteres vs palabras |
| `speech-rules.spec.ts` | Acepta frase con sujeto, verbo y consecuencia; rechaza lenguaje visual, dígitos, dos oraciones, paréntesis escénicos, HTML/URL, id de personaje; límites 24 y 140; lista de verbos |
| `time-plan.spec.ts` | 15/30/45/60/90 s en MiniMax y Kling; `planShotDurations` null → rejilla superior + recorte del último; 15 s → 6+6+3; 30 s → 5×6; nunca 2 s salvo el último; `usedRatio ≥ 0,9`; reparto por escenas 1–4; determinismo |
| `tts-adapter.spec.ts` | Contrato de petición/respuesta; URL validada contra allowlist; URL de otro host → `audio-invalid`; 429/5xx → `audio-failed` reintentable; timeout; coste calculado por caracteres |
| `tts-capabilities.spec.ts` | Ficha completa por proveedor; idiomas; precio > 0; `verifiedAt` con fecha |
| `voice-registry.spec.ts` | Los tres ids semánticos resuelven a un id de proveedor; id desconocido no resuelve; nunca se filtra el id de proveedor al DTO |
| `audio-orchestrator.spec.ts` | Idempotencia por hash; un fallo no cancela las demás escenas; `audio.status` agregado correcto; `audio-too-long` antes de keyframes; reajuste a) → b) → c) en orden; cancelación limpia temporales |
| `captions-plan.spec.ts` | ASS con 720×1280; ≤2 líneas; ≤32 car/línea; ≤7 palabras; ≤17 car/s; mínimo 0,8 s; hueco 0,08 s; texto literal del guion (corte por espacios); sin solapes; SRT con los mismos tiempos; escapado de `{}` y `\` |
| `audio-mix.spec.ts` | Silencio de relleno exacto; suma de audio = duración del vídeo; args de `loudnorm` (−14/−1/LRA 11); AAC 48 kHz mono 96k; sin voz no se genera pista |
| `shot-assembly-service.spec.ts` | Un solo pase con `ass` + `drawtext`; verificador admite 1 audio AAC; rechaza 2 audios; rechaza subtítulos embebidos; sin voz → `-an`; deriva de audio > 0,2 s → `assembly-failed`; el MP4 conserva la duración |
| `reel-cost.spec.ts` | El audio entra en `estimate()`; `audioCapUsdFor` por duración; el cap de perfil sigue mandando; reintentos contabilizados |
| `story-audio-routes.spec.ts` | `POST` con `voiceId` válido/ inválido y `captionsMode`; `GET` con `audio`; `?asset=audio\|captions\|video`; 400 asset inválido; 404 sin asset; sesión ajena → 404; sin fuga de ids de proveedor |
| `story-audio-ui.spec.ts` | Copy exacto; `role="status"` en la etapa; nota de degradación no bloqueante; enlace de subtítulos solo cuando existe; selector de voz en el panel avanzado no añade clics |
| `story-audio-regression.spec.ts` | Con `audioEnabled=false` el DTO y el MP4 son los de 008; los planes legacy sin `spokenLine` no rompen la lectura |

**Fakes, nunca proveedor real:**

| Fake | Cómo |
|---|---|
| TTS | Adaptador en memoria que devuelve un WAV sintético de duración pedida, generado con el propio FFmpeg en el setup del test (0,5–12 s) |
| Audio sintético | `ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t N` para silencio y `sine` para señal; sin voz real en CI |
| Descarga | `fetchImpl` inyectado, igual que `media-downloader` |
| FFmpeg | `FfmpegRunner` falso que registra argumentos; smoke real opt-in `RUN_FFMPEG_SMOKE=1` con los mismos WAV sintéticos |

**Smoke real opt-in** (`RUN_STORY_SMOKE=1 RUN_TTS_SMOKE=1`), con aprobación humana y presupuesto:

1. Una frase corta, tres proveedores, medir duración real vs estimada → calibrar `SPEECH_WORDS_PER_SECOND` y anotar el desvío.
2. Una historia de 15 s completa: comprobar voz, subtítulos, sincronía y que el MP4 se entiende **sin mirar**.
3. Repetir la misma historia para verificar idempotencia de audio (0 llamadas nuevas).

---

## 18. Fases

| # | Fase | Entregable |
|---|---|---|
| 1 | **Reparar `stake`** | `stake` en `REEL_SCENE_KEYS`, en el esquema de escenas y en `StoryBeat`; typecheck sin los 4 errores de `stake` |
| 2 | Puro | `speech-rate`, `speech-rules`, `time-plan` + tests. Sin proveedor, sin red |
| 3 | Puro | `captions-plan` (ASS/SRT), `audio-mix` + tests |
| 4 | Adaptador | `tts-adapter`, `tts-capabilities`, `fal-tts-adapter`, `voice-registry` + tests de contrato con stub HTTP |
| 5 | Orquestación | `audio-orchestrator` dentro del planning: síntesis, medición, reajuste, persistencia, degradación |
| 6 | Montaje | Voz, mux, pase único con ASS y gráficos, verificador ampliado |
| 7 | API y UI | DTO, `?asset`, `/voices`, etapa de progreso, copy, panel avanzado |
| 8 | Coste y config | `audioCapUsdFor`, `reel-cost`, `nuxt.config`, `.env.example`, README |
| 9 | Gate | Suite completa + build + typecheck; smoke real de una historia de 15 s |

**Condición de retirada del modo mudo:** `audioEnabled` se queda como interruptor operativo permanente (es un kill switch, no un `legacy`). No hay ruta de compatibilidad silenciosa: si está a `false`, el DTO lo dice (`audio.status: 'skipped'`) y la UI lo muestra.

---

## 19. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| La voz suena distinta entre escenas (prosodia) | Media | Mismo `voiceId`, mismas opciones, `speed: 1.0`; se valida en el smoke y, si se nota, se pasa a una sola llamada con timings del proveedor |
| La estimación de habla se desvía >15 % | Media | La medición manda; el reajuste está especificado y ocurre antes de gastar en vídeo; la constante se calibra en la fase 9 |
| El cap de audio no cubre un 90 s real | Baja | `0,06 + 0,004 × target` deja margen de 3× sobre el precio de lista |
| Los subtítulos proporcionales se notan | Media | Máximo 7 palabras por subtítulo; si se nota, se contrata un proveedor con timings o se añade alineación forzada en otra spec |
| Menos planos = menos ritmo | **Alta** | Es la consecuencia asumida de F9. Si el humano prefiere cortes, se compran clips (coste sube) en lugar de recortar |
| El proveedor tarda y el lease de planning expira | Baja | Lease 180 s, timeout 60 s por escena, concurrencia 3; el paso es idempotente |
| Cambiar 008 rompe tests históricos | Alta | Los tests de 008 que fijan `Σ = target` con 12 planos se actualizan **con la enmienda**, documentando el cambio; ninguno se debilita en silencio |
| `libass` ausente en producción | Media | Detección al arrancar (`ffmpegHasAss`, mismo patrón que `ffmpegHasDrawText`), degradación declarada con evento |
| El audio sube el coste del cap y bloquea historias | Baja | El audio pesa 1 %; el cap propio lo acota y el fail-fast ocurre antes del gasto caro |

---

## 20. Assumptions y lo que no está probado

- **No se ha llamado a ningún TTS real.** Todo el apartado de calidad de voz, latencia y desviación de la estimación es una previsión basada en las fichas públicas del proveedor, no una medición de este pipeline.
- **No se ha pintado un ASS con libass en este sistema.** 015 pinta `drawtext`; `ass` comparte motor pero no está verificado aquí.
- **No se ha medido `loudnorm` sobre una voz real de este pipeline.** Los valores −14/−1 son el objetivo estándar, no un resultado observado.
- **El reparto nuevo no se ha ejecutado con proveedor.** Los números de §4.4 son aritmética del reparto, no una factura.
- La constante 2,6 palabras/s es una estimación de narración neutra en español; se calibra en la fase 9 y se anota con fecha.
- Se asume que el TTS del proveedor elegido acepta una frase de ≤140 caracteres por llamada, holgado frente a los límites de las fichas.
- Se asume que las cinco escenas de una historia caben en el timeout de planning de 180 s con concurrencia 3.
- **Ninguna historia con voz se ha entregado todavía.** Ninguna spec de este repositorio está `Validated`, y 014 tampoco lo estará hasta que el humano vea un vídeo y diga que se entiende.

---

## 21. Decisiones que el humano debe cerrar

Antes del Checkpoint 1, y idealmente antes de escribir el adaptador:

1. **Proveedor de TTS.** Recomendación: `fal-elevenlabs-turbo-v2.5` (0,05 USD/1k car.) por reutilizar la cuenta y la allowlist de Fal. Alternativas: MiniMax HD (mejor timbre, 0,10), Kokoro (0,02, más plano), ElevenLabs directo (mejor calidad y timings, pero proveedor y clave nuevos), local (coste 0, dependencia y ~100 MB de modelos). ¿Se acepta la recomendación o se prueba primero una frase con dos proveedores?
2. **Idioma y variante.** Recomendación: `es-419` neutro por defecto, con `es-ES` disponible en el panel avanzado. ¿Se ofrece la variante desde el día uno o se fija una sola?
3. **Subtítulos: quemados, sidecar o ambos.** Recomendación: ambos por defecto (quemados para el feed silenciado, SRT para reutilizar). Quemar impide corregir después sin recomponer; el SRT solo obliga al espectador a activarlos. ¿Se mantiene "ambos" o se elige uno?
4. **Densidad de corte.** Aceptar 5 planos en 30 s y 15 en 90 s `production` (consecuencia de F9 y del reparto por voz), o mantener más cortes comprando más clips (coste por historia sube ~40 %). Esta es la decisión de producto con más consecuencias visuales.
5. **Qué hacemos con el modo mudo actual.** Recomendación: deja de ser comportamiento y pasa a `NUXT_STORY_AUDIO_ENABLED`, interruptor de servidor no expuesto al cliente. ¿Se acepta, o se quiere además un "generar sin voz" visible para el usuario?
6. **Historias ya entregadas.** Confirmar que **no** se reaudio ni se reensamblan (retrofit fuera de alcance). Si se quieren, es otra spec con su coste.
7. **Voces del catálogo.** ¿ Tres ids semánticos (`neutro`, `calido`, `energico`) bastan, o el humano quiere escuchar muestras antes de fijar el catálogo? Las muestras cuestan céntimos y evitan rehacer el registro.
8. **Música y efectos.** Confirmar que quedan fuera de 014. Cuando entren, el ducking de §7.2 pasa a ser obligatorio y hay que resolver licencias.
9. **Presupuesto de smoke real.** Fal tiene ~5 USD y la cuenta se bloqueó por saldo el 2026-10-24. Sin recarga no hay ni voz real ni validación: el orden de magnitud del smoke es 0,15–0,30 USD (tres frases + una historia de 15 s), pero requiere autorización explícita.
