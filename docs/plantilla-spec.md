# Plantilla de spec — cómo escribo specs con SDD en AI Shorts

Material de apoyo para el post. Sale de leer las 16 specs del repositorio
(`specs/001` a `specs/016`), no de una plantilla genérica. Las primeras (001–004)
siguen casi al pie de la letra la plantilla de Spec Kit; a partir de la 008 la
estructura se vuelve más corta, más medida y con más tablas. Esta plantilla
recoge esa versión madura.

Índice:

1. [La estructura y para qué sirve cada sección](#1-la-estructura-y-para-qué-sirve-cada-sección)
2. [Plantilla vacía](#2-plantilla-vacía)
3. [Ejemplos reales por sección](#3-ejemplos-reales-por-sección)
4. [Reglas y hábitos que se repiten](#4-reglas-y-hábitos-que-se-repiten)

---

## 1. La estructura y para qué sirve cada sección

| # | Sección | Para qué sirve | ¿Siempre? |
|---|---|---|---|
| 0 | **Cabecera** (rama, fecha, estado, input) | Dice en qué punto está la spec y cuál fue la petición original, con las palabras del humano | Sí |
| 1 | **Por qué esta spec existe** | El problema medido: qué se ve, qué lo causa en el código, con cifras. Si no hay evidencia, no hay spec | Sí |
| 2 | **Alcance del MVP** | Lista numerada y corta de lo que entra. Lo que no está aquí, no se hace | Sí |
| 3 | **Fuera de alcance** | Lo que alguien podría esperar y no entra, a veces con la spec a la que se aplaza | Sí |
| 4 | **Decisiones cerradas** | Tabla decisión → elección → motivo. Lo que ya no se discute durante la implementación | Sí, desde 007 |
| 5 | **Contexto y relación con specs previas** | Qué se reutiliza tal cual, qué se toca y qué queda intacto (con la suite de 004 como testigo) | Sí |
| 6 | **Tabla de enmienda** | Cláusula anterior → texto anterior → contrato nuevo. Obligatoria si se cambia un contrato existente | Si cambia un contrato |
| 7 | **Historias de usuario y criterios de aceptación** | Cada historia con prioridad, un test independiente y escenarios Given/When/Then comprobables | Sí |
| 8 | **Edge cases** | Los bordes que rompen: vacío, límite exacto, límite + 1, offline, SSR, entrada maliciosa | Sí en specs con UI o API |
| 9 | **Requisitos funcionales** | Tabla `FR-NNN` con MUST / MUST NOT. Un requisito, una frase verificable | Sí |
| 10 | **Contrato de datos** | Tipos compartidos (`app/models/`), tipos solo de servidor y persistencia/migración | Si cambia un tipo o la BD |
| 11 | **Contrato de API** | Rutas nuevas o ampliadas, errores HTTP, eventos de log permitidos | Si hay rutas |
| 12 | **Arquitectura server-side** | Árbol de archivos con una línea por módulo y los límites que se respetan | Si hay código de servidor |
| 13 | **Máquina de estados y recuperación** | Estados, transiciones y tabla de fallos: qué pasa cuando cada pieza falla | Si hay jobs o pasos asíncronos |
| 14 | **UI/UX y copy deck** | Textos exactos, `data-testid`, ARIA, presupuesto de clics | Si hay UI |
| 15 | **Seguridad, coste y lifecycle** | Secretos, allowlist, rate limit, cap de presupuesto, idempotencia, caducidad de medios, logs prohibidos | Si hay proveedor o dinero |
| 16 | **Impacto en configuración** | Variables nuevas, defaults, y dónde se reflejan (README, `.env.example`, `nuxt.config.ts`) | Si cambia un default |
| 17 | **Coste** | Aritmética por historia o por perfil, con el precio y la fecha en que se leyó | Si hay proveedor de pago |
| 18 | **Plan de test** | Qué se prueba con stubs, qué es opt-in con proveedor real, qué es manual | Sí |
| 19 | **Fases** | Orden de implementación, de lo puro a lo integrado, terminando en el gate | Sí |
| 20 | **Riesgos** | Riesgo → mitigación. Breve | Sí |
| 21 | **Supuestos y lo que no está probado** | Lo que se da por cierto sin haberlo medido. Honestidad antes de implementar | Sí |
| 22 | **Decisiones que el humano debe cerrar** | Preguntas abiertas con recomendación propia. Se cierran en el Checkpoint 1 | Mientras esté en `Draft` |
| 23 | **Constitution check** | Un punto por principio de la constitución, en una línea | Recomendado |
| 24 | **Hallazgos y enmiendas con fecha** | Lo que se descubrió al implementar o al probar con el proveedor real, y el contrato que cambia | Se añaden después |
| 25 | **Estado final / deuda declarada** | Qué funciona, qué no, y qué falta para `Validated` | Al cerrar |

El orden no es sagrado, pero tiene una lógica: **por qué → qué entra → qué no →
qué ya está decidido → cómo encaja → cómo se comprueba → cómo se construye →
qué puede salir mal → qué falta por decidir**. Las secciones 24 y 25 crecen
después de aprobar la spec: la spec es un documento vivo, no un acta.

---

## 2. Plantilla vacía

Copiar a `specs/NNN-nombre-corto/spec.md`.

````markdown
# Feature Specification: <Nombre en lenguaje de producto>

**Feature Branch**: `NNN-nombre-corto`

**Created**: AAAA-MM-DD

**Status**: `Draft`. Checkpoint 1 pendiente. Sin código antes de la aprobación humana.

**Input**: User description: "<la petición literal del humano>"

---

## Por qué esta spec existe

<Qué se ha visto, cuándo y con qué cifras.>

| Fallo | Qué se ve | Causa real en el código |
|---|---|---|
| | | |

<La cadena causal que hay que romper, en una línea o un bloque de texto.>

---

## Alcance del MVP

1.
2.
3.

**Fuera del MVP:** <lista separada por comas>.

---

## Decisiones cerradas

| Decisión | Elección | Motivo |
|---|---|---|
| | | |

---

## Contexto y relación con specs previas

| Spec | Relación con NNN |
|---|---|
| **004 Composer** | Intacta. NNN no toca `server/composer/**` ni sus tests |
| | |

### Lo que se reutiliza tal cual

| Pieza existente | Uso en NNN |
|---|---|
| | |

---

## Tabla de enmienda a <spec>

<spec> conserva su texto histórico como trazabilidad. Esta tabla **prevalece**
sobre las cláusulas listadas. Todo lo no listado sigue vigente sin cambios.

| Cláusula | Texto anterior (resumen) | Enmienda de NNN |
|---|---|---|
| | | **Se mantiene / Ampliado / Sustituido / Superseded.** |

---

## User scenarios y criterios de aceptación

### US-1 — <Resultado para la persona, en una frase> (P1)

<Narración corta: quién, qué hace, qué obtiene.>

**Test independiente:** <cómo se demuestra esta historia sola, sin las demás>.

1. **Given** …, **When** …, **Then** ….
2. **Given** …, **When** …, **Then** ….

### US-2 — … (P1)

### Edge cases

- **<Caso>**: <comportamiento exacto, con el mensaje literal si lo hay>.

---

## Requisitos funcionales

| ID | Requisito |
|---|---|
| FR-001 | MUST … |
| FR-002 | MUST NOT … |

---

## Contrato de datos

### `app/models/<dominio>.ts` (compartido)

```ts
```

### Solo servidor

### Persistencia y migración

---

## Contrato de API

| Ruta | Cambio |
|---|---|
| | |

**Eventos de log:** permitido …; prohibido ….

---

## Arquitectura server-side

```text
server/api/...      ruta fina
server/<dominio>/
  <módulo>.ts       puro: … + tests
```

Límites que se respetan:

- La ruta no conoce al proveedor.
- El adaptador no conoce `useRuntimeConfig`.

---

## Máquina de estados y recuperación

| Fallo | Qué pasa | Estado final | Qué ve el usuario |
|---|---|---|---|
| | | | |

---

## UI/UX y copy deck

| Contexto | Texto exacto |
|---|---|
| | |

Presupuesto de clics: …

---

## Seguridad, coste y lifecycle

| Regla | Contrato |
|---|---|
| Secretos | |
| Proveedor solo en servidor | |
| Rate limit | |
| Presupuesto | |
| Idempotencia | |
| Lifecycle | |
| Logs | |

---

## Impacto en configuración

| Variable | Default | Dónde se documenta |
|---|---|---|
| | | README, `.env.example`, `nuxt.config.ts` |

---

## Coste

<Precio por unidad con fecha de lectura, aritmética por perfil, cap.>

---

## Plan de test

- **Con stubs (gate):**
- **Opt-in con proveedor real:** variable `RUN_…_SMOKE=1`, presupuesto máximo …
- **Manual:**

---

## Fases

1. Módulos puros + tests.
2. Adaptador / integración + tests.
3. Persistencia y DTO.
4. UI y copy.
5. Gate completo (`npm run test:run` + `npm run build`).
6. Prueba real, si se autoriza.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| | |

---

## Supuestos y lo que no está probado

-

---

## Decisiones que el humano debe cerrar

1. **<Tema>.** Recomendación: …. Alternativas: …. ¿…?

---

## Constitution check

- **I. Simplicidad:**
- **II. SDD:**
- **III. Secretos:**
- **IV. Modularidad:**
- **V. Tests:**
- **VI. Cierre:**
- **VII. Economía de tests:**
- **VIII. Compatibilidad:**
````

Cuando la spec se cierra, la línea de estado pasa a algo así:

```markdown
**Status**: `Implemented` (AAAA-MM-DD, commit `abc1234`). Gate: N passed / M skipped,
build correcto. **No `Validated`:** falta <smoke real / QA manual>.
Desviaciones conocidas: …
```

---

## 3. Ejemplos reales por sección

Recortados de las specs del repositorio. Se han quitado identificadores internos
de historias y cualquier dato de cuenta.

### Cabecera e input

De la 014 (voz y subtítulos). El input es la frase literal del humano, no un
resumen:

> **Status**: `Draft`. Checkpoint 1 pendiente. Sin código antes de la aprobación
> humana. Este documento **no decide proveedor de TTS, idioma ni formato de
> subtítulo**: presenta las opciones, recomienda y deja la decisión en la última
> sección.
>
> **Input**: User description: "La primera historia completa ya sale entera y no
> se entiende. Comparada con el vídeo de referencia, la diferencia no son los
> prompts: la referencia habla y la nuestra no."

### Por qué esta spec existe

De la 014. Fallo → qué se ve → causa en el código:

> | Fallo | Qué se ve | Causa real en el código |
> |---|---|---|
> | **F1** | El vídeo es mudo | `shot-assembly-service.ts` normaliza cada clip con `-an` y el MP4 final no tiene pista de sonido |
> | **F9** | 12 planos de 2 s, cada clip pagado dura 6 s | `allocateDurations()` hace `Math.floor(target / shots)`: la duración **nace de una división**, no del contenido |
>
> ```text
> perfil de coste → nº de planos (12) → 24 s ÷ 12 = 2 s por plano
>       → el motor hace clips de 6 s → se paga 6 y se usa 2 → el vídeo no dice nada
> ```
>
> **Esta spec invierte el orden:** primero se escribe lo que se dice, después se
> mide cuánto dura decirlo, y el vídeo se dimensiona sobre esa medida.

De la 016, cuando el problema es un dato que nadie había contrastado:

> **Hallazgo:** el nombre del campo de última imagen **cambia entre los dos
> motores**. Un pipeline que lo dé por hecho rompe al cambiar de motor.
>
> Lo que hace hoy el código: `preset === 'quality' ? 5 : 6`, un ternario. Acierta
> con los dos motores actuales **por casualidad**. Con el tercero, rompe.

### Alcance del MVP

De la 015 (gráficos):

> Cuatro piezas, todas locales y deterministas:
>
> 1. **Rótulo de titular** por escena, con tipografía, tamaño, posición y zona segura vertical.
> 2. **Terminal falsa** con contenido real del guion, sin inventar nada.
> 3. **Banda inferior** con nombre de canal o etiqueta de marca.
> 4. **Orden de composición** sobre el MP4 ya montado, sin volver a codificar cada plano.

### Lo que queda fuera

De la 015. Cada exclusión dice a dónde va, si va a algún sitio:

> - Animación de gráficos y transiciones.
> - Editor visual por el usuario.
> - Subtítulos: pertenecen a 014 (audio), porque dependen de los tiempos del TTS.
> - Sustituir la pantalla inventada por contenido real compuesto en perspectiva:
>   requiere tracking y va en una spec futura.

De la 014, en una sola línea:

> **Fuera del MVP:** música, efectos de sonido, diálogo entre personajes,
> sincronización labial, clonación de voz, traducción, editor de voz en la UI.

### Decisiones cerradas

De la 014. La columna «Motivo» es la que importa: sin ella, la decisión se
reabre en la primera duda:

> | Decisión | Elección | Motivo |
> |---|---|---|
> | **Quién habla** | Un narrador en off, sin diálogo | Un personaje moviendo la boca con una voz que no le corresponde se lee como un error. El lip-sync fiable no existe en los motores que usamos |
> | **Autoridad de la duración** | La voz medida. La estimación solo sirve para escribir | Si la estimación mandase, se recortaría voz real en el montaje, que es peor que un plano corto |
> | **Fallo de voz** | El vídeo se entrega **sin voz y marcado** | Un vídeo mudo es un vídeo; un vídeo con subtítulos inventados es una mentira |

De la 012, decisiones aprobadas por el humano, con una tachada y su motivo:

> 3. ~~El vídeo recibe el keyframe más las referencias de los demás
>    personajes.~~ **Aplazado**: la sonda funcionó, pero duplica el coste de
>    vídeo. **012 no cambia el motor de vídeo.**
> 4. **Quien está en foco manda el encuadre**: si el gato teclea, el plano se
>    encuadra en el gato, no un plano general con un gato en alguna parte.

### Relación con specs previas

De la 014:

> | Spec | Relación con 014 |
> |---|---|
> | **004 Composer** | Intacta. 014 no toca `server/composer/**`, ni sus rutas, ni sus 605 tests |
> | **015 Gráficos** | Se reutiliza el patrón (plan puro → argumentos FFmpeg → pase único con degradación declarada). 014 **comparte el pase** de 015 en lugar de añadir otro encode |
> | **016 Capacidades** | `planShotDurations()` existe y **no está llamada desde ningún sitio del pipeline**. 014 la pone en el camino crítico |

### Historia de usuario y criterios de aceptación

De la 014. Título como resultado, narración corta, test independiente y
escenarios que se pueden convertir en test sin interpretar:

> ### US-3 — Si la voz no llega, se sabe (P1)
>
> El proveedor de TTS devuelve 503 en dos ocasiones. La historia no se bloquea:
> los keyframes y los vídeos siguen, el MP4 se entrega **sin voz**, sin
> subtítulos, y la UI lo dice.
>
> 1. **Given** dos fallos consecutivos del TTS en una escena, **When** termina
>    la historia, **Then** `audio.status === 'missing'`, `captionsUrl === null`,
>    el MP4 no tiene pista de audio y la historia está `READY` con nota.
> 2. **Given** una historia con `audio.status === 'missing'`, **When** se abre
>    el resultado, **Then** se ve `Este vídeo no tiene voz. El resto está
>    completo.` en un aviso discreto, no en un error rojo.
> 3. **Given** `NUXT_STORY_AUDIO_ENABLED=false`, **When** se crea una historia,
>    **Then** no se llama al TTS y `audio.status === 'skipped'`.

### Edge cases

De la 004 (Composer real). Límite exacto, límite + 1, y el mensaje literal:

> - **Prompt de 280 caracteres**: se acepta. 281 se rechaza en cliente y en
>   servidor con `La idea no puede superar los 280 caracteres.`.
> - **Prompt con emoji**: el contador usa `String.length` (igual que
>   `maxlength`), de modo que un emoji puede contar 2.
> - **Prompt con HTML o `<script>`**: se envía como texto; se renderiza con
>   interpolación y nunca con `v-html`.
> - **Hidratación**: no se usa `Date.now()`, `Math.random()` ni la hora para
>   renderizar el estado inicial.

### Requisitos funcionales

De la 015. MUST / MUST NOT, un requisito por fila:

> | ID | Requisito |
> |---|---|
> | FR-001 | MUST existir `server/story/graphics-plan.ts`: función pura que convierte un `StoryPlan` en un `GraphicsPlan` determinista. Mismas entradas, mismo plan, sin reloj ni azar |
> | FR-004 | El texto de cada rótulo MUST venir del guion. El compositor MUST NOT inventar texto |
> | FR-008 | Un fallo de FFmpeg en los gráficos MUST NOT perder el vídeo: se entrega el MP4 sin gráficos, se registra `story.graphics.failed` y la historia sigue |

### Seguridad, coste y lifecycle

De la 014:

> | Regla | Contrato |
> |---|---|
> | Proveedor solo en servidor | El cliente nunca ve un id de proveedor, ni un endpoint, ni un precio por carácter |
> | Idempotencia | Por `(storyId, sceneOrder, hash(spokenLine + voiceId + provider))`. Reintentar la misma entrada no vuelve a cobrar |
> | Derechos | Solo voces del catálogo del proveedor. **Sin clonación, sin voces de famosos, sin imitaciones.** Queda escrito porque es la puerta que no se abre por accidente |
> | Logs | Prohibido `spokenLine`, audio, URL firmada, clave. Permitido `characters`, `speechSeconds`, `costUsd`, `providerId` |

### Tabla de enmienda

De la 008, enmendando la 007. La spec vieja no se reescribe: se dice qué
cláusula cambia y cómo:

> 007 conserva su texto histórico como trazabilidad. Esta tabla **prevalece**
> sobre las cláusulas listadas. Todo lo no listado sigue vigente sin cambios.
>
> | Cláusula de 007 | Texto anterior (resumen) | Enmienda de 008 |
> |---|---|---|
> | **FR-401** | No modificar el Composer; 605 tests intactos. | **Se mantiene.** |
> | **FR-405** | Sin nuevas tablas ni índices. | **Superseded.** Se añade la tabla `Shot` y sus índices. Sin nuevas dependencias ni proveedores. |
> | **FR-419** | `StoryBeat` con `order`, `sceneRole`, … | **Sustituido.** `StoryBeat` desaparece. Los campos visuales pasan a `StoryShot`. |

De la 012, cuando la regla anterior se retira pero su motivo se conserva:

> | # | Contrato anterior | Origen | Contrato nuevo |
> |---|---|---|---|
> | 1 | "Una sola imagen por plano". | 011, enmienda | **N referencias por plano**, máximo 3, **nunca una rejilla**. El motivo de la regla anterior (el modelo copia la rejilla) se conserva como prohibición de rejilla, no como límite de una imagen. |

### Enmienda con fecha (hallazgo durante la implementación)

De la 013. Se midió, no funcionó, y se retira por escrito con la evidencia:

> ## Enmienda — el guardia de texto se retira (2026-10-24)
>
> La heurística de texto **no se implanta**. Se midió dos veces sobre la misma
> familia de imágenes y no separa los casos:
>
> | Muestra | Contenido real | 128×384 | 160×480 |
> |---|---|---|---|
> | Plano general con monitor de neón | **Sin texto** | 17 filas | 0 |
> | Plano con titular inventado | **Con texto** | 4 filas | 0 |
>
> No existe umbral que acepte el monitor de neón y rechace el titular.

De la 015, defectos de la primera prueba real, corregidos en código:

> | Defecto | Síntoma | Causa | Arreglo |
> |---|---|---|---|
> | Título descentrado | Se salía por la izquierda | En texto multilínea `text_w` es la línea más larga, no el bloque | `(w-text_w)/2` |
> | Terminal de 10 s | Tapaba media historia | Duraba hasta el título final | `TERMINAL_SECONDS = 4` |

### Riesgos

De la 015:

> | Riesgo | Mitigación |
> |---|---|
> | `drawtext` no está en todos los FFmpeg | Se detecta al arrancar y se desactiva con evento; el vídeo se entrega igual |
> | Doble codificación degrada la calidad | Un solo pase sobre el MP4 final, con `-crf 18` |

### Supuestos y lo que no está probado

De la 014:

> - **No se ha llamado a ningún TTS real.** Todo el apartado de calidad de voz,
>   latencia y desviación es una previsión basada en las fichas públicas, no
>   una medición de este pipeline.
> - **No se ha medido `loudnorm` sobre una voz real.** Los valores −14/−1 son el
>   objetivo estándar, no un resultado observado.
> - La constante 2,6 palabras/s es una estimación; se calibra en la fase 9 y se
>   anota con fecha.

### Decisiones que el humano debe cerrar

De la 014. Cada pregunta trae una recomendación, alternativas y su coste:

> 3. **Subtítulos: quemados, sidecar o ambos.** Recomendación: ambos por
>    defecto (quemados para el feed silenciado, SRT para reutilizar). Quemar
>    impide corregir después sin recomponer. ¿Se mantiene "ambos" o se elige uno?
> 4. **Densidad de corte.** Aceptar 5 planos en 30 s, o mantener más cortes
>    comprando más clips (coste por historia sube ~40 %). Esta es la decisión
>    de producto con más consecuencias visuales.

### Constitution check

De la 009 (eval del director):

> - **I. Simplicidad:** no cambia el producto ni la UI; la eval es herramienta.
> - **III. Secretos:** la clave sigue en servidor; las fixtures no guardan cabeceras.
> - **VI. Cierre:** la spec quedará en `Implemented` al mergear; `Validated` solo
>   tras la ejecución real aprobada.
> - **VII. Economía de tests:** el runner no entra en `test:run`.

### Estado final y deuda declarada

De la 016. El estado dice lo que funciona **y** lo que no:

> **Status**: Implemented **parcial**. Lo que funciona: las fichas con datos
> oficiales, y el orquestador ya no contiene duraciones literales. Lo que
> **no**: `planShotDurations` solo la usan los tests. **Consecuencia:** el
> reparto de planos que la spec describe **no está implementado**.

De la 013:

> | Deuda | Impacto | Coste de cierre |
> |---|---|---|
> | El texto puede aparecer cuando el encuadre enfoca el monitor de cerca | Medio: depende de la escena | Elegir planos que no enfoquen la pantalla, o cambiar de motor |
>
> **013 queda `Implemented`, no `Validated`.**

---

## 4. Reglas y hábitos que se repiten

**Sobre el contenido**

1. **Empezar por la evidencia, no por la solución.** Las specs maduras abren con
   «Por qué esta spec existe» y una tabla fallo → síntoma → causa en el código,
   con nombre de archivo y función. La solución viene después.
2. **El input es literal.** La petición del humano se copia entre comillas. Es
   la vara de medir al final: ¿esto resuelve lo que se pidió?
3. **Escribir siempre lo que queda fuera.** Cada spec tiene su «Fuera de
   alcance», y muchas dicen a qué spec se aplaza cada cosa. Evita que el
   desarrollador «aproveche» y amplíe.
4. **Cada decisión lleva su motivo.** Tabla decisión → elección → motivo. Sin
   motivo, la decisión se reabre en la primera duda.
5. **Medir antes de afirmar.** Precios, duraciones y nombres de campo se leen del
   esquema oficial del proveedor y se anotan con fecha («consultado el
   2026-10-24»). Un número sin fecha es una suposición.
6. **Declarar lo que no está probado.** Sección propia de supuestos: «no se ha
   llamado a ningún TTS real». Es lo opuesto a vender la spec.
7. **Preguntas abiertas con recomendación.** Nunca «¿qué hacemos con X?» a
   secas: recomendación, alternativas, coste y la pregunta concreta.

**Sobre los contratos**

8. **Tabla de enmienda cuando se toca un contrato previo.** La spec antigua no se
   reescribe: queda como trazabilidad y la nueva dice cláusula por cláusula si
   se mantiene, se amplía, se sustituye o queda *superseded*. «Todo lo no
   listado sigue vigente.»
9. **Al retirar una regla, conservar su motivo.** Si el motivo sigue siendo
   cierto, se reformula como otra regla (de «una imagen por plano» a «nunca una
   rejilla»).
10. **La 004 como testigo.** Casi todas las specs dicen explícitamente que no
    tocan el Composer y que sus 605 tests siguen intactos. Es la prueba de no
    regresión más barata.
11. **Requisitos con MUST / MUST NOT** y numerados (`FR-NNN`), uno por fila,
    verificables con un test.
12. **Mensajes y textos exactos.** El copy de error va entre comillas en la
    spec, porque el test lo compara literal.

**Sobre el comportamiento**

13. **Degradación declarada, nunca éxito falso.** Si una capa falla (voz,
    gráficos, QC), el vídeo se entrega sin ella, marcado, y la UI lo dice. Lo
    que no se hace: inventar subtítulos, simular un PASS o esconder el fallo.
14. **Lo determinista lo hace el código, no el modelo.** Texto legible con
    FFmpeg, duraciones desde la ficha del motor, reparto de planos en código. El
    modelo solo hace lo que no se puede hacer de otra forma.
15. **Coste en la spec, con cap duro.** Cada spec con proveedor de pago trae la
    aritmética por perfil y el tope que se comprueba **antes** de cada llamada.
16. **Seguridad como tabla fija:** secretos, allowlist, rate limit, presupuesto,
    idempotencia, lifecycle y logs prohibidos. Se repite en cada spec aunque
    parezca obvio.

**Sobre el proceso**

17. **Arquitectura de lo puro a lo integrado.** Las fases empiezan siempre por
    módulos puros con tests (sin I/O, sin mocks) y terminan en el gate y una
    prueba real.
18. **La spec crece después de aprobarse.** Hallazgos y enmiendas con fecha se
    añaden al final: lo que se descubrió con el proveedor real y qué contrato
    cambió. Un arreglo sin spec es deuda, aunque el test esté en verde.
19. **El estado es una afirmación sobre evidencia.** `Draft` → `Approved` →
    `Implemented` → `Validated`. `Implemented` dice qué funciona y qué no;
    `Validated` solo lo concede el humano tras una prueba real. A fecha de hoy,
    ninguna spec del repo está `Validated`, y está escrito así.
20. **Renumerar en voz alta.** Cuando una spec ocupa un número reservado para
    otra, lo dice y lo refleja en `AGENTS.md` al cerrar.
