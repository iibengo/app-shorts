# Feature Specification: Composer de Shorts con IA real (Fal.ai)

**Feature Branch**: `004-composer-real`

**Created**: 2026-10-20

**Status**: Implemented (automated suite and build green; real-provider smoke is opt-in)

> **Estado de implementación (2026-10-21):** implementada en `app/` y `server/`. La suite automatizada tiene 613 tests en verde (44 archivos) y `npm run build` pasa. El smoke real de Fal es opt-in (`RUN_FAL_SMOKE=1`) y no se ejecuta en CI. Quedan pendientes la QA manual de accesibilidad/navegador y la validación de CORS, lifecycle y cancelación en el entorno real de despliegue.

**Input**: User description: "Sustituir el Composer mock de 003 por una integración real con Fal.ai: prompt + 0–1 imagen de referencia, dos presets de vídeo vertical 9:16 (`Rápido` con MiniMax Hailuo 02 Standard y `Calidad` con Kling 2.5 Turbo Pro), keyframe previo generado con FLUX, cola asíncrona de Fal, subida firmada de la referencia, progreso por etapas reales, cancelación, rate limit e idempotencia, manteniendo el flujo de 1 a 3 clics, la accesibilidad y la seguridad server-side."

## Contexto y relación con 003

Esta especificación es **aditiva** sobre 001 y 002 y **sustituye el comportamiento mock de 003** para el Composer. La landing `/` y el feed `/feed` no se rediseñan, no se refactorizan y no cambian su comportamiento; solo se corrige la meta description del feed, que en 003 afirmaba que el estudio era simulado y en 004 ya no lo es.

- El Composer real se publica en la misma ruta `/composer` (`app/pages/composer.vue`).
- La generación deja de ser cliente y determinista: pasa a ser servidor + Fal.ai, con llamadas de red reales y coste real.
- El despliegue de esta feature requiere `nuxt build` con Nitro/Node. **No es compatible con `nuxt generate`** para el Composer real: las Server Routes no existen en un sitio estático.
- La autenticación de usuarios sigue fuera de alcance. El rate limit y la sesión anónima son medidas anti-abuso, no identidad.
- El resultado sigue siendo terminal: no se publica en el feed, no se persiste, no se descarga y no se comparte.

### ENMIENDA A 003

003 sigue siendo la fuente de verdad para todo lo que no se enumere aquí. Las cláusulas incompatibles quedan **enmendadas o derogadas** en la medida exacta de esta tabla.

| Cláusula de 003 | Efecto de 004 |
|-----------------|---------------|
| Contexto: "simulación enteramente cliente, sin IA real, sin red, sin `server/api/`, sin secretos y compatible con `nuxt generate`" | **Superseded**. 004 usa IA real, `server/api/`, secretos server-side, cola de Fal y despliegue Node/Nitro. |
| Contexto: "El resultado es una vista previa terminal" | **Amended**. El resultado es un vídeo real terminal; sigue sin publicación, persistencia, descarga ni compartición. |
| US1 (generación simulada de 2,4 s) | **Superseded** por US1 de 004. |
| US2 (hasta 3 imágenes o vídeos, sin subida) | **Superseded** por US2 de 004: 0–1 imagen, subida firmada real. |
| US3 (cancelar/editar/regenerar/reintentar simulado) | **Amended**. Se conservan las acciones, pero con cancelación real, polling, timeout y éxito parcial. |
| US5 (honestidad de simulación) | **Superseded** por US7 de 004: badge `BETA`, badge `IA` y copy de generación real. |
| FR-001 (no modificar `nuxt.config.ts`, `package.json` ni crear `server/`) | **Superseded** en lo relativo a `nuxt.config.ts`, `.env.example` y `server/`. `package.json` no necesita dependencias nuevas. |
| FR-002 (SSR inicial mock) | **Amended**. El SSR inicial sigue siendo `idle`, pero con copy, preset y controles reales; sin generación ni polling en servidor. |
| FR-003 y FR-004 (CTA y retirada de `Próximamente`) | **Ratificadas**. El CTA sigue siendo `<a href="/composer">` con texto `Crear short`. |
| FR-005 (feed intacto; solo meta description y `noscript`) | **Amended**. Se cambia únicamente la meta description del feed para eliminar la palabra `simulado`. El resto del feed queda intacto. |
| FR-006 (migración a `app/models/short.ts`) | **Ratificada**. |
| FR-007 (modelos estrictos, sin `any`, `readonly`, sin `File`) | **Ratificada y ampliada** al contrato de 004. |
| FR-008 (prompt obligatorio, máximo 280, conservado) | **Ratificada**. La validación se duplica en servidor. |
| FR-009 (prohibida la configuración avanzada: modelo, estilo, duración, aspect ratio, resolución) | **Superseded**. Se añaden dos presets (`Rápido`/`Calidad`) y duración limitada; no hay selector de modelo, aspect ratio, resolución, semilla ni estilo libre. |
| FR-010 (hasta 3 imágenes o vídeos) | **Superseded**. Máximo 1 imagen; no se admiten vídeos de referencia. |
| FR-011 (MIME y tamaños de imagen y vídeo) | **Amended**. Solo `image/png`, `image/jpeg` y `image/webp`, hasta 8 MiB. Se eliminan los tipos de vídeo y el límite de 50 MiB. |
| FR-012 (miniatura, sin subida, sin `FormData`, sin `fetch`) | **Superseded**. La imagen se sube mediante ticket firmado y `PUT` directo a Fal; no se usa `FormData` ni multipart. |
| FR-013 (`File` solo en `Map` local, nunca se sube) | **Amended**. El `File` vive en memoria solo durante la subida; se descarta tras el `PUT` correcto. El `ObjectURL` se sigue revocando. |
| FR-014 (generación 100 % cliente y simulada) | **Superseded**. Generación server-side con Fal. |
| FR-015 (resultado determinista con FNV-1a) | **Superseded**. El resultado es un vídeo real, no determinista. Se elimina el algoritmo de pósters/títulos. |
| FR-016 (máquina `idle/generating/ready/error`) | **Amended** por la máquina de estados de 004 (`uploading`, `submitting`, `queued`, `running`, `ready`, `error`, `cancelled`). |
| FR-017 (bloqueo de doble submit con temporizadores) | **Amended**. El doble submit se bloquea con estado + `Idempotency-Key` + idempotencia server-side. |
| FR-018 (preview terminal con póster local, título, intento) | **Superseded**. El resultado es `<video>` real con póster/keyframe, modelo, duración y referencia. |
| FR-019 (badges `DEMO` y `SIMULACIÓN`, copy de simulación) | **Superseded**. Se sustituyen por `BETA` y `IA`, con copy de generación real y coste. |
| FR-020 (foco en generación, preview, cancelar, editar, error) | **Amended**. Se añaden foco en resultado real, error de subida, error de job y éxito parcial. |
| FR-021 (`role="status"`/`role="alert"`) | **Ratificada y amended**. Se anuncian etapas reales y cola, sin porcentajes inventados. |
| FR-022 (validación custom y foco en el primer campo inválido) | **Ratificada y ampliada** con errores de servidor. |
| FR-023 a FR-027 (semántica, 44 px, reduced motion, forced colors, responsive) | **Ratificadas**. |
| FR-028 (metadatos de `/composer`) | **Amended**. Nuevo title/description de generación real; `lang`, `color-scheme`, `theme-color` y `robots` se conservan. |
| FR-029 (cero peticiones externas, sin `$fetch`) | **Superseded**. Se permiten llamadas server-side a Fal y un `PUT` directo del navegador a la URL firmada. Se mantiene la prohibición de fuentes, analítica, píxeles, CDNs de UI y librerías externas. |
| FR-030 (cero persistencia, ni cookies) | **Amended**. Se permite una cookie de sesión anónima `composer_sid` (HttpOnly, sin datos personales) solo para rate limit, y estado en memoria del servidor. Sigue prohibida la persistencia de prompt, borrador, referencias, jobs o resultados en el navegador. |
| FR-031 (sin `v-html`) | **Ratificada**. |
| FR-032 (copy en español, sin i18n) | **Ratificada** con el nuevo Copy Deck. |
| FR-033 (`data-testid` estables) | **Ratificada y ampliada**. |
| FR-034 (arquitectura modular) | **Amended**. Se añade `server/composer/`, `server/api/composer/` y `app/composables/useComposerApi.ts`. |
| FR-035 (`AppButton` mínimo) | **Ratificada**. |
| FR-036 (tests de 003) | **Amended**. Los tests de mock, determinismo y pósters se retiran o reescriben; se añaden tests de servidor, rutas y contrato de Fal. |
| FR-037 (sin dependencias, sin `server/`, sin PWA config, compatible con `nuxt generate`) | **Superseded**. Se añaden Server Routes y configuración PWA; **no se añaden dependencias npm** (se usa `fetch` nativo y `node:crypto`). El despliegue real es `nuxt build`. |
| FR-038 (stack Nuxt 4/Vue 3/Tailwind 3.4/Vitest) | **Ratificada**. Se añade Node.js 22 LTS como runtime de servidor. |
| FR-039 (presupuesto de 2/3 clics) | **Amended**. Se mantiene 2 clics sin referencia y 3 con una imagen; preset y duración son opcionales y no obligatorios. |
| FR-040 (sin botones muertos) | **Ratificada**. |
| FR-041 (simulación total para entradas válidas) | **Superseded**. Un proveedor real puede fallar; se especifican errores, reintento y éxito parcial. |
| FR-042 (intento determinista) | **Amended**. `attempt` cuenta intentos de generación iniciados por la persona, incluidos los que fallan en keyframe; no interviene en el resultado. |
| FR-043 (sin imports del feed) | **Ratificada**. |
| FR-044 (el HTML no contiene `<video>`) | **Superseded**. El resultado usa `<video controls playsinline>` sin autoplay; el SSR inicial sigue sin `<video>`. |
| FR-045 (4 SVG de pósters mock) | **Superseded**. El póster es el keyframe de FLUX. Se retiran `public/mock/composer/*.svg`, `COMPOSER_POSTERS` y `COMPOSER_TITLES`. |
| FR-046 (solo `Generar short` es submit; resto `type="button"`) | **Ratificada y amended**. El botón pasa a `Generar vídeo`; el resto sigue siendo `type="button"`. |
| Fixture / Asset Contract y Algoritmo determinista | **Superseded** en su totalidad. No hay pósters, títulos, timeline ni hash de simulación. |
| Normative Copy Deck de 003 | **Superseded** por el Copy Deck de 004, salvo los textos que 004 reutiliza explícitamente. |
| Design Contract de 003 | **Amended**. Se conservan tokens, dark-only, foco, safe areas y responsive; se añaden estilos de preset, progreso real y `<video>`. |
| Testing Strategy de 003 | **Amended**. La matriz de 004 sustituye a la de mock. |
| Out of Scope de 003: generación real, backend, subida, PWA | **Superseded** para 004 en generación real, backend, subida y PWA. El resto de exclusiones se mantiene. |
| SC-004 (determinismo) | **Superseded**. |
| SC-009 (cero subidas) | **Superseded**. Ahora hay una subida temporal a Fal. |
| SC-010 (`npm run generate` correcto) | **Amended**. El build de referencia es `npm run build`; `generate` no se usa para esta feature. |
| SC-011 (sin JavaScript no se simula éxito) | **Ratificada**. Sin JS no se genera ni se muestra resultado. |
| SC-012 (preview terminal sin publicar/descargar/compartir) | **Ratificada** para el resultado real. |
| Assumptions de 003 sobre mock, determinismo y archivos que no salen del navegador | **Superseded**. |
| Open Questions de 003 ("no hay") | **Amended**. 004 tiene preguntas abiertas no bloqueantes en la sección final. |
| Feed: meta description `...estudio de creación simulado.` | **Amended**. Pasa a `...estudio de creación con IA.` Es el único cambio de copy del feed. |

### Qué se conserva de 003

- La ruta `/composer`, la cabecera con marca y enlace `Volver al feed`, el stepper de 3 pasos, el formulario de idea y el `<noscript>`.
- Accesibilidad: un solo `h1`, `header`/`main`, labels programáticas, `role="status"`/`role="alert"`, foco gestionado, objetivos táctiles de 44 × 44 px, contraste AA, `prefers-reduced-motion`, forced-colors, zoom 200 %/400 % y safe areas.
- Responsive de 320 px a 1920 px sin scroll horizontal.
- Copy en español (`es-ES`), sin i18n.
- Renderizado con interpolación de Vue; prohibido `v-html` y `dangerouslySetInnerHTML`.
- Sin botones muertos: cada control tiene efecto verificable.
- Feed y landing intactos en diseño, datos, scroll-snap, like/save/share y tests, salvo la meta description del feed.
- Stack Nuxt 4, Vue 3 con `<script setup lang="ts">`, Tailwind CSS 3.4.x (sintaxis v3) y Vitest + `@nuxt/test-utils` + `happy-dom`.
- `AppButton` como primitiva mínima; no se amplía su API.
- El resultado es terminal: no se publica, no se persiste, no se descarga y no se comparte.

### Qué queda fuera de 004

- Audio, voz, música, doblaje o sincronización labial.
- 2–3 imágenes de referencia, referencias de vídeo y composición multi-referencia.
- Publicación en el feed, conversión a `Short`, historial de proyectos, persistencia, descarga y compartición.
- Modo solo imagen.
- Autenticación de usuarios, cuentas, pagos o facturación.
- Elección libre de modelo, endpoint, aspect ratio, resolución, semilla, cámara o estilo.
- Edición, recorte, unión, subtítulos o miniaturas personalizadas del vídeo.
- Reanudación de un job tras recargar o cerrar la pestaña.
- Rate limit distribuido entre instancias.
- Nano Banana Pro Edit u otro modelo para multi-referencia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generar un vídeo vertical desde una idea en dos clics (Priority: P1)

Una persona entra al feed, pulsa `Crear short`, llega a `/composer`, escribe una idea y pulsa `Generar vídeo`. Sin tocar nada más, el sistema crea un keyframe vertical 9:16 con FLUX, lo usa como primer fotograma y envía el vídeo a la cola de Fal con el preset `Rápido` y 6 segundos. La persona ve etapas reales, espera y recibe un vídeo reproducible.

**Why priority**: Es el núcleo del producto y el camino mínimo que valida la promesa de 1 a 3 clics con IA real. Sin este recorrido no existe 004.

**Independent Test**: Partir de `/feed`, activar `Crear short`, escribir `Un short sobre luz natural`, pulsar `Generar vídeo` y comprobar que se muestra `Creando el fotograma base`, que después aparece `En cola`/`Generando el vídeo`, que el polling termina en `Tu short` con un `<video>` reproducible, y que no se ha pedido ningún modelo, duración ni referencia.

**Acceptance Scenarios**:

1. **Given** la persona está en `/composer` en estado `idle`, **When** el formulario se renderiza, **Then** el preset `Rápido` está seleccionado, la duración es `6 s`, no hay referencia y `Generar vídeo` está habilitado con un prompt válido.
2. **Given** un prompt válido y el camino por defecto, **When** la persona pulsa `Generar vídeo`, **Then** el formulario se bloquea, el foco va al encabezado del progreso y se anuncia `Creando el fotograma base` sin mostrar un porcentaje.
3. **Given** el keyframe se ha generado, **When** el vídeo se envía a Fal, **Then** la respuesta contiene un `ComposerJob` en estado `queued` con `id` opaco, `posterUrl` y `pollAfterMs`, y la interfaz pasa a `En cola` o `Generando el vídeo` según el estado real.
4. **Given** el job termina en `COMPLETED` con `video.url`, **When** el polling recibe el resultado, **Then** aparece `Tu short`, un `<video controls playsinline>` sin autoplay con el keyframe como póster y los metadatos de modelo, duración y referencia.
5. **Given** el resultado está visible, **When** la persona busca publicar, descargar o compartir, **Then** no existe ninguna acción para hacerlo.
6. **Given** la misma persona repite el flujo, **When** genera de nuevo, **Then** obtiene un job nuevo, un vídeo nuevo y `Intento 2`; no hay resultado cacheado ni determinista.

---

### User Story 2 - Añadir una imagen de referencia opcional con subida firmada (Priority: P1)

Una persona añade una única imagen PNG, JPG o WebP de hasta 8 MB. Al seleccionarla, el cliente pide un ticket al servidor; el servidor inicia la subida en Fal y devuelve una URL firmada; el navegador hace `PUT` directo sin ver ni enviar la clave. La imagen se usa con FLUX Kontext para crear el keyframe y se elimina del almacenamiento de Fal en una hora. La persona puede eliminar la referencia antes de generar o reintentar la subida si falla.

**Why priority**: La referencia es la principal palanca creativa y el caso de 3 clics. Sin una subida segura, la clave de Fal se filtraría o el flujo no cabría en Nitro.

**Independent Test**: En `/composer`, pulsar `Añadir imagen`, seleccionar un WebP válido, comprobar `Subiendo imagen…`, luego la tarjeta con miniatura y `Imagen · 8 MB` como máximo, verificar que el `PUT` va a la URL firmada con las cabeceras del ticket y sin `Authorization`, generar y comprobar `1 imagen` en el resultado. Repetir con un archivo de 8 388 609 bytes y con un GIF.

**Acceptance Scenarios**:

1. **Given** el formulario está visible, **When** la persona pulsa `Añadir imagen` y elige un PNG de 1 MiB, **Then** el cliente valida MIME y tamaño, pide `POST /api/composer/uploads` con `{fileName, contentType, sizeBytes}` y recibe `uploadUrl`, `fileUrl`, `expiresAt` y `uploadHeaders`.
2. **Given** el ticket está disponible, **When** el cliente hace `PUT` a `uploadUrl`, **Then** envía exactamente `uploadHeaders`, no envía `Authorization`, no usa `FormData` y no pasa el binario por Nitro.
3. **Given** el `PUT` responde 200, **When** termina la subida, **Then** aparece una tarjeta con `Imagen`, nombre, tamaño, miniatura local y el botón `Eliminar {nombre}`, y el contador muestra `1 de 1`.
4. **Given** una imagen ya subida, **When** la persona pulsa `Eliminar {nombre}`, **Then** la tarjeta desaparece, el `ObjectURL` se revoca, el `File` se descarta y la generación vuelve a ser prompt-only.
5. **Given** la persona selecciona un GIF, un SVG o un archivo de más de 8 MiB, **When** se valida en cliente, **Then** no se sube y se anuncia `Formato no admitido. Usa PNG, JPG o WebP.` o `La imagen supera el máximo de 8 MB.`.
6. **Given** el `PUT` falla por red, **When** la persona pulsa `Reintentar subida`, **Then** se reintenta con el mismo `File` y un ticket vigente; si el ticket caducó, se pide uno nuevo y se repite el `PUT`.
7. **Given** la referencia se usó para generar, **When** el keyframe se crea, **Then** se usa `fal-ai/flux-pro/kontext` con `image_url` igual al `fileUrl` validado y `aspect_ratio: "9:16"`, y el copy de privacidad explica que la imagen se envía a Fal y se elimina en una hora.

---

### User Story 3 - Elegir Rápido o Calidad y ajustar la duración sin romper el presupuesto de clics (Priority: P2)

Una persona puede cambiar entre `Rápido` (MiniMax Hailuo 02 Standard) y `Calidad` (Kling 2.5 Turbo Pro) y elegir una duración permitida. Los controles tienen valores por defecto, son opcionales y no bloquean el camino de 2 o 3 clics. La interfaz muestra el modelo real de cada preset y advierte de que `Calidad` tarda y cuesta más.

**Why priority**: Los dos presets son la propuesta de valor diferencial, pero no pueden convertir el flujo simple en un asistente de configuración.

**Independent Test**: Generar con `Rápido` y 6 s; comprobar el modelo `MiniMax Hailuo 02`. Cambiar a `Calidad`, comprobar que la duración cambia a 5 s y que las opciones son 5 y 10 s; generar y comprobar `Kling 2.5 Turbo Pro`. Abrir `Ajustes`, elegir 10 s, comprobar que el resumen muestra `Ajustes · 10 s` y que el formulario no exige pasos adicionales.

**Acceptance Scenarios**:

