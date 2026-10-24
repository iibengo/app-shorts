# AI Shorts: resumen para la serie del blog

> **Qué es este documento y qué no.** Es material para escribir los artículos, no documentación del proyecto. El estado técnico real vive en `AGENTS.md`, en `BACKLOG.md` y en `CAMBIOS-SIN-CONFIRMAR.md`. Lo que aquí aparece puede quedarse viejo: sirve para contar la historia, no para saber cómo está el código.

Este resumen sale **solo** de lo que hay escrito en el repositorio: `specs/`, `.specify/memory/constitution.md`, `AGENTS.md`, `BACKLOG.md`, `README.md`, `.opencode/` y el historial de git (110 commits, de 2026-09-11 a 2026-10-24). Cuando algo no está documentado, lo digo. No incluye claves, variables de entorno, URLs de proveedor ni identificadores internos de historias.

---

## 1. Qué es el proyecto (para quien no programa)

AI Shorts es una aplicación web que convierte una idea escrita en un vídeo vertical corto, del tipo de TikTok o Instagram Reels. Escribes una premisa, eliges si quieres un estilo visual y una duración, y la aplicación escribe la historia, la divide en planos, dibuja una imagen para cada plano, la anima y une todos los clips en un único vídeo. Si subes tu foto o tu avatar, intenta que el protagonista sea el mismo en todos los planos. El objetivo es que el camino normal sean de 1 a 3 clics y que lo avanzado quede escondido y sea opcional.

---

## 2. Arquitectura en lenguaje llano

### Las piezas

| Pieza | Qué hace en este proyecto |
|---|---|
| **Nuxt** (Nuxt 4, Vue 3, Tailwind 3.4) | Es la aplicación entera: las pantallas que ve el usuario y también el servidor (Nitro, sobre Node.js 22). El navegador solo habla con este servidor. Las claves de los proveedores viven solo en el servidor. |
| **PostgreSQL + Prisma** | La memoria del sistema: cada historia, sus escenas y sus planos se guardan con su estado. Así la historia sobrevive a una recarga y el trabajo se puede retomar. |
| **DeepSeek** | El guionista. Escribe el canon (personajes, lugares, objetos), las escenas y la lista de planos, en JSON validado por el servidor. También se usa como "ojo" de visión en el control de calidad (desde la 006). |
| **fal.ai** | El estudio de imagen y vídeo. A través de fal se llaman los modelos que dibujan (FLUX, FLUX Kontext, Nano Banana) y los que animan (MiniMax Hailuo, Kling). También guarda archivos: las subidas firmadas y el MP4 final. |
| **FFmpeg / ffprobe** | El montador, en local. Descarga los clips, los normaliza, los une con cortes secos, comprueba duraciones, extrae fotogramas para el control de calidad, detecta imágenes partidas en dos viñetas y, desde la 015, pinta los títulos y textos encima del vídeo. |

### Cómo viaja la información, de la idea al vídeo

1. **Idea.** El usuario escribe la premisa en la pantalla de Story. Opcionalmente sube una foto (el navegador la sube directamente a fal con un permiso firmado y de corta duración: es la única vez que el navegador toca al proveedor), elige estilo (`cartoon3d` por defecto, `papercraft`, `clay`, `anime`, `photo`), duración (15/30/45/60/90 s) y perfil de coste (budget, standard, production).
2. **Registro.** El servidor valida, aplica límites de uso y presupuesto, y crea la historia en PostgreSQL.
3. **Guion (DeepSeek).** Primero el *Narrador* escribe el canon y los momentos de la historia; después el *Director Visual* lo convierte en escenas y planos con encuadre y cámara. Los campos visuales van en inglés; título, logline y narración, en español.
4. **Personajes (fal, Nano Banana).** Cada personaje sin foto del usuario recibe una imagen propia, una sola vez (0,04 USD). La foto del usuario sigue siendo la del protagonista.
5. **Fotograma clave por plano (fal).** Para cada plano se dibuja primero una imagen vertical 9:16 (*keyframe-first*), con hasta 3 referencias de personaje. FFmpeg revisa que no salga una imagen partida en dos viñetas antes de pagar el vídeo.
6. **Vídeo por plano (fal, MiniMax o Kling).** Cada imagen se anima con un prompt que describe solo movimiento. Son trabajos asíncronos: el servidor los encola y un proceso en segundo plano (el *reconciliador*) pregunta por su estado, reintenta lo que se puede reintentar y cancela lo que se queda colgado.
7. **Control de calidad.** FFmpeg extrae fotogramas y, según la 006, DeepSeek Vision los revisa antes del montaje. Si no puede revisarlos, la historia queda en revisión: no se inventa un aprobado.
8. **Montaje (FFmpeg).** Une los clips con cortes secos y verifica la duración final.
9. **Gráficos (FFmpeg, 015).** Pinta en local, en un solo pase, un título al principio y otro al final, una terminal opcional de 4 s con texto del guion y una etiqueta. Si falla, se entrega el vídeo sin gráficos.
10. **Entrega.** El MP4 se sube al almacenamiento de fal y el navegador, que ha ido consultando el estado sin porcentajes inventados, muestra el resultado. Si el vídeo falla, se conserva el fotograma clave como póster (éxito parcial).

