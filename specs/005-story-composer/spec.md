# Feature Specification: Story Composer — micro-relatos de 4–6 escenas

**Feature Branch**: `005-story-composer`

**Created**: 2026-10-21

**Status**: Implemented (automated suite and build green; real-provider smoke is opt-in)

> **Estado de implementación (2026-10-21):** implementada en `app/`, `server/story/`, `server/api/story/`, `prisma/` y `server/plugins/story-reconciler.ts`. La migración inicial está aplicada. La suite automatizada tiene 1505 tests en verde y 7 skips opt-in; los 613 tests de 004 siguen intactos. El smoke real de DeepSeek/Fal y el smoke E2E son opt-in y no se ejecutan en CI. Pendientes: QA manual de navegador, validación real de DeepSeek Vision, precios, CORS/lifecycle de Fal, Supabase pooler y multi-instancia.
>
> **Enmienda A (2026-10-21):** existe una enmienda aditiva vigente, «Enmienda A — Pre-análisis determinista de premisa», que añade un brief de producción determinista antes del director DeepSeek con **cero llamadas extra**, sin cambios de API, persistencia, UI ni coste. Es la única modificación vigente de esta spec; el resto de cláusulas históricas se leen a través de su tabla de enmienda. Ver la sección inmediatamente anterior a «Constitution Check».

**Input**: User description: "Añadir un Story Composer que convierta una premisa en un micro-relato vertical de 4–6 escenas de 6 segundos. DeepSeek escribe el guion y la narración; FLUX o FLUX Kontext generan un keyframe 9:16 por escena; el usuario revisa y regenera imágenes; al aprobar, MiniMax o Kling generan un vídeo de 6 segundos por escena; FFmpeg une las escenas con cortes secos; el MP4 final se sube al CDN de Fal. La historia persiste en PostgreSQL/Prisma ligada a una cookie `story_sid`, se recupera al recargar y tiene un presupuesto máximo de 8 dólares. El Composer de 004 y sus 613 tests no se tocan."

## Contexto y relación con 004

Esta especificación es **aditiva**. Crea un dominio nuevo (`Story`) con rutas, servicios, modelos y UI propios. No modifica contratos, comportamiento, copy ni tests del Composer de 004.

### Qué se reutiliza de 004

| Pieza | Uso en 005 |
|-------|------------|
| `server/fal/http-client.ts` | Cliente HTTP único a Fal, con ampliación aditiva para subir binarios generados. |
| `server/fal/queue-service.ts` | Submit, estado, resultado y cancelación por `statusUrl`/`responseUrl`/`cancelUrl`. |
| `server/fal/storage-service.ts` | Ticket de subida de la referencia; se parametriza el prefijo y el lifecycle sin cambiar el comportamiento de 004. |
| `server/fal/adapters/flux-image-adapter.ts`, `flux-kontext-adapter.ts` | Keyframes por escena. |
| `server/fal/adapters/minimax-video-adapter.ts`, `kling-video-adapter.ts` | Vídeos por escena. |
| `server/fal/types.ts` | Allowlist de endpoints y hosts de CDN. |
| `server/shared/errors.ts` | `ComposerError` sigue siendo el error del transporte Fal; Story lo traduce en su frontera. |
| `server/shared/rate-limit.ts` | Patrón de ventanas, presupuesto y mapas acotados; Story usa su propio limitador con sus límites. |
| `server/shared/request-context.ts` | `resolveClientIp`, `hashIp`, cabeceras de respuesta y comprobación same-origin. |
| `server/shared/json.ts`, `prompt.ts`, `hmac.ts` | Parseo JSON, normalización de texto y primitivas HMAC (si se firma algo). |
| Patrón de job asíncrono, polling, cancelación best-effort y éxito parcial | Se adapta a una máquina de estados por historia y por escena. |
| Patrón keyframe-first 9:16 | Cada escena genera su keyframe antes de su vídeo. |
| Patrón de subida firmada | Solo para la referencia 0–1; el MP4 final lo sube el servidor con autorización propia. |
| Patrón de allowlist, lifecycle, idempotencia y errores estables | Se aplica con la taxonomía `StoryErrorCode`. |

### No hay enmienda a 004

| Cláusula de 004 | Efecto de 005 |
|-----------------|---------------|
| `/composer`, `app/models/composer.ts`, `app/components/composer/**`, `app/composables/useComposer*`, `server/composer/**`, `server/api/composer/**` | **Intactos**. 005 no importa los shims de `server/composer/`; importa `server/fal/` y `server/shared/`. |
| FR-005 de 004: resultado terminal sin persistencia | **Se mantiene para el Composer**. Story es otro dominio y sí persiste por diseño. |
| Out of Scope de 004: sin base de datos, sin reanudación, sin audio | **Se mantiene para el Composer**. Story añade PostgreSQL, reanudación por cookie y un MP4 sin audio. No cambia el comportamiento de 004. |
| "No se crean `server/middleware` ni `server/plugins`" | **Acotado a la implementación de 004**. 005 añade un único `server/plugins/story-reconciler.ts`; no hay middleware ni proxy genérico. |
| Contratos de error, cabeceras, cookie `composer_sid` y tokens de job | **Sin cambios**. Story usa `story_sid` y su propia taxonomía; no comparte tokens de job. |

### Qué queda fuera de 005

- Audio, voz en off, música, subtítulos y texto quemado en el vídeo.
- Transiciones distintas del corte seco.
- Multi-referencia (2–3 imágenes), referencia de vídeo y composición multi-referencia.
- Publicación en el feed, creación de `Short`, descarga y compartición.
- Autenticación, cuentas, pagos y facturación.
- Elección libre de modelo, endpoint, duración, resolución, semilla o aspect ratio.
- Edición fina del montaje, recorte manual, reordenación de escenas y miniaturas personalizadas.
- Worker durable externo, Redis, colas propias, webhooks de Fal y rate limit distribuido.
- Multi-región, alta disponibilidad perfecta y ensamblaje distribuido.
- i18n y copy en otros idiomas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear una historia de 5 escenas desde una premisa (Priority: P1)

Una persona entra en `/story`, escribe una premisa, deja los valores por defecto (`5 escenas`, `Rápido`) y pulsa `Crear historia`. DeepSeek escribe un título, un logline y exactamente 5 beats con `visualPrompt` y `narration`. La historia se guarda y el servidor empieza a generar los keyframes. La persona ve progreso real y, cuando todas las imágenes están listas, la pantalla de revisión.

**Why priority**: Es el núcleo del producto. Sin planificación y persistencia no existe micro-relato ni recuperación.

**Independent Test**: Desde `/story`, escribir una premisa de 120 caracteres, comprobar `5 escenas` y `Rápido` seleccionados, pulsar `Crear historia`, verificar la redirección a `/story/{id}`, que existen 5 escenas en `story-plan` y que la respuesta de `GET /api/story/{id}` devuelve `sceneCount: 5`, `durationSeconds: 6` y 5 escenas con `order` 1–5.

**Acceptance Scenarios**:

1. **Given** la persona está en `/story` en estado inicial, **When** el formulario se renderiza, **Then** la premisa está vacía, `5 escenas` y `Rápido` están seleccionados, no hay referencia y `Crear historia` está deshabilitado hasta que la premisa sea válida.
2. **Given** una premisa válida y los defaults, **When** se pulsa `Crear historia`, **Then** se muestra `Escribiendo el guion`, se envía `POST /api/story` con `{premise, sceneCount: 5, preset: "fast", referenceUrl: null, referenceExpiresAt: null}` y no se envía ningún modelo, endpoint, duración ni beat.
3. **Given** DeepSeek devuelve un plan válido, **When** el servidor responde 201, **Then** la persona navega a `/story/{id}` y ve `Preparando las imágenes` con 5 escenas en estado `PENDING` o posterior.
4. **Given** el plan contiene 4 beats cuando se pidieron 5, **When** el servidor valida, **Then** reintenta una vez y, si vuelve a fallar, responde 502 `director-invalid-output` sin crear la historia.
5. **Given** el plan es válido, **When** se persiste, **Then** `Story.planJson` contiene el plan completo, cada `Scene` tiene `order`, `visualPrompt` y `narration` del beat correspondiente, y `Story.status` es `GENERATING_KEYFRAMES`.

---

### User Story 2 - Revisar keyframes, editar una escena y regenerar solo esa imagen (Priority: P1)

Cuando todas las imágenes están listas, la persona ve 4–6 tarjetas con su keyframe, la narración y el prompt visual. Puede editar el prompt de una escena y pulsar `Guardar y regenerar`; solo esa imagen se vuelve a generar, la aprobación anterior queda invalidada y el resto de la historia no se toca. Solo hay un intento extra por escena.

**Why priority**: La revisión es la única pausa humana del flujo y la principal palanca de calidad. Sin regeneración individual, un mal keyframe obliga a repetir toda la historia.

**Independent Test**: Con una historia en `WAITING_APPROVAL`, abrir la tarjeta de la escena 2, cambiar el prompt y pulsar `Guardar y regenerar`; comprobar `POST /api/story/{id}/beats/{sceneId}/keyframe`, que solo cambia `Scene.order = 2`, que `Story.status` pasa a `GENERATING_KEYFRAMES`, que `approvedAt` queda `null` y que al terminar vuelve a `WAITING_APPROVAL` con la nueva URL.

**Acceptance Scenarios**:

1. **Given** la historia está en `WAITING_APPROVAL`, **When** se muestra la revisión, **Then** hay exactamente `sceneCount` tarjetas ordenadas, cada una con `keyframeUrl`, `narration`, `visualPrompt`, `Imagen 1 de 2` y el botón `Guardar y regenerar`.
2. **Given** una tarjeta editable, **When** la persona cambia el prompt y pulsa `Guardar y regenerar`, **Then** se valida el prompt (20–600 caracteres, sin HTML ni Markdown), se envía a la API y la tarjeta muestra `Regenerando imagen…` sin borrar la imagen anterior.
3. **Given** la regeneración termina bien, **When** el polling recibe `KEYFRAME_READY`, **Then** la tarjeta muestra la nueva imagen y `Imagen 2 de 2`; el resto de escenas conserva su `keyframeUrl`.
4. **Given** la escena ya usó sus 2 intentos, **When** la persona intenta regenerar de nuevo, **Then** el botón está deshabilitado y la API devuelve 409 `keyframe-limit-reached`.
5. **Given** la persona solo cambia la narración y envía `regenerate: false`, **When** el prompt visual no cambió, **Then** se actualiza `narration`, no se consume intento y la aprobación no se invalida.
6. **Given** una escena falla al regenerar, **When** el intento termina, **Then** la tarjeta conserva la imagen anterior, muestra `No se pudo regenerar la imagen.`, la escena queda `KEYFRAME_FAILED` y la historia `FAILED` si no hay más escenas activas.

---

### User Story 3 - Aprobar y generar vídeos; reintentar una escena fallida (Priority: P1)

La persona aprueba las imágenes y el servidor genera un vídeo de 6 segundos por escena con MiniMax (`Rápido`) o Kling (`Calidad`). Los vídeos se generan de dos en dos. Si una escena falla, la persona puede reintentarla una vez sin repetir las demás.

**Why priority**: La aprobación es el segundo y último clic del flujo. El reintento por escena evita pagar de nuevo toda la historia por un fallo aislado.

**Independent Test**: Aprobar una historia de 5 escenas, comprobar `POST /api/story/{id}/approve`, que las escenas pasan por `VIDEO_QUEUED` → `VIDEO_RUNNING` → `VIDEO_READY`, que nunca hay más de 2 vídeos en vuelo, forzar el fallo de la escena 3, pulsar `Reintentar escena`, comprobar `POST /api/story/{id}/beats/{sceneId}/retry` y que solo se reenvía esa escena.

**Acceptance Scenarios**:

1. **Given** todas las escenas están `KEYFRAME_READY` y la historia `WAITING_APPROVAL`, **When** se pulsa `Aprobar y generar vídeos`, **Then** la API responde 202, `approvedAt` se rellena, `status` pasa a `GENERATING_VIDEOS` y no se envía ningún vídeo de forma síncrona.
2. **Given** la historia está `GENERATING_VIDEOS`, **When** el reconciliador trabaja, **Then** como máximo 2 escenas están en `VIDEO_QUEUED`/`VIDEO_RUNNING` a la vez y cada submit usa el `keyframeUrl` de su propia escena.
3. **Given** una escena termina en `VIDEO_FAILED`, **When** el resto sigue activo, **Then** la persona ve `Reintentar escena` para esa escena y puede reintentarla sin esperar.
4. **Given** una escena `VIDEO_FAILED` con `videoAttempts = 1`, **When** se reintenta, **Then** `videoAttempts` pasa a 2, la escena vuelve a `VIDEO_QUEUED`, la historia a `GENERATING_VIDEOS` y se usa el mismo `keyframeUrl`.
5. **Given** una escena ya tiene `videoAttempts = 2`, **When** se intenta reintentar, **Then** la API devuelve 409 `video-retry-limit-reached`.
6. **Given** todas las escenas terminan `VIDEO_READY`, **When** el reconciliador actualiza, **Then** la historia pasa a `VIDEOS_READY` y el montaje se inicia automáticamente.

---

### User Story 4 - Recargar o desconectarse y recuperar el estado (Priority: P1)

La persona puede recargar `/story/{id}`, cerrar la pestaña o perder la conexión en `WAITING_APPROVAL`, `GENERATING_VIDEOS` o `ASSEMBLING`. Al volver, la cookie `story_sid` identifica su historia, la página consulta el estado real en PostgreSQL y reanuda el polling. No se pierde el trabajo ni se inventa un estado.

**Why priority**: La generación tarda minutos y el estado debe sobrevivir al navegador. Sin recuperación, la persistencia no aporta valor.

**Independent Test**: Crear una historia, aprobar, recargar durante `GENERATING_VIDEOS`, comprobar que `/story/{id}` muestra las escenas con su estado real y que el polling se reanuda; simular `document.hidden` y `offline`/`online`; comprobar que no se crean historias nuevas.

**Acceptance Scenarios**:

1. **Given** una historia `WAITING_APPROVAL` y la cookie `story_sid`, **When** se recarga `/story/{id}`, **Then** se muestra la revisión con las mismas imágenes y no se regenera nada.
2. **Given** una historia `GENERATING_VIDEOS`, **When** se recarga, **Then** se muestra `Generando los vídeos`, el estado por escena y el polling se reanuda con `pollAfterMs`.
3. **Given** una historia `ASSEMBLING`, **When** se recarga, **Then** se muestra `Montando el vídeo final` y el polling continúa hasta `READY` o `FAILED`.
4. **Given** la pestaña está oculta, **When** el polling iba a ejecutarse, **Then** se pausa; al volver visible se hace una consulta inmediata.
5. **Given** `navigator.onLine === false`, **When** hay una historia activa, **Then** el polling se pausa, se muestra `Sin conexión. Reintentaremos cuando vuelvas a estar en línea.` y se reanuda al volver online.
6. **Given** la cookie `story_sid` se ha perdido, **When** se abre `/story/{id}`, **Then** la API devuelve 404 `story-not-found`, la UI muestra `Esta historia no está disponible en este navegador.` y no hay forma de recuperarla.
7. **Given** la historia ha superado `expiresAt`, **When** se consulta, **Then** la API devuelve 410 `story-expired` y la UI muestra `Esta historia ya no está disponible. Empieza de nuevo.`.

---

### User Story 5 - Resultado final de 30 segundos con cortes secos (Priority: P1)

Cuando todas las escenas tienen vídeo, el servidor descarga los clips, los normaliza a 720×1280, 30 fps, H.264, sin audio, los une con cortes secos y sube el MP4 al CDN de Fal. La persona ve un `<video>` reproducible con el primer keyframe como póster y la duración real medida.

**Why priority**: Es el entregable. Sin montaje, el usuario tendría una secuencia de clips, no un micro-relato.

**Independent Test**: Con 5 escenas y clips stub de 6 s, ejecutar el ensamblaje, comprobar que el MP4 final dura 30 s ± 0.3 s, mide 720×1280, tiene 30 fps, `yuv420p`, `faststart`, ninguna pista de audio y que la UI muestra `0:30` y un `<video controls playsinline poster>` sin autoplay.

**Acceptance Scenarios**:

1. **Given** todas las escenas `VIDEO_READY`, **When** el reconciliador reclama la historia, **Then** `status` pasa a `ASSEMBLING` y se ejecutan las etapas reales `Descargando los vídeos`, `Uniendo las escenas`, `Subiendo el resultado`.
2. **Given** el MP4 se ha subido, **When** se persiste, **Then** `finalVideoUrl` pasa la allowlist de Fal CDN, `finalVideoExpiresAt` es `now + 24 h`, `status` es `READY` y `completedAt` se rellena.
3. **Given** la historia `READY`, **When** se abre `/story/{id}`, **Then** se muestra un único `<video controls playsinline preload="metadata" poster>`, sin `autoplay`, sin `loop`, sin descarga, sin compartir y sin publicar.
4. **Given** el MP4 de 5 escenas, **When** se inspecciona con `ffprobe`, **Then** no contiene stream de audio ni texto, y la duración es exactamente 30 s dentro de la tolerancia.
5. **Given** un fallo de FFmpeg o de subida, **When** el ensamblaje termina, **Then** `status` es `FAILED` con `assembly-failed` o `assembly-timeout`, el temporal se limpia y la UI ofrece `Reintentar montaje`.

---

### User Story 6 - Usar una referencia de actor en el guion y en los keyframes (Priority: P2)

La persona puede subir una imagen PNG, JPG o WebP de hasta 8 MB. DeepSeek la usa para describir al personaje en el guion y FLUX Kontext la usa como ancla visual en cada keyframe. La referencia se elimina de Fal en una hora y solo puede haber una.

**Why priority**: La consistencia de personaje es el principal valor creativo de un micro-relato, pero el flujo debe funcionar sin referencia.

**Independent Test**: Crear una historia con una referencia válida, comprobar `POST /api/story/uploads`, el `PUT` directo sin `Authorization`, que el prompt de DeepSeek incluye la imagen, que cada keyframe usa `fal-ai/flux-pro/kontext` con el mismo `image_url` y que el resultado muestra `1 imagen`.

**Acceptance Scenarios**:

1. **Given** el formulario de `/story`, **When** se selecciona un WebP de 1 MiB, **Then** se pide ticket a `POST /api/story/uploads`, el navegador hace `PUT` a la URL firmada con `uploadHeaders`, sin `Authorization`, y la tarjeta muestra `Imagen · 1 MB`.
2. **Given** una referencia subida, **When** se crea la historia, **Then** `referenceUrl` se valida contra la allowlist de Fal CDN y se persiste con `referenceExpiresAt`.
3. **Given** una referencia válida, **When** DeepSeek planifica, **Then** el mensaje de usuario incluye la imagen y el plan describe al personaje de forma consistente.
4. **Given** una referencia válida, **When** se genera cada keyframe, **Then** se usa `fal-ai/flux-pro/kontext` con `image_url = referenceUrl` y `aspect_ratio: "9:16"`.
5. **Given** no hay referencia, **When** se generan los keyframes, **Then** se usa `fal-ai/flux/dev` y el resultado muestra `Sin referencia`.
6. **Given** la referencia ha caducado (`referenceExpiresAt <= now`), **When** el servidor intenta generar un keyframe, **Then** no llama a Fal, marca la historia `FAILED` con `reference-expired` y la UI pide empezar de nuevo.

---

### User Story 7 - Errores de presupuesto, límites, BD, DeepSeek, Fal y FFmpeg (Priority: P2)

La persona recibe mensajes claros y acciones posibles cuando se agota el presupuesto de 8 dólares, se supera un límite, la base de datos no responde, DeepSeek tarda o devuelve un guion inválido, Fal falla o FFmpeg no está disponible. Nunca ve claves, URLs internas, SQL ni mensajes crudos del proveedor.

**Why priority**: En un flujo con varias llamadas de pago, el error es el caso normal. Un mensaje incorrecto puede duplicar coste o romper la confianza.

**Independent Test**: Con stubs de DeepSeek, Fal y FFmpeg, provocar 429, 503, timeout, JSON inválido, escena fallida, presupuesto agotado, BD caída y binario ausente; comprobar códigos HTTP, mensajes exactos y ausencia de secretos.

**Acceptance Scenarios**:

1. **Given** la historia ha alcanzado 8 dólares estimados, **When** se intenta regenerar o reintentar, **Then** la API devuelve 429 `story-budget-exhausted` y la UI muestra el mensaje exacto.
2. **Given** la sesión ya tiene una historia activa, **When** se intenta crear otra, **Then** la API devuelve 409 `story-in-progress`.
3. **Given** la instancia supera 2 historias activas, **When** se intenta crear otra, **Then** devuelve 429 `server-busy` con `Retry-After`.
4. **Given** DeepSeek supera 45 s, **When** la ruta espera, **Then** devuelve 504 `director-timeout` y no crea la historia.
5. **Given** DeepSeek devuelve JSON inválido dos veces, **When** se agota el reintento, **Then** devuelve 502 `director-invalid-output`.
6. **Given** PostgreSQL no responde, **When** se llama a cualquier ruta de Story, **Then** devuelve 503 `database-unavailable` con `Retry-After: 5`; `/feed` y `/composer` siguen funcionando.
7. **Given** `FFMPEG_PATH` no existe, **When** se intenta montar, **Then** devuelve 503 `ffmpeg-not-configured` al comando `assemble` y la historia no se marca `READY`.
8. **Given** Fal devuelve 401/402/429/5xx, **When** el servidor lo mapea, **Then** responde 503/502 con `provider-*`, nunca con el status o el mensaje crudo de Fal.

---

### User Story 8 - Accesibilidad, responsive, PWA y offline (Priority: P3)

Una persona que usa teclado, lector de pantalla, zoom, alto contraste o movimiento reducido puede crear, revisar, aprobar, seguir el progreso, reintentar y reproducir el resultado. La interfaz funciona de 320 a 1920 px. La PWA no cachea `/api/story/**` ni medios de Fal. Sin conexión se explica el estado y no se simula éxito.

**Why priority**: Es un requisito de la constitución y de la marca. El flujo añade tarjetas, listas de estado y un vídeo final que deben seguir siendo accesibles.

**Independent Test**: Auditar `/story` y `/story/{id}` con teclado, VoiceOver/TalkBack, `prefers-reduced-motion: reduce`, forced-colors, zoom 200 %/400 %, anchos 320–1920 px y offline; comprobar foco, anuncios, controles de vídeo y que el service worker no cachea APIs ni Fal.

**Acceptance Scenarios**:

1. **Given** un lector de pantalla abre `/story`, **When** anuncia la página, **Then** encuentra `header`, `main`, un único `h1`, un formulario etiquetado, un `radiogroup` de escenas y otro de calidad, y una jerarquía de encabezados sin saltos.
2. **Given** la revisión, **When** se navega con teclado, **Then** cada tarjeta tiene un encabezado `Escena {n} de {total}`, el textarea está etiquetado, `Guardar y regenerar` mide al menos 44 × 44 px y el foco vuelve a la tarjeta tras regenerar.
3. **Given** una historia activa, **When** cambia el estado global, **Then** una región `role="status"` anuncia el cambio una vez; el tiempo transcurrido no se anuncia cada segundo.
4. **Given** un error, **When** aparece, **Then** se usa `role="alert"`, el mensaje es exacto y el foco va a la acción útil.
5. **Given** `prefers-reduced-motion: reduce`, **When** se usa la página, **Then** no hay animaciones no esenciales ni scroll suave.
6. **Given** forced-colors, **When** se inspeccionan tarjetas, progreso, errores y vídeo, **Then** los límites y estados siguen visibles.
7. **Given** anchos de 320, 360, 390, 768, 1024, 1440 y 1920 px, **When** se recorre el flujo, **Then** no hay scroll horizontal ni controles fuera de alcance.
8. **Given** el service worker activo, **When** se inspecciona la caché, **Then** no contiene `/api/story/**`, `fal.media`, `*.fal.media`, `queue.fal.run`, `fal.run` ni `rest.fal.ai`.
9. **Given** `navigator.onLine === false` en `/story`, **When** se intenta crear, **Then** el botón está deshabilitado, se muestra `Sin conexión. La creación necesita internet.` y no se hace ninguna petición.

---

### User Story 9 - Convivencia con 004 sin regresiones (Priority: P1)

El Composer, el feed y la landing siguen exactamente igual. Los 613 tests de 004 siguen en verde. El código nuevo no importa shims de `server/composer/` ni modifica la UI del Composer.

**Why priority**: La constitucionalidad y la confianza en la suite dependen de que una feature nueva no reescriba la anterior.

**Independent Test**: Ejecutar `npm run test:run` sin cambiar ningún test de 004; comprobar que `/composer` responde 200 con su copy, que `/api/composer/**` no cambia y que `tests/unit/composer-guards.spec.ts` sigue pasando ampliado con las guardas de Story.

**Acceptance Scenarios**:

1. **Given** la suite completa, **When** se ejecuta, **Then** los 613 tests de 004 pasan sin modificaciones.
2. **Given** `/composer`, **When** se solicita, **Then** su HTML, copy, presets, duraciones y rutas API no cambian.
3. **Given** `server/story/**`, **When** se inspeccionan imports, **Then** no importa `server/composer/**` ni `app/components/composer/**`.
4. **Given** `app/models/composer.ts` y `server/api/composer/**`, **When** se compara con 004, **Then** no hay cambios.
5. **Given** los tests de feed y landing, **When** se ejecutan, **Then** siguen en verde sin cambios de copy.

### Edge Cases