1. **Given** el formulario inicial, **When** se inspecciona el selector de preset, **Then** es un `radiogroup` etiquetado con dos opciones, `Rápido` seleccionada por defecto y `Calidad` disponible, sin ningún modelo libre ni endpoint visible.
2. **Given** `Rápido`, **When** la persona abre `Ajustes`, **Then** el select de duración ofrece exactamente `6 s` y `10 s`, con `6 s` seleccionado.
3. **Given** `Calidad`, **When** la persona abre `Ajustes`, **Then** el select ofrece exactamente `5 s` y `10 s`; si la duración previa era 6 s, se ajusta a 5 s sin error.
4. **Given** la persona cambia de preset, **When** genera sin abrir `Ajustes`, **Then** el flujo sigue en 2 clics (sin referencia) o 3 (con referencia) y se usa la duración por defecto del preset.
5. **Given** la persona elige `Calidad` y 10 s, **When** el servidor valida, **Then** el body contiene `preset: "quality"` y `durationSeconds: 10` y se usa el endpoint de Kling; un `durationSeconds: 6` con `quality` devuelve 400 `invalid-duration`.
6. **Given** el resultado, **When** se muestran los metadatos, **Then** aparecen `Modelo`, `Kling 2.5 Turbo Pro` o `MiniMax Hailuo 02`, `Duración`, `10 s`/`6 s`/`5 s`, y `Formato`, `9:16`.

---

### User Story 4 - Progreso real, cancelación, timeout, reintento y éxito parcial (Priority: P1)

Una persona ve en qué etapa real está la generación, cuánto tiempo ha pasado y, si Fal lo devuelve, la posición en la cola. Puede cancelar mientras espera, reintentar errores recuperables y, si el vídeo falla pero el keyframe se generó, conservar el keyframe como resultado parcial. Nunca ve porcentajes inventados.

**Why priority**: La generación real tarda minutos y puede fallar. Sin transparencia y recuperación, la espera se percibe como un cuelgue y se gastan créditos sin control.

**Independent Test**: Con un stub de Fal, comprobar las transiciones `keyframe → queued → video → finalizing → ready`; cancelar en `queued` y comprobar la llamada a `cancel_url`; forzar un timeout de keyframe y comprobar que no se envió ningún vídeo; forzar un fallo de vídeo y comprobar que el keyframe se muestra como éxito parcial con `Reintentar`.

**Acceptance Scenarios**:

1. **Given** la generación está en `submitting`, **When** el servidor aún no ha respondido, **Then** la UI muestra `Creando el fotograma base`, una barra indeterminada, el tiempo transcurrido y `Cancelar`; no muestra porcentaje.
2. **Given** el job está `IN_QUEUE` con `queue_position: 3`, **When** el polling recibe el estado, **Then** la etapa es `En cola`, se muestra `Posición 3 en la cola` y se anuncia una sola vez.
3. **Given** el job está `IN_PROGRESS`, **When** el polling recibe el estado, **Then** la etapa es `Generando el vídeo` y la barra sigue indeterminada.
4. **Given** el job está en `queued` o `running`, **When** la persona pulsa `Cancelar`, **Then** se llama a `POST /api/composer/jobs/{id}/cancel`, se muestra `Generación cancelada.`, el foco vuelve al prompt y el borrador se conserva.
5. **Given** el keyframe supera 45 s, **When** el servidor aborta, **Then** devuelve 504 `keyframe-timeout`, no se envía ningún vídeo a la cola y la UI muestra `La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.`.
6. **Given** el keyframe se generó pero el vídeo falla, **When** el job termina en `failed`, **Then** la UI muestra el keyframe como imagen, el mensaje `No se pudo generar el vídeo, pero conservamos el fotograma base.` y las acciones `Reintentar` y `Editar idea`.
7. **Given** un error recuperable de proveedor, **When** la persona pulsa `Reintentar`, **Then** se inicia un job nuevo con `Intento + 1`, un `Idempotency-Key` nuevo y el mismo borrador; el keyframe se vuelve a generar.
8. **Given** el polling sufre un error de red, **When** fallan 3 reintentos, **Then** la UI muestra un error recuperable con `Reintentar` sin perder el `jobId`; al reintentar, continúa el polling del mismo job.
9. **Given** la generación supera 10 minutos, **When** el job sigue activo, **Then** se muestra `Está tardando más de lo habitual. Puedes seguir esperando o cancelar.` y el polling continúa con backoff hasta la expiración del job.

---

### User Story 5 - Recuperarse de rate limit, contenido bloqueado y fallos del proveedor (Priority: P2)

Una persona que alcanza el límite, cuyo prompt o imagen es bloqueado por políticas, o que sufre una caída o falta de créditos del proveedor, recibe un mensaje claro en español, un código estable y una acción posible: esperar, cambiar la idea, reintentar o volver más tarde. Nunca ve la clave, el mensaje crudo de Fal ni URLs firmadas.

**Why priority**: En un sistema real con coste, los errores no son defensivos: son el caso normal. Un mensaje incorrecto puede provocar doble cobro o pérdida de confianza.

**Independent Test**: Con stubs de Fal, provocar 429 por rate limit, 422 por política de contenido, 402 por créditos, 401 por credencial inválida y 503 por caída. Comprobar el código HTTP, el `Retry-After`, el mensaje exacto y que la respuesta no contiene `Key`, `Authorization`, `fal.run`, `queue.fal.run`, `rest.fal.ai` ni el prompt.

**Acceptance Scenarios**:

1. **Given** la persona supera el límite de generaciones, **When** llama a `POST /api/composer/generate`, **Then** recibe 429 `rate-limited` con `Retry-After` en segundos y la UI muestra `Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.` con el tiempo restante.
2. **Given** ya hay un job activo para la misma sesión, **When** llega otro `generate` con distinta `Idempotency-Key`, **Then** recibe 409 `generation-in-progress` y la UI muestra `Ya tienes una generación en curso. Espera a que termine o cancélala.`.
3. **Given** el proveedor bloquea el prompt o la imagen, **When** el servidor mapea el error, **Then** devuelve 422 `content-blocked` y la UI muestra `El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.` con `Editar idea`.
4. **Given** Fal devuelve 401/403 de credenciales, **When** el servidor lo registra, **Then** responde 503 `ai-unavailable` sin detalles internos, la UI muestra `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` y no se reintenta automáticamente.
5. **Given** Fal devuelve 402 o créditos agotados, **When** el servidor lo mapea, **Then** responde 503 `ai-credits-exhausted`, registra el incidente y la UI muestra el mismo mensaje de indisponibilidad sin prometer reintento inmediato.
6. **Given** Fal devuelve 5xx o timeout, **When** el servidor lo mapea, **Then** responde 502 `provider-error` o 504 `provider-timeout` con `retryable: true`, `Retry-After` cuando aplique y la UI ofrece `Reintentar`.
7. **Given** la clave de Fal no está configurada, **When** se llama a cualquier ruta de generación, **Then** responde 503 `ai-not-configured` y el log registra el fallo de configuración sin exponer la variable.

---

### User Story 6 - Coexistir con el feed y la landing sin regresiones (Priority: P2)

La persona que ya conoce el feed encuentra el mismo feed, con sus seis shorts, su scroll-snap, sus pósters y sus acciones intactas. El CTA sigue llevando a `/composer`. La landing no cambia. El único cambio visible es que la meta description del feed deja de decir que el estudio es simulado.

**Why priority**: La generación real no puede poner en riesgo la demo existente. La regresión del feed y de la landing es obligatoria.

**Independent Test**: Solicitar `/feed` y `/`; comprobar HTTP 200, seis títulos, primer short activo, pósters `/mock/shorts/*.svg`, CTA `<a href="/composer">`, ausencia de `Próximamente` y de `create-short-notice`; comprobar la meta description actualizada; ejecutar los tests de landing sin cambios.

**Acceptance Scenarios**:

1. **Given** `/feed` renderizado, **When** se inspecciona el CTA, **Then** sigue siendo `<a href="/composer">` con texto `Crear short` y `data-testid="feed-cta"`, sin `aria-haspopup` y sin diálogo.
2. **Given** `/feed` renderizado, **When** se compara con 003, **Then** los seis shorts, el orden, el scroll-snap, los pósters, like/save/share y `Fin del feed de prueba` no cambian.
3. **Given** la meta description del feed, **When** se renderiza, **Then** dice exactamente `Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación con IA.` y no contiene `simulado`.
4. **Given** la landing `/`, **When** se ejecutan sus tests y se solicita la ruta, **Then** no cambia ni su copy, ni su diseño, ni su meta description, ni su CTA `Próximamente`.
5. **Given** la suite completa, **When** se ejecuta, **Then** feed y landing siguen en verde; solo se actualiza la aserción de la meta description del feed.

---

### User Story 7 - Accesibilidad, responsive, PWA y offline (Priority: P3)

Una persona que usa teclado, lector de pantalla, zoom, alto contraste o movimiento reducido puede completar el flujo real, entender las etapas, cancelar, reintentar y reproducir el vídeo. La interfaz funciona de 320 a 1920 px. La PWA no cachea `/api/**` ni los vídeos de Fal. Sin conexión, la generación se deshabilita y se explica por qué.

**Why priority**: Es un requisito de calidad de la marca y de la constitución. La generación real añade estados y contenido multimedia que deben seguir siendo accesibles.

**Independent Test**: Auditar `/composer` con teclado, VoiceOver/TalkBack, `prefers-reduced-motion: reduce`, forced-colors, zoom 200 %/400 %, anchos 320–1920 px y modo offline. Comprobar foco, anuncios, controles de vídeo y que el service worker no cachea `/api/**` ni `*.fal.media`.

**Acceptance Scenarios**:

1. **Given** un lector de pantalla abre `/composer`, **When** anuncia la página, **Then** encuentra un `header`, un `main`, un único `h1`, un formulario etiquetado, un `radiogroup` de preset, un select de duración y una jerarquía de encabezados sin saltos.
2. **Given** el foco está en el preset, **When** la persona usa las flechas, **Then** cambia entre `Rápido` y `Calidad`, se anuncia la opción y no se mueve el foco fuera del grupo.
3. **Given** una generación en curso, **When** cambia la etapa, **Then** una región `role="status"` con `aria-live="polite"` anuncia la etapa una sola vez; el tiempo transcurrido no se anuncia cada segundo.
4. **Given** el resultado, **When** la persona llega al `<video>`, **Then** tiene nombre accesible, controles nativos, `playsinline`, póster y no se reproduce automáticamente.
5. **Given** `prefers-reduced-motion: reduce`, **When** se usa el Composer, **Then** no hay barra animada, ni shimmer, ni transiciones no esenciales; la barra indeterminada es estática.
6. **Given** forced-colors, **When** se inspeccionan preset, select, progreso, tarjetas, errores y `<video>`, **Then** los límites y estados siguen visibles con colores del sistema.
7. **Given** anchos de 320, 360, 390, 768, 1024, 1440 y 1920 px y zoom 200 %/400 %, **When** se recorre el flujo, **Then** no hay scroll horizontal, ni texto cortado, ni controles fuera de alcance, y los objetivos táctiles miden al menos 44 × 44 px.
8. **Given** el service worker activo, **When** se inspecciona su configuración y la caché, **Then** no cachea `/api/**`, ni `v3.fal.media`, ni `v3b.fal.media`, ni `fal.media`, y no intercepta el `PUT` de subida.
9. **Given** `navigator.onLine === false`, **When** la persona intenta generar, **Then** el botón está deshabilitado, se muestra `Sin conexión. La generación necesita internet.` y no se hace ninguna petición; al volver online, el polling se reanuda si había un job activo.

### Edge Cases

- **SSR**: `/composer` se renderiza en `idle`; el HTML contiene cabecera, `h1`, intro, stepper, formulario, preset por defecto, duración por defecto, selector de referencia, botón `Generar vídeo` y `noscript`; no contiene `<video>`, progreso, job, token, URLs de Fal ni llamadas a Fal.
- **Hidratación**: el estado inicial es idéntico en servidor y cliente. No se usa `Date.now()`, `Math.random()`, `crypto.randomUUID()` ni la hora para renderizar el estado inicial. El tiempo transcurrido empieza en cliente al montar.
- **JavaScript deshabilitado**: el formulario y el copy son legibles; no se genera nada. El `<noscript>` explica que la generación real necesita JavaScript.
- **Prompt vacío o solo espacios**: se rechaza con `Escribe una idea para generar tu short.` y foco en el textarea.
- **Prompt de 280 caracteres**: se acepta. 281 se rechaza en cliente y en servidor con `La idea no puede superar los 280 caracteres.`.
- **Prompt con emoji**: el contador usa `String.length` (igual que `maxlength`), de modo que un emoji puede contar 2.
- **Prompt con saltos de línea**: se conservan; el servidor normaliza NFC y `trim`, pero no colapsa saltos internos.
- **Prompt con caracteres de control**: se rechaza con 400 `invalid-prompt`; se permiten `\n` y `\t`.
- **Prompt con HTML o `<script>`**: se envía como texto; se renderiza con interpolación y nunca con `v-html`.
- **Archivo de 0 bytes**: se rechaza con `El archivo está vacío.` y no se pide ticket.
- **MIME vacío o desconocido**: se rechaza con `Formato no admitido. Usa PNG, JPG o WebP.`; no se deduce por extensión.
- **MIME con parámetros** (`image/png; charset=binary`): se normaliza a `image/png` y se acepta.
- **Imagen de exactamente 8 388 608 bytes**: se acepta; 8 388 609 se rechaza.
- **Imagen con nombre muy largo**: se valida y se muestra con `break-words` y `line-clamp-2`; el servidor genera un nombre de almacenamiento propio y no confía en el nombre del cliente.
- **Nombre con path traversal** (`../../x.png`): se rechaza con 400 `invalid-file-name`; nunca se pasa crudo a Fal.
- **Seleccionar el mismo archivo dos veces**: se permite; se pide un ticket nuevo y se reemplaza la referencia anterior (máximo 1).
- **Cancelar el selector de archivos**: no cambia el estado, no pide ticket y no muestra error.
- **Subida concurrente**: el botón de referencia se deshabilita mientras hay un `PUT` en curso; no se admiten dos subidas simultáneas.
- **Ticket caducado antes del `PUT`**: el cliente pide un ticket nuevo una vez y reintenta; si vuelve a fallar, muestra `La subida ha caducado. Vuelve a seleccionar la imagen.`.
- **`PUT` 403/413/415**: se mapea a error de subida y se ofrece `Reintentar subida` o cambiar de archivo; no se genera.
- **CORS del `PUT` bloqueado**: se muestra `No se pudo subir la imagen. Inténtalo de nuevo.` y se registra el fallo; es un gate de fase 1, no un fallback silencioso a proxy.
- **`URL.createObjectURL` no disponible**: la tarjeta se muestra sin miniatura y la subida continúa.
- **`URL.revokeObjectURL` no disponible**: se ignora de forma segura.
- **Eliminar referencia durante la subida**: se aborta el `PUT` con `AbortController`, se revoca el `ObjectURL` y se descarta el `File`.
- **Eliminar referencia después de subir**: se descarta el `fileUrl` y el `File`; Fal la elimina por lifecycle.
- **Doble submit**: el estado `submitting` deshabilita el botón; además, el servidor deduplica por `Idempotency-Key` y por job activo.
- **Doble clic en `Reintentar`**: solo se inicia un job; el botón se deshabilita hasta recibir respuesta.
- **Cancelar durante `submitting`**: se aborta la petición HTTP del cliente. El servidor comprueba la desconexión antes de enviar el vídeo a la cola; si ya lo envió, el job puede continuar y consumir crédito. Se documenta como limitación best-effort.
- **Cancelar en `queued`/`running`**: se llama a Fal; si Fal ya terminó, responde 409 `job-not-cancellable` y la UI refresca el estado real.
- **Cancelar en `ready`**: no hay acción de cancelar; solo `Regenerar` y `Editar idea`.
- **Timeout de keyframe**: 504 `keyframe-timeout`; no se envía vídeo; el mensaje lo dice explícitamente.
- **Fallo de vídeo con keyframe válido**: éxito parcial; el keyframe se muestra como póster y se puede reintentar (nueva pipeline completa).
- **Job expirado**: 410 `job-expired`; la UI muestra `Esta generación ya no está disponible. Empieza de nuevo.` y ofrece `Regenerar`/`Editar idea`.
- **Token manipulado**: 404 `job-not-found`; no se revela si el fallo es de firma o de formato.
- **Token de más de 4096 caracteres**: 404 `job-not-found`; no se procesa y no se revela el motivo exacto.
- **Job completado sin `video.url`**: 502 `provider-invalid-output`; no se muestra un `<video>` roto.
- **`video.url` con host no permitido**: 502 `provider-invalid-output`; no se renderiza.
- **NSFW detectado por FLUX**: 422 `content-blocked`; no se envía vídeo.
- **Vídeo con URL caducada**: el `<video>` muestra el póster y `No se pudo cargar el vídeo. Puede que el enlace haya caducado.`; se ofrece `Regenerar`.
- **Pestaña oculta**: el polling se pausa; al volver visible se hace un poll inmediato.
- **Sin conexión durante polling**: se pausa, se muestra `Sin conexión. Reintentaremos cuando vuelvas a estar en línea.` y se reanuda al volver.
- **Recarga o cierre**: el job, el token y el resultado se pierden; no hay restauración. El job puede seguir en Fal y consumir crédito.
- **Navegación fuera de `/composer`**: se abortan subida y polling, se revocan `ObjectURL` y timers; no se cancela el job ya enviado.
- **Múltiples pestañas**: cada pestaña tiene su propio estado y su propia sesión de rate limit; no se comparte nada.
- **Rate limit compartido por IP**: dos pestañas pueden compartir límite por IP; se documenta.
- **Instancia reiniciada**: se pierden contadores en memoria y jobs activos; el token sigue permitiendo consultar el job si Fal sigue disponible.
- **320 px**: el selector de preset se apila; el `<video>` no supera el ancho; no hay scroll horizontal.
- **1920 px**: el contenido se centra con `max-w-3xl`; el resultado usa dos columnas como máximo y el vídeo no se estira más de `20rem` de ancho.
- **Zoom 200 %/400 %**: todo refluye; los botones crecen con `min-height`; el `<video>` mantiene 9:16.
- **Safe areas**: cabecera, `main` y resultado respetan `safe-area-inset-*`; con insets a 0 el layout no se rompe.
- **Movimiento reducido**: sin barra animada, sin shimmer y sin transiciones no esenciales.
- **Forced colors**: preset, select, barra, tarjetas, errores y `<video>` conservan límites y estados.
- **Enlace directo a `/composer`**: funciona sin pasar por el feed; `Volver al feed` navega a `/feed`.
- **Enlace directo a un job**: no hay página de job; solo la API. El token no se expone en la página.

## Requirements *(mandatory)*

### Functional Requirements

#### Ruta, despliegue y alcance

- **FR-001**: El Composer MUST renderizarse en `/composer` mediante `app/pages/composer.vue`, con enrutado por archivos de Nuxt 4.
- **FR-002**: La feature MUST desplegarse con `nuxt build` y runtime Node/Nitro. MUST NOT depender de `nuxt generate` para el Composer real. El build estático puede seguir existiendo para landing/feed, pero `/composer` real requiere servidor.
- **FR-003**: La respuesta SSR de `/composer` MUST renderizar el estado `idle`: cabecera, un único `h1`, intro, stepper, formulario, preset `Rápido` seleccionado, duración `6 s`, selector de una imagen, botón `Generar vídeo` y aviso `noscript`. MUST NOT incluir `<video>`, progreso, job, token, URLs de Fal, referencias subidas ni polling.
- **FR-004**: La landing `/` y el feed `/feed` MUST permanecer intactos en diseño, datos, comportamiento y tests, con una única excepción: la meta description del feed MUST pasar de `...estudio de creación simulado.` a `...estudio de creación con IA.`.
- **FR-005**: El resultado MUST ser terminal: MUST NOT publicar en el feed, MUST NOT crear un `Short`, MUST NOT persistir, MUST NOT descargar y MUST NOT compartir.
- **FR-006**: MUST NOT existir autenticación de usuarios, cuentas, pagos ni facturación en esta feature.

#### Modelos y validación