Las specs no documentan todavía audio, voz, música ni subtítulos: están previstos para la spec 014, que aún no existe.

---

## 3. Cronología

Fechas tomadas del campo `Created` de cada spec y de los commits.

| Spec | Fecha | Qué resolvía |
|---|---|---|
| — | 2026-09-11 | Commit `chore: install project`. No hay más actividad hasta el 18 de octubre. |
| **001** Landing en construcción | 2026-10-18 | Una página de inicio de marca, honesta: anuncia que el producto llega, sin cifras falsas ni botones que no hacen nada. |
| **002** Feed de Shorts mock | 2026-10-18 | Un feed vertical en `/feed` con datos ficticios para validar la experiencia visual. |
| **003** Composer mock | 2026-10-19 | Primer estudio de creación, simulado (sin IA ni backend). **Sustituida** por la 004; se conserva como histórico. |
| **004** Composer real | 2026-10-20 | Primera generación real con fal: prompt + foto opcional, fotograma clave con FLUX, vídeo con MiniMax o Kling, subida firmada, trabajos asíncronos, cancelación, límites y presupuesto. |
| **005** Story Composer | 2026-10-21 | De un clip a un micro-relato: 4–6 escenas de 6 s, guion con DeepSeek, montaje con FFmpeg y persistencia en PostgreSQL. Presupuesto máximo de 8 USD. |
| **006** Continuidad | 2026-10-21 | Una "biblia" de la historia y control de calidad antes de montar, para que los objetos, la ropa y el clima no cambien de escena a escena. |
| **007** Modos y canon | 2026-10-22 | Reescribe la 006: varias localizaciones y dos pasadas de DeepSeek (Narrador y Director Visual), con estructura de gancho, complicación, giro y remate. |
| **008** TikTok Reel Engine | 2026-10-22 | La duración pasa a ser un contrato (15–90 s), cada escena tiene varios planos, hay perfiles de coste y se puede regenerar un plano suelto. |
| — | 2026-10-22 | Endurecimiento de los agentes de OpenCode: el revisor no lanza subagentes, el arquitecto solo edita `specs/`, el tester no toca specs ni configuración, `git push` denegado. |
| — | 2026-10-23 | Arreglos B1, B2, B4 y A3 (ver sección 4), cada uno con su enmienda en la spec antes del código. |
| **009** Director eval | 2026-10-23 | Medir de forma reproducible la calidad del director con DeepSeek real: 12 premisas, tope de 1 USD, resultados grabados y repetibles sin red. |
| **010** Estilo visual | 2026-10-23 | Elegir el estilo desde la interfaz y anclar la identidad de cada personaje en su primer fotograma (010a y 010b). |
| **011** Hoja de personaje | 2026-10-24 | Una hoja con varias vistas del personaje y una verificación automática de identidad. La tubería existe, pero la hoja quedó **en reposo** (ver sección 4). |
| **012** Referencias por personaje | 2026-10-24 | Una imagen propia por personaje secundario y encuadre en quien hace la acción. |
| **013** Prompts oficiales | 2026-10-24 | Rehacer los prompts según la documentación oficial de los modelos para que dejen de inventar texto. |
| **014** | — | **No existe.** El número está reservado para audio, voz, música y subtítulos. |
| **015** Gráficos y overlays | 2026-10-24 | El texto legible lo pinta FFmpeg, nunca el modelo. |
| **016** Capacidades de los motores | 2026-10-24 | Una ficha por motor de vídeo (duraciones, entradas, coste) para no pedir lo que el motor no acepta. Estado `Approved`: aún sin implementar. |