- **Premisa vacía o solo espacios**: 400 `premise-required`; foco en el textarea.
- **Premisa de 600 caracteres**: se acepta; 601 se rechaza con `premise-too-long`.
- **Premisa con emoji**: el contador usa `String.length` (un emoji puede contar 2).
- **Premisa con saltos de línea**: se conservan; el servidor normaliza NFC y `trim`.
- **Premisa con caracteres de control**: 400 `invalid-premise`; se permiten `\n` y `\t`.
- **Premisa con HTML o `<script>`**: se envía como texto, se renderiza con interpolación y nunca con `v-html`.
- **`sceneCount` 3, 7 o string**: 400 `invalid-scene-count`.
- **`preset` desconocido**: 400 `invalid-preset`.
- **`durationSeconds`, `model`, `endpoint`, `beats` en el body**: 400 `invalid-request`; no se aceptan.
- **Referencia de 0 bytes, GIF, SVG o > 8 MiB**: mismos códigos y mensajes que 004.
- **Referencia con nombre malicioso**: 400 `invalid-file-name`.
- **Doble submit de creación**: el botón se bloquea y la idempotencia evita dos historias.
- **Misma `Idempotency-Key` con otro body**: 409 `idempotency-conflict`.
- **Historia activa**: 409 `story-in-progress`.
- **DeepSeek timeout**: 504 `director-timeout`; no se crea fila.
- **DeepSeek JSON inválido**: un reintento de reparación; si falla, 502 `director-invalid-output`.
- **DeepSeek 401/403**: 503 `director-unavailable`; no se filtra la clave.
- **Plan con 4 beats cuando se pidieron 5**: inválido; se reintenta una vez.
- **Plan con beat vacío, HTML o Markdown**: inválido; 502 tras el reintento.
- **Keyframe falla una vez**: `KEYFRAME_FAILED`; la historia `FAILED`; `Reintentar escena` consume el segundo intento.
- **Keyframe falla dos veces**: no hay más reintentos; la UI ofrece `Empezar de nuevo`.
- **Regenerar con prompt inválido**: 400 `invalid-visual-prompt`; no se consume intento.
- **Regenerar mientras otra escena se regenera**: permitido; cada escena tiene su estado.
- **Aprobar con una escena `KEYFRAME_FAILED`**: 409 `story-not-ready`.
- **Doble aprobación**: la segunda devuelve 202 con el estado actual; no duplica vídeos.
- **Vídeo falla una vez**: `Reintentar escena`; consume el segundo intento.
- **Vídeo falla dos veces**: sin más reintentos; la historia `FAILED` con `video-failed`.
- **Reintentar vídeo mientras otras escenas generan**: permitido; no se reinicia la historia.
- **Cancelar en `GENERATING_KEYFRAMES`, `WAITING_APPROVAL`, `GENERATING_VIDEOS`, `VIDEOS_READY` o `ASSEMBLING`**: 200 y `CANCELLED`; cancelación de Fal best-effort.
- **Cancelar dos veces**: 200 idempotente.
- **Cancelar en `READY` o `FAILED`**: 409 `story-not-cancellable`; si ya está `CANCELLED`, 200 idempotente.
- **Cancelar durante `ASSEMBLING`**: la historia queda `CANCELLED`; el proceso puede terminar el archivo pero no se publica ni se marca `READY`.
- **Recarga con cookie válida**: recupera estado y polling.
- **Recarga sin cookie o en otro navegador**: 404 `story-not-found`; no hay recuperación.
- **Historia expirada**: 410 `story-expired`; el cleanup la borra después.
- **BD no disponible al arrancar**: el servidor arranca; Story responde 503; `/composer` y `/feed` funcionan.
- **Dos instancias reclaman la misma historia**: el claim atómico concede el lease a una sola; la otra libera y reintenta.
- **Crash después de submit y antes de persistir el `requestId`**: ventana residual de duplicado; los intentos persistidos y la allowlist de reintentos acotan el coste. Se documenta.
- **Clip de 10 s (Kling)**: se recorta a 6 s en la normalización.
- **Clip de 5,8 s**: se rellena el último fotograma hasta 6,0 s para que el total sea exacto.
- **Clip sin audio**: el MP4 final no tiene audio; no se añade.
- **Clip con audio**: se descarta con `-an`.
- **Clip con URL caducada**: el ensamblaje falla con `assembly-failed`; `Reintentar montaje` puede fallar también y la UI lo explica.
- **FFmpeg ausente o timeout**: `ffmpeg-not-configured` o `assembly-timeout`; nunca se marca `READY`.
- **Disco lleno**: el ensamblaje falla, se limpia el temporal y se registra el error.
- **MP4 final > 200 MB**: se rechaza la subida y se marca `assembly-failed`.
- **URL final fuera de la allowlist**: no se persiste ni se renderiza.
- **320 px**: la revisión se apila en una columna; el vídeo no supera el ancho.
- **1920 px**: la revisión usa como máximo 3 columnas y el vídeo `max-w-[20rem]`.
- **Zoom 200 %/400 %**: todo refluye; los controles crecen con `min-height`.
- **Safe areas**: cabecera, `main`, tarjetas y resultado respetan `safe-area-inset-*`.

## Requirements *(mandatory)*

### Functional Requirements

#### Rutas, alcance y no regresión

- **FR-001**: El Story Composer MUST renderizarse en `/story` (`app/pages/story/index.vue`) y en `/story/[id]` (`app/pages/story/[id].vue`), con enrutado por archivos de Nuxt 4. Tras un 201 de `POST /api/story`, el cliente MUST navegar a `/story/{id}`.
- **FR-002**: La UI de Story MUST vivir en `app/components/story/`, sus composables en `app/composables/`, sus modelos en `app/models/story.ts`, sus datos estáticos en `app/data/story.ts` y sus helpers puros en `app/utils/story.ts`.
- **FR-003**: 005 MUST NOT modificar `/composer`, `app/pages/composer.vue`, `app/components/composer/**`, `app/composables/useComposer*.ts`, `app/models/composer.ts`, `server/composer/**` ni `server/api/composer/**`.
- **FR-004**: 005 MUST NOT modificar el feed ni la landing, salvo que una enmienda posterior lo apruebe. La ruta `/story` es accesible directamente y el enlace `Volver al feed` navega a `/feed`.
- **FR-005**: La feature MUST desplegarse con `nuxt build` y un proceso Node.js 22 LTS persistente. MUST NOT depender de `nuxt generate`, de un runtime serverless con límite de ejecución corto ni de un entorno sin disco temporal escribible.
- **FR-006**: El resultado MUST ser terminal: MUST NOT publicar en el feed, crear un `Short`, descargar, compartir ni ofrecer un botón de publicación.
- **FR-007**: MUST NOT existir autenticación de usuarios, cuentas, pagos ni facturación. La cookie `story_sid` es un identificador anónimo de ownership, no identidad.
- **FR-008**: Los 613 tests de 004 MUST permanecer sin cambios y en verde. Las guardas estáticas de 004 MUST ampliarse a `server/story/**`, `server/fal/**` y `server/shared/**` sin relajar las existentes.

#### Contratos, validación y datos