- **FR-007**: Los modelos compartidos del Composer MUST vivir en `app/models/composer.ts`, ser `readonly`, no contener `any`, `unknown` público, `File`, `Blob`, `FileList` ni barrels. Los tipos crudos de proveedor MUST vivir solo en `server/`.
- **FR-008**: El prompt MUST ser obligatorio, normalizarse con NFC y `trim`, conservar saltos de línea internos y tener un máximo de 280 caracteres (`String.length`). El servidor MUST repetir la validación; un prompt inválido MUST devolver 400 con código `prompt-required` o `prompt-too-long`.
- **FR-009**: El preset MUST ser `fast` o `quality`; si se omite, MUST ser `fast`. El cliente MUST enviar siempre uno. MUST NOT existir selección libre de modelo, endpoint, aspect ratio, resolución, semilla o estilo. El único modo soportado es vídeo: MUST NOT existir `mode`, `imageOnly` ni un flujo de imagen; si el body los incluye, 400 `invalid-request`.
- **FR-010**: La duración MUST ser un entero permitido por el preset: `fast` → `6` o `10`; `quality` → `5` o `10`. Si se omite, MUST usarse el default del preset (`fast` → 6, `quality` → 5). Una duración no permitida MUST devolver 400 `invalid-duration`.
- **FR-011**: La referencia MUST ser opcional y como máximo una imagen. MUST aceptarse `image/png`, `image/jpeg` y `image/webp`, con tamaño entre 1 y 8 388 608 bytes. MUST rechazarse vacío, tipo no admitido y exceso de tamaño con los códigos y mensajes del Copy Deck. Un archivo inválido MUST NOT reemplazar ni eliminar una referencia válida existente.
- **FR-012**: El `referenceUrl` MUST ser `null` o una URL `https` con host exacto en `v3.fal.media`, `v3b.fal.media` o `fal.media`, sin userinfo, sin puerto distinto de 443, sin fragmento y con longitud ≤ 2048. Cualquier otra URL MUST devolver 400 `invalid-reference`.
- **FR-013**: Los bodies MUST ser JSON (`application/json`, con `charset` opcional) y MUST rechazar campos desconocidos, en particular `endpointId`, `model`, `modelId`, `image_url`, `status_url`, `response_url`, `cancel_url` y `webhookUrl`. MUST devolver 415 `unsupported-media-type` si el `Content-Type` no es JSON.
- **FR-014**: El tamaño máximo del body MUST ser 16 KiB para `generate` y 4 KiB para `uploads`; por encima, 413 `payload-too-large`.

#### Subida de referencia