---

## 4. Momentos interesantes para contar

### Cambios de rumbo y specs rehechas

- **De mock a real (003 → 004).** El Composer se diseñó primero como simulación sin backend. La 004 lo sustituyó entero por fal real, y la 003 quedó marcada como "no reutilizar su mock".
- **"Fuga en el parque" (005 → 006).** La 006 nace de una historia real que salió técnicamente correcta pero incoherente: *"el patinete azul pasó a bicicleta y luego a patinete rosa, el vestuario cambió, apareció un personaje que no estaba en ningún prompt, el clima pasó de día a tormenta y el protagonista desapareció"*. La causa documentada: cada fotograma se generaba sin memoria de los demás.
- **La 007 rechaza la solución de la 006.** La 006 resolvió la continuidad con una sola localización, una sola hora y un solo clima. El resultado fueron escenas repetidas, y el humano lo rechazó. La 007 es una "reescritura de contrato": hasta 3 localizaciones y dos pasadas de DeepSeek.
- **De 4–6 escenas fijas a reels (007 → 008).** Los vídeos de 24–36 s "no se parecen a un reel": no hay gancho en el primer segundo ni varios planos por escena. La 008 convierte la duración en contrato.
- **El audio se renumeró varias veces.** Estaba previsto como 009 (AGENTS.md), luego 011, luego 012/013 y ahora 014. Sigue sin escribirse.

### Problemas que solo aparecieron al ejecutar

- **DeepSeek "pensaba" sin que se le pidiera (B1, 2026-10-23).** Medido con 3 llamadas (~0,002 USD): el modelo razonaba por defecto, se comía el límite de tokens y la `temperature` no tenía efecto. Arreglo: desactivar el razonamiento de forma explícita en cada petición, con enmiendas en 005, 006, 007 y 008.
- **El canon se truncaba (007).** En una historia real de 4 escenas, el canon se cortó a 3.000 tokens; se subió a 8.000.
- **El primer run de principio a fin falló por proporción.** Kontext heredó un 3:4 de la imagen de referencia y MiniMax devolvió un 4:3. De ahí la regla: el primer fotograma lo genera FLUX a 1152×2048 y se rechaza cualquier fotograma fuera de 9:16 (±3 %).
- **Prompts en español que el modelo ignoraba (010).** Dos sondas de ~0,03 USD con el mismo plano: con el prompt mezclado ES/EN salió fotorrealista y sin la acción; con todo en inglés y el estilo al principio, salió 3D cartoon y con la acción.
- **La hoja de personaje devolvía dípticos (011).** Con la hoja, 3 de 4 planos mantenían la identidad. Pero el modelo "copia la estructura de la referencia": al recibir una rejilla 2×2 devolvía dos viñetas apiladas, que no sirven como fotograma. Añadir *"no grid, no collage"* no bastó. Decisión: hoja **en reposo**, una sola imagen por plano y un detector de dípticos con FFmpeg que rechaza la imagen antes de pagar el vídeo.
- **El texto inventado (013).** Un fotograma salió con un titular inventado en un portátil y dos bocadillos. El prompt **sí** decía `no text`. Según la documentación oficial, Nano Banana no tiene prompt negativo y Google pide *"describe what you want, not what you don't"*: nombrar "texto" lo activaba. Con prompts en positivo, el texto inventado pasó de 4 de 4 planos a 0 de 4.
- **El vídeo también inventaba texto.** El primer MP4 completo (15 s, 4 planos, 1,56 USD) salió con fotogramas limpios, pero MiniMax añadía titulares al animar las pantallas. Se resolvió con una frase en positivo: las pantallas conservan la imagen del primer fotograma.
- **Bugs de estado que la suite no cubría (013).** Un plano atascado para siempre en `KEYFRAME_QUEUED`, un plano devuelto a la cola cuando la historia ya estaba en la fase de vídeos y nadie lo reconstruía, y un tope de intentos demasiado bajo. Cada arreglo tiene un test comprobado "en ambos sentidos": falla sin el arreglo y pasa con él.
- **Los gráficos, a la primera, salieron mal (015).** Título descentrado y más ancho que el vídeo, terminal ilegible encima del personaje y de 10 s. Se corrigió en código: centrado real, tamaño adaptativo, caja translúcida y 4 s de máximo.
- **Las historias largas no se montan (backlog 0a, 2026-10-24).** En una historia de 30 s y 12 planos, el proveedor devuelve 5,875 s por clip aunque se pidan 2 o 3. El montaje recorta bien, pero la verificación rechaza el resultado con una tolerancia de 0,1 s. Con 4 planos no pasaba. Está en "Prioridad máxima" y es el origen de la 016, donde el humano decide: *"tenemos que adaptarnos a eso, más bien el director o el motor"*. Consecuencia aceptada: con un motor de mínimo 6 s, 15 s son 2 planos, no 4.