- **FR-009**: Los modelos compartidos MUST vivir en `app/models/story.ts`, ser `readonly`, usar uniones discriminadas y no contener `any`, `unknown` público, `File`, `Blob`, `FileList` ni barrels.
- **FR-010**: Los tipos de Prisma, los DTOs de DeepSeek y los tipos crudos de Fal MUST vivir solo en `server/`. Ningún archivo de `app/` puede importar `server/`, `@prisma/client` ni `node:crypto`.
- **FR-011**: La premisa MUST ser obligatoria, normalizarse con NFC y `trim`, conservar saltos internos y tener entre 10 y 600 caracteres (`String.length`). MUST rechazarse con 400 `premise-required`, `premise-too-long` o `invalid-premise`.
- **FR-012**: `sceneCount` MUST ser `4`, `5` o `6`; si se omite, MUST ser `5`. Cualquier otro valor MUST devolver 400 `invalid-scene-count`.
- **FR-013**: La duración MUST ser fija: 6 segundos por escena. `Story.durationSeconds` MUST ser `6`; `totalDurationSeconds` MUST ser `sceneCount × 6` (24, 30 o 36). El cliente MUST NOT poder enviar `durationSeconds`.
- **FR-014**: El preset MUST ser `fast` o `quality`; si se omite, MUST ser `fast`. `fast` MUST usar `minimax-hailuo-02`; `quality` MUST usar `kling-2.5-turbo-pro`. El cliente MUST NOT elegir modelo, endpoint, aspect ratio, resolución, semilla ni estilo.
- **FR-015**: El servidor MUST rechazar campos desconocidos en todos los bodies, en particular `model`, `modelId`, `endpointId`, `durationSeconds`, `beats`, `statusUrl`, `responseUrl`, `cancelUrl`, `webhookUrl` y `sessionId`, con 400 `invalid-request`.
- **FR-016**: Los bodies MUST ser JSON (`application/json`, `charset` opcional); otro `Content-Type` MUST devolver 415 `unsupported-media-type`. El máximo MUST ser 16 KiB para `POST /api/story`, 8 KiB para actualizar un beat y 4 KiB para `uploads`; por encima, 413 `payload-too-large`.
- **FR-017**: La referencia MUST ser opcional y como máximo una imagen `image/png`, `image/jpeg` o `image/webp` de 1 a 8 388 608 bytes. MUST validarse el nombre (1–200 caracteres, sin `/`, `\`, `..` ni controles) y generarse un nombre de almacenamiento propio.
- **FR-018**: `referenceUrl` MUST ser `null` o una URL `https` con host exacto en `v3.fal.media`, `v3b.fal.media` o `fal.media`, sin userinfo, sin puerto distinto de 443, sin fragmento y con longitud ≤ 2048. `referenceExpiresAt` MUST ser `null` cuando no hay referencia y, cuando la hay, una fecha ISO 8601 UTC posterior a `now` y no superior a `now + 3600 s` (la del ticket de subida). Cualquier otra combinación MUST devolver 400 `invalid-reference`.

#### Director DeepSeek

- **FR-019**: MUST existir `server/story/director.ts` y `server/story/director-prompt.ts`. El director MUST llamar a la API OpenAI-compatible de DeepSeek en `https://api.deepseek.com/chat/completions` con el modelo fijo `deepseek-flash`; el modelo MUST NOT ser elegible por el cliente.
- **FR-020**: La petición MUST usar `response_format: { type: "json_object" }`, un prompt de sistema en español que exija JSON, `stream: false`, `temperature` fija y `max_tokens` acotado. La respuesta MUST parsearse y validarse en servidor.
- **FR-021**: El JSON MUST contener exactamente `title`, `logline` y `beats`; `beats` MUST tener exactamente `sceneCount` elementos con `order` 1..N único y consecutivo, `visualPrompt` (20–600) y `narration` (10–280).
- **FR-022**: `title` MUST tener 1–80 caracteres y `logline` 1–200. Ningún campo de texto MUST contener `<`, `>`, backticks, cercas de código, caracteres de control ni Markdown de bloque. Se normaliza NFC y se colapsan saltos en `narration`.
- **FR-023**: Si la respuesta no es JSON válido o no cumple el esquema, el director MUST hacer **un único reintento** de reparación con el error y el esquema. Si el segundo intento falla, MUST lanzar 502 `director-invalid-output` y no crear la historia.
- **FR-024**: El timeout del director MUST ser 45 000 ms. Un timeout MUST devolver 504 `director-timeout` y no crear la historia. Los errores 401/403/429/5xx de DeepSeek MUST mapearse a 503 `director-unavailable` o 502, sin reintento automático ni mensaje crudo.
- **FR-025**: Si hay referencia, el mensaje de usuario MUST incluir la imagen como `image_url` con la `referenceUrl` validada, además de la premisa. Si DeepSeek no acepta `image_url` y `response_format` juntos, la fase 1 se detiene y se reabre la decisión; no se implementa un fallback silencioso.
- **FR-026**: `NUXT_DEEPSEEK_KEY` MUST declararse como `runtimeConfig.deepseekKey` privado. MUST NOT existir `NUXT_PUBLIC_DEEPSEEK_KEY`; la clave MUST NOT aparecer en cliente, HTML, respuestas, logs ni tokens.
- **FR-027**: El plan validado MUST persistirse en `Story.planJson` y replicarse en `Scene.visualPrompt` y `Scene.narration`. La creación de `Story` y sus `Scene` MUST ser una sola transacción.
- **FR-028**: `POST /api/story` MUST llamar a DeepSeek antes de crear la fila. Mientras DeepSeek trabaja, la UI está en `planning`; `PLANNING` queda reservado en el enum pero no se persiste en v1. Si DeepSeek falla, no queda una historia huérfana.
- **FR-029**: El director MUST tratar la salida de DeepSeek como texto no confiable: se renderiza con interpolación, nunca con `v-html`, y no se ejecuta, interpreta como HTML ni usa para construir rutas.

#### Keyframes, revisión y aprobación

- **FR-030**: MUST existir `POST /api/story/uploads` para el ticket de referencia. MUST reutilizar el patrón de subida firmada de 004 y devolver `uploadUrl`, `fileUrl`, `expiresAt` y `uploadHeaders`; el lifecycle MUST ser 3600 s y el prefijo del archivo MUST ser `story-ref-`.
- **FR-031**: El reconciliador MUST generar un keyframe por escena en `PENDING`, respetando una concurrencia máxima de 3 por instancia. Sin referencia MUST usar `fal-ai/flux/dev`; con referencia MUST usar `fal-ai/flux-pro/kontext` con el mismo `image_url`.
- **FR-032**: El keyframe MUST ser 9:16. Para FLUX dev MUST usarse `image_size: { width: 1152, height: 2048 }`, `num_images: 1`, `output_format: "jpeg"` y `enable_safety_checker: true`. Para Kontext MUST usarse `aspect_ratio: "9:16"`, `output_format: "jpeg"` y `safety_tolerance: "2"`.
- **FR-033**: El prompt del keyframe MUST componerse con una plantilla normativa que incluya el `visualPrompt`, la verticalidad 9:16 y la prohibición de texto, watermark y logo. MUST NOT enviarse el `visualPrompt` crudo sin contexto.
- **FR-034**: Cada escena MUST tener como máximo **2 intentos de keyframe**: el inicial y uno extra (regeneración o reintento de fallo). `keyframeAttempts` MUST incrementarse y persistirse **antes** de cada submit; con `keyframeAttempts >= 2` MUST NOT haber más submits.
- **FR-035**: La historia MUST pasar a `WAITING_APPROVAL` solo cuando **todas** las escenas estén `KEYFRAME_READY`. Si alguna queda `KEYFRAME_FAILED` y no hay escenas activas, MUST pasar a `FAILED` con `keyframe-failed`.
- **FR-036**: La revisión MUST mostrar 4–6 tarjetas ordenadas con keyframe, `narration`, `visualPrompt`, `Imagen {n} de 2` y `Guardar y regenerar`. MUST NOT mostrar URLs de proveedor, `requestId`, `statusUrl` ni detalles internos.
- **FR-037**: MUST existir `POST /api/story/[id]/beats/[beatId]/keyframe` con body `{ visualPrompt, narration?, regenerate? }`. `visualPrompt` MUST validarse (20–600, sin HTML/Markdown); `narration` MUST validarse (10–280) si se envía. `regenerate` MUST ser `true` por defecto.
- **FR-038**: Si `regenerate` es `false` y `visualPrompt` no cambió, la ruta MUST actualizar solo `narration`, sin consumir intento y sin invalidar la aprobación. Si `visualPrompt` cambió o `regenerate` es `true`, MUST regenerar y consumir un intento.
- **FR-039**: Una regeneración MUST poner la historia en `GENERATING_KEYFRAMES`, la escena en `KEYFRAME_QUEUED`, limpiar el error de la escena, poner `approvedAt = null` y conservar la imagen anterior hasta que llegue la nueva.
- **FR-040**: Solo se MUST permitir regenerar en `WAITING_APPROVAL` o en `FAILED` con error `keyframe-failed`; en otro estado MUST devolver 409 `scene-not-ready` o `story-not-ready`.
- **FR-041**: MUST existir `POST /api/story/[id]/approve`. Solo MUST aceptar `WAITING_APPROVAL` con todas las escenas `KEYFRAME_READY`; MUST poner `approvedAt`, `status = GENERATING_VIDEOS`, limpiar el error global y devolver 202. Si ya está en `GENERATING_VIDEOS` o posterior, MUST ser idempotente y no reenviar vídeos.

#### Vídeos por escena

- **FR-042**: El reconciliador MUST enviar a la cola de Fal un vídeo por escena `KEYFRAME_READY` cuando la historia esté `GENERATING_VIDEOS`, con concurrencia máxima de 2 por instancia.
- **FR-043**: `fast` MUST usar `fal-ai/minimax/hailuo-02/standard/image-to-video` con `duration: "6"`, `resolution: "768P"` y `prompt_optimizer: false`. `quality` MUST usar `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`; como Kling no ofrece 6 s, el adaptador recibe `durationSeconds: 6` y emite su duración nativa `duration: "10"`, y el ensamblaje MUST recortar los primeros 6,0 s.
- **FR-044**: El input de vídeo MUST incluir el `keyframeUrl` de la propia escena y un prompt compuesto con el `visualPrompt`, movimiento natural, verticalidad 9:16 y prohibición de texto, watermark y logo. MUST NOT incluir `narration` (no se quema en el vídeo).
- **FR-045**: MUST usarse exactamente `statusUrl`, `responseUrl` y `cancelUrl` devueltas por el submit. MUST NOT reconstruirse URLs de Fal.
- **FR-046**: Cada escena MUST tener como máximo **2 intentos de vídeo**: el inicial y un reintento. `videoAttempts` MUST incrementarse y persistirse antes de cada submit; con `videoAttempts >= 2` MUST NOT haber más submits.
- **FR-047**: MUST existir `POST /api/story/[id]/beats/[beatId]/retry` para una escena `VIDEO_FAILED` con `videoAttempts < 2` y la historia en `GENERATING_VIDEOS` o `FAILED` con `video-failed`. MUST poner la escena `VIDEO_QUEUED`, limpiar su error, poner la historia `GENERATING_VIDEOS` y devolver 202.
- **FR-048**: Cuando todas las escenas estén `VIDEO_READY`, la historia MUST pasar a `VIDEOS_READY`. Si alguna queda `VIDEO_FAILED` y no hay escenas activas, MUST pasar a `FAILED` con `video-failed`.
- **FR-049**: El estado por escena MUST derivarse de `Scene.status`: `KEYFRAME_QUEUED`/`VIDEO_QUEUED` con `requestId = null` significa "programado"; con `requestId` no nulo significa "en cola del proveedor"; `KEYFRAME_RUNNING`/`VIDEO_RUNNING` significa "generando".
- **FR-050**: Un fallo de vídeo MUST conservar el keyframe y el resto de escenas. MUST NOT borrar ni reiniciar los vídeos ya listos.

#### Reconciliador y leases

- **FR-051**: MUST existir `server/story/reconciler.ts` y `server/plugins/story-reconciler.ts`. El plugin MUST arrancar un único temporizador por proceso con `NUXT_STORY_RECONCILER_INTERVAL_MS` (default 5000), `.unref()`, guarda global contra doble registro y no-op en `NODE_ENV === 'test'` o si `DATABASE_URL` no existe.
- **FR-052**: El reconciliador MUST reclamar historias con un `updateMany` atómico que exija `status IN ('GENERATING_KEYFRAMES','GENERATING_VIDEOS','VIDEOS_READY','ASSEMBLING')` y `leaseUntil IS NULL OR leaseUntil < now`, escribiendo `leaseOwner` y `leaseUntil = now + 60 s`, e incrementando `version`.
- **FR-053**: Si el claim devuelve 0 filas, la instancia MUST liberar y no procesar. El lease MUST liberarse en `finally` (`leaseOwner = null`, `leaseUntil = null`).
- **FR-054**: El reconciliador MUST procesar una historia con un presupuesto máximo de 45 s por tick. Antes de cada submit MUST releer el estado de la escena y de la historia; si la historia ya no está activa o el lease pertenece a otro, MUST abortar sin llamar a Fal.
- **FR-055**: Para cada escena `PENDING`/`KEYFRAME_QUEUED` con `requestId = null`, el reconciliador MUST componer el prompt, llamar a `FalQueueService.submit`, persistir `requestId` y las URLs y dejar la escena en `KEYFRAME_QUEUED`.
- **FR-056**: Para cada escena `KEYFRAME_QUEUED`/`KEYFRAME_RUNNING` con `requestId`, el reconciliador MUST consultar `statusUrl`: `IN_QUEUE` mantiene `QUEUED`, `IN_PROGRESS` pasa a `RUNNING`, `COMPLETED` consulta `responseUrl`, parsea el adaptador y persiste `keyframeUrl` + `KEYFRAME_READY`.
- **FR-057**: Para cada escena `VIDEO_QUEUED`/`VIDEO_RUNNING`, el reconciliador MUST aplicar el mismo patrón y persistir `videoUrl` + `VIDEO_READY` o `VIDEO_FAILED` con el código estable.
- **FR-058**: El reconciliador MUST ejecutar las transiciones agregadas: todas las imágenes listas → `WAITING_APPROVAL`; alguna imagen fallida sin escenas activas → `FAILED` `keyframe-failed`; todos los vídeos listos → `VIDEOS_READY`; algún vídeo fallido sin escenas activas → `FAILED` `video-failed`.
- **FR-059**: `GET /api/story/[id]` MUST ser de solo lectura: MUST NOT llamar a Fal, DeepSeek ni FFmpeg, MUST NOT reclamar leases y MUST NOT modificar la base de datos.
- **FR-060**: Tras un crash, una historia con `leaseUntil` expirado MUST poder ser reclamada por otra instancia o por el siguiente tick. Si estaba `ASSEMBLING` sin `finalVideoUrl`, MUST reintentar el montaje de forma idempotente con un directorio temporal nuevo.
- **FR-061**: El reconciliador MUST borrar historias expiradas (`expiresAt < now - 1 h`) en lotes de 50 como máximo una vez cada 10 minutos; el borrado MUST ser en cascada a `Scene`.

#### Ensamblaje FFmpeg

- **FR-062**: MUST existir `server/story/assembly-service.ts`, `server/story/ffmpeg-runner.ts` y `server/story/media-downloader.ts`. El ensamblaje MUST usar el binario del sistema `FFMPEG_PATH` (default `ffmpeg`) y `FFPROBE_PATH` (default `ffprobe`), leídos de `process.env` solo en servidor.
- **FR-063**: El ensamblaje MUST usar `spawn` con un array de argumentos y `shell: false`. MUST NOT usarse `exec`, `execSync`, `spawnSync` con shell, `eval` ni concatenación de comandos.
- **FR-064**: La salida MUST ser 720×1280, 30 fps, `yuv420p`, `libx264`, `faststart`, sin audio (`-an`) y sin metadatos de usuario. Se elige 720×1280 por ser el menor denominador común de los clips 768P/1080P, reducir CPU, disco y latencia, y ser suficiente para reproducción móvil; el escalado MUST preservar el aspect ratio y recortar, nunca deformar.
- **FR-065**: Cada clip MUST normalizarse individualmente a 6,0 s exactos: `-t 6` recorta los clips de 10 s de Kling y `tpad=stop_mode=clone:stop_duration=6` rellena los clips cortos con el último fotograma. El filtro MUST ser `scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=6`.
- **FR-066**: La concatenación MUST usar el demuxer `concat` con `-f concat -safe 0 -i list.txt -c copy -movflags +faststart`. Los nombres del listado MUST ser generados por el servidor (`scene-1.mp4`…`scene-6.mp4`) y MUST NOT contener rutas del usuario.
- **FR-067**: Antes de descargar, cada `videoUrl` MUST revalidarse contra la allowlist de Fal CDN. La descarga MUST usar `redirect: 'error'`, timeout de 60 s por clip, máximo 300 MB por clip y 1,5 GB por historia; MUST descargarse de uno en uno.
- **FR-068**: El ensamblaje MUST verificar el resultado con `ffprobe`: duración dentro de ±0,3 s de `sceneCount × 6`, ancho 720, alto 1280, códec `h264`, `pix_fmt yuv420p`, 30 fps y **cero** streams de audio o subtítulos. Si no cumple, MUST fallar con `assembly-failed`.
- **FR-069**: El MP4 final MUST subirse al CDN de Fal mediante `server/fal/media-storage.ts`, con `content_type: video/mp4`, nombre generado por el servidor, lifecycle de 86 400 s y tamaño máximo de 200 MB. El `PUT` a la URL firmada MUST NOT llevar `Authorization` ni cookies; solo el `Content-Type` indicado. Es una excepción explícita de la constitución: el binario generado por el servidor puede viajar de Nitro a Fal; nunca se proxea una subida de usuario.
- **FR-070**: El ensamblaje MUST usar un directorio temporal único (`mkdtemp`) y borrarlo de forma recursiva en `finally`, incluso en error, timeout o cancelación. Tras normalizar cada clip, MUST borrar el archivo fuente para limitar el disco.
- **FR-071**: Los timeouts MUST ser 60 s por normalización, 120 s por concatenación y 180 s para el ensamblaje completo. Al expirar, MUST matarse el proceso con `SIGKILL`, limpiar el temporal y fallar con `assembly-timeout`.
- **FR-072**: La concurrencia de ensamblaje MUST ser 1 por instancia. Si hay más de 2 historias esperando montaje, el reconciliador MUST dejarlas en `VIDEOS_READY` y reintentar en el siguiente tick; `POST /api/story/[id]/assemble` MUST devolver 429 `assembly-busy` solo si la cola supera ese límite.
- **FR-073**: MUST existir `POST /api/story/[id]/assemble` para reintentar el montaje desde `VIDEOS_READY` o `FAILED` con `assembly-failed`/`assembly-timeout`, siempre que todas las escenas estén `VIDEO_READY`. MUST poner la historia en `VIDEOS_READY`, limpiar el error y devolver 202; el reconciliador hará el trabajo. Si ya está `ASSEMBLING`, MUST ser idempotente. Si está `READY`, MUST devolver 202 sin reensamblar.

#### Persistencia Prisma

- **FR-074**: La persistencia MUST usar PostgreSQL con Prisma 7 y `@prisma/adapter-pg`. `DATABASE_URL` MUST ser la conexión pooled (6543 con `?pgbouncer=true` en Supabase); `DIRECT_URL` MUST ser la directa (5432) para migraciones e introspección.
- **FR-075**: MUST ejecutarse `prisma migrate dev --name init` para crear la migración inicial y `prisma migrate deploy` en cada despliegue. MUST NOT usarse `prisma db push` en producción ni `prisma migrate reset` fuera de desarrollo local.
- **FR-076**: `npm run db:generate` MUST ejecutarse antes de `npm run build`, de `npm run test:run` y en CI cuando Story importe Prisma. `server/generated/` sigue gitignored; el build MUST fallar de forma clara si falta el cliente generado.
- **FR-077**: `server/db/prisma.ts` MUST inicializarse de forma perezosa: MUST NOT lanzar al importarse si `DATABASE_URL` falta. `getPrisma()` MUST lanzar un error de configuración solo al usarse; el arranque de Nuxt, `/feed` y `/composer` MUST funcionar sin base de datos.
- **FR-078**: MUST existir `server/story/repository.ts` (interfaz) y `server/story/prisma-story-repository.ts` (implementación). Las rutas, el reconciliador y la UI MUST depender de la interfaz; MUST NOT importar Prisma ni tipos generados.
- **FR-079**: `Story` y `Scene` MUST mapearse con tipos server-only; el DTO público MUST exponer solo los campos del Data Contract. `keyframeStatusUrl`, `keyframeResponseUrl`, `keyframeCancelUrl`, `videoStatusUrl`, `videoResponseUrl`, `videoCancelUrl`, `keyframeRequestId`, `videoRequestId`, `leaseOwner`, `leaseUntil`, `sessionId` e `idempotencyKey` MUST NOT salir al cliente.
- **FR-080**: Las transiciones MUST usar escrituras condicionales (`updateMany` con `status`/`version`) o transacciones `$transaction`. Una escritura que no cumple la precondición MUST devolver 0 filas y la ruta MUST responder 409 con el estado real, no sobrescribir.
- **FR-081**: `Story.version` MUST incrementarse en cada escritura de historia y usarse como token de concurrencia para el reconciliador y las rutas. No es un `ETag` HTTP ni una precondición obligatoria del cliente.
- **FR-082**: Los errores de escena MUST persistirse como **código estable** en `Scene.keyframeError` y `Scene.videoError`; MUST NOT persistirse el mensaje crudo del proveedor. `Story.errorCode` MUST guardar el código y `Story.errorMessage` la copia en español.
- **FR-083**: `Story.planJson` MUST contener un `StoryPlan` válido; si al leer es inválido o nulo, el repositorio MUST reconstruir el plan desde las escenas y registrar el incidente sin romper la respuesta.
- **FR-084**: `Story.expiresAt` MUST ser `createdAt + 24 h`. `GET` MUST devolver 410 `story-expired` cuando `expiresAt <= now`; el cleanup borra la fila después de una hora adicional.
- **FR-085**: MUST NOT añadirse ningún campo nuevo al schema para v1. Los intentos, errores y URLs usan columnas existentes. Si el montaje necesitara un contador persistido de intentos, se abrirá una enmienda de schema; no se añade ahora.

#### Sesión y ownership

- **FR-086**: MUST existir una cookie `story_sid` HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` en producción y `Max-Age=604800` (7 días), con un valor aleatorio de 128 bits (`crypto.randomBytes(16).toString('base64url')`).
- **FR-087**: `POST /api/story` y `POST /api/story/uploads` MUST crear la cookie si no existe. `GET` y los comandos MUST leerla, pero MUST NOT crearla.
- **FR-088**: Toda lectura o comando MUST filtrar por `Story.sessionId = story_sid`. Una historia de otra sesión MUST devolver 404 `story-not-found`, nunca 403, para no revelar existencia.
- **FR-089**: Una historia propia expirada MUST devolver 410 `story-expired`. Una historia inexistente, ajena o con cookie ausente MUST devolver 404.
- **FR-090**: Si la cookie se pierde, se borra o se usa otro navegador, la historia MUST NOT ser recuperable. La UI MUST explicarlo con `Esta historia no está disponible en este navegador.` y no prometer recuperación.
- **FR-091**: La cookie MUST NOT contener datos personales, prompt, plan, URLs ni identificadores de historia. Es solo un identificador opaco de sesión.

#### Límites, presupuesto, idempotencia y concurrencia

- **FR-092**: El coste estimado de una historia MUST calcularse con `director + Σ keyframeAttempts × unitKeyframe + Σ videoAttempts × unitVideo`, usando la tabla de costes configurable y el preset. El máximo MUST ser **8 USD por historia**.
- **FR-093**: Antes de aceptar una regeneración o un reintento, y antes de cada submit del reconciliador, el servidor MUST comprobar que el coste proyectado no supera 8 USD. Si lo supera, MUST rechazar con 429 `story-budget-exhausted` (comando) o marcar la escena/historia como fallida por presupuesto (reconciliador), sin llamar al proveedor.
- **FR-094**: MUST existir un presupuesto diario por instancia `NUXT_STORY_DAILY_BUDGET_USD` (default 50). Al agotarse, las nuevas creaciones MUST devolver 429 `daily-budget-exhausted` con `Retry-After` hasta el siguiente día UTC. Las historias ya aceptadas se rigen por su cap de 8 USD.
- **FR-095**: MUST existir rate limit en memoria por sesión/IP con ventanas fijas y mapas acotados: 3 creaciones/hora por sesión, 5 tickets de subida/10 min por sesión y 20/hora por IP, 10 comandos/minuto por sesión, 1 poll/1,5 s por historia, 3 cancelaciones/minuto por historia y 3 montajes/hora por historia. MUST devolver 429 `rate-limited` con `Retry-After`.
- **FR-096**: MUST existir concurrencia: 1 historia activa por sesión (409 `story-in-progress`) y 2 historias activas por instancia (429 `server-busy` con `Retry-After: 30`). "Activa" excluye `READY`, `FAILED` y `CANCELLED`.
- **FR-097**: `POST /api/story` y `POST /api/story/uploads` MUST aceptar `Idempotency-Key` opcional de 8–128 caracteres `[A-Za-z0-9._~-]`. La misma clave con el mismo body MUST devolver la misma respuesta sin volver a llamar a DeepSeek ni a Fal (201 en la primera creación, 200 en la repetición); con otro body MUST devolver 409 `idempotency-conflict`.
- **FR-098**: La idempotencia de creación MUST apoyarse en el unique `[sessionId, idempotencyKey]` y en un store en memoria para peticiones en vuelo. Sin clave, MUST deduplicar por `sha256(premise|sceneCount|preset|referenceUrl)` durante 60 s.
- **FR-099**: Los comandos MUST ser idempotentes por estado: aprobar dos veces no duplica vídeos; cancelar dos veces devuelve 200; montar dos veces no reensambla; regenerar o reintentar dos veces está limitado por `keyframeAttempts`/`videoAttempts`.
- **FR-100**: Los límites en memoria MUST documentarse como **no distribuidos**. Los leases permiten que varias instancias no procesen la misma historia a la vez, pero no garantizan rate limit ni presupuesto global entre instancias.

#### Seguridad y operación

- **FR-101**: `NUXT_FAL_KEY`, `NUXT_DEEPSEEK_KEY`, `DATABASE_URL`, `DIRECT_URL`, `FFMPEG_PATH` y `FFPROBE_PATH` MUST ser server-only. MUST NOT existir una variante pública de ninguno.
- **FR-102**: Las claves MUST NOT aparecer en el bundle cliente, HTML SSR, respuestas, logs, errores, cookies, URLs ni tokens.
- **FR-103**: MUST NOT loggearse la premisa, el plan, `visualPrompt`, `narration`, `referenceUrl`, URLs de Fal, `statusUrl`, `responseUrl`, `cancelUrl`, `requestId`, `Idempotency-Key`, la cadena de conexión ni la IP en claro. La premisa se registra solo como hash; la IP, solo como hash con sal.
- **FR-104**: El servidor MUST rechazar POST cross-origin con `Origin` presente y distinto del host (403 `cross-origin-request`). MUST NOT habilitarse CORS para `/api/story/**`.
- **FR-105**: El servidor MUST NOT hacer fetch de URLs arbitrarias. Las descargas de clips y la subida final MUST pasar por la allowlist de Fal; la URL firmada del `PUT` binario MUST validarse como `https` sin userinfo ni fragmento, MUST NOT recibir `Authorization` y MUST NOT aplicar la allowlist de orígenes de API (solo a las llamadas de API). El cliente DeepSeek MUST tener un origen fijo (`https://api.deepseek.com` o el override de test) y MUST usar `redirect: 'error'` y timeout.
- **FR-106**: Los errores de DeepSeek, Fal, Prisma y FFmpeg MUST mapearse a `StoryErrorCode` y mensajes en español. MUST NOT devolverse mensajes crudos, SQL, stack traces, headers internos ni detalles de credenciales.
- **FR-107**: FFmpeg MUST ejecutarse sin shell, con argumentos generados por el servidor, `cwd` en el directorio temporal y `-nostdin`. MUST NOT interpolarse ningún dato del usuario en los argumentos.
- **FR-108**: La subida del MP4 final es la única escritura de binario desde Nitro a Fal. La subida de la referencia sigue siendo un `PUT` directo del navegador. MUST NOT existir un proxy genérico de medios ni una ruta que acepte binarios de usuario.
- **FR-109**: El service worker MUST mantener `NetworkOnly` para `/api/**` y los hosts de Fal, y MUST NOT cachear `/api/story/**`, el MP4 final ni los keyframes.
- **FR-110**: MUST NOT existir analítica, píxeles, fuentes remotas, CDNs de UI ni telemetría de terceros. Los iconos MUST ser SVG inline locales.

#### UI/UX, copy y accesibilidad

- **FR-111**: `/story` MUST incluir: premisa con contador, selector de escenas 4/5/6 (`radiogroup`), selector de calidad (`radiogroup`), referencia opcional, aviso de privacidad y `Crear historia`.
- **FR-112**: El camino por defecto MUST ser de 1 a 3 clics: premisa + `Crear historia` + `Aprobar y generar vídeos`. Escenas, calidad y referencia MUST tener defaults y ser opcionales.
- **FR-113**: `/story/[id]` MUST mostrar, según el estado persistido: preparación de imágenes, revisión, generación de vídeos, montaje, resultado, error, cancelación o expiración. MUST NOT mostrar estados inventados. La planificación (`Escribiendo el guion`) pertenece a `/story` mientras `POST /api/story` está en vuelo.
- **FR-114**: La revisión MUST mostrar 4–6 tarjetas con `Escena {n} de {total}`, keyframe, narración, prompt editable, intento y `Guardar y regenerar`. MUST NOT mostrar la narración como si fuera a aparecer en el vídeo.
- **FR-115**: El progreso de vídeos MUST mostrar el estado real por escena (`En cola`, `Generando vídeo`, `Vídeo listo`, `Vídeo fallido`), el resumen `{done} de {total} vídeos listos`, tiempo transcurrido y, si aplica, aviso de espera prolongada. MUST NOT mostrar porcentajes ni ETA.
- **FR-116**: El resultado MUST mostrar badge `IA`, `<video controls playsinline preload="metadata" poster>` sin `autoplay` ni `loop`, y los metadatos `Escenas`, `Duración`, `Formato 9:16`, `Estilo` y `Referencia`. El `poster` MUST ser `scenes[0].keyframeUrl` si sigue pasando la allowlist; si no, se omite. MUST NOT ofrecer publicar, descargar ni compartir.
- **FR-117**: El copy visible MUST estar en español (`es-ES`), sin i18n, y coincidir exactamente con el Copy Deck.
- **FR-118**: Los errores MUST mostrarse con `role="alert"`, mensaje exacto y una acción útil (`Reintentar escena`, `Reintentar montaje`, `Empezar de nuevo`). El foco MUST ir al primer control relevante.
- **FR-119**: El foco MUST gestionarse así: al entrar en revisión, al `h2` de revisión; al entrar en vídeos, al `h2` de vídeos; al entrar en montaje, al `h2` de montaje; al pasar a `READY`, al `h2` del resultado; al regenerar, a la tarjeta de la escena; al fallar, al botón de acción. Los encabezados MUST tener `tabindex="-1"`.
- **FR-120**: MUST existir una región `role="status"` con `aria-live="polite"` y `aria-atomic="true"` para transiciones globales y errores recuperables; `role="alert"` para errores. Las transiciones MUST anunciarse una vez; el tiempo transcurrido MUST NOT anunciarse cada segundo.
- **FR-121**: MUST cumplirse un único `h1`, `header`/`main`, jerarquía sin saltos, labels programáticas, `aria-current="step"` en el stepper, `radiogroup` etiquetado y ningún `tabindex` positivo.
- **FR-122**: Todos los controles interactivos MUST tener un objetivo táctil mínimo de 44 × 44 px CSS, foco visible y nombre accesible. Los campos MUST usar `text-base` para evitar el zoom de iOS.
- **FR-123**: MUST respetarse `prefers-reduced-motion: reduce` (sin animaciones no esenciales, sin scroll suave) y forced-colors (límites y estados visibles en tarjetas, progreso, errores y vídeo).
- **FR-124**: El layout MUST funcionar de 320 a 1920 px sin scroll horizontal, solapamientos ni recortes, con zoom 200 %/400 % y safe areas.
- **FR-125**: MUST NOT usarse `v-html` ni `dangerouslySetInnerHTML` con premisa, plan, prompts, narración, errores o resultado. Todo MUST renderizarse con interpolación de Vue.
- **FR-126**: MUST NOT existir botones o enlaces muertos. `Volver al feed`, `Crear historia`, `Guardar y regenerar`, `Aprobar y generar vídeos`, `Reintentar escena`, `Reintentar montaje`, `Cancelar historia` y `Empezar otra historia` MUST tener efecto real.

#### SSR, PWA y offline

- **FR-127**: El SSR de `/story` MUST renderizar el formulario vacío con defaults (`5 escenas`, `Rápido`, sin referencia), `Crear historia` deshabilitado y `<noscript>`; MUST NOT incluir historia, plan, URLs de Fal, cookies ni llamadas a DeepSeek.
- **FR-128**: El SSR de `/story/[id]` MUST renderizar un shell determinista (`Tu historia`, `Cargando tu historia…`, `noscript`) sin consultar la base de datos ni exponer datos. La carga real MUST ocurrir en cliente tras montar.
- **FR-129**: `useStory` MUST NOT iniciar polling, generación ni subida durante SSR. El polling MUST empezar solo en cliente y MUST usar `setTimeout` encadenado, sin `setInterval`.
- **FR-130**: El polling MUST respetar `pollAfterMs`, no solapar peticiones, pausarse con `document.hidden` y `offline`, reanudarse con una consulta inmediata al volver visible/online, y detenerse en estados terminales o expirados. 3 fallos de red consecutivos MUST mostrar un error recuperable con `Reintentar` que reanuda el mismo polling sin crear nada; 429 MUST respetar `Retry-After` sin error terminal; 404/410 MUST ser terminales.
- **FR-131**: Sin conexión, `Crear historia` MUST estar deshabilitado y MUST mostrarse `Sin conexión. La creación necesita internet.`; si hay una historia activa, MUST mostrarse `Sin conexión. Reintentaremos cuando vuelvas a estar en línea.` y MUST NOT simular progreso.
- **FR-132**: MUST NOT persistirse en `localStorage`, `sessionStorage`, IndexedDB, query string ni estado global compartido la premisa, el plan, los prompts, la narración, las URLs, el vídeo ni el estado de la historia. La cookie `story_sid` es la única excepción y no contiene datos de usuario.

#### Testing

- **FR-133**: Cada archivo runtime nuevo MUST tener cobertura automatizada directa o por integración, excepto los modelos type-only. Los tests MUST usar stubs y fakes; MUST NOT llamar a DeepSeek, Fal ni FFmpeg reales en CI.
- **FR-134**: MUST existir tests de rutas API con repositorio fake, tests de componentes con API fake, tests de aceptación SSR de `/story` y `/story/[id]`, tests del reconciliador con leases y tests de regresión de 004.
- **FR-135**: MUST existir fixtures de DeepSeek (`deepseek-plan-4.json`, `deepseek-plan-5.json`, `deepseek-plan-6.json`, `deepseek-invalid.json`, `deepseek-repair.json`) y reutilizar las fixtures de Fal de 004. MUST existir un smoke opt-in de FFmpeg (`RUN_FFMPEG_SMOKE=1`) y otro de extremo a extremo (`RUN_STORY_SMOKE=1`), saltados por defecto y nunca ejecutados en CI.

### Data Contract

El contrato es normativo. Los modelos compartidos viven en `app/models/story.ts`. Los tipos de Prisma, DeepSeek, Fal y del repositorio viven solo en `server/`. No se crea `app/models/index.ts` ni ningún barrel.

```ts
// app/models/story.ts — contrato compartido de Story.
export type StoryStatus =
  | 'PLANNING'
  | 'GENERATING_KEYFRAMES'
  | 'WAITING_APPROVAL'
  | 'GENERATING_VIDEOS'
  | 'VIDEOS_READY'
  | 'ASSEMBLING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'

export type SceneStatus =
  | 'PENDING'
  | 'KEYFRAME_QUEUED'
  | 'KEYFRAME_RUNNING'
  | 'KEYFRAME_READY'
  | 'KEYFRAME_FAILED'
  | 'VIDEO_QUEUED'
  | 'VIDEO_RUNNING'
  | 'VIDEO_READY'
  | 'VIDEO_FAILED'
  | 'CANCELLED'

export type StoryPreset = 'fast' | 'quality'

export type StoryModelId = 'minimax-hailuo-02' | 'kling-2.5-turbo-pro'

export type StorySceneCount = 4 | 5 | 6

export type StorySceneDurationSeconds = 6

export type StoryAspectRatio = '9:16'

export type StoryImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface StoryBeat {
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
}

export interface StoryPlan {
  readonly title: string
  readonly logline: string
  readonly beats: readonly StoryBeat[]
}

export type StoryErrorCode =
  | 'invalid-request'
  | 'premise-required'
  | 'premise-too-long'
  | 'invalid-premise'
  | 'invalid-scene-count'
  | 'invalid-preset'
  | 'invalid-reference'
  | 'reference-empty'
  | 'reference-too-large'
  | 'unsupported-reference-type'
  | 'invalid-file-name'
  | 'invalid-visual-prompt'
  | 'invalid-narration'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'cross-origin-request'
  | 'story-not-found'
  | 'story-expired'
  | 'beat-not-found'
  | 'story-not-ready'
  | 'scene-not-ready'
  | 'keyframe-limit-reached'
  | 'video-retry-limit-reached'
  | 'story-not-cancellable'
  | 'story-in-progress'
  | 'idempotency-conflict'
  | 'rate-limited'
  | 'server-busy'
  | 'story-budget-exhausted'
  | 'daily-budget-exhausted'
  | 'assembly-busy'
  | 'director-not-configured'
  | 'director-timeout'
  | 'director-invalid-output'
  | 'director-unavailable'
  | 'reference-expired'
  | 'content-blocked'
  | 'provider-rejected'
  | 'provider-busy'
  | 'provider-error'
  | 'provider-invalid-output'
  | 'provider-timeout'
  | 'keyframe-failed'
  | 'video-failed'
  | 'assembly-failed'
  | 'ffmpeg-not-configured'
  | 'assembly-timeout'
  | 'database-unavailable'
  | 'story-not-configured'
  | 'cancel-failed'
  | 'internal-error'

export interface StoryJobError {
  readonly code: StoryErrorCode
  readonly message: string
  readonly retryable: boolean
}

export interface StoryApiError {
  readonly error: StoryJobError & {
    readonly retryAfterSeconds?: number
  }
}

export interface StoryScene {
  readonly id: string
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
  readonly status: SceneStatus
  readonly keyframeUrl: string | null
  readonly keyframeAttempts: number
  readonly videoUrl: string | null
  readonly videoAttempts: number
  readonly error: StoryJobError | null
}

export interface Story {
  readonly id: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
  readonly preset: StoryPreset
  readonly modelId: StoryModelId
  readonly sceneCount: StorySceneCount
  readonly durationSeconds: StorySceneDurationSeconds
  readonly totalDurationSeconds: number
  readonly aspectRatio: StoryAspectRatio
  readonly plan: StoryPlan | null
  readonly scenes: readonly StoryScene[]
  readonly finalVideoUrl: string | null
  readonly finalVideoExpiresAt: string | null
  readonly approvedAt: string | null
  readonly completedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly expiresAt: string
  readonly version: number
  readonly error: StoryJobError | null
  readonly pollAfterMs: number
}

export interface StoryCreateRequest {
  readonly premise: string
  readonly sceneCount: StorySceneCount
  readonly preset: StoryPreset
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: string | null
}

export interface StoryBeatUpdateRequest {
  readonly visualPrompt: string
  readonly narration?: string
  readonly regenerate?: boolean
}

export interface StoryReferenceUploadRequest {
  readonly fileName: string
  readonly contentType: StoryImageMimeType
  readonly sizeBytes: number
}

export interface StoryUploadTicket {
  readonly uploadUrl: string
  readonly fileUrl: string
  readonly expiresAt: string
  readonly uploadHeaders: Readonly<Record<string, string>>
}

export interface StoryReference {
  readonly fileName: string
  readonly contentType: StoryImageMimeType
  readonly sizeBytes: number
  readonly fileUrl: string
  readonly expiresAt: string
}

export interface StoryJob {
  readonly storyId: string
  readonly status: StoryStatus
  readonly version: number
  readonly pollAfterMs: number
}

export type StoryGenerationState =
  | { readonly status: 'idle' }
  | { readonly status: 'creating'; readonly premise: string }
  | { readonly status: 'planning'; readonly premise: string }
  | { readonly status: 'keyframes'; readonly story: Story }
  | { readonly status: 'review'; readonly story: Story }
  | { readonly status: 'videos'; readonly story: Story }
  | { readonly status: 'assembling'; readonly story: Story }
  | { readonly status: 'ready'; readonly story: Story }
  | {
      readonly status: 'failed'
      readonly story: Story
      readonly error: StoryJobError
    }
  | { readonly status: 'cancelled'; readonly story: Story }
  | { readonly status: 'expired'; readonly storyId: string }
```

```ts
// server/story/director-types.ts — SOLO servidor.
export interface DirectorBeat {
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
}

export interface DirectorPlan {
  readonly title: string
  readonly logline: string
  readonly beats: readonly DirectorBeat[]
}

export interface DeepSeekMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content:
    | string
    | readonly (
        | { readonly type: 'text'; readonly text: string }
        | { readonly type: 'image_url'; readonly image_url: { readonly url: string } }
      )[]
}

export interface DeepSeekChatRequest {
  readonly model: 'deepseek-flash'
  readonly messages: readonly DeepSeekMessage[]
  readonly response_format: { readonly type: 'json_object' }
  readonly temperature: number
  readonly max_tokens: number
  readonly stream: false
}
```

```ts
// server/story/repository.ts — SOLO servidor.
export interface StoryRecord {
  readonly id: string
  readonly sessionId: string
  readonly status: StoryStatus
  readonly premise: string
  readonly title: string | null
  readonly logline: string | null
  readonly referenceUrl: string | null
  readonly referenceExpiresAt: Date | null
  readonly preset: StoryPreset
  readonly sceneCount: number
  readonly durationSeconds: number
  readonly aspectRatio: string
  readonly plan: StoryPlan | null
  readonly finalVideoUrl: string | null
  readonly finalVideoExpiresAt: Date | null
  readonly errorCode: StoryErrorCode | null
  readonly errorMessage: string | null
  readonly idempotencyKey: string | null
  readonly version: number
  readonly leaseOwner: string | null
  readonly leaseUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly approvedAt: Date | null
  readonly completedAt: Date | null
  readonly expiresAt: Date
  readonly scenes: readonly SceneRecord[]
}

export interface SceneRecord {
  readonly id: string
  readonly storyId: string
  readonly order: number
  readonly visualPrompt: string
  readonly narration: string
  readonly status: SceneStatus
  readonly keyframeUrl: string | null
  readonly keyframeRequestId: string | null
  readonly keyframeStatusUrl: string | null
  readonly keyframeResponseUrl: string | null
  readonly keyframeCancelUrl: string | null
  readonly keyframeError: StoryErrorCode | null
  readonly videoUrl: string | null
  readonly videoRequestId: string | null
  readonly videoStatusUrl: string | null
  readonly videoResponseUrl: string | null
  readonly videoCancelUrl: string | null
  readonly videoError: StoryErrorCode | null
  readonly keyframeAttempts: number
  readonly videoAttempts: number
  readonly createdAt: Date
  readonly updatedAt: Date
}
```

**Persistido, derivado y UI (no confundir)**:

| Capa | Campos |
|------|--------|
| **Persistido en PostgreSQL** | `Story.status`, `premise`, `title`, `logline`, `referenceUrl`, `referenceExpiresAt`, `preset`, `sceneCount`, `durationSeconds`, `aspectRatio`, `planJson`, `finalVideoUrl`, `finalVideoExpiresAt`, `errorCode`, `errorMessage`, `idempotencyKey`, `version`, `leaseOwner`, `leaseUntil`, `createdAt`, `updatedAt`, `approvedAt`, `completedAt`, `expiresAt`; `Scene.order`, `visualPrompt`, `narration`, `status`, URLs de proveedor, `requestId`, `keyframeError`, `videoError`, `keyframeAttempts`, `videoAttempts`, timestamps. |
| **Derivado en el servidor** | `modelId` (de `preset`), `totalDurationSeconds` (`sceneCount × 6`), `plan` (de `planJson` o de las escenas), `error`/`scenes[].error` (de códigos + Copy Deck), `pollAfterMs` (de estado y configuración), `referenceUrl` expuesta solo si `referenceExpiresAt > now`. |
| **Solo UI** | `StoryGenerationState`, borrador de premisa, estado de subida de la referencia, tiempo transcurrido, paso activo del stepper, conectividad, avisos y foco. |
| **Nunca compartido** | `sessionId`, `idempotencyKey`, `leaseOwner`, `leaseUntil`, `keyframeRequestId`, `videoRequestId`, `keyframeStatusUrl`, `keyframeResponseUrl`, `keyframeCancelUrl`, `videoStatusUrl`, `videoResponseUrl`, `videoCancelUrl`. |

**Invariantes**:

- `PLANNING` existe en el enum Prisma y en `StoryStatus` para trazabilidad, pero no se persiste ni se devuelve en v1: `POST /api/story` planifica antes de crear la fila.
- `app/models/story.ts` MUST NOT contener `File`, `Blob`, `FileList`, `any` ni `unknown` público.
- Todos los campos MUST ser `readonly`; las uniones MUST discriminarse por `status`.
- `Story.status` MUST pertenecer a `StoryStatus`; `Scene.status` a `SceneStatus`.
- `Story.sceneCount` MUST ser 4, 5 o 6; `scenes.length` MUST coincidir con `sceneCount`; `order` MUST ser 1..N único.
- `Story.durationSeconds` MUST ser 6; `totalDurationSeconds` MUST ser `sceneCount × 6`.
- `Story.modelId` MUST corresponder al preset: `fast` → `minimax-hailuo-02`; `quality` → `kling-2.5-turbo-pro`.
- `Story.plan` MUST tener exactamente `sceneCount` beats cuando no es `null`.
- `keyframeAttempts` y `videoAttempts` MUST ser enteros entre 0 y 2.
- `Story.error` MUST ser `null` salvo en `FAILED` o errores recuperables; `StoryScene.error` MUST ser `null` salvo en `KEYFRAME_FAILED`/`VIDEO_FAILED`.
- `finalVideoUrl` MUST ser `null` hasta `READY`; si no es `null`, MUST pasar la allowlist de Fal CDN.
- `pollAfterMs` MUST ser 0 en estados terminales y estar entre 1000 y 10000 en estados activos.
- Ningún modelo compartido contiene endpoints, URLs de proveedor, `requestId`, `sessionId` ni claves.

## API Contract

Todas las rutas viven bajo `/api/story/`, son same-origin, no tienen CORS y devuelven JSON con `Cache-Control: no-store`.

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
| `Idempotency-Key` | Request | Opcional en `POST /api/story` y `POST /api/story/uploads`; 8–128 caracteres `[A-Za-z0-9._~-]`. |
| `Origin` | Request | Si está presente, MUST coincidir con el host; si no, 403 `cross-origin-request`. |
| `Set-Cookie: story_sid=...` | Response | Solo en `POST /api/story` y `POST /api/story/uploads` si no existe; HttpOnly, SameSite=Lax, Path=/, Secure en producción, Max-Age=604800. |
| `Authorization` | Request | MUST NOT aceptarse del cliente. Las claves solo se usan server-side. |

### POST `/api/story`

Crea la historia, llama a DeepSeek y persiste el plan y las escenas.

**Request**:

```json
{
  "premise": "Una repostera descubre que sus postres pueden predecir el futuro.",
  "sceneCount": 5,
  "preset": "fast",
  "referenceUrl": null,
  "referenceExpiresAt": null
}
```

**Validación**:

- `premise`: string, NFC + `trim`, 10–600 caracteres, sin `\0` ni controles C0 salvo `\n`/`\t`.
- `sceneCount`: `4`|`5`|`6`; omitido → `5`.
- `preset`: `fast`|`quality`; omitido → `fast`.
- `referenceUrl`: `null`/omitido o URL de la allowlist de Fal CDN.
- `referenceExpiresAt`: `null` si no hay referencia; si hay referencia, fecha ISO 8601 UTC posterior a `now` y no superior a `now + 3600 s`. Cualquier otra combinación: 400 `invalid-reference`.
- Campos desconocidos: 400 `invalid-request`.
- Body > 16 KiB: 413.
- Rate limit: 429; historia activa: 409; instancia ocupada: 429; presupuesto diario: 429; idempotencia: 409.
- Cross-origin: 403.
- DeepSeek ausente: 503 `director-not-configured`; timeout: 504; JSON inválido: 502.

**Response 201** (`Story`):

```json
{
  "id": "clx0story0001",
  "status": "GENERATING_KEYFRAMES",
  "premise": "Una repostera descubre que sus postres pueden predecir el futuro.",
  "title": "El azúcar lo sabe",
  "logline": "Una repostera descubre que sus postres anticipan lo que va a pasar.",
  "referenceUrl": null,
  "referenceExpiresAt": null,
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "sceneCount": 5,
  "durationSeconds": 6,
  "totalDurationSeconds": 30,
  "aspectRatio": "9:16",
  "plan": {
    "title": "El azúcar lo sabe",
    "logline": "Una repostera descubre que sus postres anticipan lo que va a pasar.",
    "beats": [
      { "order": 1, "visualPrompt": "Una repostera abre su obrador al amanecer.", "narration": "Cada mañana, antes de encender el horno, Clara escucha." }
    ]
  },
  "scenes": [
    {
      "id": "clx0scene0001",
      "order": 1,
      "visualPrompt": "Una repostera abre su obrador al amanecer.",
      "narration": "Cada mañana, antes de encender el horno, Clara escucha.",
      "status": "PENDING",
      "keyframeUrl": null,
      "keyframeAttempts": 0,
      "videoUrl": null,
      "videoAttempts": 0,
      "error": null
    }
  ],
  "finalVideoUrl": null,
  "finalVideoExpiresAt": null,
  "approvedAt": null,
  "completedAt": null,
  "createdAt": "2026-10-21T18:00:00.000Z",
  "updatedAt": "2026-10-21T18:00:00.000Z",
  "expiresAt": "2026-10-22T18:00:00.000Z",
  "version": 1,
  "error": null,
  "pollAfterMs": 2500
}
```

*El ejemplo muestra una escena por brevedad; la respuesta real contiene `sceneCount` escenas y `plan.beats` con `sceneCount` beats.*

**Errores**: 400 `invalid-request`, `premise-required`, `premise-too-long`, `invalid-premise`, `invalid-scene-count`, `invalid-preset`, `invalid-reference`; 403; 409 `story-in-progress`/`idempotency-conflict`; 413; 415; 422 `content-blocked`; 429 `rate-limited`/`server-busy`/`daily-budget-exhausted`; 502 `director-invalid-output`; 503 `director-not-configured`/`director-unavailable`/`database-unavailable`; 504 `director-timeout`; 500 `internal-error`.

### GET `/api/story/{id}`

`{id}` es el `cuid` de la historia. No hay token firmado; el ownership lo da `story_sid`.

**Response 200 — en revisión**:

```json
{
  "id": "clx0story0001",
  "status": "WAITING_APPROVAL",
  "title": "El azúcar lo sabe",
  "logline": "Una repostera descubre que sus postres anticipan lo que va a pasar.",
  "preset": "fast",
  "modelId": "minimax-hailuo-02",
  "sceneCount": 5,
  "durationSeconds": 6,
  "totalDurationSeconds": 30,
  "aspectRatio": "9:16",
  "approvedAt": null,
  "completedAt": null,
  "finalVideoUrl": null,
  "finalVideoExpiresAt": null,
  "version": 14,
  "error": null,
  "pollAfterMs": 2500,
  "scenes": [
    {
      "id": "clx0scene0001",
      "order": 1,
      "visualPrompt": "Una repostera abre su obrador al amanecer.",
      "narration": "Cada mañana, antes de encender el horno, Clara escucha.",
      "status": "KEYFRAME_READY",
      "keyframeUrl": "https://v3.fal.media/files/<opaque-id>/scene-1.jpeg",
      "keyframeAttempts": 1,
      "videoUrl": null,
      "videoAttempts": 0,
      "error": null
    }
  ]
}
```

*El ejemplo de revisión omite por brevedad los campos `premise`, `referenceUrl`, `referenceExpiresAt`, `plan`, `createdAt`, `updatedAt`, `expiresAt` y las escenas 2–5. La respuesta real cumple el Data Contract completo.*

**Response 200 — listo**: incluye `status: "READY"`, `finalVideoUrl`, `finalVideoExpiresAt`, `completedAt`, `pollAfterMs: 0` y todas las escenas `VIDEO_READY`.

**Errores**: 404 `story-not-found` (inexistente, ajena, cookie ausente), 410 `story-expired`, 429 `rate-limited`, 503 `database-unavailable`, 500 `internal-error`.

### POST `/api/story/uploads`

**Request**:

```json
{
  "fileName": "actor.webp",
  "contentType": "image/webp",
  "sizeBytes": 482133
}
```

**Response 200**:

```json
{
  "uploadUrl": "<signed-upload-url>",
  "fileUrl": "https://v3.fal.media/files/<opaque-id>/story-ref-<opaque-id>.webp",
  "expiresAt": "2026-10-21T19:00:00.000Z",
  "uploadHeaders": {
    "Content-Type": "image/webp"
  }
}
```

**Errores**: 400 `reference-empty`, `reference-too-large`, `unsupported-reference-type`, `invalid-file-name`, `invalid-request`; 403; 413; 415; 429; 502 `provider-error`; 503 `ai-not-configured`/`database-unavailable`; 504 `provider-timeout`.

### POST `/api/story/{id}/beats/{beatId}/keyframe`

`beatId` es el `Scene.id`, no el `order`.

**Request**:

```json
{
  "visualPrompt": "Una repostera abre su obrador al amanecer, luz cálida.",
  "narration": "Cada mañana, antes de encender el horno, Clara escucha.",
  "regenerate": true
}
```

**Validación**:

- `visualPrompt`: 20–600, sin HTML/Markdown ni controles.
- `narration`: opcional, 10–280.
- `regenerate`: booleano; default `true`.
- Campos desconocidos: 400.
- Body > 8 KiB: 413.
- Historia `WAITING_APPROVAL` o `FAILED` con `keyframe-failed`; escena `KEYFRAME_READY`/`KEYFRAME_FAILED`; intentos < 2.

**Response 202**:

```json
{
  "storyId": "clx0story0001",
  "status": "GENERATING_KEYFRAMES",
  "version": 15,
  "pollAfterMs": 2500
}
```

**Errores**: 400 `invalid-visual-prompt`/`invalid-narration`/`invalid-request`; 403; 404 `story-not-found`/`beat-not-found`; 409 `scene-not-ready`/`story-not-ready`/`keyframe-limit-reached`; 413; 415; 429 `rate-limited`/`story-budget-exhausted`; 503 `database-unavailable`; 500.

### POST `/api/story/{id}/approve`

**Request**: sin body; `Content-Type` no requerido.

**Response 202**:

```json
{
  "storyId": "clx0story0001",
  "status": "GENERATING_VIDEOS",
  "version": 20,
  "pollAfterMs": 2500
}
```

**Errores**: 403; 404; 409 `story-not-ready`; 429 `story-budget-exhausted`/`rate-limited`; 503; 500. Si ya está `GENERATING_VIDEOS` o posterior, 202 idempotente.

### POST `/api/story/{id}/beats/{beatId}/retry`

**Response 202**:

```json
{
  "storyId": "clx0story0001",
  "status": "GENERATING_VIDEOS",
  "version": 27,
  "pollAfterMs": 2500
}
```

**Errores**: 403; 404; 409 `scene-not-ready`/`video-retry-limit-reached`/`story-not-ready`; 429 `story-budget-exhausted`/`rate-limited`; 503; 500.

### POST `/api/story/{id}/assemble`

**Response 202**:

```json
{
  "storyId": "clx0story0001",
  "status": "VIDEOS_READY",
  "version": 31,
  "pollAfterMs": 2500
}
```

**Errores**: 403; 404; 409 `story-not-ready`; 429 `assembly-busy`/`rate-limited`; 503 `ffmpeg-not-configured`/`database-unavailable`; 500. Si ya está `ASSEMBLING`, 202 idempotente; si `READY`, 202 sin reensamblar.

### POST `/api/story/{id}/cancel`

**Response 200** (`Story`):

```json
{
  "id": "clx0story0001",
  "status": "CANCELLED",
  "version": 33,
  "pollAfterMs": 0,
  "scenes": [
    {
      "id": "clx0scene0001",
      "order": 1,
      "status": "CANCELLED"
    }
  ]
}
```

*La respuesta real incluye el `Story` completo con todos los campos del Data Contract.*

- Si ya está `CANCELLED`, MUST devolver 200 con el mismo cuerpo.
- Si está `READY` o `FAILED`, 409 `story-not-cancellable`.
- La cancelación de jobs de Fal es best-effort; si Fal falla, se registra y la historia queda `CANCELLED` igualmente (`cancel-failed` solo si la cancelación local falla).

**Errores**: 403; 404 `story-not-found`; 409 `story-not-cancellable`; 429 `rate-limited`; 503 `database-unavailable`; 500 `internal-error`.

### Tabla de errores HTTP

| HTTP | Código | Retryable | Mensaje normativo |
|------|--------|-----------|-------------------|
| 400 | `invalid-request` | false | `La solicitud no es válida.` |
| 400 | `premise-required` | false | `Escribe una premisa para crear tu historia.` |
| 400 | `premise-too-long` | false | `La premisa no puede superar los 600 caracteres.` |
| 400 | `invalid-premise` | false | `La premisa contiene caracteres no admitidos.` |
| 400 | `invalid-scene-count` | false | `El número de escenas no es válido. Elige entre 4 y 6.` |
| 400 | `invalid-preset` | false | `El estilo de generación no es válido.` |
| 400 | `invalid-reference` | false | `La imagen de referencia no es válida.` |
| 400 | `reference-empty` | false | `El archivo está vacío.` |
| 400 | `reference-too-large` | false | `La imagen supera el máximo de 8 MB.` |
| 400 | `unsupported-reference-type` | false | `Formato no admitido. Usa PNG, JPG o WebP.` |
| 400 | `invalid-file-name` | false | `El nombre del archivo no es válido.` |
| 400 | `invalid-visual-prompt` | false | `El prompt visual no es válido.` |
| 400 | `invalid-narration` | false | `La narración no es válida.` |
| 403 | `cross-origin-request` | false | `La solicitud no está permitida.` |
| 404 | `story-not-found` | false | `Esta historia no está disponible en este navegador.` |
| 404 | `beat-not-found` | false | `La escena no existe en esta historia.` |
| 409 | `story-not-ready` | false | `La historia aún no está lista para esta acción.` |
| 409 | `scene-not-ready` | false | `La escena no está en el estado necesario para esta acción.` |
| 409 | `keyframe-limit-reached` | false | `Esta escena ya no puede regenerar la imagen.` |
| 409 | `video-retry-limit-reached` | false | `Esta escena ya no puede reintentar el vídeo.` |
| 409 | `story-in-progress` | false | `Ya tienes una historia en curso. Termínala o cancélala primero.` |
| 409 | `idempotency-conflict` | false | `La solicitud entra en conflicto con otra anterior.` |
| 409 | `story-not-cancellable` | false | `Esta historia ya ha terminado y no se puede cancelar.` |
| 410 | `story-expired` | false | `Esta historia ya no está disponible. Empieza de nuevo.` |
| 413 | `payload-too-large` | false | `La solicitud es demasiado grande.` |
| 415 | `unsupported-media-type` | false | `El formato de la solicitud no es válido.` |
| 422 | `content-blocked` | false | `El contenido no cumple las políticas del proveedor. Cambia la premisa o la imagen.` |
| 422 | `provider-rejected` | false | `No se pudo generar una escena con estos datos. Cambia la premisa o la imagen.` |
| 429 | `rate-limited` | true | `Has alcanzado el límite de historias. Inténtalo de nuevo más tarde.` |
| 429 | `server-busy` | true | `El estudio está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.` |
| 429 | `story-budget-exhausted` | false | `Esta historia ha alcanzado su límite de 8 dólares. Empieza una nueva.` |
| 429 | `daily-budget-exhausted` | false | `El estudio ha alcanzado su límite diario. Inténtalo mañana.` |
| 429 | `assembly-busy` | true | `El montaje está ocupado ahora mismo. Inténtalo de nuevo en unos segundos.` |
| 502 | `director-invalid-output` | true | `La IA no devolvió un guion válido. Inténtalo de nuevo.` |
| 502 | `provider-error` | true | `El servicio de generación no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 502 | `provider-invalid-output` | true | `El proveedor devolvió un resultado no válido. Inténtalo de nuevo.` |
| 502 | `keyframe-failed` | false | `No se pudieron crear todas las imágenes de la historia.` |
| 502 | `video-failed` | false | `No se pudieron generar todos los vídeos de la historia.` |
| 502 | `assembly-failed` | true | `No se pudo montar el vídeo final. Puedes reintentar el montaje.` |
| 502 | `cancel-failed` | true | `No se pudo cancelar la historia. Inténtalo de nuevo.` |
| 503 | `director-not-configured` | false | `La creación de historias no está disponible ahora mismo.` |
| 503 | `director-unavailable` | false | `El servicio de guion no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 503 | `provider-busy` | true | `El servicio de generación está ocupado ahora mismo. Inténtalo de nuevo en unos minutos.` |
| 503 | `ffmpeg-not-configured` | false | `El montaje de vídeo no está disponible ahora mismo.` |
| 503 | `database-unavailable` | true | `No se pudo acceder a la historia. Inténtalo de nuevo.` |
| 503 | `story-not-configured` | false | `La creación de historias no está disponible ahora mismo.` |
| 504 | `director-timeout` | true | `La IA tardó demasiado en escribir el guion. Inténtalo de nuevo.` |
| 504 | `provider-timeout` | true | `La generación está tardando más de lo esperado. Inténtalo de nuevo.` |
| 504 | `assembly-timeout` | true | `El montaje tardó demasiado. Puedes reintentarlo.` |
| 500 | `internal-error` | false | `Algo salió mal. Inténtalo de nuevo.` |

**Regla de mapeo**: La tabla incluye códigos de respuesta HTTP y códigos de resultado que pueden aparecer en `Story.error` o `StoryScene.error` (`keyframe-failed`, `video-failed`, `assembly-failed`, `reference-expired`, `cancel-failed`). Un código de resultado no se devuelve como HTTP de una ruta de comando salvo que se indique.

- DeepSeek 400/422 → `director-invalid-output` o `content-blocked` si el payload indica política.
- DeepSeek 401/403/429/5xx → `director-unavailable` (503), sin reintento y sin mensaje crudo.
- Fal 400/422 → `provider-rejected` o `content-blocked` si el payload indica política/NSFW.
- Fal 401/403 → `provider-error` (502) o `provider-busy` (503) según el caso, nunca 401/403 al cliente.
- Fal 402 → `provider-error` (502), sin detalle de créditos.
- Fal 429 → 503 `provider-busy` con `Retry-After` si existe.
- Fal 5xx → 502 `provider-error`; timeout → 504 `provider-timeout`.
- Prisma no disponible → 503 `database-unavailable`; error de validación/constraint inesperado → 500 `internal-error`.
- FFmpeg ausente → 503 `ffmpeg-not-configured`; timeout → 504 `assembly-timeout`; salida inválida → 502 `assembly-failed`.

**Traducción `ComposerError` → `StoryErrorCode`** (frontera `server/story`):

| `ComposerError.code` | `StoryErrorCode` |
|----------------------|------------------|
| `content-blocked` | `content-blocked` |
| `provider-rejected` | `provider-rejected` |
| `provider-busy` | `provider-busy` |
| `provider-error` | `provider-error` |
| `provider-invalid-output` | `provider-invalid-output` |
| `provider-timeout` | `provider-timeout` |
| `ai-unavailable` | `provider-error` |
| `ai-credits-exhausted` | `provider-error` |
| `ai-not-configured` | `story-not-configured` |
| `job-not-cancellable` | `scene-not-ready` |
| `cancel-failed` | `cancel-failed` |
| `internal-error` | `internal-error` |

La traducción MUST preservar `retryAfterSeconds` cuando exista y MUST NOT copiar el mensaje crudo.

## Prisma / Data Model

### Modelos existentes (no se cambian)

`prisma/schema.prisma` ya contiene:

- `enum StoryStatus`: `PLANNING`, `GENERATING_KEYFRAMES`, `WAITING_APPROVAL`, `GENERATING_VIDEOS`, `VIDEOS_READY`, `ASSEMBLING`, `READY`, `FAILED`, `CANCELLED`.
- `enum SceneStatus`: `PENDING`, `KEYFRAME_QUEUED`, `KEYFRAME_RUNNING`, `KEYFRAME_READY`, `KEYFRAME_FAILED`, `VIDEO_QUEUED`, `VIDEO_RUNNING`, `VIDEO_READY`, `VIDEO_FAILED`, `CANCELLED`.
- `Story`: `id`, `sessionId`, `status`, `premise`, `title`, `logline`, `referenceUrl`, `referenceExpiresAt`, `preset`, `sceneCount`, `durationSeconds`, `aspectRatio`, `planJson`, `finalVideoUrl`, `finalVideoExpiresAt`, `errorCode`, `errorMessage`, `idempotencyKey`, `version`, `leaseOwner`, `leaseUntil`, `createdAt`, `updatedAt`, `approvedAt`, `completedAt`, `expiresAt`, `scenes`.
- `Scene`: `id`, `storyId`, `order`, `visualPrompt`, `narration`, `status`, URLs/IDs de keyframe y vídeo, errores, `keyframeAttempts`, `videoAttempts`, timestamps, relación cascade.
- Índices: `@@unique([sessionId, idempotencyKey])`, `@@index([sessionId])`, `@@index([sessionId, status])`, `@@index([status, leaseUntil])`, `@@index([expiresAt])`, `@@unique([storyId, order])`, `@@index([storyId, status])`.

No se requiere ningún campo nuevo. `PLANNING` queda reservado y no se persiste en v1. Si el montaje necesitara un contador de intentos, se abrirá una enmienda de schema; no se añade ahora.

### Migraciones y entornos

| Entorno | Base de datos | `DATABASE_URL` | `DIRECT_URL` |
|---------|---------------|----------------|--------------|
| Desarrollo | PostgreSQL 17 en Docker (`docker-compose.yml`) | `postgresql://ai_shorts:ai_shorts@localhost:5432/ai_shorts?schema=public` | Igual. |
| Producción | Supabase PostgreSQL | Pooled, puerto 6543, `?pgbouncer=true&schema=public` | Directo, puerto 5432, `?schema=public` |

Comandos:

```bash
docker compose up -d postgres
npx prisma validate
npx prisma migrate dev --name init
npm run db:generate
npm run test:run
npm run build
# Producción
npm run db:deploy
```

Reglas:

- `prisma.config.ts` MUST seguir usando `DIRECT_URL` para migraciones.
- `server/db/prisma.ts` MUST usar `DATABASE_URL` y `PrismaPg`; inicialización perezosa.
- `server/generated/` está gitignored; `db:generate` es obligatorio antes de build/test cuando Story importe Prisma.
- No se usa `db push` en producción ni `migrate reset` fuera de local.
- Backups: PITR o backup diario de Supabase en producción; volumen Docker en local. El cleanup de historias expiradas no sustituye el backup.

### Repositorio

- `server/story/repository.ts`: interfaz `StoryRepository`.
- `server/story/prisma-story-repository.ts`: implementación con Prisma 7.
- `server/db/prisma.ts`: `getPrisma()` singleton, sin lanzar al importar.

Métodos mínimos:

```ts
export interface StoryRepository {
  createStory(input: CreateStoryRecord): Promise<StoryRecord>
  findOwnedById(id: string, sessionId: string): Promise<StoryRecord | null>
  findById(id: string): Promise<StoryRecord | null>
  listClaimable(now: Date, limit: number): Promise<StoryRecord[]>
  claim(id: string, owner: string, leaseUntil: Date, now: Date): Promise<boolean>
  release(id: string, owner: string): Promise<void>
  updateStory(id: string, guard: StoryGuard, patch: StoryPatch): Promise<number>
  updateScene(storyId: string, sceneId: string, guard: SceneGuard, patch: ScenePatch): Promise<number>
  cancel(id: string, sessionId: string, now: Date): Promise<boolean>
  countActive(sessionId: string): Promise<number>
  deleteExpired(cutoff: Date, limit: number): Promise<number>
}
```

- `createStory` MUST usar una transacción con `story.create` y `scenes.createMany`/nested create.
- `findOwnedById`/`findById` MUST devolver las escenas ordenadas por `order` ascendente.
- `claim` MUST usar `updateMany` con las condiciones de estado y lease.
- `updateStory`/`updateScene` MUST usar `updateMany` con guardas de `status` y/o `version`; devuelven el número de filas afectadas.
- `cancel` MUST usar transacción: `Story.status = CANCELLED`, `Scene.status = CANCELLED` para las no terminales, `version + 1`.
- `listClaimable` MUST ordenar por `updatedAt` ascendente y limitar a 5.
- `deleteExpired` MUST borrar en cascada y devolver el número de filas.
- `CreateStoryRecord`, `StoryGuard`, `SceneGuard`, `StoryPatch` y `ScenePatch` se definen en `repository.ts` como tipos server-only; no se exportan a `app/`.

## Server Architecture / SOLID

### Estructura normativa

| Archivo | Responsabilidad |
|---------|-----------------|
| `server/api/story/index.post.ts` | Ruta fina: valida, rate limit, idempotencia, llama a `StoryService.create`, devuelve 201. |
| `server/api/story/[id].get.ts` | Ruta fina: valida sesión/ownership, llama a `StoryService.get`, serializa. |
| `server/api/story/uploads.post.ts` | Ruta fina: valida metadata, rate limit, llama a `FalStorageService.initiate` con prefijo `story-ref-`. |
| `server/api/story/[id]/approve.post.ts` | Ruta fina: `StoryService.approve`. |
| `server/api/story/[id]/cancel.post.ts` | Ruta fina: `StoryService.cancel`. |
| `server/api/story/[id]/assemble.post.ts` | Ruta fina: `StoryService.requestAssembly`. |
| `server/api/story/[id]/beats/[beatId]/keyframe.post.ts` | Ruta fina: `StoryService.updateBeatAndRegenerate`. |
| `server/api/story/[id]/beats/[beatId]/retry.post.ts` | Ruta fina: `StoryService.retryVideo`. |
| `server/story/director.ts` | Cliente DeepSeek, timeout, reintento de JSON, mapeo de errores. |
| `server/story/director-prompt.ts` | Prompt de sistema, esquema JSON y plantilla de reparación. |
| `server/story/director-types.ts` | DTOs server-only de DeepSeek. |
| `server/story/plan-validator.ts` | Type guards y validación del plan (beats, longitudes, HTML/Markdown). |
| `server/story/story-service.ts` | Casos de uso: crear, obtener, actualizar beat, aprobar, reintentar, montar, cancelar. |
| `server/story/keyframe-orchestrator.ts` | Submit/estado/resultado/cancelación de keyframes. |
| `server/story/video-orchestrator.ts` | Submit/estado/resultado/cancelación de vídeos. |
| `server/story/reconciler.ts` | Claim por lease, transiciones agregadas, concurrencia y cleanup. |
| `server/story/assembly-service.ts` | Descarga, normalización, concatenación, verificación y subida final. |
| `server/story/ffmpeg-runner.ts` | `spawn` sin shell, timeouts, `SIGKILL`, captura de stderr acotada. |
| `server/story/media-downloader.ts` | Descarga allowlisted a archivo con límites y limpieza. |
| `server/story/repository.ts` | Interfaz de persistencia. |
| `server/story/prisma-story-repository.ts` | Implementación Prisma y mapeo enum/DB ↔ dominio. |
| `server/story/validation.ts` | Validación de bodies, premisa, escenas, prompts, narración, referencia e idempotencia. |
| `server/story/session.ts` | Cookie `story_sid`, lectura/creación, IP hash y same-origin. |
| `server/story/rate-limit.ts` | Ventanas, concurrencia, presupuesto diario y mapas acotados. |
| `server/story/cost.ts` | Cálculo del coste estimado y comparación con 8 USD. |
| `server/story/errors.ts` | `StoryError`, definiciones, HTTP, retryable, mensajes y serialización. |
| `server/story/runtime.ts` | Composición de dependencias, configuración e inyección para tests. |
| `server/fal/media-storage.ts` | Subida server-side del MP4 final al CDN de Fal. |
| `server/fal/http-client.ts` | Ampliación aditiva: `uploadBinary` opcional. |
| `server/fal/storage-service.ts` | Ampliación aditiva: `filePrefix` y `lifecycleSeconds` opcionales con defaults de 004. |
| `server/db/prisma.ts` | Inicialización perezosa de Prisma. |
| `server/plugins/story-reconciler.ts` | Arranque único del reconciliador; no-op en test o sin DB. |

### Contratos internos

```ts
// server/story/director.ts
export interface StoryDirector {
  createPlan(input: {
    readonly premise: string
    readonly sceneCount: StorySceneCount
    readonly referenceUrl: string | null
  }): Promise<DirectorPlan>
}

// server/story/keyframe-orchestrator.ts
export interface ProviderSubmission {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
  readonly cancelUrl: string
}

export type KeyframePollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly keyframeUrl: string }

export interface KeyframeOrchestrator {
  submit(scene: SceneRecord, story: StoryRecord): Promise<ProviderSubmission>
  poll(scene: SceneRecord): Promise<KeyframePollResult>
  cancel(scene: SceneRecord): Promise<void>
}

// server/story/video-orchestrator.ts
export type VideoPollResult =
  | { readonly state: 'IN_QUEUE' | 'IN_PROGRESS' }
  | { readonly state: 'COMPLETED'; readonly videoUrl: string }

export interface VideoOrchestrator {
  submit(scene: SceneRecord, story: StoryRecord): Promise<ProviderSubmission>
  poll(scene: SceneRecord): Promise<VideoPollResult>
  cancel(scene: SceneRecord): Promise<void>
}

// server/fal/http-client.ts — ampliación aditiva.
import type { Readable } from 'node:stream'

export interface FalBinaryUploadRequest {
  readonly url: string
  readonly body: Uint8Array | Readable
  readonly contentType: string
  readonly timeoutMs: number
}

export interface FalHttpClient {
  request<T>(request: FalHttpRequest): Promise<FalHttpResponse<T>>
  uploadBinary?(request: FalBinaryUploadRequest): Promise<FalHttpResponse<unknown>>
}

// server/fal/media-storage.ts — SOLO servidor.
export interface MediaStorage {
  uploadFile(input: {
    readonly filePath: string
    readonly fileName: string
    readonly contentType: 'video/mp4'
    readonly lifecycleSeconds: number
  }): Promise<{ readonly fileUrl: string; readonly expiresAt: string }>
}

// server/story/assembly-service.ts
export interface StoryAssembler {
  assemble(input: {
    readonly storyId: string
    readonly clips: readonly { readonly order: number; readonly url: string }[]
    readonly signal?: AbortSignal
  }): Promise<{
    readonly fileUrl: string
    readonly expiresAt: string
    readonly width: 720
    readonly height: 1280
    readonly durationSeconds: number
  }>
}
```

Reglas:

- `server/api/story/**` MUST ser fino: parsear, validar, autorizar, delegar y serializar. MUST NOT contener lógica de proveedor, Prisma ni FFmpeg.
- `StoryService` MUST recibir por inyección `StoryRepository`, `StoryDirector`, `KeyframeOrchestrator`, `VideoOrchestrator`, `RateLimiter`, `CostGuard`, `Clock` y configuración.
- El reconciliador MUST recibir por inyección `StoryRepository`, `KeyframeOrchestrator`, `VideoOrchestrator`, `StoryAssembler`, `CostGuard`, `Clock` y configuración de leases.
- `FalHttpClient` MUST serguir siendo la única pieza que conoce `fetch` a Fal, `Authorization: Key` y los orígenes permitidos. Los adaptadores MUST NOT leer `process.env` ni `useRuntimeConfig`.
- El cliente DeepSeek MUST ser independiente del cliente Fal y MUST tener su propio origen fijo y timeout.
- `server/story/**` MUST NOT importar `server/composer/**`, `app/components/**`, `app/composables/**`, `app/pages/**` ni `app/utils/**` de UI. Solo puede importar tipos de `app/models/story.ts` y primitivas de `server/fal/` y `server/shared/`.
- `app/**` MUST NOT importar `server/**`, `@prisma/client` ni `node:crypto`.
- No se usa `any`. Se permite `unknown` en la frontera de proveedor y se estrecha con type guards.
- Los tests MUST poder inyectar un runtime fake en `event.context.storyRuntime` sin tocar módulos globales.

### Plantillas de prompt normativas

```text
storyKeyframeFlux(visualPrompt) =
  `Cinematic vertical 9:16 keyframe for a short film. ${visualPrompt}. Single clear subject, natural lighting, photorealistic, no text, no watermark, no logo.`

storyKeyframeKontext(visualPrompt) =
  `Using the reference image as the visual anchor, create a cinematic vertical 9:16 keyframe for a short film. ${visualPrompt}. Preserve subject identity, clothing and color palette. No text, no watermark, no logo.`

storyVideoPrompt(visualPrompt) =
  `${visualPrompt}. Vertical 9:16 short film scene, smooth natural motion, consistent subject, no text, no watermark, no logo.`

storyDirectorSystemPrompt(sceneCount) =
  `Eres un director de micro-relatos verticales. Devuelve un objeto JSON con "title", "logline" y "beats". ` +
  `Debe haber exactamente ${sceneCount} beats con "order" consecutivo desde 1, "visualPrompt" y "narration". ` +
  `Escribe en español, sin HTML, sin Markdown, sin texto que deba aparecer en pantalla. ` +
  `Cada visualPrompt describe una imagen vertical 9:16 coherente con las demás; cada narration es una frase breve para leer en la interfaz.`
```

- El `visualPrompt` MUST insertarse literalmente, sin HTML y sin interpolar valores no escapados.
- El prompt del director MUST pedir JSON y el esquema; el reintento de reparación MUST incluir el esquema y el error de validación.
- El hash de la premisa (`sha256`) se guarda en logs; la premisa completa no.
- La `narration` MUST NOT formar parte del prompt de vídeo ni del keyframe.

### Runtime

`server/story/runtime.ts` MUST:

- Leer `useRuntimeConfig(event)` para `falKey`, `deepseekKey`, `story.*` y las URLs base de test.
- Construir `FalHttpClient`, `FalQueueService`, `FalStorageService`, `MediaStorage`, `StoryDirector`, `PrismaStoryRepository`, `RateLimiter`, `CostGuard`, `StoryService` y `StoryAssembler`.
- Cachear por firma de configuración, como `server/composer/runtime.ts`.
- Exponer `getStoryRuntime(event)` y una vía de override para tests.
- No lanzar si faltan claves; `hasFalKey`, `hasDeepSeekKey` y `hasDatabase` permiten que las rutas devuelvan 503 estables.

## State Machine

### Estados globales

| Estado | Persistido | Significado | UI |
|--------|------------|-------------|----|
| `PLANNING` | No en v1 (reservado) | DeepSeek planifica antes de crear la fila. | `Escribiendo el guion`. |
| `GENERATING_KEYFRAMES` | Sí | Al menos una escena no está lista y no hay fallo terminal. | `Preparando las imágenes`. |
| `WAITING_APPROVAL` | Sí | Las `sceneCount` escenas están `KEYFRAME_READY`. | Revisión con tarjetas. |
| `GENERATING_VIDEOS` | Sí | Hay vídeos en curso o pendientes de reintento. | `Generando los vídeos`. |
| `VIDEOS_READY` | Sí | Todas las escenas están `VIDEO_READY`; falta montar. | `Montando el vídeo final` (cola). |
| `ASSEMBLING` | Sí | FFmpeg trabaja con lease activo. | Etapas de montaje. |
| `READY` | Sí | `finalVideoUrl` existe y es válido. | Resultado con `<video>`. |
| `FAILED` | Sí | Fallo terminal con `errorCode`. | Error con acción. |
| `CANCELLED` | Sí | Cancelación confirmada. | `Historia cancelada.`. |

### Estados por escena

| Estado | Significado | Siguiente |
|--------|-------------|-----------|
| `PENDING` | Creada, sin submit de keyframe. | `KEYFRAME_QUEUED` |
| `KEYFRAME_QUEUED` | Programada (`requestId = null`) o en cola de Fal (`requestId != null`). | `KEYFRAME_RUNNING` / `KEYFRAME_FAILED` |
| `KEYFRAME_RUNNING` | Fal la está generando. | `KEYFRAME_READY` / `KEYFRAME_FAILED` |
| `KEYFRAME_READY` | Keyframe válido. | `KEYFRAME_QUEUED` (regeneración) / `VIDEO_QUEUED` (aprobada) |
| `KEYFRAME_FAILED` | Falló; puede reintentarse si `keyframeAttempts < 2`. | `KEYFRAME_QUEUED` |
| `VIDEO_QUEUED` | Programada (`videoRequestId = null`) o en cola. | `VIDEO_RUNNING` / `VIDEO_FAILED` |
| `VIDEO_RUNNING` | Fal genera el vídeo. | `VIDEO_READY` / `VIDEO_FAILED` |
| `VIDEO_READY` | Clip listo. | `CANCELLED` (cancelación) |
| `VIDEO_FAILED` | Falló; puede reintentarse si `videoAttempts < 2`. | `VIDEO_QUEUED` |
| `CANCELLED` | Cancelada. | Terminal. |

### Transiciones globales

| Estado actual | Evento | Estado siguiente | Efecto |
|---------------|--------|------------------|--------|
| — | `POST /api/story` válido + DeepSeek OK | `GENERATING_KEYFRAMES` | Crea `Story` + `Scene[]` con `PENDING`; `version = 1`. |
| `GENERATING_KEYFRAMES` | Todas `KEYFRAME_READY` | `WAITING_APPROVAL` | `version++`; `approvedAt = null`. |
| `GENERATING_KEYFRAMES` | Alguna `KEYFRAME_FAILED`, ninguna activa | `FAILED` | `errorCode = keyframe-failed`. |
| `WAITING_APPROVAL` | Regenerar una escena | `GENERATING_KEYFRAMES` | Escena `KEYFRAME_QUEUED`; `approvedAt = null`; `version++`. |
| `WAITING_APPROVAL` | `approve` | `GENERATING_VIDEOS` | `approvedAt = now`; `version++`. |
| `GENERATING_VIDEOS` | Todas `VIDEO_READY` | `VIDEOS_READY` | `version++`. |
| `GENERATING_VIDEOS` | Alguna `VIDEO_FAILED`, ninguna activa | `FAILED` | `errorCode = video-failed`. |
| `GENERATING_VIDEOS` | `retry` de una escena fallida | `GENERATING_VIDEOS` | Escena `VIDEO_QUEUED`; `attempts++`. |
| `VIDEOS_READY` | Claim del reconciliador | `ASSEMBLING` | Lease + `version++`. |
| `ASSEMBLING` | Ensamblaje OK | `READY` | `finalVideoUrl`, `finalVideoExpiresAt`, `completedAt`. |
| `ASSEMBLING` | Ensamblaje falla | `FAILED` | `errorCode = assembly-failed`/`assembly-timeout`. |
| `FAILED` (`keyframe-failed`) | `retry` de escena | `GENERATING_KEYFRAMES` | Escena `KEYFRAME_QUEUED`; limpia error global. |
| `FAILED` (`video-failed`) | `retry` de escena | `GENERATING_VIDEOS` | Escena `VIDEO_QUEUED`; limpia error global. |
| `FAILED` (`assembly-failed`/`assembly-timeout`) | `assemble` | `VIDEOS_READY` | Limpia error; el reconciliador reintenta. |
| Activa | `cancel` | `CANCELLED` | Escenas `CANCELLED`; cancela jobs best-effort. |
| `CANCELLED` | `cancel` | `CANCELLED` | 200 idempotente. |
| `READY` | `cancel` | — | 409 `story-not-cancellable`. |

### Reglas de intentos, aprobación y cancelación

- `keyframeAttempts` se incrementa antes del submit; máximo 2. La regeneración manual y el reintento de un fallo comparten ese único intento extra.
- `videoAttempts` se incrementa antes del submit; máximo 2.
- La aprobación exige todas las escenas `KEYFRAME_READY`; cualquier regeneración la invalida con `approvedAt = null`.
- Los vídeos no se envían hasta que `approve` persiste `GENERATING_VIDEOS`.
- `cancel` es best-effort: si Fal ya procesó un job, puede cobrarlo. La UI lo documenta.
- Un job ya enviado no se puede deshacer; `cancel` llama a `cancelUrl` cuando existe.
- El reconciliador MUST comprobar el estado antes de cada submit; una historia `CANCELLED` no recibe submits nuevos.
- El reconciliador MUST liberar el lease aunque falle; un lease expirado permite la recuperación.

### Leases y recuperación

- `leaseOwner` es un identificador aleatorio por proceso/tick (`story-reconciler-<random>`); `leaseUntil = now + 60 s`.
- El claim es un `updateMany` atómico; si afecta a 0 filas, otra instancia lo tiene.
- El procesamiento de una historia MUST durar menos que el lease (presupuesto 45 s). Si se acerca al límite, MUST terminar el paso actual y liberar.
- Crash con lease activo: tras 60 s, otro tick lo reclama. Si `status = ASSEMBLING` y no hay `finalVideoUrl`, se reintenta el montaje con un directorio nuevo.
- Crash entre submit y persistencia del `requestId`: ventana residual. Se mitiga con intentos persistidos, lease amplio y comprobación de estado; se documenta como riesgo aceptado.
- `version` se incrementa en cada escritura; sirve para detectar carreras y para que el cliente sepa si el snapshot cambió.
- No hay worker durable ni cola propia: el reconciliador es un temporizador de proceso. Si el proceso se cae, la historia se recupera al reiniciar y reclamar.

## UI/UX Contract

### Estructura de pantalla

```text
/story
Header: marca AI Shorts · badge BETA · Volver al feed
Main:
  h1: Crea una historia con IA
  intro
  noscript
  Stepper: Guion · Imágenes · Vídeos · Resultado
  status (role=status, sr-only cuando vacío)
  Form card
    h2 Tu historia
    label + textarea + contador + ayuda + error
    fieldset/radiogroup: Escenas (4 / 5 / 6)
    fieldset/radiogroup: Calidad de vídeo (Rápido / Calidad)
    section Imagen de referencia (opcional)
    aviso de privacidad
    Crear historia
  [creating/planning] Progress card: Escribiendo el guion
  [error] alert block

/story/[id]
Header: marca AI Shorts · badge BETA · Volver al feed
Main:
  h1 Tu historia
  status (role=status)
  [keyframes] Progress card: Preparando las imágenes
  [review] Review card:
    h2 Revisa las imágenes
    intro
    ul de escenas:
      li: h3 Escena n de total
          <img> keyframe
          Narración (solo en pantalla)
          Prompt visual (textarea)
          Imagen n de 2
          Guardar y regenerar
    nota de coste + Aprobar y generar vídeos
  [videos] Progress card:
    h2 Generando los vídeos
    resumen n de total vídeos listos
    lista de escenas con estado real
    tiempo transcurrido
    Cancelar historia
  [assembling] Progress card:
    h2 Montando el vídeo final
    pasos reales: Descargando / Uniendo / Subiendo
  [ready] Result card:
    badge IA + h2 Tu historia
    <video controls playsinline preload="metadata" poster>
    Escenas / Duración / Formato / Estilo / Referencia
    nota de IA y caducidad
    Empezar otra historia
  [failed] alert block:
    h2 No se pudo completar la historia
    mensaje + Reintentar escena / Reintentar montaje / Empezar de nuevo
  [cancelled] Historia cancelada. + Empezar de nuevo
  [expired] Esta historia ya no está disponible. Empieza de nuevo.
  [not-owned] Esta historia no está disponible en este navegador.
```

### Copy Deck normativo

Los textos MUST aparecer exactamente como se escriben (acentos, mayúsculas y puntuación incluidos).

| Slot | Texto exacto |
|------|--------------|
| Marca | `AI Shorts` |
| Badge de cabecera | `BETA` |
| Explicación accesible del badge | `BETA. La creación de historias con IA es real, consume créditos y puede tardar varios minutos.` |
| Enlace de vuelta | `Volver al feed` |
| H1 de `/story` | `Crea una historia con IA` |
| Intro de `/story` | `Escribe una premisa. La IA prepara entre 4 y 6 escenas de 6 segundos con sus imágenes y tú decides cuándo generar los vídeos.` |
| Stepper | `Guion`, `Imágenes`, `Vídeos`, `Resultado` |
| Etiqueta accesible de paso | `Paso {n} de 4: {etiqueta}, {estado}` con estados `completado`, `actual`, `pendiente` |
| Título del formulario | `Tu historia` |
| Etiqueta de premisa | `Premisa` |
| Placeholder de premisa | `Una repostera descubre que sus postres pueden predecir el futuro.` |
| Ayuda de premisa | `Máximo 600 caracteres.` |
| Contador | `{n}/600` |
| Contador accesible | `{n} de 600 caracteres` |
| Leyenda de escenas | `Escenas` |
| Opción 4 | `4 escenas` |
| Opción 5 | `5 escenas` |
| Opción 6 | `6 escenas` |
| Ayuda de escenas | `Cada escena dura 6 segundos.` |
| Leyenda de calidad | `Calidad de vídeo` |
| Preset rápido | `Rápido` |
| Descripción rápida | `MiniMax Hailuo 02. Menos espera.` |
| Preset calidad | `Calidad` |
| Descripción calidad | `Kling 2.5 Turbo Pro. Más detalle y coste.` |
| Título de referencia | `Imagen de referencia (opcional)` |
| Ayuda de referencia | `Una imagen PNG, JPG o WebP de hasta 8 MB. Se usa para el guion y para las imágenes de todas las escenas. Se envía a DeepSeek y a Fal; Fal la elimina en 1 hora.` |
| Añadir imagen | `Añadir imagen` |
| Referencia vacía | `Sin imagen. Puedes crear la historia solo con texto.` |
| Contador de referencia | `{n} de 1` |
| Referencia seleccionada | `Imagen · {size}` |
| Subiendo | `Subiendo imagen…` |
| Imagen lista | `Imagen lista.` |
| Reintentar subida | `Reintentar subida` |
| Eliminar referencia | `Eliminar {nombre}` |
| Máximo de referencia | `Máximo 1 imagen. Elimina la actual para cambiarla.` |
| Aviso de privacidad | `Tu premisa se envía a DeepSeek para escribir el guion y a Fal para generar las imágenes y los vídeos. AI Shorts guarda la historia 24 horas para que puedas volver a ella desde este navegador. La imagen de referencia se elimina de Fal en 1 hora.` |
| Crear | `Crear historia` |
| Creando/planificando | `Escribiendo el guion` |
| Nota de planificación | `La IA está preparando las escenas. Puede tardar unos segundos.` |
| Preparando imágenes | `Preparando las imágenes` |
| Nota de imágenes | `Estamos creando una imagen por escena.` |
| Revisión: título | `Revisa las imágenes` |
| Revisión: intro | `Estas son las imágenes de tus {n} escenas. Puedes regenerar una imagen antes de aprobar.` |
| Tarjeta: título | `Escena {n} de {total}` |
| Etiqueta de narración | `Narración (solo en pantalla)` |
| Etiqueta de prompt | `Prompt visual` |
| Regenerar | `Guardar y regenerar` |
| Intento de imagen | `Imagen {n} de 2` |
| Regenerando | `Regenerando imagen…` |
| Imagen regenerada | `Imagen lista.` |
| Fallo de regeneración | `No se pudo regenerar la imagen.` |
| Nota de aprobación | `Al aprobar se generarán {n} vídeos de 6 segundos y se cobrarán {n} generaciones.` |
| Aprobar | `Aprobar y generar vídeos` |
| Título de vídeos | `Generando los vídeos` |
| Nota de vídeos | `Los vídeos se generan de dos en dos. Puede tardar varios minutos.` |
| Estado de escena en cola | `En cola` |
| Estado de escena pendiente | `Pendiente` |
| Estado de imagen generando | `Generando imagen` |
| Estado de imagen lista | `Imagen lista` |
| Estado de imagen fallida | `Imagen fallida` |
| Estado de escena generando | `Generando vídeo` |
| Estado de escena listo | `Vídeo listo` |
| Estado de escena fallido | `Vídeo fallido` |
| Resumen de vídeos | `{done} de {total} vídeos listos` |
| Tiempo transcurrido | `Tiempo transcurrido: {m}:{ss}` |
| Aviso de espera prolongada | `Está tardando más de lo habitual. Puedes seguir esperando o cancelar.` |
| Cancelar | `Cancelar historia` |
| Cancelación anunciada | `Historia cancelada.` |
| Título de montaje | `Montando el vídeo final` |
| Paso de descarga | `Descargando los vídeos` |
| Paso de unión | `Uniendo las escenas` |
| Paso de subida | `Subiendo el resultado` |
| Nota de montaje | `Estamos uniendo las escenas con cortes secos. Sin música, voz ni texto en pantalla.` |
| Badge de resultado | `IA` |
| Título de resultado | `Tu historia` |
| Etiqueta de escenas | `Escenas` |
| Etiqueta de duración | `Duración` |
| Etiqueta de formato | `Formato` |
| Valor de formato | `9:16` |
| Etiqueta de estilo | `Estilo` |
| Etiqueta de referencia | `Referencia` |
| Referencia cero | `Sin referencia` |
| Referencia una | `1 imagen` |
| Nota de resultado | `Generado con IA. Puede contener errores. No se ha publicado. El enlace del vídeo caduca en 24 horas.` |
| Empezar otra | `Empezar otra historia` |
| Título de fallo | `No se pudo completar la historia` |
| Reintentar escena | `Reintentar escena` |
| Reintentar montaje | `Reintentar montaje` |
| Empezar de nuevo | `Empezar de nuevo` |
| Historia expirada | `Esta historia ya no está disponible. Empieza de nuevo.` |
| Historia no disponible | `Esta historia no está disponible en este navegador.` |
| Sin conexión al crear | `Sin conexión. La creación necesita internet.` |
| Sin conexión durante polling | `Sin conexión. Reintentaremos cuando vuelvas a estar en línea.` |
| Aviso sin JavaScript (crear) | `La creación de historias necesita JavaScript. Puedes volver al feed de prueba.` |
| Aviso sin JavaScript (detalle) | `Esta historia necesita JavaScript para mostrar su progreso. Puedes volver al feed de prueba.` |
| Meta title de `/story` | `AI Shorts — Historias con IA` |
| Meta description de `/story` | `Crea una historia de 4 a 6 escenas con IA: revisa las imágenes, genera los vídeos y recibe un vídeo vertical de hasta 36 segundos.` |
| Meta title de `/story/[id]` | `Tu historia — AI Shorts` |

**Formatos normativos**:

- Duración: `0:30`, `0:24`, `0:36` con `formatStoryDuration`.
- Tamaño de archivo: reutilizar el formato de `B`/`KB`/`MB` con coma decimal y sin `,0`.
- Escenas: `5 escenas`; escena individual: `Escena 3 de 5`.
- Tiempo transcurrido: `m:ss` con minutos sin cero a la izquierda (`0:07`, `1:02`).
- Intento: `Imagen 1 de 2`, `Imagen 2 de 2`.

### Stable data-testid Hooks

| `data-testid` | Elemento / uso |
|---------------|----------------|
| `story-page` | Raíz de `/story`. |
| `story-header` | `header`. |
| `story-back-link` | `Volver al feed`. |
| `story-h1` | `h1` de `/story`. |
| `story-intro` | Intro. |
| `story-stepper` | `ol` del stepper. |
| `story-step` | Cada `li`; `data-step` (`plan`, `images`, `videos`, `result`) y `data-state`. |
| `story-status` | Región `role="status"`. |
| `story-create-form` | `<form>`. |
| `story-premise` | `textarea`. |
| `story-premise-counter` | Contador. |
| `story-premise-help` | Ayuda. |
| `story-premise-error` | Error `role="alert"`. |
| `story-scene-count` | `radiogroup` de escenas. |
| `story-scene-count-4/5/6` | Radios. |
| `story-preset-group` | `radiogroup` de calidad. |
| `story-preset-fast` | Radio `Rápido`. |
| `story-preset-quality` | Radio `Calidad`. |
| `story-reference` | Sección de referencia. |
| `story-reference-input` | `<input type="file">` oculto. |
| `story-reference-add` | `Añadir imagen`. |
| `story-reference-count` | `{n} de 1`. |
| `story-reference-card` | Tarjeta. |
| `story-reference-remove` | `Eliminar {nombre}`. |
| `story-reference-error` | `role="alert"`. |
| `story-privacy` | Aviso de privacidad. |
| `story-create` | `Crear historia` (`type="submit"`). |
| `story-planning` | Estado de planificación. |
| `story-detail` | Raíz de `/story/[id]`. |
| `story-detail-heading` | `h1` `Tu historia`. |
| `story-keyframes` | Progreso de imágenes. |
| `story-review` | Contenedor de revisión. |
| `story-review-heading` | `h2` `Revisa las imágenes` con `tabindex="-1"`. |
| `story-scene-card` | Tarjeta; `data-scene-order` y `data-scene-status`. |
| `story-scene-keyframe` | `<img>` del keyframe. |
| `story-scene-prompt` | `textarea` del prompt visual. |
| `story-scene-narration` | Narración. |
| `story-scene-attempt` | `Imagen {n} de 2`. |
| `story-scene-regenerate` | `Guardar y regenerar`. |
| `story-scene-error` | Error de la tarjeta. |
| `story-approve` | `Aprobar y generar vídeos`. |
| `story-approve-note` | Nota de coste. |
| `story-videos` | Progreso de vídeos. |
| `story-videos-heading` | `h2` `Generando los vídeos` con `tabindex="-1"`. |
| `story-video-scene` | Fila de escena; `data-scene-order` y `data-scene-status`. |
| `story-video-progress` | `{done} de {total} vídeos listos`. |
| `story-video-retry` | `Reintentar escena`. |
| `story-elapsed` | Tiempo transcurrido. |
| `story-slow` | Aviso de espera prolongada. |
| `story-cancel` | `Cancelar historia`. |
| `story-assembling` | Progreso de montaje. |
| `story-assembly-heading` | `h2` `Montando el vídeo final` con `tabindex="-1"`. |
| `story-assembly-step` | Paso real; `data-step` (`download`, `concat`, `upload`). |
| `story-result` | Contenedor del resultado. |
| `story-result-badge` | Badge `IA`. |
| `story-result-heading` | `h2` `Tu historia` con `tabindex="-1"`. |
| `story-final-video` | `<video>`. |
| `story-result-scenes` | `Escenas`. |
| `story-result-duration` | `Duración`. |
| `story-result-format` | `9:16`. |
| `story-result-style` | `Rápido`/`Calidad`. |
| `story-result-reference` | `Sin referencia`/`1 imagen`. |
| `story-result-note` | Nota de IA y caducidad. |
| `story-restart` | `Empezar otra historia`. |
| `story-error` | Bloque `role="alert"`. |
| `story-retry-scene` | `Reintentar escena`. |
| `story-retry-assembly` | `Reintentar montaje`. |
| `story-start-over` | `Empezar de nuevo`. |
| `story-expired` | Estado de expiración. |
| `story-not-owned` | Estado sin ownership. |
| `story-offline` | Aviso de sin conexión. |
| `story-nojs-notice` | Aviso `<noscript>`. |

### Presupuesto de clics

| Recorrido | Clics | Detalle |
|-----------|-------|---------|
| Entrada a `/story` | 1 | Enlace directo o futura entrada desde el feed. |
| Premisa → historia creada | 1 | `Crear historia`; escenas y calidad tienen defaults. |
| Revisión → vídeos | 1 | `Aprobar y generar vídeos`. |
| Total por defecto | 3 | Incluye la entrada; dentro de la app, 2. |
| Con referencia | +1 | `Añadir imagen`/selección; opcional. |
| Cambiar escenas o calidad | +1 | Opcional; no obligatorio. |
| Regenerar una imagen | +1 por escena | Recuperación; máximo 1 extra por escena. |
| Reintentar un vídeo | +1 por escena | Recuperación; máximo 1 extra por escena. |
| Reintentar montaje | +1 | Recuperación. |
| Cancelar | +1 | Recuperación. |
| Publicar / Descargar / Compartir | — | No existen. |

### Design Contract

Se conservan el tema dark-only, los tokens `brand-*`, la tipografía del sistema, los iconos SVG inline, las superficies, el foco, las safe areas y el responsive de 001–004. Adiciones:

| Concern | Decisión |
|---------|----------|
| Formulario | Tarjeta `rounded-3xl` con `h2`, textarea `text-base`, contador, dos `fieldset`/`radiogroup` y sección de referencia. |
| Escenas | Radios tipo tarjeta con `min-h-11`; seleccionada con `border-brand-fuchsia` y fondo `brand-fuchsia/10`. |
| Revisión | `grid` de 1 columna en base, 2 en `md` y 3 en `xl`; tarjeta `rounded-2xl border border-white/10 bg-brand-surface`. |
| Keyframe | `aspect-[9/16] w-full rounded-xl border border-white/10 bg-black object-cover`. |
| Prompt | `textarea` de 3–5 filas, `text-base`, `bg-brand-ink`, borde `white/15`. |
| Vídeos | Lista de filas con punto de estado; `En cola` ámbar, `Generando` violeta, `Listo` verde, `Fallido` fucsia. Sin porcentajes. |
| Montaje | Lista de 3 pasos con el paso actual resaltado; barra indeterminada solo `motion-safe:`. |
| Resultado | `<video>` `aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 bg-black object-cover`; metadatos en tarjeta `brand-surface`. |
| Error | Bloque `rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm`. |
| Offline | Bloque `rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm`. |
| Motion | Solo transiciones de color/opacidad de 150 ms bajo `motion-safe:`; sin shimmer ni parallax. |
| Responsive | 320 px base; `sm` 640; `md` 768; `lg` 1024; `xl` 1280; hasta 1920 px. |
| z-index | Contenido `0`, cabecera `10`, alertas/estado `20`. Sin modales. |

### App File Structure (normativa)

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/pages/story/index.vue` | Ruta `/story`: formulario, defaults, subida de referencia, creación, estados de planificación y error. |
| `app/pages/story/[id].vue` | Ruta `/story/[id]`: shell SSR, carga cliente, revisión, vídeos, montaje, resultado, errores, expiración y ownership. |
| `app/components/story/StoryHeader.vue` | `header` con marca, badge `BETA` explicado y `Volver al feed`. |
| `app/components/story/StoryStepper.vue` | `nav` + `ol` de 4 pasos; no interactivo. |
| `app/components/story/StoryCreateForm.vue` | `<form>` con premisa, contador, slots de escenas/calidad/referencia y `Crear historia`. |
| `app/components/story/StorySceneCountPicker.vue` | `radiogroup` de 4/5/6 escenas. |
| `app/components/story/StoryPresetPicker.vue` | `radiogroup` Rápido/Calidad con modelo y descripción. |
| `app/components/story/StoryReferencePicker.vue` | Referencia opcional, ticket, `PUT`, tarjeta, estados y errores. |
| `app/components/story/StoryPlanProgress.vue` | Estado de planificación e imágenes. |
| `app/components/story/StoryReview.vue` | Contenedor de revisión, tarjetas, nota de coste y aprobación. |
| `app/components/story/StorySceneCard.vue` | Tarjeta de escena: keyframe, narración, prompt, intento y regeneración. |
| `app/components/story/StoryVideoProgress.vue` | Progreso por escena, resumen, tiempo, aviso y cancelación. |
| `app/components/story/StoryAssemblyProgress.vue` | Pasos reales de montaje. |
| `app/components/story/StoryResult.vue` | Resultado con `<video>`, metadatos, nota y reinicio. |
| `app/components/story/StoryErrorAlert.vue` | `role="alert"` con mensaje y acciones. |
| `app/components/story/StoryExpired.vue` | Estados de expiración y falta de ownership. |
| `app/composables/useStory.ts` | Máquina de estados, polling, recarga, foco, anuncios y limpieza. |
| `app/composables/useStoryApi.ts` | Cliente same-origin de `/api/story/**` y `PUT` de referencia; único archivo de Story con `$fetch`/`fetch`. |
| `app/composables/useStoryReference.ts` | Validación, ticket, `PUT`, `ObjectURL`, `File` efímero y limpieza. |
| `app/models/story.ts` | Contrato compartido de Story. |
| `app/data/story.ts` | Presets, escenas, límites, defaults y copy de opciones. Sin endpoints. |
| `app/utils/story.ts` | Helpers puros: validación, formato de duración/tamaño, etiquetas y mapeo de estado. |

**API de componentes y composables (normativa)**:

- `StorySceneCountPicker`: prop `sceneCount: StorySceneCount`; emit `update:sceneCount`.
- `StoryPresetPicker`: prop `preset: StoryPreset`; emit `update:preset`.
- `StoryReferencePicker`: props `reference: StoryReference | null`, `uploadState: 'idle' | 'uploading' | 'error'`; emits `select [file: File]`, `remove []`, `retry []`. El `File` solo cruza este evento y no se guarda en modelos.
- `StoryCreateForm`: props `premise: string`, `issue: StoryJobError | null`; emits `update:premise`, `submit`; slots `sceneCount`, `preset` y `reference`; expone `focusPremise()`.
- `StoryReview`: props `story: Story`; emits `regenerate [sceneId: string, input: StoryBeatUpdateRequest]`, `approve []`.
- `StorySceneCard`: props `scene: StoryScene`, `total: number`, `disabled: boolean`; emits `regenerate [input: StoryBeatUpdateRequest]`.
- `StoryVideoProgress`: props `story: Story`, `elapsedSeconds: number`, `isSlow: boolean`; emits `cancel`, `retry [sceneId: string]`.
- `StoryAssemblyProgress`: props `elapsedSeconds: number`; sin emits.
- `StoryResult`: props `story: Story`; emit `restart`.
- `useStory(options: { api?: StoryApi; storyId?: string })`: devuelve `state`, `story`, `statusMessage`, `createStory`, `loadStory`, `regenerateScene`, `approve`, `retryScene`, `retryAssembly`, `cancel`, `restart`, `clearError`.
- `StoryApi` es local a `useStoryApi.ts`: `createStory`, `getStory`, `createUploadTicket`, `uploadReference`, `updateKeyframe`, `approve`, `retryVideo`, `assemble`, `cancel`.
- `AppButton` y `BrandMark` se reutilizan sin cambios de API.

## Costes y latencia

Los valores unitarios son **estimaciones de trabajo configurables**, no precios garantizados. La fase 1 MUST verificar los precios reales de DeepSeek, FLUX, MiniMax, Kling y Fal Storage; si el peor caso de 6 escenas `Calidad` supera 8 USD, el servidor MUST rechazar la operación con `story-budget-exhausted` y se documentará la limitación. **No se sube el cap de 8 USD.**

Variables (defaults):

| Variable | Default | Uso |
|----------|---------|-----|
| `NUXT_STORY_MAX_COST_USD` | `8` | Cap por historia. |
| `NUXT_STORY_COST_DIRECTOR_USD` | `0.01` | DeepSeek por plan. |
| `NUXT_STORY_COST_KEYFRAME_USD` | `0.05` | FLUX dev por keyframe. |
| `NUXT_STORY_COST_KEYFRAME_REFERENCE_USD` | `0.08` | FLUX Kontext por keyframe. |
| `NUXT_STORY_COST_VIDEO_FAST_USD` | `0.35` | MiniMax 6 s por vídeo. |
| `NUXT_STORY_COST_VIDEO_QUALITY_USD` | `0.70` | Kling 10 s (recortado a 6 s) por vídeo. |
| `NUXT_STORY_DAILY_BUDGET_USD` | `50` | Cap diario por instancia. |

Coste = `director + keyframeAttempts × unitKeyframe + videoAttempts × unitVideo`. Los intentos se cuentan aunque el proveedor falle, porque pueden cobrarse.

| Escenario | Escenas | Keyframes (1 inicial + 1 extra/escena) | Vídeos (1 inicial + 1 reintento/escena) | Coste estimado |
|-----------|---------|----------------------------------------|------------------------------------------|----------------|
| Rápido, sin referencia | 4 | 8 × 0,05 = 0,40 | 8 × 0,35 = 2,80 | **3,21 USD** |
| Rápido, sin referencia | 5 | 10 × 0,05 = 0,50 | 10 × 0,35 = 3,50 | **4,01 USD** |
| Rápido, sin referencia | 6 | 12 × 0,05 = 0,60 | 12 × 0,35 = 4,20 | **4,81 USD** |
| Rápido, con referencia | 6 | 12 × 0,08 = 0,96 | 12 × 0,35 = 4,20 | **5,17 USD** |
| Calidad, sin referencia | 4 | 8 × 0,05 = 0,40 | 8 × 0,70 = 5,60 | **6,01 USD** |
| Calidad, sin referencia | 5 | 10 × 0,05 = 0,50 | 10 × 0,70 = 7,00 | **7,51 USD** |
| Calidad, sin referencia | 6 | 12 × 0,05 = 0,60 | 12 × 0,70 = 8,40 | **9,01 USD** |
| Calidad, con referencia | 6 | 12 × 0,08 = 0,96 | 12 × 0,70 = 8,40 | **9,37 USD** |

Base sin reintentos (5 escenas): Rápido ≈ **2,01 USD**; Calidad ≈ **3,76 USD**. El cap de 8 USD no cubre el peor caso teórico de 6 escenas Calidad con todos los reintentos: el `CostGuard` debe bloquear los submits que lo superen, priorizando los keyframes y los vídeos iniciales. Si los precios reales son mayores, se aplica el mismo cap y se documenta la limitación; no se sube a 8 USD.

Latencia orientativa (no es una promesa ni se muestra como ETA):

| Etapa | Rango típico | Límite duro |
|-------|--------------|-------------|
| DeepSeek (guion) | 3–15 s | 45 s + 1 reparación |
| Keyframes (3 en paralelo) | 10–45 s para 4–6 escenas | 3 submits simultáneos |
| Revisión humana | Sin límite | — |
| Vídeos (2 en paralelo) | 3–8 min Rápido; 4–10 min Calidad | 2 submits simultáneos |
| Ensamblaje | 20–60 s | 180 s |
| Total sin revisión | 4–12 min | 20 min |

Disco y BD:

- Cada clip de entrada ≤ 300 MB; pico temporal ≤ 1,5 GB; los originales se borran tras normalizar.
- Cada clip normalizado ≈ 8–20 MB; el MP4 final ≈ 15–40 MB.
- Fila `Story` + 6 `Scene` ≈ 10–20 KB; `planJson` ≈ 5–15 KB.
- Se requiere un directorio temporal escribible con al menos 2 GB libres.

## Security & Operations

### Threat model

| Amenaza | Mitigación | Riesgo residual |
|---------|------------|-----------------|
| Fuga de claves (Fal, DeepSeek, BD) | `runtimeConfig` privado, `server/` only, sin `NUXT_PUBLIC_*`, respuestas/logs sin claves, guardas estáticas. | Un error de build futuro; se añade test de fuga SSR/API. |
| Abuso de coste | Cap 8 USD/historia, presupuesto diario, 1 historia activa/sesión, 2 por instancia, rate limit, intentos máximos 2. | Muchas sesiones/IPs; se recomienda WAF/edge y límites bajos al abrir. |
| Prompt injection a DeepSeek | Prompt de sistema, JSON schema, validación server-side, sin herramientas, salida tratada como texto no confiable, sin `v-html`. | Contenido creativo inesperado; se rechaza HTML/Markdown y se valida longitud. |
| SSRF | Nunca se hace fetch de URLs arbitrarias; referencia y clips validados contra la allowlist de Fal; DeepSeek con origen fijo; `redirect: 'error'`. | Una URL de Fal comprometida; se limita a hosts conocidos. |
| FFmpeg injection | `spawn` con array de args, `shell: false`, nombres generados, `cwd` temporal, `-nostdin`. | Un bug de construcción de args; se prueba con nombres maliciosos. |
| Acceso a historia ajena | `sessionId` en todas las queries; 404 para ajenas; cookie HttpOnly; sin IDs en logs de capacidad. | Robo de cookie; `Secure` + `SameSite=Lax` y no se comparte. |
| Replay de comandos | Guardas de estado, idempotencia de creación y límites de intentos. | Repetición de comandos idempotentes; sin coste extra. |
| Split-brain de reconciliador | Claim atómico, lease 60 s, relectura antes de submit, liberación en `finally`. | Crash entre submit y persistencia puede duplicar un job; intentos y cap lo acotan. |
| DoS de disco/CPU | Límites de tamaño, timeouts, concurrencia 1 de montaje, limpieza en `finally`, cola máxima 2. | Varias instancias montando a la vez; no hay coordinación global de CPU. |
| Enumeración de historias | `cuid` no adivinable + ownership por cookie + 404 uniforme. | Fuga de un ID por logs; no concede acceso. |
| Fuga de PII en logs | No se loggea premisa, plan, prompts, narración, URLs ni IP en claro. | Logs de proxies externos; se configura redacción. |
| Contenido bloqueado/NSFW | `enable_safety_checker`, `safety_tolerance`, mapeo a 422; sin bypass. | Falsos negativos del proveedor; se invita a editar. |
| URL de vídeo caducada | Lifecycle explícito y reintento de montaje; la UI explica la caducidad. | El proveedor puede caducar antes; se documenta. |

### Rate limit, presupuesto e idempotencia

| Variable | Default | Uso |
|----------|---------|-----|
| `NUXT_DEEPSEEK_KEY` | — (obligatoria) | Clave de DeepSeek; `runtimeConfig.deepseekKey`. |
| `NUXT_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Solo tests; en producción, default. |
| `NUXT_STORY_DIRECTOR_MODEL` | `deepseek-flash` | Fijo; no elegible por el cliente. |
| `NUXT_STORY_DIRECTOR_TIMEOUT_MS` | `45000` | Timeout del guion. |
| `NUXT_STORY_MAX_COST_USD` | `8` | Cap por historia. |
| `NUXT_STORY_DAILY_BUDGET_USD` | `50` | Cap diario por instancia. |
| `NUXT_STORY_TTL_MS` | `86400000` | `expiresAt` de la historia (24 h). |
| `NUXT_STORY_RECONCILER_ENABLED` | `true` | Interruptor del plugin. |
| `NUXT_STORY_RECONCILER_INTERVAL_MS` | `5000` | Tick del reconciliador. |
| `NUXT_STORY_LEASE_MS` | `60000` | Lease de historia. |
| `NUXT_STORY_KEYFRAME_CONCURRENCY` | `3` | Submits de keyframe por instancia. |
| `NUXT_STORY_VIDEO_CONCURRENCY` | `2` | Submits de vídeo por instancia. |
| `NUXT_STORY_POLL_AFTER_MS` | `2500` | Polling del cliente. |
| `NUXT_STORY_CREATE_LIMIT` | `3` | Historias por ventana y sesión. |
| `NUXT_STORY_CREATE_WINDOW_MS` | `3600000` | Ventana de creación (1 h). |
| `NUXT_STORY_UPLOAD_LIMIT` | `5` | Tickets por ventana y sesión. |
| `NUXT_STORY_UPLOAD_WINDOW_MS` | `600000` | Ventana de subida (10 min). |
| `NUXT_STORY_ASSEMBLY_TIMEOUT_MS` | `180000` | Timeout del montaje. |
| `NUXT_STORY_ASSEMBLY_CONCURRENCY` | `1` | Montajes por instancia. |
| `FFMPEG_PATH` | `ffmpeg` | Binario del sistema. |
| `FFPROBE_PATH` | `ffprobe` | Binario del sistema. |
| `NUXT_COMPOSER_FAL_QUEUE_BASE_URL` / `NUXT_COMPOSER_FAL_STORAGE_BASE_URL` | `https://queue.fal.run` / `https://rest.fal.ai` | Overrides de test del transporte Fal compartido; en producción se usan los defaults. |
| `DATABASE_URL` | — (obligatoria) | Conexión pooled. |
| `DIRECT_URL` | — (obligatoria) | Migraciones. |

Reglas:

- Las ventanas son fijas y por `sha256(sessionId)`/`sha256(ipHash)`; los mapas están acotados (máx. 10 000 entradas) y se limpian por TTL.
- `Retry-After` es el tiempo hasta el final de la ventana o hasta el reinicio diario UTC.
- La idempotencia de creación vive en el unique de BD y en un store en memoria para peticiones en vuelo (TTL 10 min, máx. 1 000 entradas).
- El presupuesto por historia se deriva de `keyframeAttempts`/`videoAttempts`; el diario es un contador en memoria por instancia.
- Los límites y presupuestos no son distribuidos. Se documenta y se recomienda un límite de borde para producción multi-instancia.

### Lifecycle y expiración

| Recurso | TTL | Comportamiento |
|---------|-----|----------------|
| Cookie `story_sid` | 7 días (604 800 s) | Ownership; no contiene datos personales. |
| Historia en BD | 24 h (`expiresAt`) | `GET` devuelve 410 tras expirar; cleanup a las 25 h. |
| Referencia en Fal | 1 h (3600 s) | Lifecycle en el `initiate`; si caduca antes de un keyframe, la historia falla con `reference-expired`. |
| Keyframe en Fal | Según Fal | Se usa como póster y como `image_url` del vídeo; si caduca, el reintento de vídeo puede fallar. |
| Clip de vídeo en Fal | Según Fal | Se descarga para el montaje; si caduca, el montaje falla y se puede reintentar. |
| MP4 final en Fal | 24 h (86 400 s) | `finalVideoExpiresAt`; coincide con la vida de la historia. |
| Temporal de montaje | Por ensamblaje | Se borra en `finally`. |
| Idempotencia en memoria | 10 min | Se puede reintentar con la misma clave dentro de la ventana. |
| Lease | 60 s | Se libera al terminar o expira para recuperación. |

### Observabilidad

- Logs estructurados JSON a stdout/stderr, sin dependencias nuevas.
- Eventos permitidos: `story.create.start`, `story.create.ok`, `story.create.failed`, `story.plan.ok`, `story.plan.failed`, `story.keyframe.submitted`, `story.keyframe.succeeded`, `story.keyframe.failed`, `story.video.submitted`, `story.video.succeeded`, `story.video.failed`, `story.approve`, `story.assembly.start`, `story.assembly.ok`, `story.assembly.failed`, `story.cancel`, `story.reconciler.claim`, `story.reconciler.release`, `story.reconciler.error`, `story.cost.reject`, `story.cleanup`.
- Campos permitidos: `storyId`, `sceneOrder`, `stage`, `attempt`, `modelId`, `preset`, `sceneCount`, `latencyMs`, `httpStatus`, `errorCode`, `retryable`, `costEstimateUsd`, `promptHash`, `ipHash`, `leaseOwnerHash`.
- Campos prohibidos: premisa, plan, `visualPrompt`, `narration`, `referenceUrl`, `fileUrl`, `uploadUrl`, `statusUrl`, `responseUrl`, `cancelUrl`, `requestId`, `Idempotency-Key`, `NUXT_FAL_KEY`, `NUXT_DEEPSEEK_KEY`, `DATABASE_URL`, `DIRECT_URL`, `Authorization`, cookies, IP en claro.
- Métricas manuales mínimas: historias creadas/terminadas/fallidas, tasa de 429, latencia de guion, latencia de keyframe, latencia de vídeo, latencia de montaje, coste estimado por historia, ratio de éxito por escena.
- No se añade Sentry ni APM en esta feature.

### Deployment checklist

1. Runtime Node.js 22 LTS persistente; no serverless con límite corto.
2. PostgreSQL accesible; `DIRECT_URL` para migraciones y `DATABASE_URL` pooled para runtime.
3. `npm ci`.
4. `npm run db:generate`.
5. `npm run db:deploy` (o `prisma migrate deploy`).
6. `npm run build`; arrancar `.output/server/index.mjs`.
7. `NUXT_FAL_KEY`, `NUXT_DEEPSEEK_KEY`, `DATABASE_URL`, `DIRECT_URL`, `FFMPEG_PATH`, `FFPROBE_PATH` como secretos del entorno; nunca en el repo.
8. FFmpeg y ffprobe instalados y accesibles; verificar `ffmpeg -version` y `ffprobe -version`.
9. Directorio temporal escribible con ≥ 2 GB y limpieza operativa.
10. Proxy: body máximo ≥ 16 KiB; timeout de `POST /api/story` ≥ 90 s (DeepSeek), `GET`/comandos ≥ 30 s; sin buffering especial.
11. `X-Forwarded-For`/`X-Forwarded-Proto` solo desde el proxy de confianza.
12. CDN/proxy: no cachear `/api/story/**`; respetar `no-store`.
13. PWA: verificar `NetworkOnly` para `/api/**` y Fal; sin caché de MP4.
14. TLS obligatorio; cookie `Secure` en producción.
15. Backups de PostgreSQL (PITR o diario) y prueba de restauración.
16. Limpieza de historias expiradas y de temporales monitorizada.
17. Rate limit, presupuesto y concurrencia revisados antes de abrir; empezar bajo.
18. Monitorizar 429, 5xx, `director-*`, `provider-*`, `assembly-*` y latencias.
19. Rotar claves de Fal y DeepSeek con reinicio; las historias activas pueden fallar y se reintentan.
20. Ejecutar el smoke opt-in una vez por entorno con créditos reales y revisar el coste.

## Test Plan

La validación sigue la Constitución v1.1.0. Cada archivo runtime nuevo, excepto los modelos type-only, MUST tener cobertura directa o por integración. Los 613 tests de 004 MUST permanecer sin cambios y en verde.

### Gate de calidad

```bash
npm run db:generate
npm run test:run
npm run build
```

`db:generate` es obligatorio antes de `test:run` y `build` cuando Story importe Prisma. El CI MUST usar un PostgreSQL de servicio solo para los tests de integración opt-in; los tests unitarios y de rutas usan repositorio fake.

### Tests unitarios de servidor

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/server/story-director.spec.ts` | Petición exacta a `deepseek-flash`, `response_format`, timeout, 1 reintento solo por JSON inválido, 401/429/5xx, sin clave en logs. |
| `tests/unit/server/story-director-prompt.spec.ts` | Prompt de sistema, esquema, inclusión de premisa y referencia, reparación, sin HTML. |
| `tests/unit/server/story-plan-validator.spec.ts` | Exactamente N beats, orden consecutivo, longitudes, HTML/Markdown, controles, NFC, title/logline. |
| `tests/unit/server/story-validation.spec.ts` | Premisa, escenas, preset, referencia y `referenceExpiresAt`, prompt, narración, campos desconocidos, Content-Type, tamaño. |
| `tests/unit/server/story-errors.spec.ts` | Mapeo de `StoryErrorCode` a HTTP/retryable/mensajes; traducción de `ComposerError`; sin mensajes crudos. |
| `tests/unit/server/story-repository.spec.ts` | Mapeo Prisma ↔ dominio, create transaccional, guardas de estado, claim atómico, cancel, deleteExpired, planJson inválido. |
| `tests/unit/server/story-reconciler.spec.ts` | Claim/lease, transiciones keyframe/video/assembly, concurrencia 3/2, liberación en `finally`, crash recovery, no side effects en GET. |
| `tests/unit/server/story-keyframe-orchestrator.spec.ts` | FLUX dev vs Kontext, input exacto, persistencia antes de submit, estados, intentos, errores, cancelación. |
| `tests/unit/server/story-video-orchestrator.spec.ts` | MiniMax 6 s, Kling 10 s, input exacto, estados, intentos, reutilización de keyframe, errores. |
| `tests/unit/server/story-cost.spec.ts` | Fórmula, unidades, cap 8, rechazo antes de submit, preset/referencia, intentos fallidos. |
| `tests/unit/server/story-rate-limit.spec.ts` | 3/h, 5/10 min, 20/h IP, 10 comandos/min, poll 1/1,5 s, cancel 3/min, assemble 3/h, mapas acotados. |
| `tests/unit/server/story-session.spec.ts` | Cookie `story_sid` 7 días, HttpOnly/SameSite/Secure, no creación en GET, lectura, hash de IP, same-origin. |
| `tests/unit/server/story-assembly-command.spec.ts` | Args exactos de normalize/concat/probe, 720×1280, 30 fps, `-an`, `faststart`, `tpad`, sin shell. |
| `tests/unit/server/story-ffmpeg-runner.spec.ts` | `spawn` sin shell, timeout, `SIGKILL`, stderr acotado, error de binario, limpieza. |
| `tests/unit/server/story-media-downloader.spec.ts` | Allowlist, `redirect: 'error'`, timeout, 300 MB/clip, 1,5 GB total, archivo parcial borrado. |
| `tests/unit/server/story-media-storage.spec.ts` | Initiate con `video/mp4` y lifecycle 86 400, PUT binario, `fileUrl` validado, tamaño máximo, error de subida. |
| `tests/unit/server/story-runtime.spec.ts` | Composición, firma de config, `hasFalKey`/`hasDeepSeekKey`/`hasDatabase`, override de test, sin lanzar al importar. |

### Tests de rutas y contrato

| Test | Cobertura mínima |
|------|------------------|
| `tests/acceptance/story-api-create.spec.ts` | 201/200 replay, validaciones 400/413/415/403, DeepSeek stub, 409 activo/idempotencia, 429, 502/503/504, cookie, `referenceExpiresAt`, no claves, no URLs de proveedor. |
| `tests/acceptance/story-api-detail.spec.ts` | 200 en cada estado, 404 ajeno/ausente, 410 expirado, solo lectura (no calls a Fal, DeepSeek ni FFmpeg), forma exacta, no URLs internas. |
| `tests/acceptance/story-api-uploads.spec.ts` | Ticket, prefijo `story-ref-`, lifecycle, validaciones, rate limit, no binario por Nitro. |
| `tests/acceptance/story-api-keyframe.spec.ts` | 202, regeneración individual, `regenerate: false`, invalidación de `approvedAt`, límite 2, 409, presupuesto, errores. |
| `tests/acceptance/story-api-approve.spec.ts` | 202 solo con todas `KEYFRAME_READY`, idempotencia, 409, no submit síncrono, `approvedAt`. |
| `tests/acceptance/story-api-videos.spec.ts` | Retry 202, límite 2, estado incorrecto, concurrencia, fallo agregado, `video-failed`. |
| `tests/acceptance/story-api-assemble.spec.ts` | 202 desde `VIDEOS_READY`/`FAILED`, idempotencia, 409 sin vídeos, 503 sin FFmpeg, `assembly-busy`. |
| `tests/acceptance/story-api-cancel.spec.ts` | 200 en estados activos, escenas canceladas, idempotencia, 409 terminal, best-effort. |
| `tests/acceptance/story-route.spec.ts` | SSR de `/story`: formulario, defaults 5/Rápido, `noscript`, un `h1`, sin datos de historia ni claves, no fetch SSR. |
| `tests/acceptance/story-detail-route.spec.ts` | SSR de `/story/[id]`: shell determinista, `Cargando tu historia…`, sin datos ni DB, `noscript`. |
| `tests/acceptance/story-004-regression.spec.ts` | `/composer`, `/feed` y `/` sin cambios; 613 tests de 004 intactos; rutas API de 004 intactas. |

**Fixtures**: `tests/fixtures/deepseek/deepseek-plan-4.json`, `deepseek-plan-5.json`, `deepseek-plan-6.json`, `deepseek-invalid.json`, `deepseek-repair.json`, `deepseek-timeout.json`. Se reutilizan las fixtures de Fal de 004 (`queue-submit.json`, `queue-status-*.json`, `flux-dev-result.json`, `flux-kontext-result.json`, `minimax-result.json`, `kling-result.json`, `storage-initiate.json`). Sin claves reales.

### Tests de componentes y composables

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/story-create-form.spec.ts` | Premisa, contador, labels, slots, defaults, submit, foco, deshabilitado, sin campos prohibidos. |
| `tests/unit/story-scene-count-picker.spec.ts` | `radiogroup`, 4/5/6, default 5, teclado, emisión. |
| `tests/unit/story-preset-picker.spec.ts` | Rápido/Calidad, modelos, descripciones, default, emisión. |
| `tests/unit/story-reference-picker.spec.ts` | Una imagen, MIME/tamaño, ticket, `PUT` con headers, estados, reintento, eliminar, `ObjectURL`. |
| `tests/unit/story-review.spec.ts` | 4–6 tarjetas, orden, nota de coste, aprobar, regenerar, foco, sin URLs internas. |
| `tests/unit/story-scene-card.spec.ts` | Keyframe, narración, prompt, intento, deshabilitado en 2/2, error, 44 px. |
| `tests/unit/story-video-progress.spec.ts` | Estados reales por escena, resumen, tiempo, aviso, cancelar, reintentar, `aria-live`. |
| `tests/unit/story-assembly-progress.spec.ts` | 3 pasos, paso actual, sin porcentajes, reduced motion. |
| `tests/unit/story-result.spec.ts` | Badge IA, `<video controls playsinline poster>`, sin autoplay/loop, metadatos, nota, reinicio, sin descarga/share/publicar. |
| `tests/unit/story-error-alert.spec.ts` | `role="alert"`, mensajes exactos, acciones, foco. |
| `tests/unit/use-story.spec.ts` | Máquina completa, polling/backoff, recarga, visibilidad, offline, cancelación, reintento, regeneración, montaje, limpieza, sin persistencia. |
| `tests/unit/use-story-api.spec.ts` | Rutas exactas, headers, `Idempotency-Key`, `PUT` directo, parseo de errores, no claves. |
| `tests/unit/use-story-reference.spec.ts` | Validación, ticket, `PUT`, reemplazo, abort, `ObjectURL`, `File` descartado. |
| `tests/unit/story-utils.spec.ts` | Validación de premisa/prompt/narración, formato de duración/tamaño, etiquetas, mapeo de estado. |
| `tests/unit/story-data.spec.ts` | Presets, escenas, límites, defaults; paridad con el servidor; sin endpoints. |
| `tests/unit/story-guards.spec.ts` | Modelos sin `File`/`Blob`/`any`; sin barrel; `app/**` sin `server/`, claves, `DATABASE_URL`, `FFMPEG_PATH`; `server/story/**` sin `server/composer/**`; sin `any`; sin `exec`/`execSync`; sin `v-html`; sin persistencia; `Date.now()` solo donde se permite. |

### Tests de aceptación, integración y smoke

- Los tests de aceptación usan `@nuxt/test-utils/e2e`, `setup({ server: true })` y `// @vitest-environment node`.
- DeepSeek y Fal se sustituyen por servidores HTTP locales configurados con `NUXT_DEEPSEEK_BASE_URL` y `NUXT_COMPOSER_FAL_*_BASE_URL` (solo test). Los tests MUST NOT salir a internet.
- El repositorio se sustituye por un fake en `event.context.storyRuntime`; no se requiere PostgreSQL para la suite normal.
- Test de integración opt-in de PostgreSQL (`RUN_DB_SMOKE=1` + `DATABASE_URL_TEST`): migraciones, create, claim, cancel, deleteExpired.
- Test de integración opt-in de FFmpeg (`RUN_FFMPEG_SMOKE=1`): genera 2–3 clips de color con `ffmpeg`, normaliza, concatena y verifica duración/streams; se salta si faltan binarios.
- Smoke de extremo a extremo (`RUN_STORY_SMOKE=1` + claves + DB + FFmpeg): crea una historia de 4 escenas `Rápido`, revisa, aprueba, monta y verifica el MP4; presupuesto máximo 8 USD y no se ejecuta en CI.
- El test de SSR se ejecuta con claves falsas y comprueba que no aparecen en HTML ni en respuestas.

### Comprobaciones manuales obligatorias

1. Crear una historia de 5 escenas desde `/story` con una premisa y comprobar plan, 5 tarjetas y persistencia tras recargar.
2. Verificar defaults: 5 escenas, Rápido, sin referencia, 6 s por escena y 30 s totales.
3. Editar el prompt de una escena, regenerar solo esa imagen y comprobar que la aprobación se invalida.
4. Comprobar el límite de 2 intentos de imagen y de 2 intentos de vídeo.
5. Aprobar y comprobar que los vídeos se generan de dos en dos y que la UI no muestra porcentajes.
6. Forzar el fallo de una escena de vídeo y reintentarla sin repetir las demás.
7. Recargar en `WAITING_APPROVAL`, `GENERATING_VIDEOS` y `ASSEMBLING`; comprobar recuperación y polling.
8. Borrar la cookie `story_sid` y comprobar 404 y el mensaje de ownership.
9. Comprobar el MP4 final con `ffprobe`: 720×1280, 30 fps, `yuv420p`, sin audio, duración exacta, `faststart`.
10. Comprobar que el vídeo final se reproduce con controles, sin autoplay/loop, y que no hay descarga/compartir/publicar.
11. Probar una referencia PNG/WebP y comprobar que se usa en DeepSeek y en Kontext; comprobar la caducidad a 1 h.
12. Provocar errores de DeepSeek, Fal, BD, presupuesto, rate limit y FFmpeg; comprobar códigos y mensajes.
13. Auditar teclado, VoiceOver/TalkBack, `aria-live`, `role="alert"`, foco y 44 px.
14. Auditar 320, 360, 390, 768, 1024, 1440 y 1920 px, zoom 200 %/400 % y safe areas.
15. Auditar `prefers-reduced-motion: reduce` y forced-colors.
16. Comprobar que el service worker no cachea `/api/story/**`, Fal ni el MP4.
17. Comprobar que `/composer`, `/feed` y `/` no cambian y que los 613 tests de 004 pasan.
18. Revisar logs: sin premisa, plan, prompts, URLs, claves, cadena de conexión ni IP en claro.

## Assumptions

- `deepseek-flash` acepta el formato OpenAI-compatible de chat, `response_format: { type: "json_object" }` y `image_url` en el mismo mensaje. Es un gate de fase 1; si no lo acepta, se detiene y se reabre la decisión.
- La `referenceUrl` de Fal CDN es accesible desde el servidor de DeepSeek durante la planificación y desde el servidor de Story durante los keyframes.
- Los clips de MiniMax/Kling son accesibles desde el servidor para el ensamblaje y Fal permite descargarlos con `fetch` sin credenciales adicionales.
- Kling 2.5 Turbo Pro no ofrece 6 s; se solicita 10 s y se recorta a 6 s. El coste de Kling se calcula por el clip de 10 s.
- FFmpeg 6+ y ffprobe están instalados en el host y accesibles por `FFMPEG_PATH`/`FFPROBE_PATH`.
- El hosting es un proceso Node persistente con disco temporal escribible y al menos 2 GB libres; no es serverless.
- PostgreSQL 17 local y Supabase en producción; Prisma 7 con `@prisma/adapter-pg` funciona con la conexión pooled de Supabase.
- Las migraciones se aplican con `DIRECT_URL`; el runtime usa `DATABASE_URL`.
- La cookie `story_sid` dura 7 días, pero la historia dura 24 h; una cookie válida sin historia devuelve 404.
- La pérdida de cookie implica pérdida de acceso; no hay recuperación por email, cuenta ni enlace mágico.
- Los leases permiten coordinar instancias, pero no se promete multi-instancia perfecta; el reconciliador se prueba con leases expirados y claims concurrentes.
- El rate limit y el presupuesto diario son por instancia; no son distribuidos.
- No hay audio, voz, música, subtítulos ni texto quemado; el MP4 final es mudo por diseño.
- El resultado es terminal: no se publica, descarga ni comparte.
- Los precios unitarios son estimaciones configurables; el cap de 8 USD se aplica con esos valores y se verifica en fase 1.
- La PWA puede servir el shell de `/story` y `/story/[id]`, pero no cachea APIs ni medios.
- Se añaden únicamente las dependencias aprobadas de Prisma 7 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`). No se añaden SDKs de DeepSeek o Fal ni librerías de FFmpeg: se usa `fetch`, `node:crypto`, `node:child_process`, `node:fs`, `node:os`, Prisma y FFmpeg del sistema.

## Out of Scope

- Audio, voz en off, música, doblaje, sincronización labial y subtítulos.
- Texto quemado, overlays, marcas de agua, títulos y créditos en el vídeo.
- Transiciones distintas del corte seco; crossfades, wipes, zoom transitions y LUTs.
- Multi-referencia, referencia de vídeo, Nano Banana Pro Edit y composición multi-referencia.
- Publicación en el feed, creación de `Short`, descarga, compartición y enlaces públicos.
- Autenticación, cuentas, perfiles, pagos, suscripciones y facturación.
- Elección libre de modelo, endpoint, duración, resolución, aspect ratio, semilla, cámara o prompt negativo.
- Edición manual del montaje, recorte, reordenación, miniaturas y postprocesado.
- Reanudación tras perder la cookie, cambio de dispositivo o recuperación de cuenta.
- Rate limit distribuido, Redis, colas propias, workers durables, webhooks y tareas programadas externas.
- Multi-región, alta disponibilidad y ensamblaje distribuido.
- Analítica, tracking, A/B testing, píxeles y telemetría de terceros.
- i18n, selector de idioma y copy en otros idiomas.
- Storybook, Playwright, tests E2E de navegador y nuevas dependencias fuera del stack aprobado de Prisma 7/pg.
- Migración a Tailwind v4, cambios de tokens o rediseño de feed/landing.
- Cambios en `/composer` o en los contratos de 004.

## Open Questions

Preguntas abiertas. Las verificaciones de infraestructura (DeepSeek Vision + JSON, precios reales, FFmpeg, Supabase pooler) son **gates de fase 1**: no bloquean el contrato de esta spec, pero deben cerrarse antes de la fase correspondiente. Las decisiones de producto están cerradas.

1. **DeepSeek Vision + `json_object`**: confirmar en fase 1 que `deepseek-flash` acepta `image_url` y `response_format` juntos. Si no, es un gate que reabre la decisión de referencia; no se implementa un fallback silencioso.
2. **Precios reales**: sustituir los valores unitarios por precios verificados. Si el peor caso de 6 escenas `Calidad` supera 8 USD, se aplica el cap y se documenta; no se sube el cap.
3. **Kling 6 s**: confirmar que Kling 2.5 Turbo Pro solo ofrece 5/10 s y que recortar 10 s a 6 s es aceptable en calidad y coste. Si ofrece 6 s, se ajusta el adaptador sin cambiar el contrato.
4. **FFmpeg en producción**: confirmar binarios, CPU y disco del hosting; si no hay FFmpeg, el montaje queda deshabilitado con `ffmpeg-not-configured`.
5. **Punto de entrada**: decidir si se añade un enlace `Crear historia` en el feed o en la landing en una spec de navegación posterior. 005 no modifica esas rutas.
6. **TTL**: confirmar 24 h de historia frente a 7 días de cookie. La diferencia es intencionada (medios y coste), pero debe validarse con producto.
7. **Supabase + Prisma 7**: verificar el pooler 6543 con `?pgbouncer=true` y `DIRECT_URL` 5432 en el entorno real; si hay incompatibilidad, se ajusta la configuración sin cambiar el modelo.
8. **Backups**: definir PITR o backup diario y probar la restauración antes de abrir al público.
9. **Idioma del guion**: DeepSeek se instruye en español, pero no se ejecuta detección de idioma; confirmar si se quiere validar que la salida sea española.
10. **Multi-instancia**: validar el reconciliador con dos procesos y leases expirados; si el riesgo de submit duplicado es inaceptable, se añadirá una enmienda con idempotencia a nivel de proveedor o worker durable.

## Implementation Phases

### Fase 0 — Extracción compartida (completada)

- `server/fal/` y `server/shared/` extraídos; shims de compatibilidad en `server/composer/`.
- 613 tests en verde y build correcto.
- Deuda conocida: ampliar guardas a `server/fal/**` y `server/shared/**` en fase 5; separar primitivas genéricas de las específicas de Composer en `server/shared/job-token.ts` y `server/shared/validation.ts` si Story las necesita.

### Fase 1 — Base de datos y director

**Objetivo**: persistencia real y guion validado.

- `server/db/prisma.ts` perezoso; migración `init`; `db:generate`.
- `app/models/story.ts`, `app/data/story.ts`, `app/utils/story.ts`.
- `server/story/errors.ts`, `validation.ts`, `session.ts`, `cost.ts`, `rate-limit.ts`, `repository.ts`, `prisma-story-repository.ts`.
- `server/story/director.ts`, `director-prompt.ts`, `director-types.ts`, `plan-validator.ts`.
- `server/story/story-service.ts` (create/get), `runtime.ts`.
- Rutas `POST /api/story` y `GET /api/story/[id]`.
- `/story` con formulario, defaults y estados de planificación.
- Tests: director, plan, repository, validation, errores, create/detail, formulario.
- **Gate**: verificar DeepSeek Vision + JSON; precios; migración contra PostgreSQL local y Supabase de staging.

**Exit criteria**: una premisa crea una historia persistida con plan válido y 4–6 escenas; `GET` respeta ownership; `/composer` sigue intacto.

### Fase 2 — Keyframes, referencia y revisión

**Objetivo**: imágenes reales y revisión humana.

- `server/fal/http-client.ts` con `uploadBinary`; `storage-service.ts` con prefijo/lifecycle opcionales.
- `POST /api/story/uploads`; `StoryReferencePicker`.
- `keyframe-orchestrator.ts`; reconciliador mínimo con claim/lease.
- `POST .../keyframe`; `POST .../approve` (sin vídeos todavía).
- `StoryReview`, `StorySceneCard`, `StoryPlanProgress`.
- Tests: storage, uploads, keyframes, reconciliador de keyframes, revisión, regeneración.
- **Gate**: CORS del `PUT`, lifecycle de referencia y calidad de Kontext.

**Exit criteria**: 4–6 keyframes reales, revisión con regeneración individual, `WAITING_APPROVAL` y aprobación persistida.

### Fase 3 — Vídeos, reconciliador y reconexión

**Objetivo**: vídeos por escena y recuperación tras recarga.

- `video-orchestrator.ts`; concurrencia 2; estados por escena.
- `POST .../retry`; `POST .../cancel`.
- `StoryVideoProgress`; polling con `useStory`; visibilidad/offline; recuperación de `/story/[id]`.
- Tests: vídeos, retry, cancel, polling, recarga, componentes.
- **Gate**: latencia real de MiniMax/Kling; ventana de duplicado por crash.

**Exit criteria**: 4–6 vídeos por escena, reintento individual, cancelación, recarga en `GENERATING_VIDEOS` y `VIDEOS_READY`.

### Fase 4 — FFmpeg y resultado final

**Objetivo**: MP4 único de 24–36 s.

- `ffmpeg-runner.ts`, `media-downloader.ts`, `assembly-service.ts`, `media-storage.ts`.
- `POST .../assemble`; transición `ASSEMBLING` → `READY`/`FAILED`.
- `StoryAssemblyProgress`, `StoryResult`.
- Tests: comandos, runner, downloader, storage, ensamblaje, resultado.
- **Gate**: FFmpeg real, duración exacta, sin audio, `faststart`, subida y lifecycle.

**Exit criteria**: MP4 720×1280 con cortes secos, reproducible, `READY`, sin descarga/compartir.

### Fase 5 — Hardening, accesibilidad, PWA y QA

**Objetivo**: cerrar calidad y operación.

- Rate limit, presupuesto diario, idempotencia y concurrencia completos.
- Guardas estáticas ampliadas; regresión de 004; documentación y `.env.example`/README.
- Accesibilidad completa, responsive, reduced motion, forced colors.
- PWA/offline; logs estructurados y redacción.
- Cleanup de expirados; checklist de despliegue; backups.
- Smoke opt-in de FFmpeg y de extremo a extremo.
- **Exit criteria**: `npm run db:generate && npm run test:run && npm run build` en verde; 613 tests de 004 intactos; QA manual completada; gates de precio/DeepSeek/FFmpeg cerrados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Rutas y SSR)**: `/story` y `/story/[id]` responden 200, declaran un único `h1`, `header`/`main`, formulario o shell determinista y `noscript`; el SSR no contiene historias, planes, claves, URLs de Fal ni cookies.
- **SC-002 (Presupuesto de clics)**: el camino por defecto se completa en 1–3 clics (entrada + `Crear historia` + `Aprobar y generar vídeos`); escenas, calidad y referencia son opcionales.
- **SC-003 (Plan válido)**: una premisa válida produce exactamente 4, 5 o 6 beats con `visualPrompt` y `narration`, persistidos en `planJson` y en `Scene`; un plan inválido se reintenta una vez y no crea historia.
- **SC-004 (Keyframes)**: cada escena tiene un keyframe 9:16; con referencia se usa Kontext y sin ella FLUX dev; la regeneración solo afecta a una escena y respeta 2 intentos.
- **SC-005 (Aprobación)**: no se genera ningún vídeo sin `approve`; aprobar dos veces no duplica vídeos; regenerar invalida la aprobación.
- **SC-006 (Vídeos)**: cada escena tiene un vídeo de 6 s final; como máximo 2 en vuelo; un fallo se reintenta una vez sin repetir las demás; el fallo agregado es `FAILED` con `video-failed`.
- **SC-007 (Persistencia y recuperación)**: recargar en `WAITING_APPROVAL`, `GENERATING_VIDEOS` o `ASSEMBLING` recupera el estado real y el polling; sin cookie devuelve 404 y no promete recuperación.
- **SC-008 (Montaje)**: el MP4 final dura `sceneCount × 6` ± 0,3 s, mide 720×1280, 30 fps, `yuv420p`, `h264`, `faststart`, sin audio ni subtítulos y con cortes secos.
- **SC-009 (Coste)**: ninguna historia supera 8 USD estimados; los intentos fallidos cuentan; el presupuesto diario y el rate limit devuelven 429 con `Retry-After`.
- **SC-010 (Seguridad)**: ninguna respuesta, HTML o log contiene claves, `DATABASE_URL`, `DIRECT_URL`, premisa, prompts, narración, URLs de proveedor, `requestId` ni IP en claro; las URLs de medios pasan la allowlist.
- **SC-011 (Errores)**: DeepSeek, Fal, Prisma y FFmpeg devuelven códigos estables y mensajes exactos; no se filtra el mensaje crudo ni SQL.
- **SC-012 (Accesibilidad)**: Lighthouse Accessibility ≥ 95 y cero violaciones axe críticas o serias; foco, `role="status"`, `role="alert"`, 44 px, reduced motion y forced colors correctos.
- **SC-013 (Responsive y PWA)**: cero scroll horizontal de 320 a 1920 px y zoom 200 %/400 %; el service worker no cachea `/api/story/**` ni Fal; offline se explica sin simular éxito.
- **SC-014 (No regresión)**: los 613 tests de 004 pasan sin cambios; `/composer`, `/feed` y `/` mantienen su comportamiento y copy; solo se añaden tests nuevos.
- **SC-015 (Calidad)**: `npm run db:generate`, `npm run test:run` y `npm run build` terminan correctamente; cada archivo runtime nuevo tiene cobertura; los smokes reales son opt-in y documentados.

## Enmienda A — Pre-análisis determinista de premisa (2026-10-21)

**Estado**: propuesta de enmienda sobre 005 ya implementada. Requiere aprobación humana en el Checkpoint 1 de la enmienda antes de escribir código.

**Naturaleza**: **aditiva**. No reescribe FR históricos, no cambia contratos de API, no cambia el esquema de Prisma, no añade UI y no añade coste. Las cláusulas afectadas se leen a través de la tabla de enmienda de A.2, que prevalece sobre el texto histórico solo en los puntos listados.

**Decisión de producto ya aprobada (no se reabre)**: enfoque **A — brief de producción determinista con cero llamadas extra a DeepSeek**. Los enfoques B (reescritura por LLM) y C (híbrido) quedan **fuera de alcance** y solo se documentan como evolución futura en A.8.

### A.1 Motivo y diagnóstico

Síntoma reportado: creaciones con `director-invalid-output` (502) cuando la premisa del usuario es muy simple o muy corta. Se contrastaron tres candidatos contra el código real:

| # | Hipótesis | Evidencia en código | Conclusión |
|---|-----------|---------------------|------------|
| 1 | La premisa entra demasiado escueta y el director no tiene material para producir 4–6 beats que cumplan el esquema | `STORY_MIN_PREMISE_LENGTH = 10` y `STORY_MAX_PREMISE_LENGTH = 600` (`server/story/validation.ts:27-28`); una premisa < 10 se rechaza **antes** de DeepSeek con 400 `premise-required`. El plan exige `visualPrompt` 20–600 y `narration` 10–280 (`server/story/plan-validator.ts:4-7`), de modo que una premisa de 10–59 caracteres puede producir beats por debajo del mínimo y agotar la reparación. | **Causa principal**. Se mitiga con el brief de esta enmienda. **El mínimo de 10 caracteres no se toca** (FR-011 intacto). |
| 2 | El esquema de salida no se cumple aunque la premisa sea suficiente | Validación estricta en `server/story/plan-validator.ts` (claves exactas, exactamente N beats, longitudes, HTML/Markdown). | **Causa parcial**. El brief sube la densidad de contexto, pero **no se relaja la validación**: el esquema sigue siendo el mismo. |
| 3 | Truncamiento de la respuesta por presupuesto de tokens | `DIRECTOR_MAX_TOKENS = 1_400` fijo (`server/story/director.ts:18`) para 4–6 beats; `readMessageContent` (`server/story/director.ts:45-59`) descarta `finish_reason`, así que truncamiento y JSON malformado son indistinguibles; la reparación es única y luego se lanza `director-invalid-output` (`server/story/director.ts:96-116`). | **Causa independiente**. Se mitiga en A.3 con `max_tokens` por número de escenas y reparación informada. |

No es la causa: el modelo (`deepseek-flash`), `response_format: { type: "json_object" }` ni la temperatura. La enmienda **no cambia** ninguno de los tres.

### A.2 Tabla de enmienda

| Cláusula | Texto anterior (resumen) | Enmienda | Efecto |
|----------|--------------------------|----------|--------|
| **FR-019** | El director MUST llamar a DeepSeek; el modelo es fijo y no elegible por el cliente. | La instancia de `StoryDirector` inyectada en `StoryService` y en `runtime.ts` es un **decorador** (`briefing-director.ts`) que envuelve al director nativo y le pasa un `context` estructurado. El director nativo sigue siendo el único que habla con `https://api.deepseek.com/chat/completions`. | Sin cambio de contrato externo. Sigue habiendo **una sola** petición HTTP en el camino feliz. |
| **FR-020** | La petición MUST usar `response_format: { type: "json_object" }`, `stream: false`, `temperature` fija y `max_tokens` acotado. | `max_tokens` deja de ser un valor único: MUST derivarse del número de escenas (4→1400, 5→1400, 6→1900, tope 2000) y el director MUST leer `choices[0].finish_reason`. `response_format`, `stream` y `temperature` no cambian. | Reduce el truncamiento en 6 escenas sin cambiar el formato de la petición. |
| **FR-023** | Un único reintento de reparación con el error y el esquema; si falla, 502 `director-invalid-output`. | La reparación sigue siendo **única**. Cuando `finish_reason === 'length'`, esa única reparación MUST incluir una nota de truncamiento y un presupuesto mayor (`min(2000, base + 500)`). Nunca un segundo reintento. | Reparación informada; se mantiene el límite de 2 peticiones. |
| **FR-025** | Con referencia, el mensaje de usuario incluye la imagen como `image_url` además de la premisa. | El bloque de brief MUST vivir en la **parte de texto** del mensaje; el bloque `image_url` sigue siendo un bloque separado y posterior. La validación de `referenceUrl` no cambia. | Sin cambio de contrato de referencia. |
| **FR-103** | MUST NOT loggearse la premisa, el plan, `visualPrompt`, `narration`, URLs, `requestId`, `Idempotency-Key`, cadena de conexión ni IP en claro. | La allowlist de campos de log MUST ampliarse **solo** con `briefApplied` (boolean) y `finishReason` (`stop` \| `length` \| `content_filter` \| `unknown`), repartidos en **dos sinks opcionales separados**: `finishReason` en el sink del director nativo (`StoryDirectorOptions.onEvent`) y `briefApplied` en el del decorador (`BriefingDirectorOptions.onEvent`). El brief renderizado se añade a la lista de campos prohibidos. | Instrumentación mínima sin filtrar contenido, y cada dato se emite en la capa que realmente lo conoce. |
| **FR-133** | Cada archivo runtime nuevo MUST tener cobertura automatizada directa o por integración. | Aplica a los dos archivos nuevos: `server/story/premise-brief.ts` y `server/story/briefing-director.ts`. La cobertura se añade en **archivos de test nuevos**; los tests existentes no se modifican. | Cobertura sin regresión. |
| **FR-134** | MUST existir tests de rutas, componentes, aceptación SSR, reconciliador y regresión de 004. | Se añade un test de ruta de `POST /api/story` con premisa corta y director real decorado contra stub local. Los tests existentes de esta lista MUST NOT modificarse. | Una ruta cubierta, cero tests reescritos. |
| **FR-135** | Fixtures de DeepSeek y Fal, y smokes opt-in. | No se añaden fixtures ni se modifican las existentes. La tabla dorada del brief vive en el test unitario nuevo; los casos de `finish_reason` usan un `fetchImpl` inyectado, sin tocar `tests/helpers/deepseek-stub.ts`. | Inventario de fixtures intacto. |
| **FR-011** | La premisa MUST tener entre 10 y 600 caracteres y rechazarse con 400 `premise-required` por debajo de 10. | **Sin cambio.** Se explicita para evitar reinterpretaciones: el brief nunca se ejecuta antes de esa validación, así que una premisa < 10 sigue devolviendo 400 y no consume cuota. | Aclaración, no enmienda. |
| **FR-085** | MUST NOT añadirse ningún campo nuevo al schema para v1. | **Sin cambio.** Se explicita que el brief **no se persiste** en `Story`, `Scene` ni `planJson`, y que la enmienda **no incluye migración de Prisma**. | Aclaración, no enmienda. |
| **Out of Scope** | Quedan fuera elección libre de modelo/endpoint/prompt negativo y las nuevas dependencias. | Se aclara que el brief es **interno, determinista y no configurable**: no es un prompt de usuario, no es una nueva dependencia, no añade campos de formulario ni afecta al camino de 1–3 clics. | Aclaración de alcance. |
| **Constitution Check, bullet II** | «No cambia contratos de 004; no hay tabla de supersesión porque no hay enmienda.» | Describe el estado de la Phase 1 original. Con la Enmienda A sí existe tabla de enmienda (A.2), y sigue sin haber enmienda a 004. | Aclaración: el bullet histórico se lee como estado previo; prevalece esta tabla. |
| **004 (todas las cláusulas)** | — | **No hay enmienda a 004.** No se tocan `/composer`, `app/models/composer.ts`, `app/components/composer/**`, `app/composables/useComposer*`, `server/composer/**` ni `server/api/composer/**`; los 613 tests de 004 MUST seguir sin cambios y en verde. | Sin impacto en 004. |

### A.3 Requisitos nuevos

Los FR nuevos son **FR-136 a FR-150**. No se reutiliza ningún número existente (el último histórico es FR-135).

#### Brief determinista y módulo puro

- **FR-136**: MUST existir `server/story/premise-brief.ts` como módulo **puro**: sin I/O, sin `fetch`, sin `process.env`, sin `useRuntimeConfig`, sin reloj, sin aleatoriedad y sin estado mutable entre llamadas. MUST exportar `analyzePremise(premise: string): PremiseBriefAnalysis` y `renderBriefBlock(brief: StoryBrief): string`, con los tipos de A.4. MUST usar `normalizeText` de `server/shared/prompt.ts` y MUST NOT duplicar la normalización NFC/`trim`. MUST NOT contener el token `any` (guarda `tests/unit/story-guards.spec.ts:199`).
- **FR-137**: `applied` MUST calcularse con la heurística exacta `normalizedLength < 60 || wordCount < 9 || clauseCount < 2`, donde `normalized = normalizeText(premise)`, `normalizedLength = normalized.length`, `wordCount` es el número de segmentos no vacíos de `normalized.split(/\s+/u)` y `clauseCount` es el número de segmentos no vacíos que resultan de sustituir `[,;:.]+` y las palabras completas `y`, `pero`, `luego`, `cuando` (case-insensitive) por un separador, con un mínimo de 1. `reasons` MUST listar en orden fijo `short-text`, `few-words`, `single-clause` las señales satisfechas. La función MUST ser determinista: la misma entrada MUST producir siempre la misma salida, sin depender del locale, la zona horaria ni el reloj.
- **FR-138**: El brief MUST contener como máximo **5 directivas**, cada una de **1 a 120** caracteres, y el bloque renderizado MUST medir **≤ 500** caracteres. Las directivas MUST pedir concretar **lugar, época u hora, atmósfera, vestuario, luz y encuadre** y MUST prohibir explícitamente **cambiar el tema, los personajes o el desenlace**. Son directivas de producción, no hechos narrativos nuevos.
- **FR-139**: Las directivas MUST ser constantes del servidor: MUST NOT interpolar texto de la premisa ni datos del usuario (la premisa solo aporta métricas). MUST NOT contener `<`, `>`, backticks, encabezados `#`, viñetas Markdown, cercas de código, caracteres de control, URLs, nombres de proveedor ni claves.

#### Decorador y mensaje al director

- **FR-140**: MUST existir `server/story/briefing-director.ts` con `createBriefingDirector(inner: StoryDirector, options?: BriefingDirectorOptions): StoryDirector`. El decorador MUST calcular el brief, MUST delegar en `inner.createPlan` con el `context` estructurado, MUST devolver el plan sin modificarlo y MUST propagar cualquier `StoryError` sin transformarlo. MUST NOT hacer HTTP directo, MUST NOT cachear planes y MUST NOT mantener estado por historia.
- **FR-141**: Por cada `createPlan`, el decorador MUST provocar **exactamente las mismas peticiones HTTP** que el director nativo sin brief: 1 en el camino feliz y 2 solo cuando el plan requiera la reparación única de FR-023. MUST NOT añadir una llamada de "mejora", un segundo prompt ni un reintento propio.
- **FR-142**: `StoryDirector.createPlan` MUST aceptar un campo `readonly context?: DirectorContext` (tipo server-only). `StoryServiceImpl` y `server/api/**` MUST NOT construirlo, enviarlo ni recibirlo desde el cliente. Cuando `applied = false`, el decorador MUST omitir `context` (dejarlo `undefined`) para que el mensaje sea byte-idéntico al actual.
- **FR-143**: `storyDirectorUserMessage(premise, referenceUrl, context?)` MUST aceptar un tercer parámetro opcional. Sin tercer argumento, la cadena resultante MUST ser **byte-idéntica** a la actual. Con bloque, la premisa MUST aparecer **verbatim, exactamente una vez**, el bloque MUST ir **después** de `Premisa: {premise}` y **antes** del esquema JSON, separado por una línea en blanco, y el esquema MUST seguir siendo el último contenido. Con referencia, el bloque MUST ir en la parte de texto y el bloque `image_url` MUST seguir siendo el último.
- **FR-144**: `max_tokens` MUST derivarse del número de escenas: **4→1400, 5→1400, 6→1900**, con tope **2000**. `DIRECTOR_MAX_TOKENS` MUST seguir exportándose con el valor de 5 escenas (**1400**) para no romper `tests/unit/server/story-director.spec.ts:86`. El tope MUST aplicarse también a la reparación.
- **FR-145**: El director MUST leer `choices[0].finish_reason` y clasificarlo como `stop`, `length`, `content_filter` o `unknown` (ausente o no reconocido). Con `stop` el comportamiento MUST ser el actual. Un plan válido MUST aceptarse aunque `finish_reason` sea `length`. Si el plan es inválido y `finish_reason === 'length'`, la reparación única MUST incluir una nota explícita de truncamiento y `max_tokens = min(2000, base + 500)`; si esa reparación vuelve a fallar, MUST lanzarse `director-invalid-output` sin un tercer intento.

#### Invariantes de dominio, coste, UI y observabilidad

- **FR-146**: MUST NOT añadirse códigos de error nuevos. La enmienda MUST reutilizar `director-invalid-output` (502), `director-timeout` (504), `director-unavailable` (503) y `content-blocked` (422). El brief MUST NOT producir 400, 413 ni un 5xx nuevo, y MUST NOT aparecer en el mensaje de error ni en su serialización.
- **FR-147**: La premisa original MUST viajar **verbatim** al director: la cadena que recibe `createPlan` es la misma que la normalizada por FR-011, sin recortes, resúmenes, prefijos ni sustitución. `canonicalStoryBody` (premisa, `sceneCount`, `preset`, `referenceUrl`, `referenceExpiresAt`) y `hashStoryBody` MUST NOT cambiar, de modo que la idempotencia por `Idempotency-Key` y la deduplicación de 60 s siguen intactas. El brief MUST NOT persistirse: `Story` y `Scene` no ganan columnas, `Story.planJson` sigue conteniendo solo `title`, `logline` y `beats`, y la enmienda MUST NOT incluir migración de Prisma.
- **FR-148**: El coste MUST ser **0 USD adicionales**: cero llamadas extra a DeepSeek. `server/story/cost.ts`, `directorCostUsd` (0,01), el cap de 8 USD, el presupuesto diario y el rate limit MUST NOT cambiar. `max_tokens` es un tope de salida, no una llamada nueva, y la reparación ya estaba presupuestada en `directorCostUsd`.
- **FR-149**: MUST NOT añadirse código nuevo en `app/`. No hay cambios de UI, copy, `data-testid`, campos de formulario, mensajes ni estados; el brief MUST NOT mostrarse al usuario. El camino por defecto de 1–3 clics MUST NOT cambiar.
- **FR-150**: La allowlist de observabilidad MUST ampliarse **solo** con `briefApplied` (boolean) y `finishReason`, y ese par MUST repartirse entre **dos sinks opcionales e independientes**: el director nativo (`StoryDirectorOptions.onEvent`) emite `finishReason` junto a `attempt` (1 y, si hay reparación, 2) una vez por intento; el decorador (`BriefingDirectorOptions.onEvent`) emite `briefApplied`. `attempt`, `errorCode`, `stage`, `modelId`, `sceneCount` y `latencyMs` ya eran campos permitidos. Los eventos siguen siendo los existentes (`story.plan.ok`, `story.plan.failed`). MUST seguir prohibido loggear la premisa, el plan, `visualPrompt`, `narration`, el brief renderizado, URLs de proveedor, `requestId`, `Idempotency-Key`, claves, cadena de conexión e IP en claro. Sin `onEvent` no se emite nada y la petición HTTP MUST ser idéntica; si se inyecta un sink, MUST recibir únicamente campos de la allowlist de su propio tipo.

### A.4 Contrato de datos server-only

Todos los tipos de esta enmienda son **server-only**. Ninguno se exporta desde `app/models/`, ninguno usa `any`, ninguno expone `unknown` público y todos los campos son `readonly`.

```ts
// server/story/premise-brief.ts — SOLO servidor. No se exporta desde app/models/.
export type StoryBriefSignal = 'short-text' | 'few-words' | 'single-clause'

export type StoryBrief =
  | { readonly applied: false; readonly reasons: readonly [] }
  | {
      readonly applied: true
      readonly reasons: readonly StoryBriefSignal[]
      readonly directives: readonly string[]
      readonly rendered: string
    }

export interface PremiseBriefAnalysis {
  readonly normalizedLength: number
  readonly wordCount: number
  readonly clauseCount: number
  readonly brief: StoryBrief
}

export function analyzePremise(premise: string): PremiseBriefAnalysis
export function renderBriefBlock(brief: StoryBrief): string // '' cuando applied = false
```

```ts
// server/story/director-types.ts — tipo server-only ampliado.
export interface DirectorContext {
  readonly brief: StoryBrief
}

export type DirectorFinishReason = 'stop' | 'length' | 'content_filter' | 'unknown'

export interface StoryDirector {
  createPlan(input: {
    readonly premise: string
    readonly sceneCount: number
    readonly referenceUrl: string | null
    readonly context?: DirectorContext
  }): Promise<DirectorPlan>
}
```

```ts
// server/story/director.ts — ampliación aditiva del director nativo. Tipos server-only.
export interface StoryDirectorLogEvent {
  readonly event: 'story.plan.ok' | 'story.plan.failed'
  readonly attempt: 1 | 2
  readonly finishReason: DirectorFinishReason
  readonly errorCode?: string
}

export interface StoryDirectorOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
  readonly onEvent?: (event: StoryDirectorLogEvent) => void
}
```

```ts
// server/story/briefing-director.ts — SOLO servidor.
export interface BriefingDirectorLogEvent {
  readonly event: 'story.plan.ok' | 'story.plan.failed'
  readonly briefApplied: boolean
  readonly errorCode?: string
}

export interface BriefingDirectorOptions {
  readonly onEvent?: (event: BriefingDirectorLogEvent) => void
}

export function createBriefingDirector(
  inner: StoryDirector,
  options?: BriefingDirectorOptions,
): StoryDirector
```

`finishReason` vive **solo** en el sink del director nativo porque `createPlan` devuelve únicamente `DirectorPlan`: el decorador no puede observar el `finish_reason` de la respuesta HTTP.

Reglas del contrato:

- La unión discriminada es sobre `applied`, que es un literal booleano; el estrechamiento MUST funcionar sin aserciones de tipo.
- `StoryBrief` no contiene texto del usuario: `directives` y `rendered` se derivan solo de constantes del servidor y de las métricas de la premisa.
- El brief **no** forma parte de `Story`, `Scene`, `SceneRecord`, `DirectorPlan` ni `app/models/story.ts`. `DirectorPlan` MUST NOT ganar campos.
- Los dos sinks son **independientes y opcionales**: el nativo emite `finishReason` y `attempt` (uno por intento), el decorador emite `briefApplied`. Ninguno de los dos tipos de evento incluye campos del otro, y sin sink inyectado no se emite nada.
- Los archivos nuevos MUST NOT contener el token `any` ni importar `node:crypto`, `@prisma/client` ni módulos de `app/`.

### A.5 Contrato de API

**Sin cambios.** La expansión es **interna**: el cliente sigue enviando `premise` y el servidor persiste y devuelve **la premisa del usuario**, nunca el texto enriquecido.

| Elemento | Estado |
|----------|--------|
| Rutas (`POST /api/story`, `GET /api/story/{id}`, uploads, keyframe, approve, retry, assemble, cancel) | Sin cambios. No hay rutas nuevas ni eliminadas. |
| Request de `POST /api/story` (`premise`, `sceneCount`, `preset`, `referenceUrl`, `referenceExpiresAt`) | Sin cambios. No se aceptan campos nuevos; el brief no es un parámetro. |
| Response, DTO y `premise` devuelta | Sin cambios: se devuelve la premisa original normalizada. |
| Códigos de estado y códigos de error | Sin cambios. Se reutilizan `director-invalid-output`, `director-timeout`, `director-unavailable`, `content-blocked`. |
| Cabeceras, cookies, `Idempotency-Key` | Sin cambios. `canonicalStoryBody` y `hashStoryBody` no cambian. |
| Límites de body (16 KiB / 8 KiB / 4 KiB) | Sin cambios: el brief no viaja por HTTP. |

Justificación: cualquier cliente (incluido un cliente futuro o un reintento manual) obtiene el mismo contrato y el mismo resultado observable; no hay estado nuevo que reconciliar y ninguna ruta necesita saber que el brief existe.

### A.6 Máquina de estados

**Sin cambios.** El brief no introduce estados, jobs, leases, reintentos ni transiciones:

| Aspecto | Efecto |
|---------|--------|
| Estados globales y por escena | Idénticos. El brief vive dentro de `createPlan`, antes de crear la fila. |
| `PLANNING` | Sigue reservado y no persistido (FR-028). |
| Recuperación y cancelación | Sin cambios: no hay nada que cancelar ni reanudar en el brief. |
| Fallos | Se mapean a los códigos existentes del director; el brief no puede fallar por sí mismo (es puro y total). |
| Reconciliador y leases | No se tocan. |

### A.7 Seguridad

| Riesgo | Mitigación de la enmienda |
|--------|---------------------------|
| **Prompt injection** | El brief lo escribe el servidor con constantes; MUST NOT interpolar texto del usuario. Se coloca **después** de la premisa y delimitado por marcadores fijos, de modo que la premisa sigue siendo el único contenido no confiable y el bloque no puede confundirse con instrucciones del usuario. Sin herramientas, sin URLs y sin cambios de `response_format`. |
| **Alteración de la idea** | La premisa MUST aparecer verbatim y el brief MUST prohibir cambiar tema, personajes y desenlace. El plan sigue validándose con el mismo esquema. |
| **Fuga de contenido a logs** | Solo se añaden `briefApplied` y `finishReason`; el brief renderizado entra en la lista prohibida (FR-103 + FR-150). |
| **Secretos** | No hay claves, variables de entorno ni configuración nuevas; el módulo puro no lee `process.env` ni `useRuntimeConfig`. |
| **Superficie de ataque nueva** | Ninguna: sin endpoint, sin campo de request, sin parámetro de cliente y sin código en `app/`. |
| **Coste y abuso** | Sin llamadas extra; el rate limit, la idempotencia y el cap de 8 USD siguen siendo la única defensa y no se relajan. |
| **Contenido bloqueado** | El brief es neutro y de producción; `content-blocked` se mantiene con el mismo mapeo y no se añade bypass. |

### A.8 Coste y latencia

| Enfoque | Llamadas DeepSeek extra | Coste extra por creación | Latencia extra | Riesgos | Decisión |
|---------|-------------------------|--------------------------|----------------|---------|----------|
| **A — Brief determinista** | 0 | **0 USD** | ~0 ms (cálculo puro en memoria, sin red) | Bajo: heurística conservadora, texto acotado, determinista | **Aprobado** |
| B — Reescritura por LLM | 1 (+1 reparación posible) | ~0,01–0,03 USD | +3–15 s (timeout 45 s) | Alto: nueva llamada pagada, nueva latencia, nueva causa de fallo, puede alterar la idea | Fuera de alcance (evolución futura) |
| C — Híbrido (heurística y, si sigue corto, LLM) | 0–1 | 0–0,03 USD | 0–15 s | Medio-alto: dos caminos que probar, no determinista, misma latencia y coste que B en el peor caso | Fuera de alcance (evolución futura) |

Notas:

- `max_tokens` pasa a depender de las escenas, pero es un **tope de salida**, no una petición: no añade coste por sí mismo y la reparación ya estaba contemplada en `directorCostUsd`.
- La latencia del brief es despreciable frente a los 3–15 s típicos de DeepSeek (tabla de «Costes y latencia»); no se muestra al usuario ni se convierte en ETA.
- El coste estimado por historia (FR-092) y el cap de 8 USD no cambian.

### A.9 Escenarios de aceptación

1. **Premisa de 15 caracteres**
   **Given** una premisa válida de 15 caracteres (≥ 10, < 60) y defaults,
   **When** se envía `POST /api/story`,
   **Then** el brief tiene `applied = true` con señales `short-text`, `few-words` y `single-clause`; la petición a DeepSeek es **una sola**; el contenido de usuario contiene la premisa **verbatim** y el bloque de brief después de ella con ≤ 500 caracteres y ≤ 5 directivas; la historia se persiste con la premisa original de 15 caracteres.

2. **Premisa de 60+ caracteres con 2 cláusulas**
   **Given** una premisa de longitud ≥ 60, ≥ 9 palabras y ≥ 2 cláusulas,
   **When** se llama a `createPlan`,
   **Then** `applied = false`; el decorador NO pasa `context`; el mensaje de usuario es **byte-idéntico** al que produce hoy `storyDirectorUserMessage(premise, referenceUrl)` sin tercer argumento; `max_tokens` corresponde solo al número de escenas.

3. **Premisa de 600 caracteres**
   **Given** una premisa de exactamente 600 caracteres (el máximo de FR-011),
   **When** se envía `POST /api/story`,
   **Then** no hay 400 ni 413; la premisa entra completa, sin truncar ni reescribir, el mensaje total no excede el límite de tokens de entrada del modelo y el plan se valida con el mismo esquema. Si la heurística marca `applied = true`, el bloque sigue siendo ≤ 500 caracteres.

4. **Mismo hash de idempotencia**
   **Given** dos peticiones idénticas (`premise`, `sceneCount`, `preset`, `referenceUrl`, `referenceExpiresAt`) con o sin `Idempotency-Key`,
   **When** se calcula `hashStoryBody(canonicalStoryBody(request))`,
   **Then** el hash es el mismo que antes de la enmienda y la repetición devuelve 200 sin una segunda llamada a DeepSeek; el brief no interviene en el hash.

5. **`finish_reason: length`**
   **Given** un stub que responde `finish_reason: 'length'` con un JSON incompleto,
   **When** el director procesa la respuesta,
   **Then** lanza **una** reparación con nota de truncamiento y `max_tokens = min(2000, base + 500)`; si esa reparación también falla, devuelve 502 `director-invalid-output` y no hay una tercera petición. Un plan válido con `finish_reason: 'length'` se acepta sin reparación.

6. **Ausencia de fugas en logs**
   **Given** cualquier creación, con brief o sin él,
   **When** se inspeccionan los eventos emitidos y la serialización de errores,
   **Then** no aparecen la premisa, el brief renderizado, el plan, `visualPrompt`, `narration`, URLs de proveedor, `requestId`, `Idempotency-Key` ni claves; solo pueden aparecer `briefApplied`, `finishReason`, `errorCode`, `stage`, `modelId`, `sceneCount` y latencias.

### A.10 Plan de tests

**Regla explícita: los tests existentes MUST NOT modificarse; solo se añaden archivos de test nuevos.** En particular quedan intactos y verdes: `tests/unit/server/story-director.spec.ts` (incluidas las longitudes 1 y 2 de `stub.requests`, la longitud 2 de `messages` y `body.max_tokens === DIRECTOR_MAX_TOKENS`), `tests/unit/server/story-director-prompt.spec.ts` (incluida la igualdad salvo número de beats), `tests/unit/server/story-service.spec.ts`, `tests/unit/server/story-plan-validator.spec.ts` y `tests/helpers/deepseek-stub.ts`.

| Test nuevo | Cobertura mínima |
|------------|------------------|
| `tests/unit/server/story-premise-brief.spec.ts` | Tabla dorada de **20 casos** con longitudes **9, 10, 29, 30, 59, 60 y 600** y **1 y 3 cláusulas**: 7 longitudes × 2 variantes de cláusulas = 14, más 6 casos de borde (frontera 8 vs 9 palabras, separadores `,` `;` `:` `.`, conectores `y`/`pero`/`cuando`, NFC compuesto vs descompuesto, saltos y tabulaciones colapsados por `normalizeText`, premisa de 600 con 3 cláusulas). Verifica `applied`, `reasons` en orden fijo, determinismo (dos llamadas iguales), límite de 5 directivas, ≤ 500 caracteres, ausencia de `<`, `>`, backticks, `#`, controles, URLs y texto de la premisa. |
| `tests/unit/server/story-briefing-director.spec.ts` | Decorador con `StoryDirector` fake: exactamente **1** llamada; `context` presente cuando `applied = true` y **ausente** cuando `applied = false`; premisa verbatim; plan devuelto sin mutar; `StoryError` propagado sin segunda llamada; el sink del decorador recibe solo `briefApplied` (y `errorCode` en fallo), **nunca** `finishReason` ni `attempt`; sin sink no hay emisión. |
| `tests/unit/server/story-director-context.spec.ts` | Director nativo con `context` contra el stub HTTP local: 1 petición; bloque después de la premisa y antes del esquema; premisa verbatim una sola vez; bloque + `image_url` conviven con el texto primero; sin `context`, el cuerpo es idéntico al actual. |
| `tests/unit/server/story-director-brief-prompt.spec.ts` | `storyDirectorUserMessage` con y sin tercer argumento: byte-identidad sin argumento, delimitadores, orden, ≤ 500 caracteres, sin `any`/`<`/backticks en el bloque, independencia del contenido de la premisa. |
| `tests/unit/server/story-director-tokens.spec.ts` | `max_tokens` por escenas (4→1400, 5→1400, 6→1900, tope 2000); `DIRECTOR_MAX_TOKENS === 1400`; `finish_reason` leído y clasificado; 1 evento por intento con `attempt: 1`/`attempt: 2` y `finishReason` en el sink del director nativo (y ninguno sin sink); `length` + plan inválido → 1 reparación con nota y `min(2000, base + 500)`; plan válido truncado aceptado; nunca un tercer intento; 502 final. Usa `fetchImpl` inyectado, no modifica el stub compartido. |
| `tests/acceptance/story-api-create-brief.spec.ts` | `POST /api/story` con premisa de 15 caracteres, director real decorado y stub HTTP local: 201, una sola petición, premisa original persistida y devuelta, bloque presente en la petición, replay idempotente con 200 y sin segunda llamada, sin claves ni URLs en la respuesta. |

Criterios del plan:

- Los nuevos tests MUST usar stubs y fakes locales; MUST NOT salir a internet ni llamar a DeepSeek real.
- La fila de longitud **9** es cobertura unitaria del módulo puro: en producción `validatePremise` la rechaza antes con 400 `premise-required` (FR-011), así que la ruta nunca llama a `analyzePremise` con menos de 10 caracteres.
- Los nuevos archivos MUST respetar las guardas existentes (`story-guards.spec.ts`): sin `any`, sin `Math.random`, sin `Date.now` fuera de lo permitido, sin `node:crypto`, sin imports de `server/composer/**` ni de `app/`.
- El gate es `npm run db:generate && npm run test:run && npm run build`, con el recuento exacto reportado; la baseline a batir es **1505 passed / 7 skipped opt-in / 96 archivos** más los archivos nuevos.

### A.11 Fuera de alcance de la enmienda

- Enfoques **B** (reescritura por LLM) y **C** (híbrido): solo evolución futura, con spec propia.
- Cambios de UI, copy, `data-testid`, formulario, estados visibles o camino de 1–3 clics.
- Migración de Prisma, columnas nuevas o persistencia del brief.
- Endpoints, campos de request, cabeceras, cookies o códigos de error nuevos.
- Dependencias nuevas (incluidos SDKs, librerías de NLP o de plantillas).
- Cambio del mínimo de premisa (10) o del máximo (600), del esquema del plan, de `response_format`, `stream`, `temperature`, del modelo o del timeout.
- Caché de briefs, telemetría, eventos nuevos de log más allá de la allowlist ampliada, i18n o edición de prompts por el usuario.
- Cualquier cambio en 004, feed, landing, `tailwind.config.ts` o `vitest.config.ts`.

### A.12 Fases de implementación de la enmienda

#### Fase A1 — Módulo puro y tabla dorada

- `server/story/premise-brief.ts` con FR-136 a FR-139 y el contrato de A.4.
- `tests/unit/server/story-premise-brief.spec.ts` con la tabla de 20 casos.
- **Exit criteria**: módulo determinista, sin I/O, ≤ 500 caracteres y ≤ 5 directivas; suite completa en verde sin tocar ningún test existente.

#### Fase A2 — Contexto, prompt y decorador

- `DirectorContext` y `context?` en `director-types.ts` (FR-142).
- Tercer parámetro opcional en `storyDirectorUserMessage` con byte-identidad sin argumento (FR-143).
- `briefing-director.ts` (FR-140, FR-141) y cableado en `runtime.ts` con `createBriefingDirector(createStoryDirector(...))`.
- Tests: decorador, contexto del director nativo y prompt.
- **Exit criteria**: una sola petición HTTP en el camino feliz; `story-director.spec.ts` y `story-director-prompt.spec.ts` intactos y verdes.

#### Fase A3 — `max_tokens` por escena y `finish_reason`

- FR-144 y FR-145 en `director.ts`, incluida la reparación informada y el tope de 2000.
- Ampliación de la allowlist de observabilidad (FR-150) y verificación de que no se filtra contenido.
- Tests: tokens, truncamiento, reparación única y ausencia de fugas.
- **Exit criteria**: 4→1400, 5→1400, 6→1900, tope 2000; `DIRECTOR_MAX_TOKENS` sigue en 1400; ningún tercer intento.

#### Fase A4 — Verificación

- `tests/acceptance/story-api-create-brief.spec.ts` (ruta con premisa corta y replay idempotente).
- Comprobaciones: sin migración pendiente, sin archivos nuevos en `app/`, `story.planJson` sin cambios, `cost.ts` sin cambios, `hashStoryBody` estable.
- Gate: `npm run db:generate && npm run test:run && npm run build`, con el recuento exacto (baseline 1505/7/96 + tests nuevos) y los 613 tests de 004 intactos.

**Cumplimiento constitucional de la enmienda**: I (ningún clic ni campo nuevo), II (enmienda explícita y trazable, sin reescribir historia), III (todo en `server/`, sin claves ni secretos nuevos, sin exponer contenido), IV (módulo puro y decorador que reutilizan `normalizeText` y la interfaz `StoryDirector`, sin abstracciones paralelas) y V (cada archivo runtime nuevo con cobertura nueva, sin modificar tests existentes).

## Constitution Check

Confirmación explícita contra `.specify/memory/constitution.md` v1.1.0:

- **I. Simplicity First (1-to-3-Clicks UX)**: el camino por defecto es premisa + `Crear historia` + `Aprobar y generar vídeos` (1–3 clics incluyendo la entrada). Escenas (5), calidad (Rápido) y duración (6 s) tienen defaults; la referencia es opcional. El progreso usa etapas reales, sin porcentajes ni ETA. Los errores ofrecen una acción útil y el resultado es terminal.
- **II. Spec-Driven Development**: esta es la Phase 1. No se escribe implementación, `plan.md` ni `tasks.md` hasta la aprobación humana en el Checkpoint 1. El entregable es solo esta spec. No cambia contratos de 004; no hay tabla de supersesión porque no hay enmienda.
- **III. Server-Side Security for AI & Secrets**: Fal, DeepSeek, Prisma y FFmpeg viven en `server/`. `NUXT_FAL_KEY` y `NUXT_DEEPSEEK_KEY` son `runtimeConfig` privados; `DATABASE_URL`/`DIRECT_URL` son variables de entorno server-only. Los jobs son asíncronos con polling. La subida de referencia es un `PUT` firmado del navegador; la única escritura de binario desde Nitro es el MP4 final generado por el servidor, aprobada explícitamente aquí y limitada a la allowlist de Fal. Todas las rutas de coste tienen rate limit, idempotencia, concurrencia y cap de 8 USD; los medios tienen lifecycle explícito.
- **IV. Modular Architecture & Reusability**: página en `app/pages/story/`, dominio en `app/components/story/`, lógica en `app/composables/`, modelos en `app/models/story.ts`, datos en `app/data/story.ts`, helpers en `app/utils/story.ts`, servidor modular en `server/story/` con repositorio, director, orquestadores, reconciliador y ensamblador inyectables. Se reutilizan `server/fal/` y `server/shared/`; no se duplican cliente HTTP, cola ni storage. Los tipos de proveedor y Prisma quedan en `server/`.
- **V. Test-First & Quality Gates**: se especifican tests unitarios por archivo runtime nuevo, tests de rutas con repositorio fake, componentes con API fake, aceptación SSR, reconciliador con leases, guardas estáticas, regresión de 004 y smokes opt-in de FFmpeg y extremo a extremo. El gate es `db:generate` + `test:run` + `build`.
- **Tailwind 3.4.x**: se usa sintaxis v3 y tokens existentes; no se modifica `tailwind.config.ts` ni se usa Tailwind v4.
- **Nuxt 4 / Node 22**: rutas por archivos, `useHead`/`useSeoMeta`, `server/api/`, `runtimeConfig`, Nitro y proceso Node persistente. No se usa `nuxt generate` para Story.
- **PWA**: `NetworkOnly` para `/api/**` y hosts de Fal; sin caché de medios ni de historias.
- **Sin cambios colaterales**: `/composer`, `app/components/composer/**`, `app/composables/useComposer*`, `app/models/composer.ts`, `server/composer/**`, `server/api/composer/**`, feed, landing, `specs/001`–`004`, `tailwind.config.ts` y `vitest.config.ts` no se modifican. Las únicas ediciones compartidas son aditivas: `server/fal/http-client.ts` (`uploadBinary`), `server/fal/storage-service.ts` (prefijo/lifecycle opcionales), `server/db/prisma.ts` (lazy), `nuxt.config.ts` (`runtimeConfig.story`/`deepseekKey`), `.env.example`, `README.md` y los scripts ya añadidos de Prisma. Las dependencias aprobadas de Prisma 7/pg ya están instaladas; no se añaden SDKs de proveedores ni librerías de FFmpeg.

**Desviaciones explícitas**:

1. **Binario de Nitro a Fal**: la constitución prohíbe proxear binarios de usuario salvo aprobación explícita. 005 lo aprueba **solo** para el MP4 generado por el servidor (`media-storage.ts`), no para subidas de usuario. La referencia sigue yendo navegador → Fal.
2. **Persistencia y reanudación**: 004 las excluía para el Composer. 005 las introduce en un dominio distinto (`Story`) con PostgreSQL, cookie y TTL; no altera el Composer.
3. **`server/plugins/`**: 004 lo prohibía para su implementación. 005 añade un único plugin de reconciliador, sin middleware ni proxy.
4. **Multi-instancia**: los leases reducen el riesgo, pero no se promete coordinación perfecta ni rate limit distribuido; se documenta y se prueba la recuperación.

---

## Enmienda B — Modo `thinking` explícito en el cliente DeepSeek (2026-10-23)

> Medición real del 2026-10-23 (3 llamadas, coste ≈ 0,0019 USD): DeepSeek activa `thinking` por defecto. En el director de planos, `usage.reasoning_tokens` fue 1 277 de 1 958 tokens de salida; con `max_tokens: 200` y thinking activo el razonamiento consumió el presupuesto completo (`finish_reason: length`, contenido vacío). La documentación de DeepSeek confirma que `temperature` no tiene efecto mientras thinking está activo.

| Cláusula | Antes | Enmienda | Efecto |
|---|---|---|---|
| **FR-020** | `response_format`, `stream: false`, `temperature` fija y `max_tokens` acotado. | Añade **`thinking` obligatorio** en cada petición. Todas las etapas del director lo envían `{ type: 'disabled' }`. | `temperature` recupera su efecto real; no se envía `reasoning_effort`. |
| **Contrato `DeepSeekChatRequest`** (Data Contract) | Sin campo `thinking`. | Añade `thinking: { type: 'disabled' } \| { type: 'enabled', reasoning_effort: 'low' \| 'high' \| 'max' }`. | El modo se declara por llamada; se elimina el default silencioso del proveedor. |
| **FR-019 / FR-024** | Modelo `deepseek-flash`, endpoint OpenAI-compatible y timeouts. | **Se mantienen.** | Sin cambios de modelo, endpoint, timeout ni códigos de error. |

`max_tokens` no cambia: con thinking desactivado no se necesita reserva de razonamiento.