- **FR-015**: MUST existir `server/api/composer/uploads.post.ts`. Recibe `ComposerReferenceUploadRequest` y MUST devolver 200 con `ComposerUploadTicket`: `uploadUrl`, `fileUrl`, `expiresAt` y `uploadHeaders`. MUST NOT aceptar binarios, `FormData` ni multipart. El servidor MUST validar que `fileUrl` pase la allowlist de Fal CDN y que `uploadUrl` sea `https`, sin userinfo; si no, 502 `provider-invalid-output`.
- **FR-016**: El servidor MUST iniciar la subida en Fal Storage mediante `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` con `{content_type, file_name}` y `Authorization: Key <key>`. MUST usar la clave solo en servidor.
- **FR-017**: El `file_name` enviado a Fal MUST ser generado por el servidor (por ejemplo, `composer-ref-{opaque-id}.{ext}`), no el nombre crudo del cliente. El nombre del cliente MUST validarse (1–200 caracteres, sin `/`, `\`, `..` ni caracteres de control) y usarse solo para la UI.
- **FR-018**: El ticket MUST aplicar un lifecycle máximo de 3600 segundos a la referencia. El lifecycle MUST configurarse en la petición server-side de `POST /storage/upload/initiate` mediante la cabecera `X-Fal-Object-Lifecycle` con JSON `{ "expiration_duration_seconds": 3600 }`; NO se envía en el `PUT`. El contrato expone `uploadHeaders` solo para las cabeceras necesarias del `PUT` (como `Content-Type`), y el cliente MUST copiarlas sin hardcodear nombres.
- **FR-019**: El navegador MUST hacer `PUT` directo a `uploadUrl` con `uploadHeaders`, `mode: 'cors'`, `credentials: 'omit'`, `redirect: 'error'` y `cache: 'no-store'`. MUST NOT enviar `Authorization`, cookies de Fal ni la clave. MUST NOT pasar el binario por Nitro.
- **FR-020**: El cliente MUST reintentar un `PUT` fallido una vez con el mismo ticket; si el ticket caducó, MUST pedir uno nuevo una vez y reintentar. MUST abortar el `PUT` al eliminar la referencia o desmontar.
- **FR-021**: Tras un `PUT` correcto, el `File` MUST descartarse de memoria. El `ObjectURL` de miniatura MUST revocarse al eliminar, reemplazar o desmontar. El `fileUrl` MUST conservarse solo en memoria hasta generar. Tras cada `change` del input de archivo, su valor MUST reiniciarse a `''` para permitir volver a seleccionar el mismo archivo.
- **FR-022**: La subida MUST tener rate limit propio y MUST NOT permitir más de una subida concurrente por pestaña.

#### Generación y keyframe

- **FR-023**: MUST existir `server/api/composer/generate.post.ts`. Recibe `ComposerGenerationRequest` (`prompt`, `preset`, `durationSeconds`, `referenceUrl`) y MUST devolver 202 con un `ComposerJob` completo en estado `queued` (`id` opaco, `status`, `stage`, `queuePosition`, `preset`, `modelId`, `durationSeconds`, `posterUrl`, `createdAt`, `expiresAt`, `pollAfterMs`).
- **FR-024**: El servidor MUST validar body, prompt, preset, duración, referencia, rate limit, presupuesto, concurrencia e idempotencia antes de llamar a Fal.
- **FR-025**: El keyframe MUST generarse de forma síncrona dentro de `generate.post.ts` con un timeout duro de 45 000 ms. MUST usarse `POST https://fal.run/{endpointId}` o cola con espera interna; el MVP usa `fal.run`. Si falla o expira, MUST devolver 504 `keyframe-timeout` o el error de proveedor correspondiente y MUST NOT enviar ningún vídeo a la cola.
- **FR-026**: Sin referencia, el keyframe MUST generarse con `fal-ai/flux/dev`. Con una referencia válida, MUST generarse con `fal-ai/flux-pro/kontext`. El cliente MUST NOT elegir el endpoint.
- **FR-027**: El keyframe MUST ser vertical 9:16. Para FLUX dev MUST usarse `image_size: {width: 1152, height: 2048}` (2 359 296 px, múltiplo de 16 y por debajo del máximo de 4 194 304 px), `num_images: 1`, `output_format: "jpeg"` y `enable_safety_checker: true`. Para Kontext MUST usarse `aspect_ratio: "9:16"`, `output_format: "jpeg"` y `safety_tolerance: "2"` (valor inicial; rango exacto a verificar en spike).
- **FR-028**: El prompt del keyframe MUST componerse con la plantilla normativa de `PromptComposer`; MUST NOT enviarse el prompt crudo sin contexto de verticalidad.
- **FR-029**: Tras el keyframe, el servidor MUST enviar el vídeo con `POST https://queue.fal.run/{endpointId}` y el input del adaptador correspondiente, y MUST usar exactamente `status_url`, `response_url` y `cancel_url` devueltas por el submit; MUST NOT reconstruirlas a mano.
- **FR-030**: El preset `fast` MUST usar `fal-ai/minimax/hailuo-02/standard/image-to-video`; el preset `quality` MUST usar `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`. El endpoint MUST resolverse en una allowlist server-side.
- **FR-031**: El servidor MUST NOT esperar a que el vídeo termine. MUST devolver el job opaco en cuanto el submit a la cola responde.
- **FR-032**: El job MUST identificarse con un token opaco firmado con HMAC-SHA-256 y `NUXT_COMPOSER_JOB_SECRET` (o `NUXT_APP_SECRET` si se opta por derivarlo), con formato `v1.<payloadB64url>.<sigB64url>`, expiración de 60 minutos y validación `timingSafeEqual`. El payload MUST contener endpoint, `requestId`, URLs de Fal, modelo, preset, duración, hash del prompt, `posterUrl`, `referenceUrl`, `createdAt` y `expiresAt`. MUST NOT contener la clave, el prompt completo ni datos personales. El token es opaco para el contrato pero no cifrado: su payload es decodificable; por eso MUST NOT incluir secretos y MUST tratarse como una capacidad de consulta/cancelación.
- **FR-033**: Un token manipulado, mal formado o de más de 4096 caracteres MUST devolver 404 `job-not-found`; uno expirado MUST devolver 410 `job-expired`.
- **FR-034**: El keyframe MUST conservarse como `posterUrl` del job y MUST ser el póster del `<video>`. Si el vídeo falla, el keyframe MUST seguir disponible para el éxito parcial.

#### Estado, polling y cancelación

- **FR-035**: MUST existir `server/api/composer/jobs/[id].get.ts`. Debe verificar firma y expiración, consultar `status_url`, mapear `IN_QUEUE` → `queued`, `IN_PROGRESS` → `running`, `COMPLETED` → resultado, y devolver `ComposerJob`.
- **FR-036**: Cuando el estado sea `COMPLETED`, el servidor MUST consultar `response_url` y extraer el resultado específico: FLUX/Kontext `images[]`; MiniMax/Kling `video.url`. Si el resultado no está listo, MUST devolver `running` con `stage: "finalizing"` y `pollAfterMs: 1000`. Si es inválido, 502 `provider-invalid-output`.
- **FR-037**: El `videoUrl`, `posterUrl` y `referenceUrl` devueltos al cliente MUST validarse contra la allowlist de hosts de Fal CDN. Una URL fuera de la allowlist MUST tratarse como `provider-invalid-output`.
- **FR-038**: El polling del cliente MUST empezar tras la respuesta 202, usar `pollAfterMs` del servidor (default 2000 ms) y aplicar backoff 2, 2, 3, 5, 8 y 10 s como máximo. MUST NOT solapar peticiones. MUST pausarse con la pestaña oculta y reanudarse con un poll inmediato al volver visible.
- **FR-039**: Tras 10 minutos sin estado terminal, la UI MUST mostrar un aviso de espera prolongada y MUST seguir consultando con backoff hasta la expiración del token o una acción del usuario.
- **FR-040**: MUST existir `server/api/composer/jobs/[id]/cancel.post.ts`. Debe verificar el token, consultar el estado y, si el job no es terminal, llamar a `cancel_url` con el método que Fal documente (inicialmente `PUT`), devolver 200 con el `ComposerJob` en estado `cancelled` y ser idempotente. Si el job ya terminó, 409 `job-not-cancellable`. Si Fal falla, 502 `cancel-failed`.
- **FR-041**: La cancelación MUST ser best-effort: si Fal ya empezó a procesar, puede cobrar igualmente. La UI MUST conservar el borrador y anunciar `Generación cancelada.`.
- **FR-042**: Si el cliente aborta durante `submitting`, el servidor MUST comprobar la desconexión antes de enviar el vídeo y MUST evitar el submit si es posible. La carrera residual se documenta como limitación.
- **FR-043**: El estado `ready` MUST mostrar `<video controls playsinline preload="metadata">` con `poster`, sin `autoplay`, sin `loop`, sin `<iframe>` y con relación 9:16. MUST NOT existir descarga, compartición ni publicación.
- **FR-044**: Si el vídeo falla pero el keyframe existe, la UI MUST mostrar el keyframe como éxito parcial, el mensaje normativo y las acciones `Reintentar` y `Editar idea`.

#### Idempotencia, rate limit y presupuesto

- **FR-045**: `POST /api/composer/generate` y `POST /api/composer/uploads` MUST aceptar `Idempotency-Key` opcional de 8–128 caracteres (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-`). La misma clave con el mismo body MUST devolver la misma respuesta sin volver a llamar a Fal durante 10 minutos. La misma clave con otro body MUST devolver 409 `idempotency-conflict`. Si la clave ya está en vuelo, MUST devolver 409 `generation-in-progress` en `generate` y 409 `idempotency-conflict` en `uploads`, sin repetir la llamada a Fal.
- **FR-046**: Sin `Idempotency-Key`, el servidor MUST deduplicar por huella `sha256(prompt|preset|duration|referenceUrl)` durante 60 segundos y MUST impedir dos jobs activos para la misma sesión.
- **FR-047**: MUST existir rate limit en memoria por IP y sesión anónima, con ventana fija y contadores acotados. Límites por defecto: 3 generaciones/10 min y 5 tickets de subida/10 min por sesión; 20 tickets/hora por IP. MUST devolver 429 `rate-limited` con `Retry-After` en segundos. El polling MUST limitarse a 1 petición cada 1,5 s por job y sesión; por encima, 429 `rate-limited` con `Retry-After: 2`, sin llamar a Fal. La cancelación MUST limitarse a 3 llamadas/minuto por job.
- **FR-048**: MUST existir límite de concurrencia: 1 job activo por sesión (409 `generation-in-progress`) y 3 jobs globales por instancia (429 `server-busy` con `Retry-After: 30`).
- **FR-049**: MUST existir un presupuesto diario por instancia (default 50 generaciones/día UTC). Al agotarse, 429 `budget-exhausted` con `Retry-After` hasta el siguiente día UTC. El límite MUST ser configurable por entorno. El presupuesto y el rate limit cuentan intentos de generación que superan la validación, aunque el keyframe falle, porque el keyframe puede tener coste.
- **FR-050**: El rate limit y el presupuesto MUST documentarse como **no distribuidos**: no son válidos entre múltiples instancias. La sesión anónima MUST usar una cookie `composer_sid` HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` en producción, `Max-Age=86400`, con valor aleatorio de 128 bits. MUST NOT contener datos personales. Si el cliente no acepta cookies, el rate limit cae a IP.

#### Seguridad y secretos

- **FR-051**: `NUXT_FAL_KEY` MUST declararse como `runtimeConfig.falKey` (privado) en `nuxt.config.ts`. MUST NOT existir `NUXT_PUBLIC_FAL_KEY` ni ninguna variante pública. La clave MUST usarse solo en `server/`.
- **FR-052**: La clave MUST NOT aparecer en el bundle cliente, en HTML SSR, en respuestas de API, en logs, en mensajes de error, en el token de job ni en URLs devueltas al cliente.
- **FR-053**: MUST NOT loggearse el prompt completo, el nombre del archivo, el `fileUrl`, `uploadUrl`, `status_url`, `response_url`, `cancel_url`, el token de job, la `Idempotency-Key` ni la IP en claro. El prompt se registra solo como hash; la IP, solo como hash con sal secreta.
- **FR-054**: El servidor MUST rechazar peticiones POST cross-origin cuando el header `Origin` esté presente y no coincida con el host de la petición (403 `cross-origin-request`). MUST NOT habilitar CORS para `/api/composer/**`.
- **FR-055**: El servidor MUST NOT hacer fetch de URLs arbitrarias del cliente. `FalHttpClient` MUST aceptar solo orígenes de Fal de la allowlist (`https://queue.fal.run`, `https://fal.run`, `https://rest.fal.ai`) y las URLs firmadas devueltas por el submit, validadas contra el host de Fal correspondiente. MUST usar `redirect: 'error'` y timeout. En tests, el host de `NUXT_COMPOSER_FAL_*_BASE_URL` MAY añadirse a la allowlist solo cuando `NODE_ENV === 'test'`; en producción la allowlist es fija.
- **FR-056**: El servidor MUST usar una allowlist de endpoints de modelo y MUST rechazar cualquier `endpointId` del cliente (400 `invalid-request`), resolviendo el endpoint solo en la allowlist. MUST NOT existir un proxy genérico a Fal.
- **FR-057**: Los errores de proveedor MUST mapearse a códigos estables y mensajes en español. MUST NOT devolverse el mensaje crudo de Fal, stack traces, headers internos ni detalles de credenciales.
- **FR-058**: MUST NOT añadirse el SDK de Fal ni dependencias npm nuevas. Se usa `fetch` nativo, `AbortController` y `node:crypto`. MUST NOT usarse `axios`, SDKs de cola ni librerías de terceros para storage.
- **FR-059**: MUST NOT existir analítica, píxeles, fuentes remotas, CDNs de UI, iconos remotos ni telemetría de terceros. Los iconos MUST ser SVG inline locales.

#### UI/UX

- **FR-060**: El formulario MUST incluir: textarea etiquetado con contador `{n}/280`, preset `Rápido`/`Calidad` como `radiogroup`, sección de una imagen opcional, `Ajustes` plegable con select de duración, aviso de privacidad y botón `Generar vídeo`.
- **FR-061**: El preset y la duración MUST tener defaults funcionales. El camino prompt-only MUST completarse en 2 clics (CTA del feed + `Generar vídeo`); con una imagen, en 3 clics (CTA + selección de imagen + `Generar vídeo`). Abrir `Ajustes` o cambiar preset MUST ser opcional.
- **FR-062**: El progreso MUST mostrar solo etapas reales (`keyframe`, `queued`, `video`, `finalizing`), tiempo transcurrido y, si existe, `queue_position`. MUST NOT mostrar porcentajes, ETA ni barra determinada inventada. La barra MUST ser indeterminada.
- **FR-063**: El resultado MUST mostrar badge `IA`, `<video>` con controles, póster, `Modelo`, `Duración`, `Formato 9:16`, `Referencia`, `Intento`, aviso de IA y enlace temporal. MUST NOT mostrar creador, stats, like/save/share, publicar, descargar ni enviar al feed.
- **FR-064**: El copy visible MUST estar en español (`es-ES`) y coincidir exactamente con el Copy Deck de esta spec.
- **FR-065**: Los errores de validación, subida, generación, rate limit, contenido, proveedor y expiración MUST mostrarse con `role="alert"`, mensaje exacto y una acción útil (`Reintentar`, `Reintentar subida`, `Editar idea`, `Regenerar`). El foco MUST ir al primer control relevante.
- **FR-066**: El foco MUST gestionarse así: al pasar a `submitting`, al encabezado del progreso; al pasar a `ready`, al encabezado del resultado; al pasar a éxito parcial, al encabezado `Fotograma base listo`; al cancelar o editar, al textarea; al entrar en error, al botón de acción; al terminar la subida, a la tarjeta de referencia sin robar el foco del formulario. Los encabezados de progreso, resultado y éxito parcial MUST tener `tabindex="-1"`.
- **FR-067**: MUST existir una región `role="status"` con `aria-live="polite"` y `aria-atomic="true"` para etapas, cola, cancelación, resultado y avisos; `role="alert"` para errores. Las etapas MUST anunciarse una vez por transición; el tiempo transcurrido MUST NOT anunciarse cada segundo. El contenedor de progreso MUST tener `aria-busy="true"` mientras haya un job activo.
- **FR-068**: MUST cumplirse un único `h1`, `header`/`main`, jerarquía sin saltos, labels programáticas, `aria-current="step"` en el stepper, `fieldset`/`legend` o `radiogroup` etiquetado, y ningún `tabindex` positivo.
- **FR-069**: Todos los controles interactivos MUST tener un objetivo táctil mínimo de 44 × 44 px CSS, foco visible y nombre accesible.
- **FR-070**: MUST respetarse `prefers-reduced-motion: reduce`: sin barra animada, sin shimmer, sin transiciones no esenciales y sin scroll suave. En forced-colors, controles, progreso, tarjetas, errores y `<video>` MUST conservar límites y estados visibles.
- **FR-071**: El layout MUST funcionar de 320 a 1920 px sin scroll horizontal, sin solapamientos y sin recortes, con zoom 200 %/400 % y safe areas. Los campos MUST usar `text-base` para evitar el zoom de iOS.
- **FR-072**: MUST NOT usarse `v-html` ni `dangerouslySetInnerHTML` con prompt, nombre de archivo, mensajes o resultado. Todo MUST renderizarse con interpolación de Vue.
- **FR-073**: MUST NOT existir botones o enlaces muertos. `Volver al feed` MUST navegar a `/feed`. `Cancelar`, `Reintentar`, `Reintentar subida`, `Regenerar`, `Editar idea` y `Generar vídeo` MUST tener efecto real.
- **FR-074**: La UI MUST mostrar el badge `BETA` en la cabecera con explicación accesible y el badge `IA` en el resultado. MUST NOT mostrar `DEMO` ni `SIMULACIÓN` en el Composer.

#### SSR, PWA y offline

- **FR-075**: `useComposer` MUST NOT iniciar generación, subida ni polling durante SSR. El polling MUST empezar solo tras una acción del usuario en cliente. MUST NOT usarse `onServerPrefetch` para jobs.
- **FR-076**: El service worker de `@vite-pwa/nuxt` MUST configurarse con `navigateFallbackDenylist: [/^\/api\//]` y una regla `NetworkOnly` para `/api/**`. MUST NOT cachear `v3.fal.media`, `v3b.fal.media`, `fal.media`, `queue.fal.run`, `fal.run` ni `rest.fal.ai`. MUST NOT interceptar el `PUT` de subida.
- **FR-077**: Sin conexión, `Generar vídeo` MUST estar deshabilitado, MUST mostrarse `Sin conexión. La generación necesita internet.` y MUST NOT hacerse peticiones. Si hay un job activo, el polling MUST pausarse y reanudarse al volver online.
- **FR-078**: MUST NOT persistirse prompt, borrador, referencias, `File`, `fileUrl`, job, token ni resultado en `localStorage`, `sessionStorage`, IndexedDB, query string ni estado global compartido. La cookie `composer_sid` es la única excepción y no contiene datos de usuario.

#### Testing

- **FR-079**: Cada archivo runtime nuevo MUST tener cobertura automatizada directa o por integración, excepto los modelos type-only. Los tests MUST usar `@nuxt/test-utils`, `happy-dom` y stubs; MUST NOT llamar a Fal real en CI.
- **FR-080**: MUST existir tests de aceptación SSR de `/composer`, tests de rutas API con Fal stubbeado, tests de componentes con cliente fake, tests de regresión de feed/landing y tests de guardas estáticas.
- **FR-081**: MUST existir un smoke test opt-in con Fal real, saltado por defecto (`RUN_FAL_SMOKE=1` + `NUXT_FAL_KEY`), que genere un vídeo `fast` de 6 s y valide la salida sin exponer la clave. MUST NOT ejecutarse en CI.
- **FR-082**: MUST existir fixtures de contrato de Fal (submit, estados, resultados FLUX/Kontext/MiniMax/Kling, storage) sin claves reales. Los adaptadores MUST probarse contra esas fixtures.
- **FR-083**: `Date.now()` MAY usarse solo para tiempo transcurrido, comprobación de expiración de referencias/jobs y backoff en cliente, después de montar. `crypto.randomUUID()` MAY usarse solo para `Idempotency-Key` en `useComposerApi.ts`. MUST NOT usarse ninguna de las dos para SSR, contenido, tokens de job, ids de referencia ni resultados. `Math.random` MUST NOT usarse en el Composer.

### Data Contract

El contrato es normativo. Los modelos compartidos viven en `app/models/composer.ts`. Los tipos exclusivos de un composable o SFC NO se exportan desde `app/models/`. Los tipos de proveedor y el payload del token viven solo en `server/composer/`.

```ts
// app/models/composer.ts — contrato compartido del Composer real.
export type ComposerStep = 'input' | 'generating' | 'preview'

export type ComposerPreset = 'fast' | 'quality'

export type ComposerModelId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

export type ComposerVideoDuration = 5 | 6 | 10

export type ComposerValidationCode =
  | 'prompt-required'
  | 'prompt-too-long'
  | 'invalid-prompt'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'

export interface ComposerValidationIssue {
  readonly code: ComposerValidationCode
  readonly field: 'prompt' | 'reference'
  readonly message: string
}

export type ComposerReferenceId = `ref-${number}`

export type ComposerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ComposerReferenceUploadRequest {
  readonly fileName: string
  readonly contentType: ComposerImageMimeType
  readonly sizeBytes: number
}

export interface ComposerUploadTicket {
  readonly uploadUrl: string
  readonly fileUrl: string
  readonly expiresAt: string
  readonly uploadHeaders: Readonly<Record<string, string>>
}

export interface ComposerReference {
  readonly id: ComposerReferenceId
  readonly fileName: string
  readonly mimeType: ComposerImageMimeType
  readonly sizeBytes: number
  readonly fileUrl: string
  readonly previewUrl: string | null
  readonly width: number | null
  readonly height: number | null
  readonly expiresAt: string
}

export interface ComposerGenerationRequest {
  readonly prompt: string
  readonly preset: ComposerPreset
  readonly durationSeconds: ComposerVideoDuration
  readonly referenceUrl: string | null
}

export type ComposerJobId = `v1.${string}`

export type ComposerJobStage = 'keyframe' | 'queued' | 'video' | 'finalizing'

export type ComposerJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface ComposerVideoOutput {
  readonly videoUrl: string
  readonly posterUrl: string
  readonly width: number | null
  readonly height: number | null
  readonly durationSeconds: ComposerVideoDuration
  readonly modelId: ComposerModelId
  readonly expiresAt: string
}

export type ComposerErrorCode =
  | 'invalid-request'
  | 'invalid-prompt'
  | 'prompt-required'
  | 'prompt-too-long'
  | 'invalid-preset'
  | 'invalid-duration'
  | 'invalid-reference'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'cross-origin-request'
  | 'rate-limited'
  | 'server-busy'
  | 'budget-exhausted'
  | 'generation-in-progress'
  | 'idempotency-conflict'
  | 'ai-not-configured'
  | 'ai-unavailable'
  | 'ai-credits-exhausted'
  | 'content-blocked'
  | 'provider-rejected'
  | 'provider-busy'
  | 'provider-error'
  | 'provider-invalid-output'
  | 'keyframe-timeout'
  | 'provider-timeout'
  | 'job-not-found'
  | 'job-expired'
  | 'job-not-cancellable'
  | 'cancel-failed'
  | 'internal-error'

export interface ComposerJobError {
  readonly code: ComposerErrorCode
  readonly message: string
  readonly retryable: boolean
}

export interface ComposerApiError {
  readonly error: ComposerJobError & {
    readonly retryAfterSeconds?: number
  }
}

interface ComposerJobBase {
  readonly id: ComposerJobId
  readonly preset: ComposerPreset
  readonly modelId: ComposerModelId
  readonly durationSeconds: ComposerVideoDuration
  readonly posterUrl: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly pollAfterMs: number
}

export type ComposerJob =
  | (ComposerJobBase & {
      readonly status: 'queued'
      readonly stage: 'queued'
      readonly queuePosition: number | null
    })
  | (ComposerJobBase & {
      readonly status: 'running'
      readonly stage: 'video' | 'finalizing'
      readonly queuePosition: null
    })
  | (ComposerJobBase & {
      readonly status: 'succeeded'
      readonly stage: 'finalizing'
      readonly output: ComposerVideoOutput
    })
  | (ComposerJobBase & {
      readonly status: 'failed'
      readonly stage: 'queued' | 'video' | 'finalizing'
      readonly error: ComposerJobError
    })
  | (ComposerJobBase & {
      readonly status: 'cancelled'
      readonly stage: 'queued' | 'video' | 'finalizing'
    })

export interface ComposerModelCapabilities {
  readonly id: ComposerModelId
  readonly preset: ComposerPreset
  readonly label: string
  readonly durations: readonly ComposerVideoDuration[]
  readonly defaultDurationSeconds: ComposerVideoDuration
  readonly supportsImageReference: true
  readonly maxReferenceCount: 1
  readonly estimatedLatencySeconds: {
    readonly min: number
    readonly max: number
  }
  readonly estimatedCostUsd: number | null
}

export interface ComposerPresetDefinition {
  readonly preset: ComposerPreset
  readonly modelId: ComposerModelId
  readonly label: string
  readonly description: string
  readonly durations: readonly ComposerVideoDuration[]
  readonly defaultDurationSeconds: ComposerVideoDuration
}

export type ComposerGenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting'; readonly attempt: number }
  | {
      readonly status: 'queued'
      readonly job: Extract<ComposerJob, { status: 'queued' }>
      readonly attempt: number
    }
  | {
      readonly status: 'running'
      readonly job: Extract<ComposerJob, { status: 'running' }>
      readonly attempt: number
    }
  | {
      readonly status: 'ready'
      readonly job: Extract<ComposerJob, { status: 'succeeded' }>
      readonly attempt: number
    }
  | {
      readonly status: 'error'
      readonly phase: 'keyframe' | 'video' | 'poll'
      readonly error: ComposerJobError
      readonly jobId: ComposerJobId | null
      readonly posterUrl: string | null
      readonly attempt: number
    }
  | {
      readonly status: 'cancelled'
      readonly jobId: ComposerJobId | null
      readonly attempt: number
    }
```

```ts
// server/composer/fal-types.ts — SOLO servidor.
export type ComposerEndpointId =
  | 'fal-ai/flux/dev'
  | 'fal-ai/flux-pro/kontext'
  | 'fal-ai/minimax/hailuo-02/standard/image-to-video'
  | 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'

// server/composer/job-token.ts — SOLO servidor; no se importa desde app/.
export interface ComposerJobTokenPayload {
  readonly v: 1
  readonly endpointId: ComposerEndpointId
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
  readonly modelId: ComposerModelId
  readonly preset: ComposerPreset
  readonly durationSeconds: ComposerVideoDuration
  readonly promptHash: string
  readonly posterUrl: string
  readonly referenceUrl: string | null
  readonly createdAt: number
  readonly expiresAt: number
}
```

**Invariantes**:

- `app/models/composer.ts` MUST NOT contener `File`, `Blob`, `FileList` ni `any`.
- Todos los campos de los modelos compartidos MUST ser `readonly`; las uniones MUST discriminarse por `status`.
- No se crea `app/models/index.ts` ni ningún barrel.
- `ComposerJobId` MUST empezar por `v1.` y MUST ser el token firmado completo.
- `ComposerJob.status` y `ComposerJob.stage` MUST ser coherentes con la tabla de la máquina de estados.
- `ComposerJobBase.expiresAt` MUST ser posterior a `createdAt`; `pollAfterMs` MUST estar entre 1000 y 10000.
- `ComposerVideoOutput.durationSeconds` MUST coincidir con la duración solicitada; `modelId` con el preset.
- `ComposerJob.modelId` MUST corresponder al preset: `fast` → `minimax-hailuo-02`; `quality` → `kling-2.5-turbo-pro`. `ComposerVideoOutput.posterUrl` MUST coincidir con `ComposerJob.posterUrl`.
- `ComposerVideoOutput.width/height` MUST ser `null` si el proveedor no los devuelve; la UI usa `aspect-ratio: 9/16` y no inventa dimensiones.
- `ComposerUploadTicket.uploadHeaders` MUST contener solo las cabeceras necesarias para el `PUT` directo (como `Content-Type`); el lifecycle se configura server-side en el `initiate`, no en el `PUT`. MUST NOT contener `Authorization`, cookies, clave ni cabeceras arbitrarias.
- `ComposerReference.sizeBytes` MUST ser un entero entre 1 y 8 388 608.
- `ComposerReference.id` MUST ser único por sesión, empezar en `ref-1` e incrementarse sin reutilizar ids (`ref-2` es válido tras reemplazar la primera imagen).
- `ComposerReference.previewUrl` MUST ser `null` o un `blob:` local; MUST NOT persistirse.
- `ComposerReference.fileUrl` MUST pasar la allowlist de hosts de Fal CDN.
- `ComposerReference.expiresAt` MUST ser una fecha ISO 8601 UTC posterior a la subida y MUST usarse como cota conservadora de validez de la referencia.
- `ComposerGenerationRequest.referenceUrl` MUST ser `null` o pasar la allowlist.
- `ComposerJobError.message` MUST pertenecer al Copy Deck de errores; `code` MUST pertenecer a `ComposerErrorCode`.
- `ComposerModelCapabilities.estimatedCostUsd` MAY ser `null` mientras no se verifique el precio; `null` significa "no verificado", no "gratis".
- Ningún modelo compartido contiene `endpointId`, `statusUrl`, `responseUrl`, `cancelUrl` ni la clave. Esos datos son server-only.

**Tipos locales (no globales)**:

- `ComposerApi`, `UseComposerOptions`, `UseComposerReturn`, `UseComposerReferencesReturn`, `ComposerUploadState` y `AppButtonVariant` se declaran en sus archivos de composable/SFC.
- Los tipos de props/emits de cada SFC se declaran inline en el SFC.
- `FalHttpRequest`, `FalHttpResponse`, `FalQueueSubmission`, `FalQueueStatus`, `FalProviderPayload`, `FluxImageInput`, `FluxImageOutput`, `KontextInput`, `KontextOutput`, `MinimaxVideoInput`, `MinimaxVideoOutput`, `KlingVideoInput` y `KlingVideoOutput` viven en `server/composer/` y no se importan desde `app/`.

## API Contract

Todas las rutas viven bajo `/api/composer/`, son same-origin, no tienen CORS y devuelven JSON con `Cache-Control: no-store`. Las respuestas de error usan siempre `ComposerApiError`.

### Headers comunes

| Header | Dirección | Regla |
|--------|-----------|-------|
| `Content-Type: application/json` | Request | Obligatorio en POST con body JSON; `charset` opcional. Si no, 415 `unsupported-media-type`. |
| `Content-Type: application/json; charset=utf-8` | Response | Todas las respuestas con body. |
| `Cache-Control: no-store, max-age=0` | Response | Todas las respuestas. |
| `X-Content-Type-Options: nosniff` | Response | Todas las respuestas. |
| `X-Robots-Tag: noindex` | Response | Todas las respuestas. |
| `Referrer-Policy: no-referrer` | Response | Todas las respuestas. |
| `Retry-After` | Response | Obligatorio en 429; recomendado en 503/504 recuperables. Segundos enteros. |
| `Idempotency-Key` | Request | Opcional en `generate` y `uploads`; 8–128 caracteres `[A-Za-z0-9._~-]`. |
| `Origin` | Request | Si está presente, MUST coincidir con el host; si no, 403 `cross-origin-request`. |
| `Set-Cookie: composer_sid=...` | Response | Solo si no existe; HttpOnly, SameSite=Lax, Path=/, Secure en producción, Max-Age=86400. |
| `Authorization` | Request | MUST NOT aceptarse del cliente en rutas de Composer. La clave solo se usa server-side contra Fal. |

### POST `/api/composer/uploads`

Crea un ticket de subida para una imagen de referencia.

**Request**:

```json
{
  "fileName": "look-primavera.webp",
  "contentType": "image/webp",
  "sizeBytes": 482133
}
```

**Validación**:

- `fileName`: string, 1–200 caracteres tras `trim`, sin `/`, `\`, `..`, `\0` ni caracteres de control; extensión no usada como fuente de verdad.
- `contentType`: exactamente `image/png`, `image/jpeg` o `image/webp`.
- `sizeBytes`: entero entre 1 y 8 388 608.
- Campos desconocidos: 400 `invalid-request`.
- Body > 4 KiB: 413 `payload-too-large`.
- Rate limit de subida: 429 `rate-limited`.

**Response 200**:

```json
{
  "uploadUrl": "<signed-upload-url>",
  "fileUrl": "https://v3.fal.media/files/<opaque-id>/composer-ref-<opaque-id>.webp",
  "expiresAt": "2026-10-21T18:30:00.000Z",
  "uploadHeaders": {
    "Content-Type": "image/webp"
  }
}
```

**Errores**: 400 `reference-empty`, `reference-too-large`, `unsupported-reference-type`, `invalid-file-name`; 413; 415; 429; 503 `ai-not-configured`/`ai-unavailable`; 502 `provider-error`; 504 `provider-timeout`.

### PUT directo a Fal (no es una ruta de Nuxt)

El cliente MUST hacer:

```http
PUT <uploadUrl>
<todas las cabeceras devueltas en uploadHeaders, sin añadir ni renombrar ninguna>
Cache-Control: no-store

<binario>
```

El cliente MUST limitarse a copiar los pares de `uploadHeaders`; no debe hardcodear cabeceras de Fal. El lifecycle de 1 hora se aplica en el `initiate` server-side con `X-Fal-Object-Lifecycle: {"expiration_duration_seconds":3600}` (comportamiento verificado en el SDK oficial de Fal) y no viaja en el `PUT`.

- Sin `Authorization`, sin cookies de Fal, sin `FormData`.
- `redirect: 'error'`, `mode: 'cors'`.
- 200/201 → subida correcta.
- 403 → ticket caducado o firma inválida; pedir ticket nuevo una vez.
- 413 → archivo demasiado grande; 415 → tipo no admitido.
- Error CORS/red → `No se pudo subir la imagen. Inténtalo de nuevo.`.

### POST `/api/composer/generate`

Genera el keyframe y envía el vídeo a la cola.

**Request**:

```json
{
  "prompt": "Un short sobre luz natural",
  "preset": "fast",
  "durationSeconds": 6,
  "referenceUrl": null
}
```

**Validación**:

- `prompt`: string, NFC + `trim`, 1–280 caracteres, sin `\0` ni controles C0 salvo `\n`/`\t`.
- `preset`: `fast`|`quality`; omitido → `fast`; otro → 400 `invalid-preset`.
- `durationSeconds`: entero permitido por preset; omitido → default; otro → 400 `invalid-duration`.
- `referenceUrl`: `null` o URL `https` con host exacto en la allowlist; otra → 400 `invalid-reference`.
- Campos desconocidos: 400 `invalid-request`.
- Body > 16 KiB: 413.
- Rate limit: 429 `rate-limited`; concurrencia global: 429 `server-busy`; presupuesto: 429 `budget-exhausted`; job activo: 409 `generation-in-progress`; idempotencia conflictiva: 409 `idempotency-conflict`.
- Cross-origin: 403.
- Fal key ausente: 503 `ai-not-configured`.
- Keyframe timeout: 504 `keyframe-timeout`.
- Contenido bloqueado: 422 `content-blocked`.
- Proveedor: 502 `provider-error`/504 `provider-timeout`/503 `ai-unavailable`/`ai-credits-exhausted`.

**Response 202** (`ComposerJob` completo en estado `queued`):

```json
{
  "id": "v1.eyJ2IjoxLCJlbmRwb2ludElkIjoi...<signature>",
  "status": "queued",
  "stage": "queued",
  "queuePosition": null,
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000
}
```

**Errores**: 400 `invalid-request`, `prompt-required`, `prompt-too-long`, `invalid-preset`, `invalid-duration`, `invalid-reference`; 403; 409 `generation-in-progress`/`idempotency-conflict`; 413; 415; 422 `content-blocked`; 429 `rate-limited`/`server-busy`/`budget-exhausted`; 502 `provider-error`; 503 `ai-not-configured`/`ai-unavailable`/`ai-credits-exhausted`; 504 `keyframe-timeout`/`provider-timeout`; 500 `internal-error`.

### GET `/api/composer/jobs/{id}`

`{id}` es el token firmado. No se acepta ningún otro parámetro.

**Response 200 — en cola**:

```json
{
  "id": "v1....",
  "status": "queued",
  "stage": "queued",
  "queuePosition": 3,
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000
}
```

**Response 200 — en curso**:

```json
{
  "id": "v1....",
  "status": "running",
  "stage": "video",
  "queuePosition": null,
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 3000
}
```

**Response 200 — completado**:

```json
{
  "id": "v1....",
  "status": "succeeded",
  "stage": "finalizing",
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000,
  "output": {
    "videoUrl": "https://v3.fal.media/files/<opaque-id>/video.mp4",
    "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
    "width": null,
    "height": null,
    "durationSeconds": 6,
    "modelId": "minimax-hailuo-02",
    "expiresAt": "2026-10-21T19:00:00.000Z"
  }
}
```

**Response 200 — fallido**:

```json
{
  "id": "v1....",
  "status": "failed",
  "stage": "video",
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000,
  "error": {
    "code": "provider-error",
    "message": "El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.",
    "retryable": true
  }
}
```

**Response 200 — cancelado**:

```json
{
  "id": "v1....",
  "status": "cancelled",
  "stage": "queued",
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000
}
```

**Errores**: 404 `job-not-found` (firma inválida, formato inválido, token > 4096), 410 `job-expired`, 429 `rate-limited` (polling demasiado frecuente, `Retry-After`), 502 `provider-error`/`provider-invalid-output`, 503 `ai-not-configured`/`ai-unavailable`/`ai-credits-exhausted`, 504 `provider-timeout`.

### POST `/api/composer/jobs/{id}/cancel`

**Request**: sin body; `Content-Type` no requerido.

**Response 200**:

```json
{
  "id": "v1....",
  "status": "cancelled",
  "stage": "queued",
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "durationSeconds": 6,
  "posterUrl": "https://v3.fal.media/files/<opaque-id>/keyframe.jpeg",
  "createdAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "pollAfterMs": 2000
}
```

- Si el job ya está `cancelled`, MUST devolver 200 con el mismo cuerpo (idempotente).
- Si el job ya terminó (`succeeded`, `failed`) o el proveedor responde que no es cancelable, 409 `job-not-cancellable`.
- Si Fal falla al cancelar, 502 `cancel-failed` con `retryable: true`.
- Token inválido: 404; expirado: 410.
- Más de 3 cancelaciones por minuto para el mismo job: 429 `rate-limited` con `Retry-After`.

### Tabla de errores HTTP

| HTTP | Código | Retryable | Mensaje normativo |
|------|--------|-----------|-------------------|
| 400 | `invalid-request` | false | `La solicitud no es válida.` |
| 400 | `prompt-required` | false | `Escribe una idea para generar tu short.` |
| 400 | `prompt-too-long` | false | `La idea no puede superar los 280 caracteres.` |
| 400 | `invalid-prompt` | false | `La idea contiene caracteres no admitidos.` |
| 400 | `invalid-preset` | false | `El estilo de generación no es válido.` |
| 400 | `invalid-duration` | false | `La duración no es válida para el estilo elegido.` |
| 400 | `invalid-reference` | false | `La imagen de referencia no es válida.` |
| 400 | `reference-empty` | false | `El archivo está vacío.` |
| 400 | `reference-too-large` | false | `La imagen supera el máximo de 8 MB.` |
| 400 | `unsupported-reference-type` | false | `Formato no admitido. Usa PNG, JPG o WebP.` |
| 400 | `invalid-file-name` | false | `El nombre del archivo no es válido.` |
| 403 | `cross-origin-request` | false | `La solicitud no está permitida.` |
| 404 | `job-not-found` | false | `Esta generación ya no está disponible. Empieza de nuevo.` |
| 409 | `generation-in-progress` | false | `Ya tienes una generación en curso. Espera a que termine o cancélala.` |
| 409 | `idempotency-conflict` | false | `La solicitud entra en conflicto con otra anterior.` |
| 409 | `job-not-cancellable` | false | `Esta generación ya ha terminado y no se puede cancelar.` |
| 410 | `job-expired` | false | `Esta generación ya no está disponible. Empieza de nuevo.` |
| 413 | `payload-too-large` | false | `La solicitud es demasiado grande.` |
| 415 | `unsupported-media-type` | false | `El formato de la solicitud no es válido.` |
| 422 | `content-blocked` | false | `El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.` |
| 422 | `provider-rejected` | false | `No se pudo generar el vídeo con estos datos. Cambia la idea o la imagen.` |
| 429 | `rate-limited` | true | `Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.` |
| 429 | `server-busy` | true | `El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.` |
| 429 | `budget-exhausted` | false | `El estudio ha alcanzado su límite diario de generaciones. Inténtalo mañana.` |
| 502 | `provider-error` | true | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 502 | `provider-invalid-output` | true | `El proveedor devolvió un resultado no válido. Inténtalo de nuevo.` |
| 502 | `cancel-failed` | true | `No se pudo cancelar la generación. Inténtalo de nuevo.` |
| 503 | `ai-not-configured` | false | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 503 | `ai-unavailable` | false | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 503 | `ai-credits-exhausted` | false | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 503 | `provider-busy` | true | `El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 504 | `keyframe-timeout` | true | `La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.` |
| 504 | `provider-timeout` | true | `La generación está tardando más de lo esperado. Inténtalo de nuevo.` |
| 500 | `internal-error` | false | `Algo salió mal. Inténtalo de nuevo.` |

**Regla de mapeo de proveedor**:

- 400/422 de Fal por input → `provider-rejected` o `content-blocked` si el payload indica política/NSFW.
- 401/403 de Fal → `ai-unavailable` (503), nunca 401/403 al cliente, y log de credenciales.
- 402 o saldo agotado → `ai-credits-exhausted` (503).
- 429 de Fal → `provider-busy` (503) con `Retry-After` si existe.
- 5xx de Fal → `provider-error` (502).
- Timeout de red → `provider-timeout` (504).
- 200 con output inválido → `provider-invalid-output` (502).

## Server Architecture / SOLID

### Estructura normativa

| Archivo | Responsabilidad |
|---------|-----------------|
| `server/api/composer/uploads.post.ts` | Ruta fina: valida body, aplica rate limit, llama a `FalStorageService`, devuelve ticket. |
| `server/api/composer/generate.post.ts` | Ruta fina: valida body, rate limit, idempotencia, llama a `ComposerGenerationService.createJob`, devuelve 202. |
| `server/api/composer/jobs/[id].get.ts` | Ruta fina: verifica token, llama a `ComposerGenerationService.getJob`, devuelve job. |
| `server/api/composer/jobs/[id]/cancel.post.ts` | Ruta fina: verifica token, llama a `ComposerGenerationService.cancelJob`, devuelve estado. |
| `server/composer/fal-http-client.ts` | Cliente HTTP único a Fal: auth `Key`, timeout, `redirect: 'error'`, allowlist de orígenes, sin logs sensibles. |
| `server/composer/fal-queue-service.ts` | Submit a `queue.fal.run`, lectura de estado, resultado, cancelación; usa URLs devueltas por el submit. |
| `server/composer/fal-storage-service.ts` | Inicio de subida en `rest.fal.ai/storage`, construcción del ticket y lifecycle. |
| `server/composer/model-registry.ts` | Allowlist de modelos, endpoints, presets, duraciones, defaults y adaptadores. Única fuente server-side. |
| `server/composer/prompt-composer.ts` | Plantillas de prompt de keyframe y vídeo, negative prompt y hash del prompt. |
| `server/composer/generation-orchestrator.ts` | Keyframe → validación → submit de vídeo → token. Sin HTTP de ruta. |
| `server/composer/composer-generation-service.ts` | Casos de uso: crear job, consultar job, cancelar; idempotencia, concurrencia y mapeo de estado. |
| `server/composer/adapters/flux-image-adapter.ts` | Input/output de `fal-ai/flux/dev`. |
| `server/composer/adapters/flux-kontext-adapter.ts` | Input/output de `fal-ai/flux-pro/kontext`. |
| `server/composer/adapters/minimax-video-adapter.ts` | Input/output de `fal-ai/minimax/hailuo-02/standard/image-to-video`. |
| `server/composer/adapters/kling-video-adapter.ts` | Input/output de `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`. |
| `server/composer/rate-limit.ts` | Ventanas por IP/sesión, concurrencia, presupuesto diario, mapas acotados y `Retry-After`. |
| `server/composer/job-token.ts` | Firma/verificación HMAC-SHA-256, base64url, TTL, `timingSafeEqual`. |
| `server/composer/validation.ts` | Type guards, parseo de JSON, allowlist de campos, validación de prompt/preset/duración/referencia. |
| `server/composer/errors.ts` | `ComposerError`, códigos, HTTP, retryable, mensajes y serialización `ComposerApiError`. |
| `server/composer/request-context.ts` | IP, sesión anónima, cookie `composer_sid`, origen same-origin, hash de IP. |
| `server/composer/fal-types.ts` | Tipos crudos y type guards de Fal; no se importa desde `app/`. |

No se crean `server/middleware`, `server/plugins` ni un proxy genérico. Las rutas no contienen lógica de negocio.

**No se crea `server/api/composer/models.get.ts`.** Las capacidades estáticas (labels, duraciones, defaults, latencia estimada) viven en `app/data/composer.ts` para que el SSR sea determinista y no dependa de una petición adicional; la allowlist y los endpoints viven en `server/composer/model-registry.ts`. Un test de paridad (`composer-data.spec.ts` + `model-registry.spec.ts`) garantiza que ambos lados coinciden. Una ruta `models` añadiría superficie, una petición y un estado de carga sin aportar valor al MVP.

### Contratos internos

```ts
// server/composer/fal-http-client.ts
export interface FalHttpRequest {
  readonly url: string
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly body?: unknown
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export interface FalHttpResponse<T> {
  readonly status: number
  readonly data: T
  readonly headers: Headers
}

export interface FalHttpClient {
  request<T>(request: FalHttpRequest): Promise<FalHttpResponse<T>>
}

// server/composer/fal-queue-service.ts
export interface FalQueueSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export interface FalQueueStatus {
  readonly status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  readonly queuePosition: number | null
}

export interface FalQueueService {
  submit(endpointId: ComposerEndpointId, input: unknown, signal?: AbortSignal): Promise<FalQueueSubmission>
  getStatus(statusUrl: string, signal?: AbortSignal): Promise<FalQueueStatus>
  getResult(responseUrl: string): Promise<unknown>
  cancel(cancelUrl: string): Promise<void>
}

// server/composer/adapters/types.ts
export interface KeyframeAdapter {
  readonly modelId: string
  buildInput(input: KeyframeInput): unknown
  parseOutput(payload: unknown): KeyframeOutput
}

export interface VideoAdapter {
  readonly modelId: ComposerModelId
  buildInput(input: VideoInput): unknown
  parseOutput(payload: unknown, requestedDuration: ComposerVideoDuration): VideoOutput
}
```

Reglas:

- `FalHttpClient` MUST ser la única pieza que conoce `fetch`, `Authorization: Key` y los orígenes de Fal. Los adaptadores MUST NOT leer `process.env` ni `useRuntimeConfig`.
- `FalQueueService` MUST usar `statusUrl`, `responseUrl` y `cancelUrl` del submit; MUST NOT construir URLs con `owner/app`.
- `FalHttpClient` MUST aplicar timeout por petición (keyframe 45 s; storage/queue 15 s; status 10 s) y MUST usar `redirect: 'error'`.
- Los adaptadores MUST validar el output con type guards y MUST lanzar `ComposerError` con `provider-invalid-output` si falta el campo esperado.
- `GenerationOrchestrator` MUST recibir por inyección: `FalQueueService`, `ModelRegistry`, `PromptComposer`, `FalHttpClient`, `now` y la configuración de timeouts/TTL. No usa singletons globales ni `randomId`.
- `ComposerGenerationService` MUST recibir por inyección: `GenerationOrchestrator`, `FalQueueService`, `RateLimiter`, `JobTokenService`, `Clock`.
- Los tests MUST poder sustituir cada dependencia sin red.
- Ningún archivo de `server/` puede importar `app/components`, `app/composables`, `app/pages` ni `app/utils` de UI. Solo puede importar tipos de `app/models/composer.ts`.
- Ningún archivo de `app/` puede importar `server/` ni `node:crypto`.
- No se usa `any`. Se permite `unknown` en la frontera de proveedor y se estrecha con type guards.

### Mapa de modelos y defaults

| Preset | Modelo | Endpoint (server-only) | Duración | Default | Salida |
|--------|--------|------------------------|----------|---------|--------|
| `fast` | `minimax-hailuo-02` | `fal-ai/minimax/hailuo-02/standard/image-to-video` | `6` o `10` | `6` | `video.url` |
| `quality` | `kling-2.5-turbo-pro` | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | `5` o `10` | `5` | `video.url` |

| Keyframe | Modelo | Endpoint (server-only) | Campos | Defaults |
|----------|--------|------------------------|--------|----------|
| Sin referencia | FLUX dev | `fal-ai/flux/dev` | `prompt`, `image_size`, `num_images`, `output_format`, `enable_safety_checker` | `{width:1152,height:2048}`, `1`, `"jpeg"`, `true` |
| Con referencia | FLUX Kontext | `fal-ai/flux-pro/kontext` | `image_url`, `prompt`, `aspect_ratio`, `output_format`, `safety_tolerance` | `9:16`, `"jpeg"`, `"2"` (verificar rango) |

**Input exacto de vídeo**:

```ts
// MiniMax Hailuo 02 Standard
{
  prompt: composedVideoPrompt,
  image_url: keyframeUrl,
  duration: durationSeconds === 6 ? '6' : '10',
  resolution: '768P',
  prompt_optimizer: false,
}

// Kling 2.5 Turbo Pro
{
  prompt: composedVideoPrompt,
  image_url: keyframeUrl,
  duration: durationSeconds === 5 ? '5' : '10',
  negative_prompt: 'blur, distortion, flicker, text, watermark, logo, low quality, deformed hands',
  cfg_scale: 0.5,
}
```

- `resolution: '768P'` es el default del MVP para MiniMax; `512P` queda permitido por el modelo pero no se expone en la UI.
- `prompt_optimizer: false` conserva el prompt de la persona; no se reescribe en el MVP.
- `cfg_scale: 0.5` es el valor inicial; rango exacto a verificar en spike.
- `negative_prompt` es normativo y no se expone como campo libre.
- Salida de FLUX dev/Kontext: `images[0].url`; si `has_nsfw_concepts` contiene `true`, MUST lanzarse `content-blocked` y MUST NOT enviarse el vídeo. Si `images` está vacío o falta `url`, `provider-invalid-output`.

### Plantillas de prompt normativas

```text
keyframeFlux(prompt) =
  `Cinematic vertical 9:16 keyframe for a short video. ${prompt}. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.`

keyframeKontext(prompt) =
  `Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short video. ${prompt}. Preserve the subject identity, clothing and color palette. No text, no watermark, no logo.`

videoPrompt(prompt) =
  `${prompt}. Vertical 9:16 short video, smooth natural motion, consistent subject, no text, no watermark, no logo.`
```

- El prompt de la persona MUST insertarse literalmente, sin HTML y sin interpolar valores no escapados.
- El hash del prompt (`sha256`) se guarda en el token y en logs; el prompt completo no.

## UI/UX Contract

### Estructura de pantalla

```
Header: marca AI Shorts · badge BETA · Volver al feed
Main:
  h1: Crea un short con IA
  intro
  noscript
  Stepper: Idea · Generación · Resultado
  status (role=status, sr-only cuando vacío)
  [idle/error/cancelled]
    Form card
      h2 Tu idea
      label + textarea + contador + ayuda + error
      fieldset/radiogroup: Calidad de generación
        Rápido (default) / Calidad
      section Imagen de referencia (opcional)
        Añadir imagen / tarjeta / eliminar / subida / error
      details Ajustes · {duración}
        select Duración
      aviso de privacidad
      Generar vídeo
  [submitting/queued/running]
    Progress card
      h2 Generando tu vídeo
      nota de generación real
      stage list (4) + barra indeterminada
      tiempo transcurrido
      posición en cola (si existe)
      aviso de espera prolongada (si aplica)
      Cancelar
  [ready]
    Result card
      badge IA + h2 Tu short
      <video controls playsinline poster>
      metadata: Modelo, Duración, Formato, Referencia, Intento
      nota de IA + enlace temporal
      Regenerar / Editar idea
  [partial]
    Result card
      badge IA + h2 Fotograma base listo
      <img> keyframe
      mensaje de fallo de vídeo
      Reintentar / Editar idea
  [error]
    alert block con mensaje + acción
```

### Copy Deck normativo

Los textos MUST aparecer exactamente como se escriben (acentos, mayúsculas y puntuación incluidos).

| Slot | Texto exacto |
|------|--------------|
| Marca | `AI Shorts` |
| Badge de cabecera | `BETA` |
| Explicación accesible del badge | `BETA. La generación de vídeo con IA es real, consume créditos y puede tardar varios minutos.` |
| Enlace de vuelta | `Volver al feed` |
| H1 | `Crea un short con IA` |
| Intro | `Describe una idea, añade una imagen de referencia opcional y genera un vídeo vertical de 9:16. La generación es real y consume créditos.` |
| Nombre del stepper | `Progreso de creación` |
| Paso 1 | `Idea` |
| Paso 2 | `Generación` |
| Paso 3 | `Resultado` |
| Etiqueta accesible de paso | `Paso {n} de 3: {etiqueta}, {estado}` con estados `completado`, `actual`, `pendiente` |
| Título del formulario | `Tu idea` |
| Etiqueta del prompt | `Describe tu idea` |
| Placeholder del prompt | `Un short sobre cómo preparar tu primer set de grabación.` |
| Ayuda del prompt | `Máximo 280 caracteres.` |
| Contador visible | `{n}/280` |
| Contador accesible | `{n} de 280 caracteres` |
| Título de preset | `Calidad de generación` |
| Preset rápido | `Rápido` |
| Descripción rápida | `Menos espera, ideal para probar.` |
| Preset calidad | `Calidad` |
| Descripción calidad | `Más detalle y movimiento, tarda más.` |
| Modelo rápido | `MiniMax Hailuo 02` |
| Modelo calidad | `Kling 2.5 Turbo Pro` |
| Título de referencia | `Imagen de referencia (opcional)` |
| Ayuda de referencia | `Una imagen PNG, JPG o WebP de hasta 8 MB. Se envía a Fal para generar el vídeo y se elimina en 1 hora.` |
| Añadir imagen | `Añadir imagen` |
| Contador de referencia | `{n} de 1` |
| Estado vacío | `Sin imagen. Puedes generar solo con texto.` |
| Máximo de referencia | `Máximo 1 imagen. Elimina la actual para cambiarla.` |
| Referencia seleccionada | `Imagen · {size}` |
| Subiendo | `Subiendo imagen…` |
| Imagen lista | `Imagen lista.` |
| Espera de polling | `Esperando…` |
| Reintentar subida | `Reintentar subida` |
| Eliminar referencia | `Eliminar {nombre}` |
| Ajustes | `Ajustes` |
| Resumen de ajustes | `Ajustes · {duración}` |
| Etiqueta de duración | `Duración` |
| Ayuda de duración | `La duración afecta al tiempo de espera y al coste.` |
| Aviso de privacidad | `Tu idea y tu imagen se envían a Fal para generar el vídeo. AI Shorts no las guarda. La imagen de referencia se elimina del almacenamiento de Fal en 1 hora.` |
| Generar | `Generar vídeo` |
| Título de generación | `Generando tu vídeo` |
| Nota de generación | `La generación es real y puede tardar varios minutos. Si sales de esta página, perderás el progreso.` |
| Etapa keyframe | `Creando el fotograma base` |
| Etapa queued | `En cola` |
| Etapa video | `Generando el vídeo` |
| Etapa finalizing | `Preparando el resultado` |
| Posición en cola | `Posición {n} en la cola` |
| Tiempo transcurrido | `Tiempo transcurrido: {m}:{ss}` |
| Aviso de espera prolongada | `Está tardando más de lo habitual. Puedes seguir esperando o cancelar.` |
| Cancelar | `Cancelar` |
| Cancelación anunciada | `Generación cancelada.` |
| Resultado listo | `Vídeo listo.` |
| Badge de resultado | `IA` |
| Título de resultado | `Tu short` |
| Etiqueta modelo | `Modelo` |
| Etiqueta duración | `Duración` |
| Etiqueta formato | `Formato` |
| Valor formato | `9:16` |
| Etiqueta referencia | `Referencia` |
| Referencia cero | `Sin referencia` |
| Referencia una | `1 imagen` |
| Etiqueta intento | `Intento {n}` |
| Nota de resultado | `Generado con IA. Puede contener errores. No se ha publicado en el feed. El enlace del vídeo es temporal.` |
| Regenerar | `Regenerar` |
| Editar | `Editar idea` |
| Éxito parcial: título | `Fotograma base listo` |
| Éxito parcial: mensaje | `No se pudo generar el vídeo, pero conservamos el fotograma base.` |
| Prompt obligatorio | `Escribe una idea para generar tu short.` |
| Prompt demasiado largo | `La idea no puede superar los 280 caracteres.` |
| Prompt con caracteres no admitidos | `La idea contiene caracteres no admitidos.` |
| Archivo vacío | `El archivo está vacío.` |
| Tipo no admitido | `Formato no admitido. Usa PNG, JPG o WebP.` |
| Imagen demasiado grande | `La imagen supera el máximo de 8 MB.` |
| Nombre no válido | `El nombre del archivo no es válido.` |
| Solicitud no válida | `La solicitud no es válida.` |
| Preset no válido | `El estilo de generación no es válido.` |
| Duración no válida | `La duración no es válida para el estilo elegido.` |
| Referencia no válida | `La imagen de referencia no es válida.` |
| Solicitud demasiado grande | `La solicitud es demasiado grande.` |
| Formato de solicitud no válido | `El formato de la solicitud no es válido.` |
| Idempotencia conflictiva | `La solicitud entra en conflicto con otra anterior.` |
| Estudio ocupado | `El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.` |
| Proveedor rechaza input | `No se pudo generar el vídeo con estos datos. Cambia la idea o la imagen.` |
| Proveedor con output inválido | `El proveedor devolvió un resultado no válido. Inténtalo de nuevo.` |
| Cancelación fallida | `No se pudo cancelar la generación. Inténtalo de nuevo.` |
| Subida fallida | `No se pudo subir la imagen. Inténtalo de nuevo.` |
| Subida caducada | `La subida ha caducado. Vuelve a seleccionar la imagen.` |
| Error de generación genérico | `No se pudo iniciar la generación. Inténtalo de nuevo.` |
| Error de keyframe | `La preparación del fotograma base tardó demasiado. No se ha enviado ningún vídeo a generar. Inténtalo de nuevo.` |
| Contenido bloqueado | `El contenido no cumple las políticas del proveedor. Cambia la idea o la imagen e inténtalo de nuevo.` |
| Rate limit | `Has alcanzado el límite de generaciones. Inténtalo de nuevo más tarde.` |
| Rate limit con tiempo | `Has alcanzado el límite de generaciones. Inténtalo de nuevo en {n} minutos.` |
| Concurrencia | `Ya tienes una generación en curso. Espera a que termine o cancélala.` |
| Presupuesto | `El estudio ha alcanzado su límite diario de generaciones. Inténtalo mañana.` |
| Proveedor no disponible | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| Proveedor ocupado | `El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.` |
| Timeout de generación | `La generación está tardando más de lo esperado. Inténtalo de nuevo.` |
| Job expirado | `Esta generación ya no está disponible. Empieza de nuevo.` |
| Job no cancelable | `Esta generación ya ha terminado y no se puede cancelar.` |
| Cancelación fallida | `No se pudo cancelar la generación. Inténtalo de nuevo.` |
| Vídeo no cargado | `No se pudo cargar el vídeo. Puede que el enlace haya caducado.` |
| Sin conexión | `Sin conexión. La generación necesita internet.` |
| Sin conexión durante polling | `Sin conexión. Reintentaremos cuando vuelvas a estar en línea.` |
| Error inesperado | `Algo salió mal. Inténtalo de nuevo.` |
| Aviso sin JavaScript | `El estudio de creación necesita JavaScript para generar un vídeo con IA. Puedes volver al feed de prueba.` |
| Meta title | `AI Shorts — Estudio de creación` |
| Meta description | `Estudio de creación de AI Shorts: describe una idea, añade una imagen opcional y genera un vídeo vertical de 9:16 con IA.` |
| Feed: meta description actualizada | `Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación con IA.` |

**Formatos normativos**:

- Duración: `6 s`, `10 s`, `5 s` en controles; `formatDuration` existente (`0:06`, `0:10`, `0:05`) en metadatos.
- Tamaño: reutilizar `formatFileSize` de `app/utils/composer.ts` (`B`, `KB`, `MB` con coma decimal y sin `,0`).
- Referencia: `Sin referencia` o `1 imagen`.
- Tiempo transcurrido: `m:ss` con minutos sin cero a la izquierda (`0:07`, `1:02`).

### Stable data-testid Hooks

Se conservan los hooks de 003 que sigan teniendo sentido y se añaden los nuevos. Pueden permanecer en producción.

| `data-testid` | Elemento / uso |
|---------------|----------------|
| `composer-page` | Raíz de `/composer`. |
| `composer-header` | `header`. |
| `brand-mark` | Marca `AI Shorts`. |
| `composer-beta-badge` | Badge `BETA` con explicación accesible. |
| `composer-back-link` | Enlace `Volver al feed`. |
| `composer-h1` | `h1` `Crea un short con IA`. |
| `composer-intro` | Intro. |
| `composer-stepper` | `ol` del stepper. |
| `composer-step` | Cada `li`; `data-step` (`input`, `generating`, `preview`) y `data-state` (`complete`, `current`, `upcoming`). |
| `composer-status` | Región `role="status"` de página. |
| `composer-form` | `<form>`. |
| `composer-prompt-input` | `textarea`. |
| `composer-prompt-counter` | Contador. |
| `composer-prompt-help` | Ayuda. |
| `composer-prompt-error` | Error de prompt `role="alert"`. |
| `composer-preset-group` | `radiogroup`/`fieldset` de preset. |
| `composer-preset-fast` | Radio `Rápido`. |
| `composer-preset-quality` | Radio `Calidad`. |
| `composer-reference` | Sección de referencia. |
| `composer-reference-input` | `<input type="file">` oculto. |
| `composer-reference-add` | Botón `Añadir imagen`. |
| `composer-reference-count` | `{n} de 1`. |
| `composer-reference-empty` | Estado vacío. |
| `composer-reference-uploading` | Estado `Subiendo imagen…`. |
| `composer-reference-retry` | Botón `Reintentar subida`. |
| `composer-reference-error` | Región `role="alert"`. |
| `composer-reference-card` | Tarjeta; `data-reference-id` y `data-reference-kind="image"`. |
| `composer-reference-thumbnail` | Miniatura. |
| `composer-reference-remove` | Botón `Eliminar {nombre}`. |
| `composer-settings` | `<details>` `Ajustes`. |
| `composer-settings-summary` | Resumen `Ajustes · {duración}`. |
| `composer-duration` | Select de duración. |
| `composer-privacy` | Aviso de privacidad. |
| `composer-generate` | Botón `Generar vídeo` (`type="submit"`). |
| `composer-generation` | Contenedor del progreso. |
| `composer-generation-heading` | `h2` `Generando tu vídeo` con `tabindex="-1"`. |
| `composer-generation-stage` | Etapa visible. |
| `composer-generation-stages` | Lista de 4 etapas. |
| `composer-generation-progress` | `role="progressbar"` indeterminado. |
| `composer-generation-elapsed` | Tiempo transcurrido. |
| `composer-generation-queue` | Posición en cola. |
| `composer-generation-slow` | Aviso de espera prolongada. |
| `composer-cancel` | `Cancelar`. |
| `composer-error` | Bloque `role="alert"` de error. |
| `composer-retry` | `Reintentar`. |
| `composer-result` | Contenedor del resultado. |
| `composer-result-badge` | Badge `IA`. |
| `composer-result-heading` | `h2` `Tu short` con `tabindex="-1"`. |
| `composer-video` | `<video>`. |
| `composer-video-poster` | Póster/keyframe si se muestra como `<img>` en éxito parcial. |
| `composer-result-model` | Modelo. |
| `composer-result-duration` | Duración. |
| `composer-result-format` | `9:16`. |
| `composer-result-reference` | `Sin referencia`/`1 imagen`. |
| `composer-result-attempt` | `Intento {n}`. |
| `composer-result-note` | Nota de IA y enlace temporal. |
| `composer-regenerate` | `Regenerar`. |
| `composer-edit` | `Editar idea`. |
| `composer-partial` | Contenedor de éxito parcial. |
| `composer-offline` | Aviso de sin conexión. |
| `composer-nojs-notice` | Aviso `<noscript>`. |
| `feed-cta` | CTA del feed, `<a href="/composer">`. |
| `feed-header` | Cabecera del feed. |
| `feed-page` | Raíz del feed. |

**Retirados**: `composer-demo-badge`, `composer-preview`, `composer-preview-badge`, `composer-preview-heading`, `composer-preview-poster`, `composer-preview-title`, `composer-preview-duration`, `composer-preview-references`, `composer-preview-attempt`, `composer-preview-prompt`, `composer-preview-note`, `composer-generation-note` (sustituido por `composer-generation` con copy nuevo). Los tests de 003 que los usan se reescriben o se retiran.

### Presupuesto de clics

| Recorrido | Clics | Detalle |
|-----------|-------|---------|
| Feed → Composer | 1 | CTA `Crear short` (enlace). |
| Prompt-only → vídeo | 2 | CTA + `Generar vídeo`; defaults `Rápido` + 6 s. |
| Con 1 imagen → vídeo | 3 | CTA + `Añadir imagen`/selección + `Generar vídeo`. |
| Cambiar preset | +1 | Acción opcional; no obligatoria. |
| Abrir `Ajustes` y cambiar duración | +2 | Acción opcional; no obligatoria. |
| Cancelar | +1 | Recuperación. |
| Reintentar / Regenerar | +1 | Recuperación. |
| Editar idea | +1 | Recuperación. |
| Volver al feed | +1 | Navegación. |
| Publicar / Descargar / Compartir | — | No existen. |

El camino mínimo exitoso nunca supera 3 clics. El preset y la duración tienen defaults y no obligan a elegir nada.

### Design Contract (adiciones a 003)

Se conservan el tema dark-only, los tokens `brand-*`, la tipografía del sistema, los iconos SVG inline, las superficies, el foco, las safe areas y el responsive de 003. Adiciones normativas:

| Concern | Decisión |
|---------|----------|
| Preset | `fieldset`/`radiogroup` con dos tarjetas-radio de `min-h-11`, borde `white/15`, seleccionada con `border-brand-fuchsia` y fondo `brand-fuchsia/10`. Texto secundario `text-xs text-brand-muted`. |
| Duración | `<details>` con `summary` de `min-h-11`; select nativo estilizado con `bg-brand-ink`, borde `white/15`, `text-base`. |
| Referencia | Tarjeta de 1 imagen con miniatura `size-14`, botón de eliminar de 44 px, estado de subida con spinner estático bajo reduced motion. |
| Progreso | Tarjeta `rounded-3xl` con lista de 4 etapas; etapa actual con punto gradiente; completadas con borde `brand-violet`; barra indeterminada de 8 px con gradiente y animación solo `motion-safe:`; bajo reduced motion, barra estática. |
| Resultado | `grid` de dos columnas en `md`; `<video>` `aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 bg-black object-cover`; metadatos en tarjeta `brand-surface`. |
| Badge IA | Pill `rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia`. |
| Error | Bloque `rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm`. |
| Offline | Bloque `rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-brand-text`. |
| Motion | Solo transiciones de color/opacidad de 150 ms bajo `motion-safe:`; barra indeterminada animada solo `motion-safe:`. Sin shimmer, parallax ni scroll suave. |
| Responsive | 320 px base; `sm` 640; `md` 768 para resultado a dos columnas; `lg` 1024; hasta 1920 px. |
| z-index | Contenido `0`, cabecera `10`, alertas/estado `20`. Sin overlays ni modales. |

### App File Structure (normativa)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/pages/composer.vue` | Ruta `/composer`, metadatos, composición de cabecera, stepper, formulario, progreso, resultado, éxito parcial, error y `noscript`; orquesta foco y estado. No llama a Fal directamente. |
| `app/components/composer/ComposerHeader.vue` | `header` con `BrandMark`, badge `BETA` explicado y enlace `Volver al feed`. |
| `app/components/composer/ComposerStepper.vue` | `nav` + `ol` de 3 pasos (`Idea`, `Generación`, `Resultado`); recibe `current`; no es interactivo. |
| `app/components/composer/ComposerPromptForm.vue` | `<form>` con `h2` `Tu idea`, label, textarea, contador, ayuda, error, slots `preset`, `reference` y `settings`, y botón `Generar vídeo`. Emite `update:prompt` y `submit`; expone `focusPrompt()`. |
| `app/components/composer/ComposerPresetPicker.vue` | `fieldset`/`radiogroup` con `Rápido` y `Calidad`, descripciones y modelo; emite `update:preset`. |
| `app/components/composer/ComposerReferencePicker.vue` | `section` con una imagen opcional: input oculto `accept` de imagen, botón `Añadir imagen`, tarjeta, estados de subida, error y `Reintentar subida`. Emite `select`, `remove`, `retry`. |
| `app/components/composer/ComposerReferenceCard.vue` | Tarjeta de la imagen: miniatura, nombre, `Imagen · {size}` y botón `Eliminar {nombre}`. No usa `<video>`. |
| `app/components/composer/ComposerGenerationProgress.vue` | Progreso real: heading, nota, 4 etapas, barra indeterminada, tiempo transcurrido, posición en cola, aviso de lentitud y `Cancelar`. Enfoca su heading al montar. |
| `app/components/composer/ComposerResult.vue` | Resultado real: badge `IA`, `<video controls playsinline poster>`, metadatos, nota, `Regenerar` y `Editar idea`. Enfoca su heading al montar. |
| `app/components/composer/ComposerPartialResult.vue` | Éxito parcial: keyframe como `<img>`, mensaje de fallo de vídeo, `Reintentar` y `Editar idea`. |
| `app/components/ui/AppButton.vue` | Sin cambios de API. |
| `app/composables/useComposer.ts` | Máquina de estados, polling/backoff, cancelación, reintento, regeneración, edición, intento, foco/anuncios y limpieza. Recibe `api` por inyección para tests. |
| `app/composables/useComposerReferences.ts` | Una sola referencia, validación, ticket, `PUT` directo, `ObjectURL`, `File` efímero, reintento y limpieza. |
| `app/composables/useComposerApi.ts` | Cliente same-origin de las rutas `/api/composer/**` y `PUT` directo a Fal. Único archivo de `app/` que puede usar `$fetch`/`fetch`. |
| `app/models/composer.ts` | Contrato compartido de 004. Sin `File`/`Blob`/`any`. |
| `app/data/composer.ts` | Presets, capacidades, duraciones, defaults, límites y copy de opciones. Sin endpoints de Fal. |
| `app/utils/composer.ts` | Helpers puros: validación de prompt/referencia, formato de tamaño/duración, etiquetas de etapa y construcción de requests. Sin hash FNV, pósters, timeline mock ni allowlist de hosts de Fal. |
| `app/components/composer/ComposerPreview.vue` | **Borrar**; sustituido por `ComposerResult.vue` y `ComposerPartialResult.vue`. |
| `public/mock/composer/composer-01.svg` … `composer-04.svg` | **Borrar**; ya no hay pósters mock. |
| `tests/unit/composer-preview.spec.ts` | **Retirar**; cubierto por `composer-result.spec.ts` y `composer-partial.spec.ts`. |

**API de componentes y composables (normativa)**:

- `ComposerStepper`: prop `current: ComposerStep` (`input` | `generating` | `preview`); sin emits. El paso 3 se muestra como `Resultado`.
- `ComposerPromptForm`: props `prompt: string`, `promptIssue: ComposerValidationIssue | null`; emits `update:prompt`, `submit`; slots `preset`, `reference` y `settings`; expone `focusPrompt()`.
- `ComposerPresetPicker`: props `preset: ComposerPreset`; emit `update:preset`.
- `ComposerReferencePicker`: props `reference: ComposerReference | null`, `uploadState: 'idle' | 'uploading' | 'error'`, `issues`; emits `select [file: File]`, `remove []`, `retry []`. El `File` solo cruza este evento; no se guarda en modelos.
- `ComposerReferenceCard`: props `reference: ComposerReference`; emit `remove`.
- `ComposerGenerationProgress`: props `stage: ComposerJobStage`, `queuePosition: number | null`, `elapsedSeconds: number`, `isSlow: boolean`, `attempt: number`; emit `cancel`.
- `ComposerResult`: props `job: Extract<ComposerJob, { status: 'succeeded' }>`; emits `regenerate`, `edit`.
- `ComposerPartialResult`: props `posterUrl: string`, `error: ComposerJobError`; emits `retry`, `edit`.
- `useComposer(options: { references: Ref<ComposerReference | null>; api?: ComposerApi })`: devuelve `prompt`, `preset`, `durationSeconds`, `generation`, `step`, `statusMessage`, `isGenerating`, `generate`, `cancel`, `retry`, `regenerate`, `edit`, `clearIssues`.
- `useComposerReferences(options: { api: ComposerApi })`: devuelve `reference`, `uploadState`, `issues`, `selectFile`, `removeReference`, `retryUpload`, `clearIssues`.
- `ComposerApi` es local a `useComposerApi.ts`: `createUploadTicket(input: ComposerReferenceUploadRequest): Promise<ComposerUploadTicket>`, `uploadReference(ticket: ComposerUploadTicket, file: File): Promise<void>`, `generate(input: ComposerGenerationRequest): Promise<ComposerJob>`, `getJob(id: ComposerJobId): Promise<ComposerJob>`, `cancelJob(id: ComposerJobId): Promise<ComposerJob>`. No se exporta desde `app/models/` porque contiene `Blob`/`File` en su firma.
- `AppButton`: sin cambios; `variant`, `type`, `disabled` y slot.

## State Machine

`uploading` es un subestado de la referencia (`useComposerReferences`) y no forma parte de `ComposerGenerationState`: permite que el formulario siga visible y que la máquina de generación permanezca en `idle` mientras se sube la imagen. La página lo refleja deshabilitando `Generar vídeo` y mostrando el estado de subida. Los estados de generación son los de la tabla siguiente.

### Estados

| Estado | Significado | UI |
|--------|-------------|----|
| `idle` | Sin job activo; formulario editable. | Formulario + resultado anterior descartado. |
| `uploading` | Subida de referencia en curso. | Formulario visible, `Generar vídeo` deshabilitado, tarjeta en `Subiendo imagen…`. |
| `submitting` | `POST /generate` en curso; keyframe generándose. | Progreso en `Creando el fotograma base`; formulario bloqueado; `Cancelar` aborta la petición. |
| `queued` | Job aceptado, `IN_QUEUE`. | Progreso en `En cola`; posición si existe; `Cancelar`. |
| `running` | Job `IN_PROGRESS` o `finalizing`. | Progreso en `Generando el vídeo`/`Preparando el resultado`; `Cancelar`. |
| `ready` | Job `succeeded` con `output`. | Resultado con `<video>`; `Regenerar`/`Editar idea`. |
| `error` | Fallo de subida, keyframe, vídeo o polling. | Bloque `role="alert"` con acción. |
| `cancelled` | Cancelación confirmada o abortada. | Formulario con borrador + `Generación cancelada.`. |

### Transiciones

| Estado actual | Evento | Estado siguiente | Borrador | Intento | Foco / anuncio |
|---------------|--------|------------------|----------|---------|----------------|
| `idle` | Submit inválido | `idle` | Conservado | Sin cambio | Foco al textarea; `role="alert"` |
| `idle` | Submit válido sin referencia | `submitting` | Congelado | +1 | Foco al heading de progreso; `Creando el fotograma base` |
| `idle` | Submit válido con referencia ya subida | `submitting` | Congelado | +1 | Igual |
| `idle` | Seleccionar imagen válida | `uploading` | Conservado | Sin cambio | `role="status"` `Subiendo imagen…` |
| `uploading` | `PUT` 200 | `idle` (referencia lista) | Conservado | Sin cambio | Foco a la tarjeta; `Imagen lista.` (sr-only) |
| `uploading` | `PUT` falla | `reference error` (`uploadState: 'error'`) | Conservado | Sin cambio | Foco a `Reintentar subida`; `role="alert"` |
| `uploading` | Eliminar referencia | `idle` | Conservado | Sin cambio | Foco al botón `Añadir imagen` |
| `submitting` | 202 job | `queued` | Conservado | Sin cambio | `role="status"` `En cola`; foco se mantiene en heading |
| `submitting` | 4xx/5xx/504 | `error` (phase `keyframe`) | Conservado | Sin cambio | Foco a `Reintentar`/`Editar idea`; `role="alert"` |
| `submitting` | `Cancelar` | `cancelled` | Conservado | Sin cambio | Abort; foco al textarea; `Generación cancelada.` |
| `queued` | Poll `IN_QUEUE` | `queued` | Conservado | Sin cambio | Anuncia posición solo si cambia |
| `queued` | Poll `IN_PROGRESS` | `running` | Conservado | Sin cambio | `Generando el vídeo` |
| `queued` | Poll `COMPLETED` | `ready` o `error` | Conservado | Sin cambio | Foco al heading de resultado; `Vídeo listo.`; si falla, alerta |
| `queued` | `Cancelar` | `cancelled` | Conservado | Sin cambio | API cancel; foco al textarea |
| `queued` | 409 `job-not-cancellable` | estado real del job | Conservado | Sin cambio | Refresca y anuncia |
| `running` | Poll `IN_PROGRESS` | `running` | Conservado | Sin cambio | Sin anuncio repetido |
| `running` | Poll `COMPLETED` | `ready` o `error` | Conservado | Sin cambio | Foco al resultado y `Vídeo listo.`, o alerta |
| `running` | `Cancelar` | `cancelled` | Conservado | Sin cambio | Igual |
| `running` | Poll 3 fallos de red | `error` (phase `poll`) | Conservado | Sin cambio | `Reintentar` reanuda polling |
| `ready` | `Regenerar` | `submitting` | Conservado | +1 | Foco al heading de progreso |
| `ready` | `Editar idea` | `idle` | Conservado | Sin cambio | Foco al textarea |
| `error` | `Reintentar` (retryable) | `submitting` | Conservado | +1 | Foco al heading de progreso |
| `reference error` (`uploadState: 'error'`) | `Reintentar subida` | `uploading` | Conservado | Sin cambio | Foco al estado de subida; `role="status"` |
| `error` | `Editar idea` | `idle` | Conservado | Sin cambio | Foco al textarea |
| `cancelled` | Editar | `idle` | Conservado | Sin cambio | Foco al textarea |
| `cancelled` | `Regenerar` | `submitting` | Conservado | +1 | Foco al heading de progreso |
| `idle`/`error`/`cancelled` | Cambiar prompt | mismo estado | Actualizado | Sin cambio | Error limpiado |
| `idle` | Cambiar preset | `idle` | Conservado | Sin cambio | Ajusta duración si no es válida |
| Cualquier estado | Desmontaje | Destruido | Descartado | — | Aborta fetch/polling, revoca `ObjectURL`, limpia timers |
| Cualquier estado | Recarga | `idle` inicial | Perdido | 0 | Sin restauración |

### Reglas de polling y backoff

- El polling empieza solo en cliente, tras 202.
- Intervalos: `pollAfterMs` del servidor, con mínimo 1000 y máximo 10000. Backoff si no hay `pollAfterMs`: 2, 2, 3, 5, 8, 10 s.
- No se solapan peticiones: si una sigue en curso, se ignora el tick.
- `document.hidden` pausa; `visibilitychange` a visible hace un poll inmediato.
- `offline` pausa; `online` reanuda.
- 3 fallos de red consecutivos → `error` phase `poll`; `Reintentar` reanuda el mismo job sin crear uno nuevo.
- 429 en polling → no es error terminal; se respeta `Retry-After` y se continúa el mismo job, mostrando `Esperando…` sin anunciar un error.
- 404/410 → `error` phase `poll` con `job-not-found`/`job-expired`.
- 5xx → se reintenta con backoff hasta 3 veces; luego `error` phase `poll`.
- El polling se aborta al desmontar, cancelar, editar o regenerar.
- No se usa `setInterval`; se usa `setTimeout` encadenado y cancelable.

### Reglas de cancelación, reintento y regeneración

- `Cancelar` en `submitting` aborta la petición HTTP; el servidor comprueba la desconexión antes de submitear el vídeo. Es best-effort.
- `Cancelar` en `queued`/`running` llama a la API; si falla, muestra `error` phase `poll` con `Reintentar`, sin perder el job.
- `Cancelar` en `ready` no existe.
- `Reintentar` solo está disponible para errores `retryable` o para el éxito parcial. Crea un job nuevo (nueva pipeline completa), nuevo `Idempotency-Key`, `attempt + 1`.
- `Regenerar` solo desde `ready` o éxito parcial. Crea un job nuevo con el mismo borrador y `attempt + 1`.
- `Editar idea` solo desde `ready`, `error`, `cancelled` o éxito parcial. Vuelve a `idle`; conserva prompt, preset, duración y referencia si su `fileUrl` sigue vigente; si no, limpia la referencia y pide volver a subirla.
- Antes de generar, si `reference.expiresAt <= now`, se limpia la referencia y se muestra `La subida ha caducado. Vuelve a seleccionar la imagen.`; no se llama a Fal con una URL caducada.
- Un job ya enviado no se cancela al desmontar; el token se pierde y el job puede consumir crédito. El copy lo advierte.
- No hay reintento automático de `generate` que pueda duplicar un cobro. El reintento manual usa una clave nueva.
- La cancelación es idempotente: si el job ya está cancelado, la API responde 200.

## Security & Operations

### Threat model

| Amenaza | Mitigación | Riesgo residual |
|---------|------------|-----------------|
| Fuga de la clave de Fal al cliente | `runtimeConfig.falKey` privado; solo `server/`; sin `NUXT_PUBLIC_*`; respuestas y logs sin clave; test de fuga en SSR/API. | Un error de build futuro podría introducirla; se añade guarda estática y revisión. |
| Abuso de coste | Rate limit por IP/sesión, concurrencia, presupuesto diario, prompt ≤ 280, una imagen ≤ 8 MiB, allowlist de modelos, idempotencia. | Atacante con muchas IPs; se recomienda WAF/edge en producción. Límites en memoria no distribuidos. |
| SSRF | Nunca se hace fetch de URLs del cliente; `FalHttpClient` solo acepta orígenes de Fal y URLs firmadas; `redirect: 'error'`; allowlist de hosts CDN. | Fal podría redirigir; se bloquea `redirect`. |
| Subida abusiva | Ticket solo para MIME/tamaño declarados; nombre generado por servidor; lifecycle 1 h; rate limit; sin binarios por Nitro. | El tamaño real del `PUT` no lo verifica Nitro; Fal aplica sus límites. Se acepta y se documenta. |
| Contenido bloqueado / NSFW | `enable_safety_checker: true` en FLUX; `safety_tolerance` en Kontext; mapeo de política a 422; sin bypass. | Falsos negativos del proveedor; se muestra error y se invita a editar. |
| Fuga de prompt o PII en logs | No se loggea prompt, nombre de archivo, URLs firmadas ni IP en claro; solo hash y metadatos. | Logs de proxy externos; se configura redacción. |
| Replay de token de job | Token firmado, expira en 60 min, solo permite consultar/cancelar, no contiene clave ni prompt. | Quien lo intercepte puede consultar/cancelar; no puede generar. |
| CSRF / abuso cross-origin | POST same-origin con comprobación de `Origin`, JSON obligatorio, sin CORS, rate limit. | Peticiones sin `Origin` (curl) se permiten; el rate limit protege. |
| DoS por memoria | Mapas de rate limit acotados (máx. 10 000 entradas), limpieza por TTL, bodies pequeños. | Múltiples instancias/instancias reiniciadas; se reinicia el estado. |

### Rate limit, presupuesto e idempotencia

Variables privadas (`runtimeConfig.composer.*`, override por `NUXT_COMPOSER_*`):

| Variable | Default | Uso |
|----------|---------|-----|
| `NUXT_FAL_KEY` | — (obligatoria) | Clave de Fal; `runtimeConfig.falKey`. |
| `NUXT_COMPOSER_JOB_SECRET` | — (obligatoria, ≥ 32 caracteres) | HMAC del token de job. |
| `NUXT_COMPOSER_GENERATE_LIMIT` | `3` | Generaciones por ventana y sesión. |
| `NUXT_COMPOSER_GENERATE_WINDOW_MS` | `600000` | Ventana de generación (10 min). |
| `NUXT_COMPOSER_UPLOAD_LIMIT` | `5` | Tickets de subida por ventana y sesión. |
| `NUXT_COMPOSER_UPLOAD_WINDOW_MS` | `600000` | Ventana de subida (10 min). |
| `NUXT_COMPOSER_MAX_ACTIVE_JOBS` | `1` | Jobs activos por sesión. |
| `NUXT_COMPOSER_MAX_GLOBAL_JOBS` | `3` | Jobs activos por instancia. |
| `NUXT_COMPOSER_DAILY_GENERATION_BUDGET` | `50` | Generaciones por instancia y día UTC. |
| `NUXT_COMPOSER_JOB_TTL_MS` | `3600000` | Expiración del token (60 min). |
| `NUXT_COMPOSER_KEYFRAME_TIMEOUT_MS` | `45000` | Timeout duro del keyframe. |
| `NUXT_COMPOSER_POLL_AFTER_MS` | `2000` | Intervalo inicial de polling. |
| `NUXT_COMPOSER_FAL_QUEUE_BASE_URL` | `https://queue.fal.run` | Solo tests; en producción, default. |
| `NUXT_COMPOSER_FAL_RUN_BASE_URL` | `https://fal.run` | Solo tests; en producción, default. |
| `NUXT_COMPOSER_FAL_STORAGE_BASE_URL` | `https://rest.fal.ai` | Solo tests; en producción, default. |

Reglas:

- Ventana fija por clave `sha256(ipHash + sessionId)`, con array de timestamps acotado.
- `Retry-After` = segundos hasta el final de la ventana o hasta el reinicio del presupuesto diario.
- El presupuesto diario se reinicia a las 00:00 UTC.
- La sesión `composer_sid` se genera con `crypto.randomBytes(16).toString('base64url')`, se firma? No es necesario; es opaca y HttpOnly. Si se quiere evitar falsificación, se puede firmar con el mismo secreto; el MVP acepta cookie aleatoria y rate limit por IP como respaldo.
- Idempotencia: `Map<sessionId + key, { bodyHash, response, expiresAt }>` con TTL 10 min y máximo 1 000 entradas.
- Jobs activos: `Map<sessionId, { jobId, startedAt }>`; se limpia al detectar terminal o tras `jobTtlMs`.
- Los mapas MUST limpiarse periódicamente y MUST NOT crecer sin límite.

### Lifecycle y expiración

| Recurso | TTL | Comportamiento |
|---------|-----|----------------|
| Ticket de subida | ≤ 3600 s | `expiresAt` visible; si caduca, se pide otro. |
| Imagen de referencia en Fal | 3600 s | Lifecycle solicitado en el `PUT`; no se guarda en AI Shorts. |
| Keyframe | Igual que el job (60 min) | Es el póster; puede caducar antes que el vídeo. |
| Token de job | 3600 s | Tras expirar, 410 `job-expired`. |
| Job en Fal | Según Fal | El token no se renueva; no hay persistencia. |
| Vídeo | Según Fal | `expiresAt` informado; el enlace es temporal. |
| Resultado en cliente | En memoria | Se pierde al recargar/desmontar. |
| Cookie `composer_sid` | 86400 s | Solo anti-abuso; no contiene datos personales. |
| Idempotencia | 600 s | Se puede reintentar con la misma clave dentro de la ventana. |

### Observabilidad

- Logs estructurados JSON a stdout/stderr, sin dependencias nuevas.
- Campos permitidos: `event` (`generate.start`, `generate.keyframe.ok`, `generate.video.submitted`, `job.poll`, `job.succeeded`, `job.failed`, `job.cancelled`, `upload.ticket`, `rate.limit`, `provider.error`), `requestId` interno, `falRequestId`, `modelId`, `preset`, `durationSeconds`, `attempt`, `stage`, `latencyMs`, `httpStatus`, `errorCode`, `retryable`, `queuePosition`, `promptHash`, `ipHash`.
- Campos prohibidos: prompt completo, `fileName`, `fileUrl`, `uploadUrl`, `statusUrl`, `responseUrl`, `cancelUrl`, `jobId` completo, `Idempotency-Key`, `NUXT_FAL_KEY`, `Authorization`, IP en claro, cookies.
- Errores de proveedor: se loggea el `errorCode` mapeado y el status; el body crudo solo en modo debug local, nunca en producción.
- Métricas mínimas manuales: generaciones iniciadas/terminadas/fallidas, tasa de 429, latencia de keyframe, latencia de vídeo, ratio de éxito parcial.
- No se añade Sentry ni APM en esta feature.

### Deployment checklist

1. Runtime Node.js 22 LTS y `npm ci`.
2. `NUXT_FAL_KEY` y `NUXT_COMPOSER_JOB_SECRET` configuradas como secretos del entorno; nunca en el repo ni en `.env` versionado.
3. `.env.example` con nombres y comentarios, sin valores reales.
4. `npm run build`; arrancar `.output/server/index.mjs` o el adapter Node equivalente.
5. Reverse proxy: body máximo ≥ 16 KiB; timeout de `/api/composer/generate` ≥ 90 s; timeout de `/api/composer/jobs/**` ≥ 30 s; sin buffering de respuesta necesario. Configurar `X-Forwarded-For`/`X-Forwarded-Proto` solo desde el proxy de confianza; no confiar en headers enviados por el cliente.
6. CDN/proxy: no cachear `/api/composer/**`; respetar `Cache-Control: no-store`.
7. PWA: verificar que el service worker no cachea `/api/**` ni hosts de Fal y que `navigateFallbackDenylist` incluye `/^\/api\//`.
8. TLS obligatorio; cookie `Secure` en producción.
9. Logs sin secretos; retención y acceso restringidos.
10. Presupuesto y rate limit revisados antes de abrir al público; empezar con límites bajos.
11. Monitorizar 429, 5xx, `ai-credits-exhausted`, `keyframe-timeout` y latencia media.
12. Rotar `NUXT_FAL_KEY` y `NUXT_COMPOSER_JOB_SECRET` con reinicio; los tokens antiguos dejan de validar si se rota el secreto (aceptable, no hay persistencia).
13. No desplegar esta feature en un hosting estático ni con límite de ejecución inferior a 60 s.
14. Ejecutar el smoke opt-in una vez por entorno con créditos reales y revisar el coste.

## Test Plan

La validación sigue la Constitución v1.1.0. Cada archivo runtime nuevo, excepto los modelos type-only, MUST tener cobertura directa o por integración. Los tests de la landing MUST permanecer sin cambios. Los tests de 003 específicos del mock se retiran o se reescriben.

### Tests unitarios de servidor

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/server/fal-http-client.spec.ts` | Construcción de `Authorization: Key`, timeout, `redirect: 'error'`, allowlist de orígenes, rechazo de URL fuera de allowlist, no log de key/URL, no retry de POST. |
| `tests/unit/server/fal-queue-service.spec.ts` | Submit parsea `request_id`/`status_url`/`response_url`/`cancel_url`; no reconstruye URLs; estados `IN_QUEUE`/`IN_PROGRESS`/`COMPLETED`; cancel `PUT`; errores 4xx/5xx. |
| `tests/unit/server/fal-storage-service.spec.ts` | Initiate con `content_type`/`file_name` y `X-Fal-Object-Lifecycle` 3600; ticket con `uploadHeaders` solo para el `PUT`; nombre generado; no nombre crudo; errores. |
| `tests/unit/server/model-registry.spec.ts` | Allowlist exacta; presets/duraciones/defaults; rechazo de endpoint desconocido; paridad con `app/data/composer.ts`; adaptadores correctos. |
| `tests/unit/server/prompt-composer.spec.ts` | Plantillas exactas de FLUX/Kontext/vídeo; prompt insertado; hash estable; no prompt en logs. |
| `tests/unit/server/job-token.spec.ts` | Firma/verificación; base64url; `timingSafeEqual`; tamper → error; expiración; payload sin prompt/clave; longitud > 4096 rechazada. |
| `tests/unit/server/rate-limit.spec.ts` | Ventana fija; 3/10 min; 5 tickets/10 min; concurrencia 1; global 3; presupuesto diario; `Retry-After`; limpieza de mapas; fallback sin cookie. |
| `tests/unit/server/request-context.spec.ts` | IP desde headers de proxy; cookie `composer_sid` creada/leída; hash de IP; `Origin` same-origin; rechazo cross-origin; sin PII en claro. |
| `tests/unit/server/validation.spec.ts` | Prompt, preset, duración, referencia, MIME, tamaño, nombre, campos desconocidos, body grande, `Content-Type`. |
| `tests/unit/server/errors.spec.ts` | Mapeo de HTTP/códigos/retryable/mensajes; no filtración de mensajes de Fal. |
| `tests/unit/server/adapters/flux-image-adapter.spec.ts` | Input exacto; `images[0].url`; `has_nsfw_concepts` → `content-blocked`; output inválido. |
| `tests/unit/server/adapters/flux-kontext-adapter.spec.ts` | `image_url`, `prompt`, `aspect_ratio: "9:16"`, `output_format`, `safety_tolerance`; output. |
| `tests/unit/server/adapters/minimax-video-adapter.spec.ts` | Duración `6`/`10`; `resolution: "768P"`; `prompt_optimizer: false`; `video.url`; output inválido. |
| `tests/unit/server/adapters/kling-video-adapter.spec.ts` | Duración `5`/`10`; `negative_prompt`; `cfg_scale`; `video.url`; output inválido. |
| `tests/unit/server/generation-orchestrator.spec.ts` | Keyframe → submit; keyframe falla → no submit; timeout → 504; cancelación antes de submit; token correcto. |
| `tests/unit/server/composer-generation-service.spec.ts` | Crear job, getJob, cancelJob; idempotencia; job activo; rate limit; mapeo de estados; errores. |

### Tests de rutas y contrato

| Test | Cobertura mínima |
|------|------------------|
| `tests/acceptance/composer-api-uploads.spec.ts` | 200 con ticket; validaciones 400/413/415; rate limit 429 con `Retry-After`; cookie de sesión; no key en respuesta; no binario por Nitro. |
| `tests/acceptance/composer-api-generate.spec.ts` | 202 con job; FLUX dev vs Kontext; keyframe timeout; rate limit/concurrencia/presupuesto; idempotencia; errores de proveedor; no key/URLs firmadas en respuesta. |
| `tests/acceptance/composer-api-jobs.spec.ts` | Estados `queued`/`running`/`succeeded`/`failed`/`cancelled`; `queuePosition`; output MiniMax/Kling; token tamper 404; expirado 410; cancel 200/409/502; no key. |
| `tests/acceptance/composer-route.spec.ts` | SSR idle: nuevo copy, preset/duración default, una imagen, `Generar vídeo`, `noscript`; sin `<video>`, sin job, sin URLs de Fal, sin `NUXT_FAL_KEY`; un `h1`; `header`/`main`; `radiogroup`; no polling SSR. |
| `tests/acceptance/feed-route.spec.ts` | Regresión de feed; solo cambia la meta description a `...estudio de creación con IA.`; resto intacto. |
| `tests/acceptance/landing-route.spec.ts` | Sin cambios. |

**Fixtures**: `tests/fixtures/fal/queue-submit.json`, `queue-status-in-queue.json`, `queue-status-in-progress.json`, `queue-status-completed.json`, `flux-dev-result.json`, `flux-kontext-result.json`, `minimax-result.json`, `kling-result.json`, `fal-policy-error.json`, `fal-credit-error.json`, `storage-initiate.json`. Sin claves ni URLs reales; hosts de ejemplo permitidos por la allowlist de test.

### Tests de componentes y composables

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/composer-page.spec.ts` | Estado inicial; defaults; submit; flujo con API fake hasta resultado; `<video>`; foco; cancelar; editar; regenerar; offline; sin publicación/descarga/share. |
| `tests/unit/composer-page-error.spec.ts` | Error de keyframe, vídeo, rate limit, contenido y expiración; foco y acciones; reintento con API fake. |
| `tests/unit/composer-header.spec.ts` | Marca, badge `BETA`, explicación accesible, enlace `Volver al feed` con `href="/feed"`, sin `DEMO` ni acciones de generación. |
| `tests/unit/composer-stepper.spec.ts` | 3 pasos en orden (`Idea`, `Generación`, `Resultado`), `aria-current="step"` solo en el actual, estados completo/actual/pendiente, sin interactividad. |
| `tests/unit/composer-prompt-form.spec.ts` | Label, placeholder, `maxlength`, contador, ayuda, error `role="alert"`, slots `preset`/`reference`/`settings`, submit, `focusPrompt()`, sin configuración libre. |
| `tests/unit/composer-preset-picker.spec.ts` | `radiogroup` etiquetado; defaults; cambio de preset; ajuste de duración; emisiones; teclado. |
| `tests/unit/composer-reference-picker.spec.ts` | Input `accept` exacto, sin `multiple`; una sola imagen; validación; ticket; `PUT` con headers; estados de subida; reintento; eliminar; ObjectURL. |
| `tests/unit/composer-reference-card.spec.ts` | Miniatura, nombre, tamaño, `Eliminar {nombre}`, 44 px; sin `<video>`; nombre largo. |
| `tests/unit/composer-generation-progress.spec.ts` | 4 etapas; etapa actual; barra indeterminada; tiempo; posición; aviso de lentitud; cancelar; `aria-live`; reduced motion. |
| `tests/unit/composer-result.spec.ts` | Badge `IA`; `<video controls playsinline poster>`; sin autoplay/loop; metadatos; nota; regenerar/editar; fallback de vídeo; sin descarga/share/publicar. |
| `tests/unit/composer-partial.spec.ts` | Keyframe como imagen; mensaje; reintentar/editar; sin `<video>` roto. |
| `tests/unit/use-composer.spec.ts` | Máquina completa con API fake; polling/backoff; cancelación; timeout; reintento; regeneración; edición; desmontaje; idempotencia; sin persistencia. |
| `tests/unit/use-composer-references.spec.ts` | Validación; ticket; `PUT`; una sola referencia; reemplazo; abort; `ObjectURL`; `File` descartado; errores. |
| `tests/unit/use-composer-api.spec.ts` | `$fetch` a rutas exactas; `PUT` directo; headers; `Idempotency-Key`; parseo de errores; no key. |
| `tests/unit/composer-utils.spec.ts` | Prompt, duración, formato de tamaño, referencia, etiquetas de etapa, `formatDuration`; sin hash FNV, pósters ni allowlist de hosts de Fal. |
| `tests/unit/composer-data.spec.ts` | Presets, modelos, duraciones, defaults, capacidades; paridad con servidor; sin pósters mock. |
| `tests/unit/composer-guards.spec.ts` | Modelos sin `File`/`Blob`/`any`; sin barrel; `app/**` sin `NUXT_FAL_KEY`/`falKey`/`Authorization: Key`/`server/`; `server/**` sin `any`; no `v-html`; no persistencia de borrador; no imports feed; no `XMLHttpRequest`; `Date.now()` solo en elapsed/expiración/backoff de cliente; `crypto.randomUUID()` solo en `useComposerApi.ts`; `Math.random` prohibido. |
| `tests/unit/app-button.spec.ts` | Sin cambios. |
| `tests/unit/feed-header.spec.ts`, `tests/unit/feed-page.spec.ts` | Regresión; solo actualiza la meta description si se inspecciona. |

### Tests retirados o reescritos de 003

| Test de 003 | Acción |
|-------------|--------|
| `composer-page.spec.ts` (timers 2400 ms) | **Reescrito** con API fake y estados reales. |
| `composer-page-error.spec.ts` (generador que lanza) | **Reescrito** con errores de API. |
| `use-composer.spec.ts` (timeline 15/50/80, determinismo) | **Reescrito** para máquina real. |
| `use-composer-references.spec.ts` (3 archivos, sin subida) | **Reescrito** para 1 imagen con ticket. |
| `composer-preview.spec.ts` | **Retirado**; sustituido por `composer-result.spec.ts` y `composer-partial.spec.ts`. |
| `composer-generation-progress.spec.ts` (porcentajes) | **Reescrito** para etapas sin porcentaje. |
| `composer-data.spec.ts` (4 pósters/títulos/timeline) | **Reescrito** para presets/capacidades. |
| `composer-utils.spec.ts` (FNV-1a, pósters) | **Reescrito**; se elimina el algoritmo determinista. |
| `composer-stepper.spec.ts` | **Amended**: paso 3 pasa a `Resultado`; resto igual. |
| `composer-prompt-form.spec.ts` | **Amended**: botón `Generar vídeo`; añade preset/ajustes. |
| `composer-header.spec.ts` | **Amended**: badge `BETA` y nueva explicación. |
| `composer-route.spec.ts` | **Reescrito** para el nuevo SSR y copy. |
| `feed-route.spec.ts` | **Amended**: solo meta description. |
| `composer-guards.spec.ts` | **Reescrito**: se permiten `$fetch`/`fetch` en `useComposerApi.ts` y se prohíben secretos/imports de servidor. |

### Tests de aceptación y smoke

- Los tests de aceptación usan `@nuxt/test-utils/e2e`, `setup({ server: true })` y `// @vitest-environment node`.
- Fal se sustituye por un servidor HTTP local de stub en `beforeAll`, configurado mediante `NUXT_COMPOSER_FAL_*_BASE_URL`; los tests MUST NOT salir a internet.
- El stub verifica método, path, `Authorization: Key test-key` y body; devuelve fixtures.
- El test de SSR se ejecuta con `NUXT_FAL_KEY=test-secret` y comprueba que `test-secret` no aparece en el HTML ni en ninguna respuesta.
- El smoke real `tests/smoke/composer-real.spec.ts` se salta salvo `RUN_FAL_SMOKE=1` y `NUXT_FAL_KEY`; genera un `fast` de 6 s, espera hasta 10 min, comprueba `video.url` con `HEAD` y que no se expone la clave. No se ejecuta en CI.

### Comprobaciones manuales obligatorias

1. Flujo prompt-only desde `/feed`: CTA → prompt → `Generar vídeo`; 2 clics; keyframe, cola, vídeo y `<video>` reproducible.
2. Flujo con 1 imagen: CTA → `Añadir imagen`/selección → `Generar vídeo`; 3 clics; `PUT` directo visible en Network sin `Authorization`.
3. `Rápido` vs `Calidad`: modelos, duraciones, defaults y cambio de duración al cambiar preset.
4. Cancelar en `queued` y en `running`; comprobar llamada a cancel y conservación del borrador.
5. Timeout de keyframe: no se envía vídeo; mensaje exacto.
6. Fallo de vídeo: éxito parcial con keyframe y `Reintentar`.
7. Rate limit: 429 con `Retry-After`; presupuesto diario; concurrencia.
8. Contenido bloqueado: 422 y `Editar idea`.
9. Credenciales inválidas: 503 sin filtrar la clave.
10. Anchos 320, 360, 390, 768, 1024, 1440 y 1920 px; zoom 200 %/400 %; safe areas.
11. Teclado: preset con flechas, select, subida, cancelar, reintentar, regenerar, editar, controles de vídeo.
12. VoiceOver/TalkBack: landmarks, `h1`, labels, `radiogroup`, `role="status"`, `role="alert"`, `<video>`.
13. `prefers-reduced-motion: reduce`: barra estática, sin transiciones no esenciales.
14. Forced-colors: preset, select, progreso, tarjetas, errores y vídeo.
15. PWA/offline: service worker no cachea `/api/**` ni Fal; sin conexión se deshabilita generar; al volver online se reanuda.
16. Feed y landing: sin regresiones; meta description del feed actualizada.
17. Logs del servidor: sin prompt, clave, URLs firmadas, token ni IP en claro.
18. Build de producción: `npm run build`, arranque Node, `NUXT_FAL_KEY` no presente en `.output/public`.

## Assumptions

- Existe una cuenta de Fal.ai con créditos y una clave con permisos para Queue, Storage y los modelos indicados.
- Los endpoints y esquemas de Fal indicados son estables para el MVP. El lifecycle en el `initiate` se verificó contra el SDK oficial; los campos no verificados (`safety_tolerance`, `cfg_scale`, CORS del `PUT` y método exacto de cancelación) se confirman en el spike de fase 1, y los defaults elegidos son ajustables sin cambiar el contrato de la API.
- Fal Storage permite `PUT` directo desde el navegador con CORS para el origen de la app. Si no lo permite, la fase 1 se detiene y se reabre la decisión de producto; no se implementa un proxy de binarios en Nitro sin una nueva spec.
- El hosting de producción puede mantener una petición HTTP durante al menos 90 s. Un hosting con límite de 10 s no es válido para el keyframe síncrono.
- Los modelos Kling/MiniMax I2V heredan el aspect ratio del `image_url`; por eso el keyframe es 9:16 y se genera antes del vídeo.
- Kling/MiniMax I2V aceptan una sola imagen (primer fotograma). FLUX dev no acepta imagen; Kontext acepta una. La multi-referencia requeriría otro modelo o composición previa y queda fuera de 004.
- Los modelos de vídeo pueden tardar entre 1 y 5 minutos en condiciones normales; la UI no promete un tiempo exacto ni un porcentaje.
- El vídeo generado puede no tener audio; el audio está fuera de alcance y la UI no lo promete.
- Los navegadores soportan `fetch`, `AbortController`, `crypto.randomUUID`, `URL.createObjectURL` y `<video>` (últimas dos versiones de Chrome, Edge, Firefox y Safari).
- No hay autenticación de usuarios; el rate limit es anti-abuso y no identifica personas.
- Los límites en memoria no son distribuidos y se reinician con la instancia. Para producción multi-instancia se recomienda un rate limit de borde, fuera de 004.
- El prompt y la imagen se envían a Fal; AI Shorts no los persiste. La retención de Fal se rige por su política y por el lifecycle de 1 hora aplicado a la referencia.
- La PWA puede servir el shell de `/composer`, pero no debe cachear APIs ni medios de Fal. El offline se detecta en cliente.
- `@vite-pwa/nuxt` 1.1.x acepta la configuración de Workbox indicada; se verifica en fase 4.
- No se añaden dependencias npm; `node:crypto` y `fetch` nativo son suficientes.
- Los tests de landing no se tocan. Los tests de feed solo actualizan la meta description.

## Out of Scope

- Audio, voz, música, doblaje o sincronización labial.
- 2–3 imágenes de referencia, referencias de vídeo, composición multi-referencia o Nano Banana Pro Edit.
- Publicación en el feed, creación de `Short`, historial de proyectos, persistencia, descarga y compartición.
- Modo solo imagen.
- Autenticación, cuentas, perfiles, pagos, suscripciones o facturación.
- Elección libre de modelo, endpoint, aspect ratio, resolución, semilla, cámara, estilo o prompt negativo.
- Edición, recorte, unión, subtítulos, miniaturas personalizadas o postprocesado.
- Reanudación de jobs tras recargar, cerrar la pestaña o cambiar de dispositivo.
- Rate limit distribuido, Redis, base de datos, colas propias o workers propios.
- Proxy de binarios en Nitro o subida multipart al servidor.
- Webhooks de Fal, callbacks o notificaciones push.
- Analítica, tracking, A/B testing, píxeles o telemetría de terceros.
- i18n, selector de idioma o copy en otros idiomas.
- Storybook, Playwright, tests E2E de navegador o nuevas dependencias.
- Migración a Tailwind v4, cambios en `tailwind.config.ts`, nuevos tokens o rediseño del feed/landing.
- Eliminación o modificación de `app/components/ui/ModalDialog.vue` (puede quedar sin uso).
- Promover el feed a `/` o sustituir la landing.
- Publicación del vídeo en cualquier destino.

## Open Questions

Solo preguntas no bloqueantes; las decisiones de producto ya están cerradas.

1. **Valores exactos de parámetros del proveedor**: `safety_tolerance` de Kontext (`"2"` inicial) y rango de `cfg_scale` de Kling (`0.5` inicial) se confirman en el spike de fase 1. No bloquean el contrato; se ajustan en el adaptador.
2. **Dimensiones del vídeo de salida**: no está confirmado que MiniMax/Kling devuelvan `width`/`height`. El contrato los admite `null` y la UI usa 9:16; si el proveedor los devuelve, se rellenan.
3. **Coste y latencia reales**: `ComposerModelCapabilities.estimatedCostUsd` queda `null` hasta verificar precios; `estimatedLatencySeconds` es orientativo y no se muestra como promesa. No bloquea la UI.
4. **Posición en cola**: `queue_position` es opcional. Si Fal no la devuelve, la UI muestra solo `En cola`; el contrato ya admite `null`.
5. **Payload exacto de errores de política/créditos**: el mapeo es defensivo por HTTP status y campos conocidos; se ajusta con fixtures reales sin cambiar los códigos estables.

Las verificaciones de infraestructura (CORS del `PUT`, lifecycle real en Fal y método exacto de cancelación) son **gates de fase 1** y están en Assumptions, no preguntas de producto. El contrato las abstrae: el cliente envía `uploadHeaders` y el servidor aplica el lifecycle en el `initiate` y usa `cancel_url`.

## Implementation Phases

### Fase 1 — Fundamentos, subida y keyframe

**Objetivo**: dejar la base server-side y la subida firmada funcionando, con keyframe real y job token.

- `nuxt.config.ts`: `runtimeConfig.falKey`, `runtimeConfig.composer.*`, PWA `navigateFallbackDenylist` y `NetworkOnly` para `/api/**`.
- `.env.example` con variables privadas y comentarios; sin valores.
- `app/models/composer.ts`: contrato de 004; retirar tipos mock.
- `app/data/composer.ts`: presets, modelos, duraciones, defaults; retirar pósters/títulos/timeline.
- `server/composer/`: `errors`, `validation`, `job-token`, `request-context`, `rate-limit`, `fal-http-client`, `fal-storage-service`, `fal-queue-service`, `model-registry`, `prompt-composer`.
- `server/api/composer/uploads.post.ts`.
- Adaptadores FLUX dev y Kontext; `generate.post.ts` con keyframe y submit de vídeo (sin polling UI todavía).
- UI de referencia: picker, ticket, `PUT`, estados de subida y errores.
- Tests: storage, token, validation, rate limit, HTTP client, uploads, FLUX/Kontext, guards iniciales.
- **Gate**: verificar CORS del `PUT` y lifecycle en Fal real (spike con una imagen de prueba). El lifecycle se envía en el `initiate`; si falla CORS, detener y reabrir decisión.

**Exit criteria**: subida real de una imagen a Fal CDN; keyframe 9:16 generado con FLUX dev y Kontext; `generate` devuelve 202 con token válido; no hay clave en cliente; tests de fase en verde.

### Fase 2 — Camino rápido MiniMax de extremo a extremo

**Objetivo**: prompt-only → vídeo real con `Rápido`/6 s.

- Adaptador MiniMax.
- `GET /jobs/[id]` y `POST /jobs/[id]/cancel`.
- Polling, etapas reales, cancelación, timeout, errores, éxito parcial.
- UI de progreso y resultado con `<video>`.
- Rate limit de generación, concurrencia, presupuesto, idempotencia.
- Tests: queue service, MiniMax, jobs, generate, page flow, progress, result.
- **Exit criteria**: flujo de 2 clics con vídeo reproducible; cancelación y timeout verificados; 429 con `Retry-After`; sin doble cobro en doble submit.

### Fase 3 — Calidad, presets y ajustes

**Objetivo**: `Calidad`/Kling y control opcional de duración.

- Adaptador Kling.
- UI de preset y `Ajustes` con duración; defaults y cambios válidos.
- Regenerar, editar, reintentar, éxito parcial y errores de contenido/proveedor.
- Tests: Kling, preset picker, data parity, page error, partial.
- **Exit criteria**: ambos presets generan; duraciones válidas; el camino por defecto sigue en 2/3 clics; cambio de preset no rompe el formulario.

### Fase 4 — Pulido, seguridad, PWA y despliegue

**Objetivo**: cerrar calidad y operación.

- PWA/offline: `NetworkOnly`, denylist, avisos, pausa/reanudación.
- Accesibilidad completa: foco, `aria-live`, reduced motion, forced colors, 44 px, responsive.
- Guardas estáticas de secretos, imports, `any`, `File` y persistencia.
- Observabilidad: logs estructurados y redacción.
- Retirar assets/tests mock de 003; actualizar README/`.env.example`; checklist de despliegue.
- Smoke opt-in y pruebas manuales.
- **Exit criteria**: `npm run test:run` y `npm run build` en verde; SSR sin secretos; feed/landing sin regresiones; PWA sin cache de API; smoke real opt-in documentado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Ruta y SSR)**: `/composer` responde HTTP 200, declara `lang="es"`, un único `h1`, `header`/`main`, formulario etiquetado, preset/duración default y `noscript`; no contiene `<video>`, job, token, URLs de Fal ni secretos en el estado inicial.
- **SC-002 (Presupuesto de clics)**: Desde `/feed`, prompt-only llega a vídeo en exactamente 2 clics; con una imagen, en exactamente 3. Preset y duración son opcionales y no añaden pasos obligatorios.
- **SC-003 (Generación real)**: Un prompt válido produce un keyframe 9:16 y un vídeo `MiniMax Hailuo 02` (fast) o `Kling 2.5 Turbo Pro` (quality) reproducible con `<video controls playsinline poster>`, sin autoplay.
- **SC-004 (Subida segura)**: La imagen se sube con ticket firmado y `PUT` directo; la clave de Fal no aparece en cliente, HTML, respuestas, logs ni token; el ticket y la referencia caducan en ≤ 1 hora.
- **SC-005 (Progreso honesto)**: La UI muestra solo etapas reales y tiempo transcurrido; no hay porcentajes ni ETA inventados; la posición en cola se muestra solo si el proveedor la devuelve.
- **SC-006 (Recuperación)**: Cancelar, timeout, reintento, regeneración, edición y éxito parcial funcionan según la máquina de estados; el borrador se conserva; los timers, fetch y `ObjectURL` se limpian al desmontar.
- **SC-007 (Errores)**: Rate limit, contenido bloqueado, credenciales, créditos, proveedor y expiración devuelven los códigos HTTP y mensajes exactos; ninguna respuesta filtra clave, prompt, URLs firmadas ni detalles internos.
- **SC-008 (Sin doble cobro)**: Doble submit, reintento de red y peticiones concurrentes no crean dos jobs ni dos cobros; `Idempotency-Key` y job activo lo impiden.
- **SC-009 (Regresión)**: `/feed` mantiene seis shorts, orden, pósters, scroll-snap, like/save/share y CTA; la landing no cambia; solo la meta description del feed se actualiza.
- **SC-010 (Accesibilidad)**: Lighthouse Accessibility ≥ 95 y cero violaciones axe críticas o serias; un `h1`, labels, `radiogroup`, `role="status"`/`role="alert"`, foco gestionado, 44 px, contraste AA, reduced motion y forced colors correctos.
- **SC-011 (Responsive)**: Cero scroll horizontal y cero recortes en 320, 360, 390, 768, 1024, 1440 y 1920 px, zoom 200 %/400 % y safe areas.
- **SC-012 (PWA/offline)**: El service worker no cachea `/api/**` ni hosts de Fal; sin conexión se deshabilita generar y se avisa; al volver online se reanuda el polling.
- **SC-013 (Calidad)**: `npm run test:run` y `npm run build` terminan correctamente; todos los archivos runtime nuevos tienen cobertura; feed/landing en verde; smoke real opt-in documentado.
- **SC-014 (Resultado terminal)**: El resultado no ofrece publicar, descargar, compartir ni enviar al feed; no crea un `Short`; al recargar o navegar desaparece.

## Constitution Check

Confirmación explícita contra `.specify/memory/constitution.md` v1.1.0:

- **I. Simplicity First (1-to-3-Clicks UX)**: el camino mínimo es 2 clics sin referencia y 3 con una imagen. Preset y duración tienen defaults y son opcionales; no hay asistente, pasos `Siguiente` ni configuración obligatoria. Cancelar, reintentar, regenerar y editar son recuperación opcional.
- **II. Spec-Driven Development**: esta es la Phase 1. No se escribe implementación, `plan.md` ni `tasks.md` hasta la revisión humana y la fase correspondiente. El entregable es solo esta spec.
- **III. Server-Side Security for AI & Secrets**: toda la integración con Fal vive en `server/api/` y `server/composer/`; la clave se declara en `runtimeConfig.falKey` y nunca sale al cliente. La subida usa un ticket firmado emitido por el servidor: el navegador solo hace un `PUT` scoped a una URL pre-firmada, sin `Authorization`, sin cookies de Fal y sin conocer la clave. Esta excepción está aprobada en la decisión de producto y mantiene el principio: las credenciales y la autorización se quedan en servidor; el cliente solo ejecuta el transporte del binario para evitar que Nitro proxee medios.
- **IV. Modular Component Architecture & Reusability**: página en `app/pages/`, dominio en `app/components/composer/`, primitiva en `app/components/ui/AppButton.vue`, lógica en `app/composables/`, modelos en `app/models/composer.ts`, constantes en `app/data/composer.ts`, helpers puros en `app/utils/composer.ts` y servidor modular en `server/composer/` con adaptadores e inyección de dependencias. Los tipos de un solo componente quedan inline.
- **V. Test-First & Quality Gates**: se especifican tests unitarios por archivo runtime nuevo, tests de rutas con Fal stubbeado, componentes con cliente fake, aceptación SSR/API, regresión de feed/landing, guardas de secretos y smoke real opt-in.
- **Tailwind 3.4.x**: se usa exclusivamente sintaxis v3 y los tokens existentes; no se modifica `tailwind.config.ts` ni se usa Tailwind v4.
- **Nuxt 4**: ruta por archivos, `useHead`/`useSeoMeta`, auto-imports estándar, `server/api/` y `runtimeConfig`; sin plugins ni capas adicionales.
- **Sin cambios colaterales**: `/`, la landing, `specs/001-brand-construction-landing/`, `app/app.vue`, `tailwind.config.ts`, `vitest.config.ts` y `package.json` no se modifican. El feed solo cambia su meta description. No se añaden dependencias npm.