### Cosas descartadas y por qué

- **Kling v3 Pro con `elements`.** Funcionó en una sonda real (identidad estable), pero cuesta 0,56 USD por plano frente a 0,35 y tarda unos 7 minutos por plano. Se descartó por coste y queda como evidencia en `BACKLOG.md`.
- **El detector de texto (013).** Se implementó, se midió y se **retiró**: no distingue un monitor de neón de un titular, y a ninguna resolución hay un umbral que separe los casos. Duplicaba el coste de fotogramas (9 imágenes para 4 planos). Se retiró en vez de aflojarlo, porque *"un guardia que no distingue texto de decoración gasta dinero en regeneraciones correctas y no protege de nada"*.
- **Pantallas en blanco.** Se cambiaron por pantallas "ilegibles" tras una corrección del humano: *"No tiene que leerse claramente, porque para eso tenemos la capa de gráficos."*
- **La sospecha de que la cancelación no liberaba el cupo.** Se revisó y se descartó: los trabajos huérfanos venían de cancelaciones hechas a mano en SQL durante las pruebas, no del producto.
- **Copiar código de ArcReel.** Se usó como referencia de diseño, pero el backlog lo prohíbe expresamente porque es AGPL-3.0.

### Sobre el propio método

- **"Implemented" no es "Validated" (A3, 2026-10-23).** Al principio la 008 se dio por "implementada y validada". Después se separaron los dos estados: `Validated` exige un smoke real y una QA manual, y solo lo concede el humano. Hoy **ninguna spec está `Validated`**.
- **"No me preguntes" no desactiva el checkpoint (2026-10-24).** Lección registrada en `AGENTS.md`: *"cinco arreglos válidos quedaron fuera del método porque el humano dijo 'sigue sin preguntar' y el agente lo interpretó como 'sin checkpoints'"*. Desde entonces, un arreglo nacido de un fallo real se documenta como enmienda en la spec, en el mismo pase.
- **Un typecheck que destapa deuda.** Al añadir `vue-tsc` aparecieron 268 errores previos. No entra en el gate hasta llegar a cero.
- **Los agentes.** La orquestación usa OpenCode con un orquestador ("ionias", en Sonnet según el commit `8d84161`) y subagentes Architect, Developer, Reviewer y Tester en `deepseek-flash`.

---

## 5. Reglas del proyecto (constitución v1.4.0, resumida)

1. **Simplicidad primero.** El flujo por defecto tiene 1–3 clics, lo avanzado es opcional y la espera se cuenta con honestidad: sin porcentajes ni plazos inventados.
2. **Spec-Driven Development (no negociable).** Spec → aprobación humana (Checkpoint 1) → implementación → revisor de solo lectura → revisión humana (Checkpoint 2) → tests → cierre. Un cambio de contrato exige una tabla de enmienda, y las specs antiguas se conservan.
3. **Seguridad en servidor.** Las claves solo viven en el servidor y el navegador solo hace la subida firmada. Hay listas cerradas de modelos y destinos, trabajos asíncronos, y límites de uso, idempotencia y presupuesto en todo lo que cuesta dinero.
4. **Arquitectura modular.** Rutas finas, lógica en servicios por dominio con adaptadores y contratos compartidos estrictos (sin `any`).
5. **Tests primero y gates.** Tests con stubs, nunca el proveedor real en CI. El gate final es `npm run test:run` + `npm run build`.
6. **Cierre de spec.** El estado es una afirmación sobre evidencia: `Draft` → `Approved` → `Implemented` → `Validated`, y el último solo lo da un humano.
7. **Economía de tests.** La suite completa es un gate final, no un bucle de desarrollo, y nunca se debilita un test para pasar.
8. **Trazabilidad.** Cada spec declara qué contratos toca. Nada de compatibilidades silenciosas ni de flags `legacy` permanentes.

`AGENTS.md` añade: sin dependencias nuevas sin aprobación, sin estados falsos y *"un arreglo sin spec es deuda, aunque el test esté en verde"*.

---

## 6. Cifras documentadas

| Dato | Valor | Fuente |
|---|---|---|
| Specs | 15 carpetas (001–013, 015, 016); la 014 no existe | `specs/` |
| Specs implementadas | 004–013 y 015 en `Implemented`; 016 `Approved`; 003 sustituida; **ninguna `Validated`** | `AGENTS.md`, cabeceras |
| Líneas de specs | ~14.800 en total; las más largas, 005 (2.574) y 008 (2.522) | `wc -l` |
| Enmiendas | La 008 acumula al menos 7 enmiendas fechadas y la 005, dos (A y B) | specs |
| Tareas | Solo la 001 tiene `plan.md` y `tasks.md` (25 tareas). Las demás specs no tienen fichero de tareas: **no hay un recuento total documentado** | `specs/001…/tasks.md` |
| Tests | 2287 en verde y 21 omitidos (opt-in), en 178 archivos; build correcto | `AGENTS.md` |
| Crecimiento de tests | 613 (004, 2026-10-21) → 1505 (005) → 2089 (008) → 2287 (015) | specs y `AGENTS.md` |
| Commits | 110 | `git log` |
| Ritmo | 1 commit el 11-09 y luego 1, 1, 1, 7, 12, 32 y 55 commits entre el 18 y el 24 de octubre | `git log` |
| Tiempo | Unos **7 días** de trabajo efectivo (2026-10-18 a 2026-10-24). No hay horas registradas | `git log` |
| Coste del primer MP4 completo | 1,56 USD (15 s, 4 planos: 0,16 en imágenes y 1,40 en vídeo) | spec 013 |
| Eval del director | 35/36 planes válidos (97 %), 0 truncamientos, 0,109 USD en tres corridas | `AGENTS.md` |
| Saldo de fal disponible | ~5 USD, "no gastar sin aprobación" | `AGENTS.md` |
| Deuda de tipos | 268 errores de typecheck | `AGENTS.md` |

---

## 7. Fragmentos de specs reales

### a) Historia de usuario con Given/When/Then (spec 011)

> ### US1 — La misma persona en todos los planos (P1)
>
> **Given** una historia con referencia del protagonista, **When** se generan los keyframes, **Then** cada uno se compara con el ancla y, si no coinciden, se regenera una vez.
>
> **Acceptance**
>
> 1. Un plano que no coincide se regenera automáticamente y se registra el intento.
> 2. Si el segundo intento tampoco coincide, el plano queda marcado para revisión humana y la historia sigue.
> 3. La historia nunca se bloquea por un plano inconsistente.

### b) Por qué existe una spec: evidencia antes que solución (spec 015)

> La capa de gráficos no es un adorno. **Es la solución al bug que 013 solo pudo mitigar.**
>
> | Intento | Resultado |
> |---|---|
> | Prohibir texto en el prompt | Empeoró: Nano Banana no tiene canal negativo y nombrar el concepto lo activa |
> | Pantallas ilegibles | Mejor, pero el modelo **sigue escribiendo** cuando el encuadre enfoca el monitor |
>
> La causa es de fondo: **un modelo de vídeo no sabe dibujar una pantalla con contenido**. No distingue "abstracto" de "un titular".
>
> | Decisión | Contrato |
> |---|---|
> | El texto legible **nunca** lo dibuja el modelo | Lo compone FFmpeg en local, de forma determinista |
> | Lo que pide el usuario es lo que sale | Sin modelo entre la intención y el píxel |

### c) Una decisión humana convertida en contrato (spec 016)

> **Decisión del humano (2026-10-24):** *"Si MiniMax solo acepta 6 segundos como mínimo, tenemos que adaptarnos a eso, más bien el director o el motor."*
>
> **El que se adapta es el director.** No se fabrican planos de 2 s para recortarlos de un clip de 6.
>
> | Regla | Contrato |
> |---|---|
> | Coste honesto | Se paga exactamente lo que se usa: no hay segundos comprados y tirados |
> | Sin recortes | Un recorte en el montaje MUST considerarse un error de planificación, no un caso normal |
> | Honestidad de producto | Con un motor de mínimo 6 s, una historia de 15 s tiene dos planos. MUST NOT prometerse más variedad de la que el motor permite |

---

## Huecos e incoherencias detectados en el repositorio

Conviene tenerlos en cuenta antes de publicar:

- **La 001 dice `Draft`** y sus 25 tareas están sin marcar, aunque la landing existe en el código. La 002 también dice `Draft`.
- **La 011 dice `Draft (Checkpoint 1 pending)`** en su cabecera, pero hay commits de implementación y `AGENTS.md` la describe como implementada y en reposo. No hay un commit que registre su aprobación.
- **`CLAUDE.md` está desfasado:** dice 1505 tests y "specs 004 y 005 implementadas"; `AGENTS.md` dice 2287 tests y 004–015.
- **Los 613 tests de la 004** ya no se reproducen: `AGENTS.md` dice que la cifra reproducible es 605.
- **La numeración del backlog** sigue llamando 013 al audio y 014 a los gráficos, cuando ya son 014 y 015.
- **No hay CI** (punto 13 del backlog) ni registro de horas.
- **La spec 012** contiene una URL pública del CDN de fal con una imagen generada. No la he copiado aquí; revísala si vas a enlazar o citar esa spec.

---

## 8. La trastienda: lo que no quedó escrito en las specs

Esta sección no sale del repositorio. Sale de las sesiones de trabajo, y es la parte que más ayuda a entender por qué el proyecto fue tomando las decisiones que tomó. Sin ella, la cronología parece ordenada; con ella, se ve que casi todo se descubrió ejecutando.

### Las sondas que pagaron para responder una pregunta

Muchas decisiones no salieron de un análisis, sino de **gastar unos céntimos y mirar**. Algunas, a mano, fuera del pipeline:

- **Una imagen suelta de un personaje inventado.** Antes de decidir cómo dar identidad a los secundarios, se generó una sola imagen de un personaje que solo existía en el guion, usando el avatar del usuario como referencia de estilo. El resultado sirvió y costaba menos que cualquier alternativa: de ahí la regla de «una imagen por personaje».
- **El modelo de calidad con elementos de personaje.** Se probó en un plano de cinco segundos, envíando la referencia de dos personajes y citándolos en el mensaje. **Funcionó**: el personaje mantuvo la identidad durante todo el plano y el estilo no se degradó. Se descartó por precio, no por calidad. Esa prueba es la razón de que el backlog diga "no adoptado por coste" y no "no funciona".
- **Un envío fallido que no se cobró.** El primer intento con elementos se rechazó en la validación porque faltaba un campo obligatorio. El proveedor no cobró. Ese fallo enseñó el contrato exacto y se documentó como evidencia.
- **La misma imagen, muchas frases.** Para quitar el texto inventado se probaron varias formulaciones sobre los mismos planos, hasta dar con la que funcionaba. La que ganó no fue la que prohibía: fue la que **describía**.
- **Pantallas en blanco frente a pantallas ilegibles.** Se probaron las dos. La blanca parecía un error de renderizado; la ilegible parecía un monitor encendido. La segunda la eligió el humano con una frase que explica el criterio: *"No tiene que leerse claramente, porque para eso tenemos la capa de gráficos."*

**Lo que esto enseña:** ninguno de estos hallazgos habría aparecido escribiendo una spec. Aparecieron mirando resultados.

### El episodio del «hazlo todo seguido»

Hay un momento de la noche en el que el trabajo se sale del método, y merece contarse tal cual porque es el corazón del relato.

Ya avanzada la noche, y con dos specs implementadas y aprobadas, el humano dijo:

> «ok dale automatico todo yo me voy a domir, acepto todo ve haciendo o mas posible y siguiendo tu criterio, no te pares»

Y antes había dicho:

> «hazlo todo seguido sin que yo tenga que estar arobando (2 horas seguidas) todo aprobado»

Justo después, el agente siguió trabajando **y dejó de registrar**. Interpretó «no me preguntes» como «no hay checkpoints». Así quedó escrito después, en la documentación del proyecto:

> *"cinco arreglos válidos quedaron fuera del método porque el humano dijo 'sigue sin preguntar' y el agente lo interpretó como 'sin checkpoints'"*

Los cinco arreglos fueron reales y necesarios, y ninguno tenía spec previa:

1. **Un plano que se quedaba atascado para siempre**, sin marcarse terminado ni fallido.
2. **Un rechazo automático que nadie recogía**, cuando la historia ya había cambiado de fase.
3. **Un tope de intentos demasiado bajo**, que consumían los propios controles automáticos.
4. **Un guardia que no distingue texto de decoración**, retirado tras medirlo.
5. **El texto que el propio motor de vídeo inventaba**, resuelto con una frase en positivo.

Al final de esa sesión, el humano preguntó:

> «¿esto ha sido SDD?»

Y la respuesta fue:

> «no del todo, y aun así fue el trabajo más útil de la noche»

De ahí salió una regla nueva para el proyecto: **«no me preguntes» autoriza a avanzar, nunca a dejar el registro para después**. Un cambio que nace de un fallo real se documenta como enmienda en la spec, en el mismo pase y antes de cerrar.

**Lo que esto enseña:** el método sirve para no construir lo equivocado. La evidencia sirve para descubrir lo que no sabías. Confundirlas cuesta, y reconocerlo a tiempo también es parte del método.

### El vídeo que se montó a mano

Una de las pruebas más ilustrativas de todo el proyecto.

Se generó una historia completa de 30 segundos con 12 planos. **Los 12 vídeos se generaron correctamente**, con sus personajes y su escena. Pero el montaje automático falló.

Para comprobar de qué lado estaba el problema, **los 12 clips se unieron a mano**, por fuera del sistema. El resultado fueron **30 segundos exactos**, con los gráficos encima: título al principio, terminal con texto del guion y etiqueta al final.

**La conclusión fue doble y muy honesta:** el sistema de montaje tenía un problema de verificación, no de generación. Y de paso quedó claro que la calidad del material dependía del motor, no del código. El vídeo existía; lo que fallaba era la última comprobación.

### La decisión que nadie había planteado

Al investigar los límites técnicos de los dos motores de vídeo apareció un dato incómodo: **uno de ellos solo acepta clips de 6 o 10 segundos**, y el otro de 5 o 10. Las historias de 15 y 45 segundos **no se pueden componer** con el primero.

Hasta ese momento funcionaban porque se recortaban clips largos: se pagaban 24 segundos para usar 15, y los planos quedaban cortados a mitad de movimiento.

El humano lo resolvió con una frase:

> «Si MiniMax solo acepta 6 segundos como mínimo, tenemos que adaptarnos a eso, más bien el director o el motor.»

Y después añadió el criterio económico:

> «yo mantendría la opción de hacer lo más barato posible siempre que sea posible (el modelo permite etc.)»

De ahí salió una regla de producto: **elegir el motor más barato que pueda componer esa duración sin recortar; si el barato no puede, se sube al siguiente**. Y una consecuencia visible que se aceptó de forma explícita: con un motor de mínimo 6 segundos, una historia de 15 segundos tiene **2 planos, no 4**.

**Lo que esto enseña:** una decisión que parecía técnica (qué modelo usar) en realidad define el producto (cuántos planos tiene una historia).

---

## 9. Correcciones a este resumen

Cuatro datos de las secciones anteriores conviene ajustarlos antes de publicar:

| Dónde | Qué dice | Qué conviene decir |
|---|---|---|
| Sección 6, saldo | «~5 USD disponibles» | **Omitir la cifra.** Es un dato cambiante y hablar de dinero en un artículo público no aporta. |
| Sección 6, commits | «110 commits» | El número crece cada día. Mejor **"más de cien commits"** o citar la fecha exacta del recuento. |
| Sección 4, texto del vídeo | Dice que se resolvió con una frase sobre el primer fotograma | Precisar el orden: **primero** se probó esa frase, y **después** se refinó a "pantallas ilegibles" porque la pantalla en blanco parecía rota. |
| Sección 4, historias largas | Describe el fallo | Añadir que **los 12 clips se montaron a mano y salieron perfectos**, que es lo que demuestra dónde estaba el fallo. |

---

## 10. Lo que pasó después (2026-10-24, noche)

Esta sección se añade al final del día. Cuenta lo que no estaba en el resumen original porque ocurrió mientras se trabajaba en él.

### El bug que encontraron los tests no, y un script sí

Después de escribir este resumen, una sesión larga de trabajo dejó **1922 tests en verde**. Y aun así, uno de los componentes principales del sistema —el que pinta los textos encima del vídeo— **nunca se había ejecutado**.

La causa era pequeña y humillante: la pieza se declaraba al construir el montador y **nunca se asignaba**. Todo el código que la usaba existía, todas las pruebas de sus piezas pasaban, y el resultado era que esa función no se llamaba jamás.

Ningún test lo detectó porque las pruebas del flujo completo usaban una versión falsa del montador que tampoco la ejecutaba. El hueco estaba justo donde nadie miraba.

Lo encontró un **script suelto que ejecutaba el sistema real** con clips reales. Tardó veinte minutos.

**La lección:** probar cada pieza por separado no demuestra que el conjunto funcione. Hace falta al menos una prueba que ejecute el sistema entero, aunque sea lento y aparatoso.

### El error que mentía

Durante esa misma sesión, ninguna historia terminaba. El mensaje que devolvía el sistema era:

> «El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.»

Ese mensaje era **falso**. El proveedor estaba funcionando perfectamente; lo que ocurría es que la cuenta **no tenía saldo**.

Se dedicaron horas a buscar el fallo en el montaje del vídeo. El montaje estaba bien. El problema estaba en una única palabra: el sistema traducía «cuenta bloqueada por falta de saldo» como «servicio caído». Un mensaje que no dice la verdad no solo no ayuda: **manda a buscar el problema donde no está**.

Ahora ese caso tiene su propio mensaje, que dice qué hacer: recargar la cuenta.

### La revisión que destapó cuatro fallos

Al terminar, una revisión independiente —sin acceso a esta conversación, leyendo solo el código— encontró cuatro fallos graves en el trabajo recién hecho:

1. **Un dato se guardaba y se descartaba al leerlo.** La funcionalidad parecía completa si mirabas cada archivo por separado; no funcionaba de punta a punta.
2. **Una acción devolvía éxito sin hacer nada** en dos de los tres estados en que se ofrecía.
3. **Un botón de reintentar reiniciaba el contador de intentos**, que era el único freno al gasto. Se podía pulsar en bucle.
4. **Faltaban dos protecciones** que todas las acciones hermanas sí tenían.

Los cuatro eran del trabajo de esa misma noche. **Los cuatro estaban en verde en los tests.**

**La moraleja para la serie:** el momento en que más hace falta una revisión independiente es justo cuando crees que has terminado. Esa es la razón de fondo del paso de revisión del método, y aquí se ve funcionando.

### Las especificaciones que afirmaban de más

Dos de las especificaciones decían estar implementadas y no lo estaban del todo: les faltaba la mitad de lo que prometían (una detección concreta, un aviso en pantalla, ciertos códigos de error, y la adaptación del reparto de planos que era el corazón de una de ellas).

Se corrigieron para que dijeran exactamente qué funciona y qué no. **Es incómodo escribir «implementado con reservas» cuando ya lo habías marcado como terminado**, pero un documento que miente es peor que uno incompleto.

### Y el paso que sí funciona solo

Se añadió integración continua: la suite completa y el build se ejecutan en cada envío de código a la nube. La primera ejecución pasó, en una máquina limpia, sin base de datos y sin claves de proveedor.

Eso confirma algo importante: **las pruebas no dependen de infraestructura real**. Cualquiera puede descargar el proyecto y comprobarlo.

### Lo que sigue sin poderse demostrar

**Ninguna historia completa se ha entregado de principio a fin.** No por un fallo del código, sino porque no hay saldo en el proveedor y la subida del vídeo final pasa por ahí.

Es el hueco honesto de toda la serie: hay piezas montadas a mano que demuestran que el sistema sabría hacerlo, pero nadie ha visto al sistema hacerlo solo, de principio a fin, con una cuenta con fondos.

Contarlo así —lo que funciona, lo que está probado y lo que todavía no— es más útil que contar un éxito que no ha ocurrido.
