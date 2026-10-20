# Feature Specification: Composer de Shorts con IA (mock)

**Feature Branch**: `003-composer-mock`

**Created**: 2026-10-19

**Status**: Superseded for Composer behavior by `specs/004-composer-real/spec.md` (historical mock spec)

> **Nota de vigencia:** esta spec documenta el Composer mock original. Su comportamiento fue sustituido por 004 (Fal.ai real, subida firmada, jobs asíncronos, vídeo vertical y rate limit). Se conserva como referencia histórica y de trazabilidad; no debe reutilizarse su mock, sus pósters, su timeline ni sus contratos como fuente de verdad.

**Input**: User description: "Planificar el estudio de creación (Composer) interactivo con IA estilo Higgsfield: una interfaz para generar Shorts mediante prompt, imágenes y vídeos de referencia, cumpliendo un flujo MOCK de 1 a 3 clics: Input → Generación simulada → Preview, sin IA real, sin backend, sin subida de archivos y sin vídeo real."

## Contexto y relación con 001/002

Esta especificación es **aditiva** y define la primera experiencia de creación de la demo. No sustituye a la landing ni reescribe el feed.

- La landing `/` (`app/pages/index.vue`) y `specs/001-brand-construction-landing/spec.md` **no se modifican**, ni su copy, ni su diseño, ni sus tests.
- El feed `/feed` y `specs/002-shorts-feed-mock/spec.md` siguen siendo la fuente de verdad para todo lo relativo al feed: fixture, scroll-snap, pósters, like/save/share, layout, accesibilidad y SEO. Esta spec solo cambia el destino del CTA `Crear short` y el copy que afirmaba que la creación no estaba disponible.
- El Composer se publica en una ruta nueva y aislada: `/composer`, mediante `app/pages/composer.vue`.
- `app/app.vue` ya renderiza `<NuxtPage />`; no requiere cambios.
- El Composer es una **simulación enteramente cliente**, determinista, sin IA real, sin red, sin `server/api/`, sin secretos, sin subida de archivos y compatible con `nuxt generate`.
- El resultado del Composer es una **vista previa terminal**. No se publica en el feed, no se persiste, no se comparte y no se convierte en un `Short`.

### ENMIENDA A 002

Esta sección no reescribe `specs/002-shorts-feed-mock/spec.md`. **003 es la fuente de verdad para el nuevo CTA y para el nuevo comportamiento de creación.** Para cualquier otro aspecto del feed, 002 sigue vigente.

| Cláusula de 002 | Efecto de 003 |
|-----------------|---------------|
| **US2, escenarios 3–6** | **Superseded** en lo relativo al aviso `Próximamente`: el CTA ya no abre un diálogo, no atrapa el foco y no muestra el mensaje de indisponibilidad. Los escenarios 1–2 (badge `DEMO`, honestidad de los datos ficticios) siguen vigentes. |
| **FR-005** | **Superseded**. El CTA deja de ser un `<button aria-haspopup="dialog">` que abre un aviso. Pasa a ser un enlace de navegación a `/composer` con la etiqueta visible exacta `Crear short`. |
| **FR-006** | **Superseded**. Se elimina el aviso modal `Próximamente` y su componente `CreateShortNotice.vue`. No hay `role="dialog"`, `aria-modal`, trampa de foco ni backdrop en el feed. |
| **FR-018 (solo `description`)** | **Amended**. La meta description del feed deja de decir que la creación estará disponible próximamente y pasa a mencionar el estudio de creación simulado. El `title`, `lang`, `color-scheme`, `theme-color` y `robots` no cambian. |
| **FR-022 (solo trampa de foco del aviso)** | **Amended**. El feed ya no tiene ningún diálogo modal ni trampa de foco. El resto de reglas de foco sigue vigente. |
| **FR-031** | **Superseded**. El presupuesto de clics del feed cambia: `Crear short` cuesta 1 clic y navega; el flujo de creación cuesta 2 clics sin referencias y 3 con referencias. |
| **FR-032** | **Superseded**. El CTA de creación ya no es "el que abre el aviso"; ahora es un enlace real a `/composer`. |
| **FR-036** | **Amended**. El texto del `<noscript>` del feed cambia para no afirmar que la creación no está disponible. |
| **SC-003 (solo CTA/aviso)** | **Amended**. El CTA ya no abre `Próximamente`; el badge `DEMO` y la honestidad siguen siendo obligatorios. |
| **SC-011** | **Superseded**. El presupuesto de clics se reemplaza por el de esta spec. |
| **Out of Scope: generación/creación** | **Superseded solo para 003**. La creación simulada deja de estar fuera de alcance; la generación real, el backend y la publicación siguen fuera de alcance. |
| **Assumptions, última viñeta** | **Superseded**. El CTA ya no mantiene el aviso `Próximamente`; la honestidad se traslada al badge `DEMO` del feed y al badge `SIMULACIÓN` del Composer. |
| **Stable data-testid `create-short-notice`, `notice-*`** | **Retired** del feed. `feed-cta` se conserva y pasa a identificar un `<a>`. |

**Qué NO cambia en el feed** (verificado por tests de regresión): seis shorts y su orden, fixture `app/data/shorts.ts`, scroll-snap, pósters `/mock/shorts/*.svg`, `ShortCard`, `ShortPoster`, `ShortActionRail`, `FeedEnd`, `useShortsFeed`, `useActiveShort`, `useShareShort`, like/save/share, layout responsive, safe areas, un solo `h1`, metadatos de idioma y `robots: noindex, nofollow`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generar una vista previa desde una idea en dos clics (Priority: P1)

Una persona entra al feed, pulsa `Crear short`, llega a `/composer`, escribe una idea y pulsa `Generar short`. Sin configuración adicional, ve una generación simulada por etapas y, automáticamente, una vista previa vertical con póster, título, duración y su idea original. Entiende que es una simulación y que no se ha creado ni publicado ningún vídeo.

**Why priority**: Es el núcleo del producto y el camino mínimo que valida la promesa de 1 a 3 clics. Sin este recorrido no existe Composer.

**Independent Test**: Partir de `/feed`, activar `Crear short`, escribir un prompt válido y pulsar `Generar short`. Comprobar que se llega a `/composer`, que la generación muestra tres etapas, que a los 2,4 s aparece la vista previa, que el resultado es determinista y que no hay peticiones de red, subida de archivos ni botón de publicación.

**Acceptance Scenarios**:

1. **Given** la persona está en `/feed`, **When** activa el CTA `Crear short`, **Then** navega a `/composer` con un solo clic, sin abrir ningún diálogo y sin mostrar `Próximamente`.
2. **Given** `/composer` está en estado inicial, **When** la persona escribe `Un short sobre luz natural` y pulsa `Generar short`, **Then** el formulario se sustituye por la generación simulada, se anuncia la etapa `Analizando tu idea` y no hay ningún paso `Siguiente`.
3. **Given** la generación está en curso, **When** transcurren 800 ms y 1600 ms, **Then** la etapa visible pasa a `Componiendo la escena` y `Preparando la vista previa`, y la barra de progreso avanza a 50 % y 80 %.
4. **Given** han transcurrido 2400 ms desde el inicio, **When** finaliza el temporizador, **Then** aparece `Vista previa simulada` con póster local, título, duración, idea original, `0 referencias` e `Intento 1`, y el foco se mueve al encabezado de la vista previa.
5. **Given** la vista previa está visible, **When** la persona busca publicar, **Then** no existe ningún botón, enlace o acción para publicar, descargar, compartir o enviar el resultado al feed.
6. **Given** la persona repite exactamente el mismo prompt en una sesión nueva, **When** genera por primera vez, **Then** obtiene el mismo id, título, póster, duración e intento.

---

### User Story 2 - Añadir referencias opcionales sin subir archivos (Priority: P1)

Una persona añade hasta tres imágenes o vídeos como referencia. Las imágenes muestran una miniatura local; los vídeos se muestran como una tarjeta con nombre, tipo y tamaño, sin reproducirse. Puede eliminar referencias antes de generar. Los archivos nunca salen del navegador.

**Why priority**: Las referencias son parte de la propuesta del Composer y del flujo de 3 clics. Sin ellas la interfaz sería solo un campo de texto; con subida real o autoplay se rompería la honestidad y el alcance mock.

**Independent Test**: En `/composer`, seleccionar una imagen PNG válida y un vídeo MP4 válido en una sola interacción de selección múltiple, comprobar las dos tarjetas, eliminar una, añadir otra, intentar un tipo no admitido y un archivo sobredimensionado, y verificar los mensajes exactos. Generar y comprobar `2 referencias` en la vista previa sin ninguna petición de red.

**Acceptance Scenarios**:

1. **Given** el formulario está visible, **When** la persona pulsa `Añadir referencia` y selecciona una imagen PNG de menos de 8 MB, **Then** aparece una tarjeta `Imagen` con miniatura, nombre y tamaño, y el contador muestra `1 de 3`.
2. **Given** la persona selecciona un vídeo MP4 de menos de 50 MB, **When** se procesa, **Then** aparece una tarjeta `Vídeo` con nombre, tipo y tamaño, sin `<video>`, sin autoplay y sin controles de reproducción.
3. **Given** hay una referencia añadida, **When** la persona pulsa `Eliminar {nombre}`, **Then** la tarjeta desaparece, el contador decrece, el `ObjectURL` de la imagen se revoca y no queda ningún archivo retenido.
4. **Given** la persona selecciona tres archivos válidos en una sola interacción, **When** se procesan, **Then** se aceptan los tres, el contador muestra `3 de 3` y el botón `Añadir referencia` queda deshabilitado con el texto de máximo alcanzado.
5. **Given** la persona selecciona un archivo de tipo no admitido, **When** se valida, **Then** no se añade y se anuncia `Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.`.
6. **Given** la persona selecciona una imagen de más de 8 MB o un vídeo de más de 50 MB, **When** se valida, **Then** no se añade y se anuncia respectivamente `La imagen supera el máximo de 8 MB.` o `El vídeo supera el máximo de 50 MB.`.
7. **Given** la persona ha añadido referencias, **When** genera, **Then** la vista previa muestra el número exacto de referencias y sigue sin existir subida, `FormData`, `fetch` ni petición de red.

---

### User Story 3 - Recuperarse de una generación: cancelar, editar, regenerar y reintentar (Priority: P2)

Una persona puede cancelar una generación en curso y conservar lo que escribió; editar la idea desde la vista previa sin perderla; regenerar para obtener otra variante simulada; y reintentar si la preparación de la vista previa falla. Ninguna de estas acciones publica nada.

**Why priority**: El flujo principal ya es útil sin recuperación, pero cancelar y editar son necesarios para que la simulación no se sienta rígida. Regenerar y reintentar completan la máquina de estados y permiten probar errores sin efectos secundarios.

**Independent Test**: Iniciar una generación y cancelarla antes de 2,4 s; comprobar que el prompt y las referencias siguen ahí y que el foco vuelve al campo. Generar, pulsar `Editar idea`, comprobar que el formulario conserva el borrador. Generar, pulsar `Regenerar` y verificar `Intento 2` y un póster distinto. Forzar el error del generador en un test unitario, comprobar el mensaje y `Reintentar`.

**Acceptance Scenarios**:

1. **Given** una generación en curso, **When** la persona pulsa `Cancelar`, **Then** se limpian los temporizadores, vuelve el formulario, el prompt y las referencias se conservan, el foco vuelve al campo de idea y se anuncia `Generación cancelada.`.
2. **Given** una vista previa visible, **When** la persona pulsa `Editar idea`, **Then** vuelve el formulario con el prompt y las referencias intactos, el foco va al campo de idea y la vista previa deja de mostrarse.
3. **Given** una vista previa con `Intento 1`, **When** la persona pulsa `Regenerar`, **Then** comienza una nueva generación con el mismo borrador, `Intento 2`, y al terminar el póster y el título son distintos de los del intento anterior.
4. **Given** el generador lanza un error defensivo, **When** falla la generación, **Then** aparece `No se pudo preparar la vista previa simulada. Inténtalo de nuevo.` con un botón `Reintentar`, se conserva el borrador, el foco va a `Reintentar` y el mensaje se anuncia con `role="alert"`.
5. **Given** el estado de error, **When** la persona pulsa `Reintentar`, **Then** se inicia una nueva generación con `Intento + 1` y, si el generador vuelve a funcionar, aparece la vista previa.
6. **Given** una generación en curso, **When** la persona intenta enviar el formulario dos veces o pulsa repetidamente `Generar short`, **Then** solo existe una generación activa, no se duplican temporizadores y no se crean dos resultados.
7. **Given** la persona navega fuera de `/composer` durante la generación, **When** se desmonta la página, **Then** se limpian los temporizadores y los `ObjectURL`; al volver, el estado es inicial y no se restaura nada.

---

### User Story 4 - Coexistir con el feed sin romperlo (Priority: P2)

La persona que ya conoce el feed encuentra el mismo feed de siempre, con su badge `DEMO`, sus seis shorts y sus acciones intactas. El único cambio visible es que `Crear short` ahora lleva al estudio de creación. No aparece el aviso `Próximamente`, no hay enlaces muertos y el feed sigue funcionando igual.

**Why priority**: La creación no puede poner en riesgo la demo existente. La regresión del feed es obligatoria porque el repositorio no tenía cobertura del feed antes de esta iteración.

**Independent Test**: Montar y solicitar `/feed`; comprobar HTTP 200, seis títulos, primer short activo, pósters locales, like/save/share, CTA con `href="/composer"`, ausencia de `Próximamente`, de `role="dialog"` y de `create-short-notice`; comprobar que la landing y sus tests no cambian.

**Acceptance Scenarios**:

1. **Given** el feed renderizado, **When** la persona inspecciona el CTA, **Then** es un enlace `<a>` con `href="/composer"`, texto exacto `Crear short`, `data-testid="feed-cta"`, sin `aria-haspopup` y sin handler que abra un diálogo.
2. **Given** el feed renderizado, **When** la persona recorre el DOM, **Then** no existe `Próximamente`, ni `create-short-notice`, ni `notice-overlay`, ni `notice-heading`, ni `role="dialog"`, ni ningún backdrop.
3. **Given** el feed renderizado, **When** se comparan sus datos y comportamiento, **Then** siguen existiendo exactamente seis `<article>` con los títulos del fixture, scroll-snap, like/save/share y el panel `Fin del feed de prueba`.
4. **Given** los tests de la landing, **When** se ejecuta la suite completa, **Then** siguen pasando sin modificaciones y no se añaden dependencias.

---

### User Story 5 - Una experiencia accesible, responsive y honesta (Priority: P3)

Una persona que usa teclado, lector de pantalla, zoom, modo de alto contraste o movimiento reducido puede completar el flujo, entender los errores y reconocer que la generación es simulada. La interfaz funciona de 320 px a 1920 px sin scroll horizontal y respeta las safe areas.

**Why priority**: Es un requisito de calidad de la marca. El flujo principal ya es comprensible, pero la demo no se considera terminada sin accesibilidad, responsive y honestidad verificables.

**Independent Test**: Auditar `/composer` con teclado, VoiceOver o TalkBack, `prefers-reduced-motion: reduce`, forced-colors, zoom 200 %/400 % y anchos 320–1920 px. Confirmar un solo `h1`, landmarks, formulario etiquetado, errores anunciados, foco gestionado, objetivos táctiles de 44 × 44 px y contraste AA.

**Acceptance Scenarios**:

1. **Given** un lector de pantalla abre `/composer`, **When** anuncia la página, **Then** encuentra un `header`, un `main`, un único `h1` (`Crea un short de prueba`), un formulario con etiqueta y una jerarquía de encabezados sin saltos.
2. **Given** el formulario sin prompt, **When** la persona pulsa `Generar short`, **Then** aparece y se anuncia `Escribe una idea para generar tu short.`, el campo recibe el foco, `aria-invalid="true"` y la descripción del error, y no se inicia ninguna generación.
3. **Given** una generación en curso, **When** cambia la etapa, **Then** una región `role="status"` con `aria-live="polite"` anuncia la etapa y el porcentaje; al terminar, se anuncia `Vista previa lista.` y el foco va al encabezado de la vista previa.
4. **Given** el sistema pide movimiento reducido, **When** se usa el Composer, **Then** no hay animaciones ni transiciones no esenciales, el progreso cambia sin transición y el foco no provoca scroll suave.
5. **Given** forced-colors, **When** se inspeccionan controles, foco, barra de progreso y tarjetas, **Then** los límites y estados siguen siendo visibles con colores del sistema.
6. **Given** anchos de 320, 360, 390, 768, 1024, 1440 y 1920 px, **When** se recorre el flujo completo, **Then** no hay scroll horizontal, ni texto cortado, ni controles fuera de alcance; los objetivos táctiles miden al menos 44 × 44 px.
7. **Given** la persona lee la página, **When** busca promesas de IA real, **Then** ve el badge `DEMO`, el badge `SIMULACIÓN` en la vista previa y los textos explícitos de que no se crea ni publica un vídeo real y de que los archivos no se suben.

---

### Edge Cases

- **SSR**: `/composer` se renderiza en estado inicial (`idle`). El HTML del servidor contiene cabecera, `h1`, stepper, formulario, textarea, botón de referencias, botón `Generar short` y aviso `noscript`; no contiene vista previa, progreso, referencias, temporizadores ni `ObjectURL`.
- **Hidratación**: el estado inicial es idéntico en servidor y cliente; no se usan `Math.random`, `Date.now`, `new Date()` ni `crypto.randomUUID()` para renderizar o construir el borrador.
- **JavaScript deshabilitado**: el formulario y el copy son legibles, pero no se genera nada. El `<noscript>` explica que la generación simulada necesita JavaScript. Si se pulsa el botón sin JS, la página puede recargarse; MUST NOT simularse un éxito ni mostrarse una vista previa.
- **Archivo vacío (0 bytes)**: se rechaza y se anuncia `El archivo está vacío.`.
- **MIME vacío o desconocido**: se rechaza con `Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.`; no se deduce el tipo por la extensión.
- **MIME con parámetros** (`image/png; charset=binary`): se normaliza tomando la parte anterior a `;` y se acepta si coincide.
- **Imagen > 8 MiB o vídeo > 50 MiB**: se rechaza con el mensaje exacto correspondiente. Los límites se comparan en bytes, no en MB decimales.
- **Más de 3 referencias en una selección**: se aceptan las primeras válidas hasta 3 y se añade una sola incidencia `references-limit`; el resto se ignora sin romper la lista.
- **Selección múltiple**: el input admite `multiple`; seleccionar tres archivos en una sola interacción cuenta como una acción del presupuesto de clics.
- **Seleccionar el mismo archivo dos veces**: se permite; cada referencia recibe un id nuevo y su propio `ObjectURL` si es imagen.
- **Cancelar el selector de archivos**: no cambia el estado, no añade referencias y no muestra error.
- **`URL.createObjectURL` no disponible o lanza**: la imagen se añade con `thumbnailUrl: null` y una tarjeta genérica; no se rompe el flujo ni se muestra un error de generación.
- **`URL.revokeObjectURL` no disponible**: se ignora de forma segura; no se lanza una excepción.
- **Eliminar, vaciar o desmontar con referencias**: se revocan todos los `ObjectURL` de imágenes y se vacía el `Map` local de `File`.
- **Doble submit / doble clic en `Generar short`**: el guard de estado y el botón deshabilitado impiden más de una generación; los callbacks de temporizadores antiguos se ignoran con un token de ejecución.
- **Cancelación durante la generación**: se limpian los temporizadores, se vuelve a `idle`, se conserva el borrador y se anuncia `Generación cancelada.`.
- **Navegación durante la generación**: no hay diálogo de confirmación; al desmontar se limpian temporizadores y `ObjectURL`. Al volver, todo empieza de cero.
- **Error defensivo del generador**: se muestra el mensaje, se conserva el borrador y se ofrece `Reintentar`; no se finge una vista previa parcial.
- **Regenerar**: el intento incrementa; el póster, el título y la duración cambian de forma determinista. No hay `Math.random`.
- **Prompt de 280 caracteres**: se permite; el contador muestra `280/280`. Un prompt que supere 280 por programa se rechaza con `La idea no puede superar los 280 caracteres.`.
- **Prompt solo con espacios**: se trata como vacío.
- **Prompt con saltos de línea**: se conservan en la vista previa con `white-space: pre-wrap`; el hash normaliza los espacios.
- **Nombre de archivo muy largo**: envuelve hasta dos líneas con `break-words`; el nombre completo permanece en la etiqueta accesible `Eliminar {nombre}`.
- **Teclado móvil**: el textarea usa `text-base` para evitar el zoom automático de iOS; el foco y el scroll dejan visible el campo.
- **320 px**: el stepper puede envolver etiquetas a dos líneas; nunca hay scroll horizontal.
- **1920 px**: el contenido se centra y no supera `max-w-3xl`; la vista previa no estira el póster más de `20rem` de ancho.
- **Zoom 200 %/400 %**: el contenido refluye, los botones crecen con `min-height` y nada queda inaccesible.
- **Safe areas**: cabecera y contenido inferior respetan `safe-area-inset-top/bottom/left/right`; con insets a 0 el layout no se rompe.
- **Movimiento reducido**: sin transiciones de progreso, sin shimmer y sin animaciones de entrada.
- **Forced colors**: controles, barra de progreso, tarjetas y foco usan colores del sistema y mantienen límites visibles.
- **Recarga**: el borrador, las referencias, el intento y la vista previa desaparecen; no se usa `localStorage`, `sessionStorage`, cookies, IndexedDB ni query string.
- **Pestañas múltiples**: no hay estado compartido; cada pestaña es independiente.
- **Enlace directo a `/composer`**: funciona sin pasar por el feed; el enlace `Volver al feed` permite regresar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST renderizar el Composer en la ruta `/composer` mediante `app/pages/composer.vue`, siguiendo el enrutado por archivos de Nuxt 4. MUST NOT modificar `/`, `app/pages/index.vue`, `app/app.vue`, `specs/001-brand-construction-landing/spec.md`, los tests de la landing, `tailwind.config.ts`, `nuxt.config.ts`, `vitest.config.ts` ni `package.json`.
- **FR-002**: La respuesta SSR de `/composer` MUST incluir cabecera, un único `h1`, intro, stepper, formulario etiquetado, textarea, selector de referencias, botón `Generar short` y aviso `noscript`. MUST NOT incluir vista previa, progreso, temporizadores, referencias ni `ObjectURL` en el estado inicial.
- **FR-003**: El CTA `Crear short` del feed MUST ser un enlace de navegación a `/composer` con la etiqueta visible exacta `Crear short` y `data-testid="feed-cta"`. MUST NOT tener `aria-haspopup`, MUST NOT abrir un diálogo y MUST NOT ejecutar lógica de generación.
- **FR-004**: El aviso `Próximamente` MUST eliminarse del feed. `app/components/shorts/CreateShortNotice.vue` MUST borrarse; `app/pages/feed.vue` MUST dejar de importarlo, de renderizarlo y de usar `isNoticeOpen`, `noticeMounted`, `openNotice`, `closeNotice` e `inert` para el aviso. `app/components/ui/ModalDialog.vue` MAY permanecer sin uso, pero MUST NOT ser importado por el feed ni por el Composer.
- **FR-005**: El resto del feed MUST permanecer intacto: seis shorts, orden, fixture, `ShortCard`, `ShortPoster`, `ShortActionRail`, `FeedEnd`, scroll-snap, like/save/share, `useShortsFeed`, `useActiveShort`, `useShareShort`, pósters `/mock/shorts/*.svg`, layout responsive, safe areas y accesibilidad. Los únicos cambios de copy permitidos son la meta description y el texto del `<noscript>` indicados en el Copy Deck.
- **FR-006**: Los modelos de tipos MUST migrarse de `app/types/short.ts` a `app/models/short.ts` sin cambios de comportamiento. Los imports MUST pasar de `~/types/short` a `~/models/short`. MUST actualizarse exactamente los 10 imports existentes: `app/components/shorts/ShortActionRail.vue`, `app/components/shorts/ShortCard.vue`, `app/components/shorts/ShortPoster.vue`, `app/components/shorts/ShortsFeed.vue`, `app/composables/useActiveShort.ts`, `app/composables/useShareShort.ts`, `app/composables/useShortsFeed.ts`, `app/data/shorts.ts`, `app/pages/feed.vue` y `app/utils/shorts.ts`. No existe ningún otro import de `~/types/short`. `app/types/short.ts` MUST borrarse. No se crea barrel ni `index.ts`.
- **FR-007**: El Composer MUST usar modelos estrictos en `app/models/composer.ts`, sin `any`, sin `unknown` en campos públicos y sin `File` en ningún modelo compartido. Todos los campos de los modelos del Composer MUST ser `readonly`; los estados de generación MUST ser una unión discriminada. `ShortInteractionState` conserva su mutabilidad existente porque representa estado de UI, no un dato de fixture.
- **FR-008**: El formulario MUST incluir una etiqueta visible y programática para el textarea, un placeholder, un contador `{n}/280` y un texto de ayuda. El prompt MUST ser obligatorio tras `trim`, MUST tener un máximo de 280 caracteres y MUST conservar su valor al cancelar, editar, reintentar o regenerar.
- **FR-009**: MUST NOT existir configuración avanzada: ni selector de modelo, estilo, duración, aspect ratio, resolución, semilla, cámara, voz o música; ni pasos `Siguiente`; ni un asistente multi-paso.
- **FR-010**: Las referencias MUST ser opcionales, con un máximo de 3, seleccionables de una en una o varias a la vez. El input MUST aceptar `image/png`, `image/jpeg`, `image/webp`, `video/mp4`, `video/webm` y `video/quicktime`, con `multiple` y `accept` exactos.
- **FR-011**: Cada referencia MUST validarse por tipo MIME normalizado y tamaño: imágenes hasta 8 MiB (8 388 608 bytes), vídeos hasta 50 MiB (52 428 800 bytes). MUST rechazarse archivos vacíos, tipos no admitidos y archivos sobredimensionados con los mensajes exactos del Copy Deck.
- **FR-012**: Las imágenes MUST mostrar una miniatura creada con `URL.createObjectURL`; los vídeos MUST mostrarse como tarjeta de archivo con nombre, etiqueta `Vídeo` y tamaño, sin `<video>`, sin autoplay, sin controles y sin reproducción. MUST NOT existir subida, `FormData`, `fetch`, `XMLHttpRequest`, multipart ni endpoint.
- **FR-013**: El `File` de cada referencia MUST conservarse solo en un `Map` local de `useComposerReferences`, además del paso efímero por el evento de selección. MUST NOT almacenarse en el modelo `ComposerReference`, en un store, en el DOM, en estado reactivo compartido ni en almacenamiento del navegador. El `ObjectURL` MUST revocarse al eliminar la referencia, al vaciar la lista y al desmontar el composable.
- **FR-014**: La generación MUST ser 100 % cliente y simulada con temporizadores: `idle → generating (analyzing 15 %, composing 50 %, rendering 80 %) → ready` a los 0, 800, 1600 y 2400 ms respectivamente. MUST NOT usar IA real, modelos, red, `server/api/`, secretos ni variables de entorno.
- **FR-015**: El resultado MUST ser determinista a partir del prompt normalizado, las referencias (tipo, nombre y tamaño, en orden) y el intento. MUST usarse un hash FNV-1a de 32 bits sobre una firma JSON estable y los índices/duraciones definidos en el Data Contract. MUST NOT usarse `Math.random`, `Date.now`, `new Date()`, `crypto.randomUUID()` ni la hora del sistema en render, generación o ids.
- **FR-016**: La máquina de estados MUST implementar `idle`, `generating`, `ready` y `error`. `cancel` MUST volver a `idle` conservando el borrador; `edit` MUST volver a `idle` conservando el borrador; `regenerate` MUST volver a `generating` con intento + 1; `retry` MUST volver a `generating` con intento + 1. MUST NOT existir publicación, guardado ni envío al feed.
- **FR-017**: El doble submit MUST bloquearse. Mientras `status === 'generating'`, el formulario MUST ocultarse, las activaciones repetidas MUST ignorarse y cualquier callback de un temporizador antiguo MUST descartarse mediante un token de ejecución. `cancel`, `edit` y el desmontaje MUST limpiar todos los temporizadores.
- **FR-018**: La vista previa MUST ser terminal y usar `GeneratedShortPreview`, no `Short`. MUST mostrar póster local `/mock/composer/*.svg`, título, duración en formato `m:ss`, idea original, número de referencias e intento. MUST NOT mostrar creador, handle, stats, likes, guardados, etiquetas, share, publicar, descargar ni enviar al feed.
- **FR-019**: La vista previa MUST mostrar el badge `SIMULACIÓN` y el texto de honestidad normativo. El Composer MUST mostrar el badge `DEMO` en la cabecera y copy explícito de que la generación es simulada, que no se crea ni publica un vídeo real y que los archivos no se suben.
- **FR-020**: El foco MUST gestionarse así: al pasar a `generating`, al encabezado del progreso; al pasar a `ready`, al encabezado de la vista previa; al cancelar o editar, al textarea; al entrar en `error`, al botón `Reintentar`. Los encabezados de progreso y vista previa MUST tener `tabindex="-1"`.
- **FR-021**: MUST existir una región `role="status"` con `aria-live="polite"` y `aria-atomic="true"` para la generación y la vista previa, y regiones `role="alert"` para errores de validación y error de generación. Los mensajes MUST anunciarse una sola vez por transición.
- **FR-022**: El formulario MUST usar validación custom (`novalidate` o ausencia de `required` nativo) y anunciar errores con `aria-invalid`, `aria-describedby`, `aria-required="true"` en el prompt, texto visible y foco en el primer campo inválido. Los errores de archivo MUST anunciarse sin mover el foco fuera del selector.
- **FR-023**: La página MUST usar HTML semántico: un `header`, un `main`, un único `h1`, un `nav` con `aria-label="Progreso de creación"`, jerarquía de encabezados sin saltos y ninguna trampa de foco.
- **FR-024**: Todos los controles interactivos MUST tener un objetivo táctil mínimo de 44 × 44 px CSS, foco visible y nombres accesibles. MUST NOT existir `tabindex` positivo.
- **FR-025**: La interfaz MUST respetar `prefers-reduced-motion: reduce`: sin animaciones ni transiciones no esenciales, sin scroll suave, sin shimmer y con cambios de progreso instantáneos.
- **FR-026**: La interfaz MUST funcionar en forced-colors y mantener contraste AA: texto normal ≥ 4.5:1, texto grande ≥ 3:1 y límites/controles significativos ≥ 3:1.
- **FR-027**: El layout MUST funcionar de 320 px a 1920 px sin scroll horizontal, sin solapamientos y sin contenido recortado, incluyendo zoom 200 %/400 % y safe areas. Los campos MUST usar `text-base` para evitar el zoom de iOS.
- **FR-028**: La ruta MUST declarar `lang="es"`, `color-scheme: dark`, `theme-color: #09090b`, title `AI Shorts — Estudio de creación (demo)`, la description normativa y `robots: noindex, nofollow`.
- **FR-029**: MUST NOT realizarse peticiones a orígenes externos: sin fuentes remotas, imágenes remotas, iconos remotos, analítica, píxeles, CDNs, APIs ni `$fetch`. Los iconos MUST ser SVG inline locales y los pósters SVG locales.
- **FR-030**: MUST NOT existir persistencia: ni `localStorage`, ni `sessionStorage`, ni cookies, ni IndexedDB, ni query string, ni estado global (Pinia, `useState` compartido con el feed). Al recargar, todo vuelve al estado inicial.
- **FR-031**: El prompt, los nombres de archivo, los mensajes y el resultado MUST renderizarse con interpolación de Vue. MUST NOT usarse `v-html` ni `dangerouslySetInnerHTML` con datos del usuario.
- **FR-032**: Todo el copy visible MUST estar en español (`es-ES`) y coincidir exactamente con el Copy Deck. No se añade i18n ni selector de idioma.
- **FR-033**: La página MUST exponer los `data-testid` estables definidos en esta spec. Pueden permanecer en producción.
- **FR-034**: La implementación MUST seguir la arquitectura modular de la Constitución: página en `app/pages/`, componentes de dominio en `app/components/composer/`, primitiva `AppButton` en `app/components/ui/`, composables en `app/composables/`, tipos globales en `app/models/`, helpers puros en `app/utils/`, fixture/constantes en `app/data/` y assets en `public/mock/composer/`.
- **FR-035**: `AppButton.vue` MUST justificarse como primitiva mínima reutilizada por el formulario, la generación y la vista previa. Su API MUST limitarse a `variant` (`primary`, `secondary`, `quiet`), `type`, `disabled` y slot por defecto; MUST NOT aceptar `as`, `href` ni variantes no usadas.
- **FR-036**: Los tests MUST cubrir: aceptación SSR de `/composer`; unitarios por cada archivo runtime nuevo (excepto modelos type-only); regresión del feed (`FeedHeader`, `feed.vue`, CTA y ausencia del aviso); assets SVG; determinismo; limpieza de timers y `ObjectURL`; y la migración de imports. Los tests de la landing MUST permanecer sin cambios.
- **FR-037**: MUST NOT añadirse dependencias, Playwright, Storybook, rutas de servidor, `server/`, plugins, middlewares, stores, secrets, autenticación, base de datos ni configuración de PWA. La feature MUST seguir siendo compatible con `nuxt generate`.
- **FR-038**: El stack MUST ser Nuxt 4, Vue 3 con `<script setup lang="ts">`, Tailwind CSS 3.4.x con sintaxis v3 (nunca v4), Vitest, `@nuxt/test-utils` y `happy-dom`. MUST reutilizarse los tokens `brand-*` existentes; MUST NOT modificarse `tailwind.config.ts`.
- **FR-039**: El presupuesto de clics MUST ser: 1 clic del feed al Composer; 2 clics para prompt-only (CTA + `Generar short`) con vista previa automática; 3 clics con referencias (CTA + seleccionar hasta 3 archivos en una interacción + `Generar short`). Regenerar, editar, cancelar y volver son acciones opcionales de recuperación y no forman parte del primer resultado exitoso.
- **FR-040**: MUST NOT existir botones o enlaces muertos en el modo soportado. Cada control MUST tener un efecto real y verificable. El enlace `Volver al feed` MUST navegar a `/feed`.
- **FR-041**: La generación simulada MUST ser total para entradas válidas: no falla de forma aleatoria ni por el contenido del prompt. El estado `error` es defensivo y se prueba inyectando un generador que lanza; no se expone un botón de "simular error".
- **FR-042**: El intento MUST empezar en 1 y incrementarse en cada inicio de generación (incluido reintento y regeneración). Cancelar no lo decrementa; editar no lo reinicia.
- **FR-043**: El Composer MUST NOT importar `Short`, `shorts`, `useShortsFeed`, `useActiveShort` ni `useShareShort`. No hay estado compartido con el feed.
- **FR-044**: El HTML de `/composer` MUST NOT contener `<video>`, `<audio>`, `autoplay`, `<iframe>` ni contenido reproducible. Las referencias de vídeo son tarjetas de archivo.
- **FR-045**: Los assets de póster del Composer MUST ser 4 SVG locales nuevos en `public/mock/composer/`, de 1080 × 1920, sin texto incrustado, sin `<script>`, sin referencias externas, sin imágenes raster y con un tamaño recomendado ≤ 50 KB por archivo.
- **FR-046**: Solo `Generar short` MUST ser `type="submit"`. Todos los demás botones del Composer (`Añadir referencia`, `Eliminar`, `Cancelar`, `Reintentar`, `Regenerar`, `Editar idea`) MUST ser `type="button"` para no enviar el formulario por accidente. `Volver al feed` MUST ser un enlace `<a>`/`NuxtLink`.

### Data Contract

El contrato es normativo. Los modelos globales viven en `app/models/`. Los tipos exclusivos de un composable, de un SFC o de una función pura NO se exportan desde `app/models/`; se declaran localmente.

```ts
// app/models/short.ts — migrado desde app/types/short.ts, sin cambios semánticos.
export type ShortId = `short-${string}`
export type PosterSrc = `/mock/shorts/${string}.svg`

export interface ShortCreator {
  readonly name: string
  readonly handle: `@${string}`
}

export interface ShortStats {
  readonly likes: number
  readonly saves: number
}

export interface ShortPoster {
  readonly src: PosterSrc
  readonly alt: string
  readonly width: 1080
  readonly height: 1920
}

export interface ShortMedia {
  readonly type: 'poster'
  readonly poster: ShortPoster
}

export interface ShortInitialState {
  readonly isLiked: boolean
  readonly isSaved: boolean
}

export interface ShortInteractionState {
  isLiked: boolean
  isSaved: boolean
}

export interface Short {
  readonly id: ShortId
  readonly title: string
  readonly creator: ShortCreator
  readonly media: ShortMedia
  readonly durationSeconds: number
  readonly tags: readonly string[]
  readonly stats: ShortStats
  readonly publishedAt: string
  readonly initialState: ShortInitialState
}

export type ShareOutcome = 'shared' | 'copied' | 'unavailable' | 'cancelled'

export interface SharePayload {
  title: string
  text: string
  url: string
}
```

```ts
// app/models/composer.ts — contrato global del Composer.
export type ComposerStep = 'input' | 'generating' | 'preview'

export type ComposerReferenceKind = 'image' | 'video'
export type ComposerReferenceId = `ref-${number}`

export type ComposerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'
export type ComposerVideoMimeType = 'video/mp4' | 'video/webm' | 'video/quicktime'
export type ComposerReferenceMimeType = ComposerImageMimeType | ComposerVideoMimeType

export interface ComposerReference {
  readonly id: ComposerReferenceId
  readonly kind: ComposerReferenceKind
  readonly name: string
  readonly mimeType: ComposerReferenceMimeType
  readonly sizeBytes: number
  readonly thumbnailUrl: string | null
  readonly durationSeconds: number | null
}

export interface ComposerDraft {
  readonly prompt: string
  readonly references: readonly ComposerReference[]
}

export type ComposerPosterSrc = `/mock/composer/${string}.svg`

export interface ComposerPoster {
  readonly src: ComposerPosterSrc
  readonly alt: string
  readonly width: 1080
  readonly height: 1920
}

export interface ComposerReferenceSignature {
  readonly kind: ComposerReferenceKind
  readonly name: string
  readonly sizeBytes: number
}

export interface ComposerGenerationRequest {
  readonly prompt: string
  readonly references: readonly ComposerReferenceSignature[]
  readonly attempt: number
}

export type GeneratedShortPreviewId = `preview-${string}`

export interface GeneratedShortPreview {
  readonly id: GeneratedShortPreviewId
  readonly title: string
  readonly poster: ComposerPoster
  readonly durationSeconds: number
  readonly prompt: string
  readonly referenceCount: number
  readonly attempt: number
}

export type ComposerGenerationStage = 'analyzing' | 'composing' | 'rendering'

export type ComposerGenerationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'generating'
      readonly stage: ComposerGenerationStage
      readonly progress: number
      readonly attempt: number
    }
  | { readonly status: 'ready'; readonly result: GeneratedShortPreview }
  | { readonly status: 'error'; readonly message: string; readonly attempt: number }

export type ComposerValidationField = 'prompt' | 'references'

export type ComposerValidationCode =
  | 'prompt-required'
  | 'prompt-too-long'
  | 'references-limit'
  | 'reference-empty'
  | 'reference-type'
  | 'reference-too-large'

export interface ComposerValidationIssue {
  readonly code: ComposerValidationCode
  readonly field: ComposerValidationField
  readonly message: string
}

export type ComposerGenerator = (
  request: ComposerGenerationRequest,
) => GeneratedShortPreview
```

**Invariantes**:

- `app/models/composer.ts` MUST NOT contener `File`, `Blob` ni `FileList`.
- `ComposerReference.id` es único por sesión, empieza en `ref-1` y se incrementa de uno en uno sin reutilizar ids (`ref-4` es válido tras eliminar una referencia). La lista visible contiene como máximo 3. No se deriva de la hora ni de un UUID aleatorio.
- `ComposerReference.kind` se deriva del MIME: `image/*` → `image`; `video/*` → `video`.
- `ComposerReference.thumbnailUrl` es no nulo solo para imágenes y solo si `URL.createObjectURL` está disponible; para vídeos es siempre `null`.
- `ComposerReference.durationSeconds` es siempre `null` en esta iteración; el campo existe para evolución futura y no se lee.
- `ComposerReference.sizeBytes` es un entero > 0.
- `references.length` es siempre ≤ 3.
- `ComposerGenerationRequest.attempt` es un entero ≥ 1. `references` contiene exactamente las firmas de las referencias del borrador, en el mismo orden.
- `GeneratedShortPreview.id` sigue `preview-{hashHex}-{attempt}`, donde `hashHex` son 8 caracteres hexadecimales en minúsculas.
- `GeneratedShortPreview.title` pertenece al pool normativo de 4 títulos.
- `GeneratedShortPreview.poster` pertenece al pool normativo de 4 pósters y conserva `width: 1080` y `height: 1920`.
- `GeneratedShortPreview.durationSeconds` es un entero entre 12 y 30.
- `GeneratedShortPreview.referenceCount` es igual a `request.references.length` y está entre 0 y 3.
- `GeneratedShortPreview.attempt` es igual a `request.attempt`.
- `GeneratedShortPreview.prompt` es el prompt de visualización (NFC, `trim`, sin colapsar saltos de línea internos) y no supera 280 caracteres.
- `ComposerGenerationState.generating.progress` es un entero entre 0 y 100; los valores de la línea de tiempo son 15, 50 y 80.
- `ComposerGenerationState.error.message` es exactamente el mensaje normativo de error de generación.
- Ningún modelo contiene `any`. Los estados usan discriminante `status`.

**Tipos locales (no globales)**:

- `UseComposerOptions`, `UseComposerReturn`, `UseComposerReferencesReturn`, `ComposerFileLike` y `AppButtonVariant` se declaran en sus archivos de composable/SFC/utils y no se exportan desde `app/models/`.
- Los tipos de props/emits de cada SFC se declaran inline en el propio SFC.
- No se crea `app/models/index.ts` ni ningún barrel.

### Fixture / Asset Contract (normative)

Base de pósters: `public/mock/composer/`. Todos son SVG locales de 1080 × 1920, sin texto incrustado, sin `<script>`, sin `<foreignObject>`, sin referencias externas, sin imágenes raster y con tamaño recomendado ≤ 50 KB.

| Índice | Archivo | Texto alternativo exacto | Dirección visual |
|--------|---------|--------------------------|------------------|
| 0 | `/mock/composer/composer-01.svg` | `Póster simulado abstracto violeta con ondas de luz.` | Violeta profundo, ondas concéntricas y destello fucsia |
| 1 | `/mock/composer/composer-02.svg` | `Póster simulado abstracto fucsia con formas geométricas.` | Fucsia, bloques geométricos y líneas finas |
| 2 | `/mock/composer/composer-03.svg` | `Póster simulado abstracto índigo con un marco luminoso.` | Índigo, marco vertical 9:16 y halo violeta |
| 3 | `/mock/composer/composer-04.svg` | `Póster simulado abstracto ámbar con un haz diagonal.` | Ámbar, haz diagonal y degradado oscuro |

Pool normativo de títulos, en orden:

| Índice | Título exacto |
|--------|---------------|
| 0 | `Una idea que se mueve en vertical` |
| 1 | `De la idea a la pantalla` |
| 2 | `Ritmo, luz y un solo mensaje` |
| 3 | `Tu historia en nueve por dieciséis` |

Límites y constantes normativas:

| Constante | Valor |
|-----------|-------|
| Máximo de referencias | `3` |
| Máximo de prompt | `280` caracteres |
| Tipos de imagen admitidos | `image/png`, `image/jpeg`, `image/webp` |
| Tamaño máximo de imagen | `8 MiB` = `8 388 608` bytes |
| Tipos de vídeo admitidos | `video/mp4`, `video/webm`, `video/quicktime` |
| Tamaño máximo de vídeo | `50 MiB` = `52 428 800` bytes |
| Atributo `accept` | `image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime` |
| Etapa inicial | `analyzing`, 15 %, a los 0 ms |
| Etapa intermedia | `composing`, 50 %, a los 800 ms |
| Etapa intermedia | `rendering`, 80 %, a los 1600 ms |
| Resultado | `ready`, a los 2400 ms |
| Rango de duración | entero `12..30` |

Los textos visibles usan `MB` por legibilidad, pero el límite normativo es el valor exacto en bytes de la tabla (MiB binarios). Un archivo de exactamente 8 388 608 bytes se acepta; 8 388 609 bytes se rechaza. Un vídeo de exactamente 52 428 800 bytes se acepta; 52 428 801 bytes se rechaza.

**Algoritmo determinista normativo**:

1. `promptKey = prompt.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()`.
2. `signature = JSON.stringify([promptKey, references.map((r) => [r.kind, r.name, r.sizeBytes])])`, conservando el orden de las referencias.
3. `baseHash = fnv1a32(signature)`, FNV-1a de 32 bits: offset `0x811c9dc5`, primo `0x01000193`, operaciones con `Math.imul`, resultado final `>>> 0`.
4. Con `attempt` ≥ 1:
   - `posterIndex = (baseHash + attempt - 1) % 4`
   - `titleIndex = (baseHash + (attempt - 1) * 3) % 4`
   - `durationSeconds = 12 + ((baseHash + (attempt - 1) * 7) % 19)`
   - `id = 'preview-' + baseHash.toString(16).padStart(8, '0') + '-' + attempt`
5. El resultado MUST ser idéntico para la misma firma y el mismo intento en cualquier sesión, navegador y build. No se usa la hora, el azar, el orden de iteración de objetos ni la configuración regional.

`Math.imul`, `Math.floor`, `%`, `toLowerCase`, `normalize` y `JSON.stringify` están permitidos. `Math.random`, `Date.now`, `new Date()`, `crypto.randomUUID` y `performance.now()` para el resultado están prohibidos.

## Interaction & State Rules

### Estado inicial

- `generation = { status: 'idle' }`, `step = 'input'`, `prompt = ''`, `references = []`, `attempt = 0`, `statusMessage = ''`.
- El formulario es visible; el stepper marca `Idea` como actual.
- El HTML SSR coincide con este estado.
- Derivación normativa del stepper: `status === 'generating'` → `step = 'generating'`; `status === 'ready'` → `step = 'preview'`; `status === 'idle'` o `status === 'error'` → `step = 'input'`.

### Máquina de estados

| Estado actual | Evento | Estado siguiente | Borrador | Intento | Foco / anuncio |
|---------------|--------|------------------|----------|---------|----------------|
| `idle` | Submit con prompt inválido | `idle` | Conservado | Sin cambio | Foco al textarea; `role="alert"` con el error |
| `idle` | Submit válido | `generating` (`analyzing`, 15 %) | Congelado para la petición; sigue en memoria | +1 | Foco al encabezado del progreso; `role="status"` anuncia etapa |
| `generating` | Timer 800 ms | `generating` (`composing`, 50 %) | Conservado | Sin cambio | `role="status"` anuncia etapa |
| `generating` | Timer 1600 ms | `generating` (`rendering`, 80 %) | Conservado | Sin cambio | `role="status"` anuncia etapa |
| `generating` | Timer 2400 ms y generador OK | `ready` | Conservado | Sin cambio | Foco al `h2` de la vista previa; `Vista previa lista.` |
| `generating` | Timer 2400 ms y generador lanza | `error` | Conservado | Sin cambio | Foco a `Reintentar`; `role="alert"` |
| `generating` | `Cancelar` | `idle` | Conservado | Sin cambio | Foco al textarea; `Generación cancelada.` |
| `generating` | Desmontaje / navegación | Destruido | Descartado | — | Se limpian timers y `ObjectURL` |
| `ready` | `Editar idea` | `idle` | Conservado | Sin cambio | Foco al textarea |
| `ready` | `Regenerar` | `generating` (`analyzing`, 15 %) | Conservado | +1 | Foco al encabezado del progreso |
| `error` | `Reintentar` | `generating` (`analyzing`, 15 %) | Conservado | +1 | Foco al encabezado del progreso |
| `error` | Editar el prompt | `idle` | Actualizado | Sin cambio | Error limpiado |
| `generating` | Segundo submit | Ignorado | Conservado | Sin cambio | Sin efecto |
| Cualquier estado | Recarga | `idle` inicial | Perdido | 0 | Sin restauración |

### Reglas de generación

- El botón `Generar short` es el único disparador. El formulario usa `@submit.prevent`; no hay `Siguiente` ni `Continuar`.
- `generate()` valida el prompt antes de crear la petición. Si hay una incidencia, no incrementa el intento ni crea temporizadores.
- Al iniciar: `attempt += 1`; se crea una petición inmutable con prompt de visualización, firmas de referencias y el intento; se guarda un `runId` incremental.
- Los callbacks de temporizador comprueban que el `runId` siga vigente y que el estado sea `generating`; si no, salen sin efecto.
- A los 2400 ms se llama al generador. El generador por defecto es puro y no falla para entradas válidas. Un error solo puede provenir de un fallo defensivo o de un generador inyectado en tests.
- `cancel()` limpia timers e incrementa `runId`, pero conserva `prompt`, `references` y `attempt`.
- `edit()` solo es válido desde `ready`. Limpia `result`, conserva el borrador y no reinicia `attempt`.
- `regenerate()` solo es válido desde `ready`; usa el mismo borrador y `attempt + 1`.
- `retry()` solo es válido desde `error`; usa el mismo borrador y `attempt + 1`.
- `onBeforeUnmount` limpia timers e incrementa `runId`. No hay persistencia ni restauración.
- No hay publicación, no hay descarga, no hay compartición del preview y no hay integración con el feed.

### Reglas de referencias

- El selector visible es un `<button type="button">` que activa un `<input type="file">` oculto, `multiple`, con el `accept` normativo. Ni el input ni el textarea tienen `name`; sin JavaScript no se envía el prompt ni ningún archivo en la URL.
- Tras cada `change`, el valor del input se reinicia a `''` para permitir volver a seleccionar el mismo archivo.
- `addFiles` procesa los archivos en orden, valida antes de crear nada y acepta hasta 3. Las incidencias se deduplican por código en cada llamada.
- Si ya hay 3 referencias, el botón `Añadir referencia` está deshabilitado y se muestra el texto de máximo. La validación del composable sigue protegiendo llamadas programáticas.
- Al añadir una imagen se crea un `ObjectURL`; si falla, se guarda `thumbnailUrl: null`. Al añadir un vídeo, `thumbnailUrl` es `null`.
- `removeReference` revoca el `ObjectURL` si existe, elimina el `File` del `Map` y actualiza la lista.
- `clearReferences` revoca todos los `ObjectURL`, vacía el `Map` y la lista.
- `onBeforeUnmount` llama a la limpieza completa.
- Las referencias no se persisten ni se comparten entre pestañas.

### Reglas de foco y anuncios

- Una región `role="status"` de página anuncia `Generación cancelada.` y `Vista previa lista.`. No anuncia etapas.
- La región de progreso anuncia `{etapa}. {n} % completado.` en cada cambio de etapa.
- Las incidencias de prompt y las de archivo usan `role="alert"`/`aria-live="assertive"`.
- El error de generación usa `role="alert"` y el foco va a `Reintentar`.
- El contenedor `composer-generation` lleva `aria-busy="true"` mientras `status === 'generating'`.
- Al montar `ComposerGenerationProgress`, su `h2` recibe foco. Al montar `ComposerPreview`, su `h2` recibe foco.
- `ComposerPromptForm` expone `focusPrompt()` para que la página devuelva el foco al textarea en cancelar/editar/error de validación.
- No se usa scroll suave. El foco puede provocar el scroll nativo del navegador.
- La región `composer-status` existe siempre en el DOM. Cuando `statusMessage` está vacío, permanece vacía y `sr-only`; cuando tiene texto, se muestra como pill centrada bajo el stepper.

### Presupuesto de clics

| Recorrido | Clics | Detalle |
|-----------|-------|---------|
| Feed → Composer | 1 | CTA `Crear short` (enlace) |
| Prompt-only → preview | 2 | CTA + `Generar short`; la preview aparece sola |
| Con referencias → preview | 3 | CTA + una selección múltiple de hasta 3 archivos + `Generar short` |
| Regenerar | +1 | Acción opcional de recuperación |
| Editar | +1 | Acción opcional de recuperación |
| Volver al feed | +1 | Navegación, no parte del flujo de generación |
| Publicar | — | No existe |

No hay pasos `Siguiente`, configuración avanzada ni confirmación intermedia. El camino mínimo exitoso nunca supera 3 clics. La selección múltiple es la que permite mantener el presupuesto de 3 clics con referencias; añadir referencias de una en una es una acción opcional adicional que no forma parte del camino mínimo.

## Normative Copy Deck

Los siguientes textos son normativos y MUST aparecer exactamente como se escriben (mayúsculas, acentos y puntuación incluidos).

| Slot | Texto exacto |
|------|--------------|
| Marca | `AI Shorts` |
| Badge de cabecera del Composer | `DEMO` |
| Explicación accesible del badge | `DEMO. El estudio de creación es una simulación: no se crea ni se publica ningún vídeo real y los archivos no se suben.` |
| Enlace de vuelta | `Volver al feed` |
| H1 | `Crea un short de prueba` |
| Intro | `Describe una idea, añade referencias opcionales y genera una vista previa simulada. No se crea ni se publica ningún vídeo real.` |
| Nombre del stepper | `Progreso de creación` |
| Paso 1 | `Idea` |
| Paso 2 | `Generación` |
| Paso 3 | `Vista previa` |
| Etiqueta accesible de paso | `Paso {n} de 3: {etiqueta}, {estado}` con estados `completado`, `actual`, `pendiente` |
| Título del formulario | `Tu idea` |
| Etiqueta del prompt | `Describe tu idea` |
| Placeholder del prompt | `Un short sobre cómo preparar tu primer set de grabación.` |
| Ayuda del prompt | `Máximo 280 caracteres.` |
| Contador visible | `{n}/280` |
| Contador accesible | `{n} de 280 caracteres` |
| Título de referencias | `Referencias (opcional)` |
| Ayuda de referencias | `Hasta 3 imágenes o vídeos. Se quedan en tu navegador y no se suben.` |
| Añadir referencia | `Añadir referencia` |
| Contador de referencias | `{n} de 3` |
| Estado vacío | `Sin referencias. Puedes generar solo con texto.` |
| Máximo alcanzado | `Máximo 3 referencias. Elimina una para añadir otra.` |
| Tipo de referencia imagen | `Imagen` |
| Tipo de referencia vídeo | `Vídeo` |
| Eliminar referencia | `Eliminar {nombre}` |
| Generar | `Generar short` |
| Título de generación | `Generando tu short simulado` |
| Nota de generación | `Esto es una simulación: no se está creando ningún vídeo real.` |
| Etapa analyzing | `Analizando tu idea` |
| Etapa composing | `Componiendo la escena` |
| Etapa rendering | `Preparando la vista previa` |
| Progreso accesible | `{n} % completado` |
| Cancelar | `Cancelar` |
| Cancelación anunciada | `Generación cancelada.` |
| Vista previa lista | `Vista previa lista.` |
| Error de generación | `No se pudo preparar la vista previa simulada. Inténtalo de nuevo.` |
| Reintentar | `Reintentar` |
| Badge de preview | `SIMULACIÓN` |
| Título de preview | `Vista previa simulada` |
| Etiqueta duración | `Duración` |
| Etiqueta referencias | `Referencias` |
| Etiqueta intento | `Intento` |
| Etiqueta de la idea original | `Idea original` |
| Nota de preview | `Esta vista previa es ficticia. No se ha generado ningún vídeo, no se ha subido ningún archivo y no se ha publicado nada en el feed.` |
| Regenerar | `Regenerar` |
| Editar | `Editar idea` |
| Prompt obligatorio | `Escribe una idea para generar tu short.` |
| Prompt demasiado largo | `La idea no puede superar los 280 caracteres.` |
| Límite de referencias | `Puedes añadir hasta 3 referencias.` |
| Archivo vacío | `El archivo está vacío.` |
| Tipo no admitido | `Formato no admitido. Usa PNG, JPG, WebP, MP4, WebM o MOV.` |
| Imagen demasiado grande | `La imagen supera el máximo de 8 MB.` |
| Vídeo demasiado grande | `El vídeo supera el máximo de 50 MB.` |
| Aviso sin JavaScript | `El estudio de creación necesita JavaScript para generar la vista previa simulada. Puedes volver al feed de prueba.` |
| Meta title | `AI Shorts — Estudio de creación (demo)` |
| Meta description | `Estudio de creación simulado de AI Shorts: describe una idea, añade referencias opcionales y genera una vista previa ficticia. No se crea ni se publica ningún vídeo real.` |
| Feed: meta description actualizada | `Feed de demostración de AI Shorts con seis shorts ficticios y un estudio de creación simulado.` |
| Feed: aviso sin JavaScript actualizado | `La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. El estudio de creación también necesita JavaScript.` |

Los formatos visibles de duración (`m:ss`), tamaño de archivo y número de referencias son normativos:

- Duración: `formatDuration` existente de `app/utils/shorts.ts` produce `0:18`, `1:02`, etc. La vista previa MUST mostrar ese formato y un nombre accesible `Duración: {n} segundos`.
- Tamaño: `< 1024` → `{bytes} B`; `< 1 MiB` → `{n} KB` redondeado hacia arriba; ≥ 1 MiB → `{n,n} MB` con un decimal y coma decimal, omitiendo `,0` (por ejemplo `8 MB`, `7,5 MB`).
- Referencias: `0 referencias`, `1 referencia`, `2 referencias`, `3 referencias`.

## Design Contract (normative)

No hay preguntas de diseño abiertas. Se reutilizan los tokens existentes de `tailwind.config.ts`. Tailwind es 3.4.x mediante `@nuxtjs/tailwindcss` 6.14: se usa sintaxis v3 (`bg-gradient-to-*`, `from-*`, `to-*`), nunca sintaxis v4.

| Concern | Decisión |
|---------|----------|
| Tema | Dark-only. Sin tema claro ni selector. |
| Página raíz | `div` con `min-h-svh overflow-x-clip bg-brand-ink text-brand-text antialiased selection:bg-brand-fuchsia/30 selection:text-white`. |
| Fondo de página | `#09090b` (`bg-brand-ink`), también en `html` y `body`. |
| Superficie de tarjetas | `#18181b` (`bg-brand-surface`). |
| Texto primario | `#fafafa` (`text-brand-text`). |
| Texto secundario | `#a1a1aa` (`text-brand-muted`). |
| Acento | `#a78bfa` → `#e879f9` (`brand-violet` → `brand-fuchsia`) para foco, badges, progreso y estados activos. |
| Botón primario | Gradiente `#7c3aed` → `#c026d3` (`from-brand-violet-deep to-brand-fuchsia-deep`), texto blanco. |
| Botón secundario | `border border-white/15 bg-white/5 text-brand-text`, hover `bg-white/10`. |
| Botón silencioso | Fondo transparente, texto `text-brand-muted`, hover `text-brand-text` y `bg-white/5`. |
| Botón deshabilitado | `disabled:opacity-50 disabled:cursor-not-allowed`; conserva el texto y el tamaño, sin animación. |
| Tipografía | Solo stack sans-serif del sistema (`font-sans`). Sin fuentes externas. |
| Iconografía | SVG inline locales; sin `@nuxt/icon`, Iconify, CDN ni librería de iconos. |
| Cabecera | `header` estático, `px-4 sm:px-6`, `pt-[calc(env(safe-area-inset-top)+0.75rem)]`, `pb-3`, sin blur. Marca + badge `DEMO` a la izquierda; `Volver al feed` a la derecha. Puede envolver a dos filas en 320 px. |
| Contenedor principal | `main` con `mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4 sm:px-6 sm:pt-8`, `overflow-x-clip`. La página scrollea de forma nativa; no hay scroll-snap. |
| H1 | `text-3xl sm:text-4xl font-semibold leading-tight tracking-tight text-brand-text`. |
| Intro | `mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted sm:text-base`. |
| Stepper | `nav` con `ol` flex, `mt-6`, tres pasos con círculo numerado de 24–28 px y etiqueta `text-[10px] sm:text-xs`. Actual con gradiente y texto blanco; completado con borde `brand-violet`; pendiente con borde `white/15` y texto `brand-muted`. Sin blur ni animación. |
| Tarjeta de formulario | `mt-6 rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6`. |
| Título de sección | `text-lg sm:text-xl font-semibold tracking-tight text-brand-text`. |
| Label | `text-sm font-medium text-brand-text`. |
| Textarea | `mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/15 bg-brand-ink px-3 py-3 text-base leading-relaxed text-brand-text placeholder:text-brand-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-fuchsia focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface`. `text-base` evita el zoom de iOS. |
| Contador / ayuda | `text-xs text-brand-muted`, `tabular-nums`. |
| Referencias | Lista `flex flex-col gap-2 sm:grid sm:grid-cols-2`. Tarjeta `flex items-start gap-3 rounded-2xl border border-white/10 bg-brand-ink p-3`. Miniatura/bloque de icono `size-14 shrink-0 rounded-xl`. Nombre `text-sm font-medium text-brand-text break-words line-clamp-2`; metadatos `text-xs text-brand-muted`. |
| Botón añadir | `min-h-11 w-full rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-4 text-sm font-semibold text-brand-text`, hover `bg-white/[0.06]`. |
| Generar | `min-h-12 w-full rounded-full bg-gradient-to-r from-brand-violet-deep to-brand-fuchsia-deep px-5 text-base font-semibold text-white shadow-lg shadow-brand-fuchsia/20`. |
| Progreso | Tarjeta `rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6`. Barra de 8 px `rounded-full bg-white/10`; relleno `bg-gradient-to-r from-brand-violet to-brand-fuchsia`; porcentaje `text-xs tabular-nums text-brand-muted`. Sin shimmer. |
| Vista previa | `mt-6 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-6`. Póster `aspect-[9/16] w-full max-w-[20rem] rounded-2xl border border-white/10 object-cover`; en móvil se centra. Metadatos en tarjeta `rounded-3xl border border-white/10 bg-brand-surface p-4 sm:p-6`. |
| Badge SIMULACIÓN | Pill `rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia`. |
| Badge DEMO | Misma pill que el feed, reutilizando el estilo existente. |
| Error | Bloque `rounded-2xl border border-brand-fuchsia/40 bg-brand-fuchsia/10 p-3 text-sm leading-relaxed text-brand-text`; icono inline `aria-hidden`. |
| Foco | Anillo de 2 px `brand-fuchsia` con offset de 2 px sobre `brand-ink`; en forced-colors, color de sistema. |
| Objetivos táctiles | Mínimo 44 × 44 px CSS para todos los botones, enlaces y el selector de archivos. |
| Safe areas | Cabecera y `main` respetan `safe-area-inset-top`, `safe-area-inset-bottom`, `safe-area-inset-left` y `safe-area-inset-right`. El padding lateral usa `max(1rem, env(safe-area-inset-left/right))`; con insets a 0 equivale a 16 px. |
| Motion | Solo color/opacidad/transform de presión a 150 ms `ease-out`, bajo `motion-safe:`. La barra de progreso puede animar el ancho a 400 ms `ease-out` solo bajo `motion-safe:`. Sin animaciones de entrada, parallax, shimmer ni `scroll-behavior: smooth`. |
| Reduced motion | `prefers-reduced-motion: reduce` desactiva transiciones, animación de progreso y cualquier movimiento no esencial. |
| Forced colors | Controles, tarjetas, barra de progreso y foco conservan bordes y estados con colores del sistema. |
| Overflow | Nunca hay scroll horizontal. La página scrollea verticalmente de forma nativa. |
| z-index | Contenido `0`, cabecera `10`, alertas/estado `20`. No hay overlays ni modales. |
| Responsive | Base 320 px; `sm` 640; `md` 768 (preview a dos columnas); `lg` 1024; hasta 1920 px. |
| Pósters | SVG locales, 1080 × 1920, sin texto, scripts, fuentes ni referencias externas. |
| Selección | `selection:bg-brand-fuchsia/30 selection:text-white`. |

Los valores son normativos. Si un nombre de utilidad de Tailwind difiere, el color, espaciado, contraste y comportamiento renderizados deben coincidir con la tabla.

## Stable data-testid Hooks

Estos hooks son estables y pueden permanecer en producción.

| `data-testid` | Elemento / uso |
|---------------|----------------|
| `composer-page` | Raíz de `/composer`. |
| `composer-header` | `header` del Composer. |
| `brand-mark` | Marca reutilizada `AI Shorts` (hook existente de `BrandMark`). |
| `composer-demo-badge` | Badge `DEMO` con explicación accesible. |
| `composer-back-link` | Enlace `Volver al feed`. |
| `composer-h1` | `h1` `Crea un short de prueba`. |
| `composer-intro` | Párrafo introductorio. |
| `composer-stepper` | `ol` del stepper. |
| `composer-step` | Cada `li`; incluye `data-step` (`input`, `generating`, `preview`) y `data-state` (`complete`, `current`, `upcoming`). |
| `composer-form` | `<form>` del prompt. |
| `composer-prompt-input` | `textarea` de la idea. |
| `composer-prompt-counter` | Contador `{n}/280`. |
| `composer-prompt-help` | Texto de ayuda del prompt. |
| `composer-prompt-error` | Error de prompt con `role="alert"`. |
| `composer-references` | Sección de referencias. |
| `composer-reference-picker` | Contenedor del selector. |
| `composer-reference-input` | `<input type="file">` oculto. |
| `composer-reference-add` | Botón `Añadir referencia`. |
| `composer-reference-count` | Contador `{n} de 3`. |
| `composer-reference-empty` | Estado vacío. |
| `composer-reference-error` | Región `role="alert"` de errores de archivo. |
| `composer-reference-card` | Cada tarjeta; incluye `data-reference-id` y `data-reference-kind`. |
| `composer-reference-thumbnail` | Miniatura de imagen. |
| `composer-reference-remove` | Botón `Eliminar {nombre}`. |
| `composer-generate` | Botón `Generar short`. |
| `composer-generation` | Contenedor del progreso. |
| `composer-generation-heading` | `h2` `Generando tu short simulado` con `tabindex="-1"`. |
| `composer-generation-note` | Nota de simulación. |
| `composer-generation-stage` | Etapa visible. |
| `composer-generation-progress` | `role="progressbar"`. |
| `composer-generation-percent` | Porcentaje visible. |
| `composer-cancel` | Botón `Cancelar`. |
| `composer-error` | Bloque `role="alert"` del error de generación. |
| `composer-retry` | Botón `Reintentar`. |
| `composer-preview` | Contenedor de la vista previa. |
| `composer-preview-badge` | Badge `SIMULACIÓN`. |
| `composer-preview-heading` | `h2` `Vista previa simulada` con `tabindex="-1"`. |
| `composer-preview-poster` | `<img>` del póster local. |
| `composer-preview-title` | Título simulado. |
| `composer-preview-duration` | Duración `m:ss`. |
| `composer-preview-references` | Número de referencias. |
| `composer-preview-attempt` | `Intento {n}`. |
| `composer-preview-prompt` | Idea original. |
| `composer-preview-note` | Nota de honestidad. |
| `composer-regenerate` | Botón `Regenerar`. |
| `composer-edit` | Botón `Editar idea`. |
| `composer-status` | Región `role="status"` de página. |
| `composer-nojs-notice` | Aviso `<noscript>`. |
| `feed-cta` | CTA del feed, ahora `<a href="/composer">`. |
| `feed-header` | Cabecera del feed; sin `open` ni diálogo. |
| `feed-page` | Raíz del feed. |

Los testids retirados `create-short-notice`, `notice-overlay`, `notice-heading`, `notice-body` y `notice-close` MUST NOT aparecer en el feed.

## Proposed Component & File Structure

La estructura es normativa; los nombres de archivo forman parte del contrato de modularidad. Los componentes pueden importarse explícitamente o mediante auto-imports de Nuxt con sus prefijos de carpeta.

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/pages/composer.vue` | Ruta `/composer`, metadatos, composición de cabecera, stepper, formulario, progreso, error, preview y `noscript`; orquesta foco y estado. |
| `app/components/composer/ComposerHeader.vue` | `header` con `BrandMark`, badge `DEMO` explicado y enlace `Volver al feed`. Sin props ni emisiones. |
| `app/components/composer/ComposerStepper.vue` | `nav` + `ol` de 3 pasos; recibe `current: ComposerStep`; marca completado/actual/pendiente; no es interactivo. |
| `app/components/composer/ComposerPromptForm.vue` | `<form>` con `h2` `Tu idea`, label, textarea, contador, ayuda, error de prompt, slot de referencias y botón `Generar short`. Emite `update:prompt` y `submit`; expone `focusPrompt()`. |
| `app/components/composer/ComposerReferencePicker.vue` | `section` con `aria-labelledby` y `h3` `Referencias (opcional)`, input de archivos oculto, botón `Añadir referencia`, contador, estado vacío, errores, lista de tarjetas y límite de 3. Emite `add` y `remove`. |
| `app/components/composer/ComposerReferenceCard.vue` | Tarjeta de una referencia: miniatura de imagen u icono de vídeo, nombre, tipo, tamaño y botón de eliminar. No usa `<video>`. |
| `app/components/composer/ComposerGenerationProgress.vue` | Progreso simulado: heading, nota, etapa, `role="progressbar"`, porcentaje y `Cancelar`. Enfoca su heading al montar. |
| `app/components/composer/ComposerPreview.vue` | Vista previa terminal: badge, póster local `<img>` con `width`/`height` 1080×1920, `loading="eager"` y `decoding="async"`, título, duración, referencias, intento, prompt, nota y botones `Regenerar`/`Editar idea`. Enfoca su heading al montar. |
| `app/components/ui/AppButton.vue` | Primitiva mínima de botón con variantes `primary`, `secondary`, `quiet`, `type` y `disabled`. Justificada por la reutilización en formulario, progreso, preview y errores. No soporta enlaces. |
| `app/composables/useComposer.ts` | Estado del borrador, validación de prompt, máquina de estados, temporizadores, intento, generación determinista y limpieza. |
| `app/composables/useComposerReferences.ts` | Lista de referencias, validación de archivos, `Map` local de `File`, creación/revocación de `ObjectURL` y limpieza. |
| `app/utils/composer.ts` | Helpers puros: normalización, validaciones, hash FNV-1a, construcción de petición/resultado, etiquetas de etapa, formato de tamaño y conteo de referencias. |
| `app/data/composer.ts` | Pools de pósters y títulos, límites, MIME admitidos, atributo `accept` y línea de tiempo de generación. |
| `app/models/composer.ts` | Modelos globales del Composer. Sin `File`. Sin tests por ser tipos planos. |
| `app/models/short.ts` | Migración exacta de `app/types/short.ts`. Sin tests por ser tipos planos. |
| `app/components/shorts/FeedHeader.vue` | Modificado: el CTA pasa a `NuxtLink` a `/composer`; se elimina la emisión `open`. |
| `app/pages/feed.vue` | Modificado: se elimina el aviso y su estado/`inert`; se actualizan la meta description y el `<noscript>`; el resto queda intacto. |
| `app/components/shorts/CreateShortNotice.vue` | **Borrar** por quedar superseded. |
| `public/mock/composer/composer-01.svg` … `composer-04.svg` | Cuatro pósters locales 1080 × 1920. |
| `app/types/short.ts` | **Borrar** tras migrar los 10 imports. |

No se crean `server/`, layouts, plugins, middlewares, stores, `app/models/index.ts` ni dependencias nuevas.

### API de componentes y composables (normativa)

- `ComposerStepper`: prop `current: ComposerStep`; sin emits.
- `ComposerPromptForm`: props `prompt: string`, `promptIssue: ComposerValidationIssue | null`; emits `update:prompt [value: string]`, `submit []`; slot `references`; expone `focusPrompt(): void`. Solo se renderiza en `idle` y `error`, por lo que no necesita estado `disabled`.
- `ComposerReferencePicker`: props `references: readonly ComposerReference[]`, `maxReferences: number`, `issues: readonly ComposerValidationIssue[]`; emits `add [files: File[]]`, `remove [id: ComposerReferenceId]`. El límite se deriva de `references.length >= maxReferences`.
- `ComposerReferenceCard`: prop `reference: ComposerReference`; emit `remove [id: ComposerReferenceId]`.
- `ComposerGenerationProgress`: props `stage: ComposerGenerationStage`, `progress: number`, `attempt: number`; emit `cancel []`.
- `ComposerPreview`: prop `preview: GeneratedShortPreview`; emits `regenerate []`, `edit []`.
- `AppButton`: props `variant?: 'primary' | 'secondary' | 'quiet'` (default `primary`), `type?: 'button' | 'submit' | 'reset'` (default `button`), `disabled?: boolean`; slot por defecto; atributos nativos y `data-testid` pasan por fallthrough.
- `useComposer(options: { references: Ref<readonly ComposerReference[]>; generator?: ComposerGenerator })`: devuelve `prompt`, `draft`, `issues`, `generation`, `step`, `statusMessage`, `isGenerating`, `generate`, `cancel`, `regenerate`, `edit`, `retry`, `clearIssues`. `generator` es una costura de test; el valor por defecto es `buildGeneratedShortPreview`.
- `useComposerReferences()`: devuelve `references`, `issues`, `canAddMore`, `addFiles`, `removeReference`, `clearReferences`, `clearIssues`.

## Testing Strategy

La validación sigue la Constitución v1.0.1. Cada archivo de código nuevo, excepto `app/models/short.ts` y `app/models/composer.ts` (interfaces planas), MUST tener cobertura automatizada directa o mediante integración. Los tests existentes de la landing MUST permanecer sin cambios.

| Test | Cobertura mínima |
|------|------------------|
| `tests/acceptance/composer-route.spec.ts` | SSR de `/composer`: HTTP 200, `lang="es"`, title/description/robots, un `h1`, `header`/`main`, stepper de 3 pasos, formulario etiquetado, textarea, botón de referencias, `Generar short`, aviso `noscript`, ausencia de preview/progreso/referencias, ausencia de `<video>`/`<audio>`/`<iframe>`, ausencia de hosts externos y de pósters `/mock/shorts/`. |
| `tests/acceptance/feed-route.spec.ts` | Regresión SSR de `/feed`: HTTP 200, seis títulos, primer short activo, CTA `<a href="/composer">`, ausencia de `Próximamente`, de `role="dialog"`, de `create-short-notice` y de `notice-*`, copy actualizado de `noscript` y meta description, pósters locales, ausencia de `<video>`. |
| `tests/unit/composer-page.spec.ts` | Montaje de la página en `idle`: un `h1`, stepper actual, formulario, sin preview/progreso; submit inválido; flujo completo con fake timers hasta preview; foco gestionado; `noscript`; ausencia de publicación. |
| `tests/unit/composer-header.spec.ts` | Marca, badge `DEMO`, explicación accesible, enlace `Volver al feed` con `href="/feed"` y sin botones de generación. |
| `tests/unit/composer-stepper.spec.ts` | 3 pasos en orden, etiquetas, `aria-current="step"` solo en el actual, estados completo/actual/pendiente, `nav` etiquetado, sin elementos interactivos. |
| `tests/unit/composer-prompt-form.spec.ts` | Label asociada, placeholder, `maxlength`, contador, ayuda, error con `role="alert"`/`aria-invalid`/`aria-describedby`, emisión de `update:prompt` y `submit`, botón `Generar short`, `focusPrompt()`, ausencia de configuración avanzada. |
| `tests/unit/composer-reference-picker.spec.ts` | Input `multiple` y `accept` exactos, apertura mediante botón, selección múltiple, límite 3, deshabilitado al máximo, estado vacío, contador, emisiones `add`/`remove`, errores anunciados, reset del valor del input. |
| `tests/unit/composer-reference-card.spec.ts` | Variante imagen con miniatura y `alt=""`, variante vídeo sin `<video>` ni autoplay, nombre/tipo/tamaño, nombre largo, botón `Eliminar {nombre}` de 44 px, emisión `remove`. |
| `tests/unit/composer-generation-progress.spec.ts` | Heading, nota, etapa, `role="progressbar"` con min/max/now, porcentaje, `Cancelar`, foco al heading al montar, `aria-busy`, sin animación bajo reduced motion. |
| `tests/unit/composer-preview.spec.ts` | Badge `SIMULACIÓN`, póster local, título, duración visible/accesible, referencias, intento, prompt, nota de honestidad, botones `Regenerar`/`Editar idea`, foco al heading, ausencia de creador/stats/like/save/share/publicar/descargar. |
| `tests/unit/app-button.spec.ts` | Variantes, `type` por defecto `button`, `type="submit"`, `disabled`, slot, paso de `class`/`data-testid`/`aria-*`, foco/forced-colors presentes en clases. |
| `tests/unit/use-composer.spec.ts` | Estado inicial, validación, transiciones completas con fake timers (15/50/80/ready), determinismo, intento, doble submit, cancelación, edición, regeneración, error inyectado y reintento, limpieza de timers al desmontar, `statusMessage`, ausencia de persistencia. |
| `tests/unit/use-composer-references.spec.ts` | Validación de vacío/tipo/tamaño, límite 3, deduplicación de incidencias, ids `ref-1..3`, `Map` de `File` no expuesto, `ObjectURL` creado/revocado al eliminar/vaciar/desmontar, fallback sin `createObjectURL`, `canAddMore`, limpieza de issues. |
| `tests/unit/composer-utils.spec.ts` | `normalizeComposerPrompt`, validaciones, `formatFileSize` (`B`, `KB`, `MB`, coma), `formatReferenceCount`, `composerStageLabel`, `getReferenceKind`, hash FNV-1a estable, construcción de petición y resultado, índices/duration/id, cambio de póster/título/duración al regenerar. |
| `tests/unit/composer-data.spec.ts` | 4 pósters con rutas/alt/dimensiones, 4 títulos, límites, MIME, `accept`, línea de tiempo; existencia y contenido local de los 4 SVG (1080 × 1920, sin `<script>`, `<text>`, `<image>`, `foreignObject` ni referencias externas). |
| `tests/unit/composer-guards.spec.ts` | Guardas estáticas: `app/models/composer.ts` sin `File`; archivos runtime nuevos sin `Math.random`, `Date.now`, `new Date(`, `crypto.randomUUID`, `localStorage`, `sessionStorage`, `fetch(`, `$fetch`, `XMLHttpRequest`, `v-html`, `dangerouslySetInnerHTML`; `app/types/short.ts` no existe; no hay barrel en `app/models/`. |
| `tests/unit/feed-header.spec.ts` | CTA como `<a href="/composer">`, texto exacto `Crear short`, `data-testid="feed-cta"`, sin `aria-haspopup`, sin emisión `open`, badge `DEMO` y explicación accesible. |
| `tests/unit/feed-page.spec.ts` | Regresión de `feed.vue`: seis artículos, primer activo, like/save independientes, CTA con `href="/composer"`, ausencia de diálogo/aviso/`Próximamente`, share intacto, `noscript` actualizado, pósters locales. |

**Reglas de test**:

- Usar `@nuxt/test-utils` y `mountSuspended` como en la landing.
- Usar `vi.useFakeTimers()` para la línea de tiempo de 0/800/1600/2400 ms y limpiar timers en `afterEach`.
- Mockear `URL.createObjectURL` y `URL.revokeObjectURL`; comprobar llamadas de creación y revocación.
- Usar `File` de `happy-dom` con tipos y tamaños controlados; no leer archivos reales.
- Inyectar un generador que lanza para cubrir `error`; no añadir un disparador visible de error.
- Los tests de aceptación usan `@nuxt/test-utils/e2e` y `setup({ server: true })` con `// @vitest-environment node`.
- Las guardas estáticas usan `node:fs` y `// @vitest-environment node`.
- No se añade Playwright ni ninguna dependencia nueva.
- `happy-dom` no valida layout, scroll-snap, safe areas, contraste real ni rendimiento; esos puntos se validan manualmente.
- Los tests de la landing (`tests/acceptance/landing-route.spec.ts`, `tests/unit/index-page.spec.ts`, `tests/unit/index-page-a11y.spec.ts`) no se editan.

**Comprobaciones manuales obligatorias**:

1. Flujo prompt-only desde `/feed`: CTA → prompt → `Generar short` → preview; exactamente 2 clics y sin pasos intermedios.
2. Flujo con 1–3 referencias seleccionadas de una vez: exactamente 3 clics; miniaturas, tarjetas de vídeo y contador correctos.
3. Cancelar a mitad de generación, editar desde preview, regenerar dos veces y comprobar que el póster/título/duración cambian y que `Intento` incrementa.
4. Anchos 320, 360, 390, 768, 1024, 1440 y 1920 px; sin scroll horizontal ni recortes; stepper legible a 320 px.
5. Zoom 200 % y 400 % sobre 1280 px; reflow sin pérdida de contenido.
6. Safe areas en iPhone con notch/home indicator y Android con gestos.
7. Objetivos táctiles ≥ 44 × 44 px medidos en DevTools.
8. Teclado: Tab/Shift+Tab, Enter/Espacio, selección de archivos, cancelar, editar, regenerar, reintentar; foco visible y sin trampas.
9. VoiceOver o TalkBack: landmarks, H1, labels, `role="status"`, `role="alert"`, progreso y foco al preview.
10. `prefers-reduced-motion: reduce`: sin transiciones ni animaciones no esenciales.
11. Forced-colors: controles, foco, barra de progreso y tarjetas visibles.
12. DevTools Network: cero peticiones a orígenes externos y cero subidas; `ObjectURL` revocados al eliminar/desmontar.
13. Recarga y navegación durante la generación: no se restaura nada y no quedan timers activos.
14. Feed: CTA navega a `/composer`, no aparece `Próximamente`, y like/save/share/scroll-snap siguen igual.
15. Lighthouse mobile: accesibilidad y contraste; sin errores de consola en build de producción.

## Out of Scope

- Generación real de vídeo con IA, inferencia, modelos, renderizado, encoding o efectos.
- Backend, `server/api/`, base de datos, ORM, almacenamiento, caché, autenticación, cuentas o sesiones.
- Subida de archivos, `FormData`, multipart, almacenamiento remoto o procesamiento de medios en servidor.
- Publicación en el feed o en cualquier otro destino; descarga, exportación o compartición de la vista previa.
- Persistencia en `localStorage`, `sessionStorage`, cookies, IndexedDB o query string.
- Reproducción de vídeo, `<video>`, `<audio>`, autoplay, controles de reproducción o edición de medios.
- Drag & drop, pegar archivos, captura con cámara, grabación o recorte.
- Configuración de modelo, estilo, duración, aspect ratio, resolución, voz, música, semilla o pasos múltiples.
- Historial de proyectos, múltiples borradores, plantillas o duplicación.
- Deep links con prompt/referencias, prefill por query, restauración de estado o URLs compartibles.
- Comentarios, reacciones, follows, notificaciones, búsqueda, explorar o ajustes.
- Analítica, tracking, cookies, A/B testing, píxeles o telemetría.
- i18n, selector de idioma o copy en otros idiomas.
- PWA: manifest, service worker, offline behavior o instalación.
- Migración a Tailwind v4, plugins nuevos, tokens nuevos o cambios en `tailwind.config.ts`.
- Storybook, Playwright, tests E2E de navegador o nuevas dependencias.
- Refactorización, rediseño o limpieza del feed más allá de los cambios explícitos de CTA, aviso y copy especificados.
- Eliminación o modificación de `app/components/ui/ModalDialog.vue`; puede quedar sin uso en esta iteración.
- Promover el feed a `/` o sustituir la landing. Sigue siendo una decisión futura y separada.

## Key Entities

- **ComposerDraft**: borrador en memoria compuesto por `prompt` y `references`. No se persiste y se descarta al desmontar.
- **ComposerReference**: archivo de referencia validado. Contiene id determinista de sesión, tipo (`image`/`video`), nombre, MIME, tamaño, `thumbnailUrl` opcional y `durationSeconds` (siempre `null` en esta iteración). No contiene el `File`.
- **ComposerGenerationRequest**: petición inmutable de simulación con prompt de visualización, firmas de referencias en orden e intento. No contiene archivos.
- **GeneratedShortPreview**: resultado ficticio y terminal. Contiene id determinista, título del pool, póster del pool, duración, prompt, número de referencias e intento. No contiene creador, stats, likes, guardados ni etiquetas.
- **ComposerGenerationState**: unión discriminada `idle | generating | ready | error` con etapa, progreso, resultado, mensaje e intento según corresponda.
- **ComposerValidationIssue**: incidencia de validación con código, campo (`prompt`/`references`) y mensaje normativo.
- **ComposerPoster**: póster SVG local 9:16 con ruta `/mock/composer/*.svg`, alt y dimensiones 1080 × 1920.
- **ComposerStep**: paso visible del flujo (`input`, `generating`, `preview`) que alimenta el stepper y el foco.
- **ComposerGenerator**: función pura inyectable que transforma una petición en un resultado; el valor por defecto es determinista y total para entradas válidas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Ruta y SSR)**: `/composer` responde HTTP 200, declara `lang="es"`, tiene un único `h1`, un `header`, un `main`, formulario etiquetado, stepper de 3 pasos y aviso `noscript`; no contiene preview, progreso ni referencias en el estado inicial.
- **SC-002 (Presupuesto de clics)**: Desde `/feed`, prompt-only llega a preview en exactamente 2 clics; con hasta 3 referencias seleccionadas de una vez, en exactamente 3 clics. No existen pasos `Siguiente` ni configuración avanzada.
- **SC-003 (Referencias)**: Se aceptan hasta 3 archivos de los MIME y tamaños especificados; los inválidos se rechazan con los mensajes exactos; las imágenes muestran miniatura; los vídeos no se reproducen; no hay subida ni red.
- **SC-004 (Determinismo)**: La misma firma de prompt + referencias + intento produce el mismo id, título, póster y duración en cualquier sesión y build. Dos regeneraciones consecutivas cambian póster, título y duración. No se usan APIs de azar o fecha en runtime.
- **SC-005 (Máquina de estados)**: Cancelar, editar, regenerar, reintentar y el doble submit se comportan según la tabla; todos los timers y `ObjectURL` se limpian al desmontar; no hay publicación ni persistencia.
- **SC-006 (Regresión del feed)**: `/feed` sigue renderizando seis shorts y su panel final; like/save/share y scroll-snap siguen intactos; el CTA es un enlace a `/composer`; `Próximamente` y el diálogo ya no existen; los tests de la landing siguen pasando sin cambios.
- **SC-007 (Accesibilidad)**: Lighthouse Accessibility ≥ 95 y cero violaciones axe críticas o serias; un `h1`; labels; `role="status"`/`role="alert"`; foco gestionado; objetivos táctiles ≥ 44 × 44 px; contraste AA; reduced motion y forced colors correctos.
- **SC-008 (Responsive)**: Cero scroll horizontal y cero contenido recortado en 320, 360, 390, 768, 1024, 1440 y 1920 px, al 200 %/400 % de zoom y con safe areas activas.
- **SC-009 (Honestidad y privacidad)**: Cero peticiones externas, cero subidas, cero persistencia y cero secretos. La UI muestra `DEMO`, `SIMULACIÓN` y los textos de que no se crea/publica vídeo real y de que los archivos no se suben.
- **SC-010 (Calidad)**: `npm run test:run`, `npm run build` y `npm run generate` terminan correctamente; todos los archivos runtime nuevos tienen cobertura; los 4 SVG se validan; la suite de la landing sigue en verde.
- **SC-011 (Sin JavaScript)**: El HTML entregado contiene el formulario, el copy y el aviso `noscript`; no se simula generación, preview ni éxito.
- **SC-012 (Preview terminal)**: La preview no ofrece publicar, descargar, compartir ni enviar al feed; no crea un `Short`; al recargar o navegar desaparece.

## Constitution Check

Confirmación explícita contra `.specify/memory/constitution.md` v1.0.1:

- **I. Simplicity First (1-to-3-Clicks UX)**: el camino mínimo es 2 clics sin referencias y 3 con referencias; no hay pasos `Siguiente`, configuración avanzada ni flujos paralelos. Regenerar/editar/cancelar son recuperación opcional.
- **II. Spec-Driven Development**: esta es la Phase 1. No se escribe implementación, `plan.md` ni `tasks.md` hasta la revisión humana y la fase correspondiente.
- **III. Server-Side Security for AI & Secrets**: no hay IA real, secretos, API keys, `server/api/`, variables de entorno ni llamadas de red. Todo el mock es cliente y no requiere backend.
- **IV. Modular Component Architecture & Reusability**: página en `app/pages/`, dominio en `app/components/composer/`, primitiva justificada en `app/components/ui/AppButton.vue`, lógica en `app/composables/`, modelos globales en `app/models/`, helpers puros en `app/utils/`, constantes en `app/data/` y assets en `public/mock/composer/`. Los tipos de un solo componente quedan inline.
- **V. Test-First & Quality Gates**: se especifican tests de aceptación SSR, unitarios por archivo runtime nuevo, regresión del feed, guardas de determinismo y validación de assets. La landing y sus tests permanecen intactos.
- **Tailwind 3.4.x**: se usa exclusivamente sintaxis v3 y los tokens existentes; no se modifica `tailwind.config.ts` ni se usa Tailwind v4.
- **Nuxt 4**: ruta por archivos en `app/pages/composer.vue`, `useHead`/`useSeoMeta`, auto-imports estándar, sin plugins ni capas adicionales. `app/models/` es la carpeta canónica de modelos con alias `~/models`.
- **Sin cambios colaterales**: `/`, la landing, `specs/001-brand-construction-landing/`, `app/app.vue`, `tailwind.config.ts`, `nuxt.config.ts`, `vitest.config.ts`, `package.json` y los tests existentes no se modifican.

## Assumptions

- El producto sigue siendo **AI Shorts**, en español (`es-ES`), con estética dark premium y acento violeta-fucsia.
- La demo se sirve sin `baseURL` ni subpath y se despliega con SSR o `nuxt generate`.
- Los navegadores soportan `File`, `FileList`, `URL.createObjectURL` y `URL.revokeObjectURL`. Si `createObjectURL` no existe o falla, la imagen se muestra sin miniatura y el flujo continúa.
- El tipo MIME reportado por el navegador es la única fuente de verdad para validar el tipo de archivo; la extensión no se usa.
- Los archivos seleccionados son locales y accesibles mientras la página está montada. No se leen, suben ni procesan.
- La generación simulada es total para entradas válidas y no falla por azar. El estado `error` cubre fallos defensivos y se prueba mediante inyección.
- Los pósters y títulos son ficticios, locales y no requieren licencias externas.
- El estado es efímero por diseño. No se espera persistencia, historial ni sincronización entre pestañas.
- `happy-dom` no reproduce layout real; las comprobaciones de responsive, safe areas, contraste y foco visual se hacen manualmente.
- La demo usa navegadores evergreen modernos (últimas dos versiones de Chrome, Edge, Firefox y Safari). No se garantiza paridad pixel-perfect en navegadores antiguos.
- `app/components/ui/ModalDialog.vue` puede quedar sin uso tras retirar el aviso; su limpieza no forma parte de esta iteración.
- El feed conserva su `title` `AI Shorts — Feed de prueba`; solo cambia su meta description y el texto del `noscript` por coherencia con el nuevo CTA.

## Open Questions

**No hay preguntas abiertas.** Todas las decisiones de producto, alcance, datos, copy, diseño, accesibilidad, estado y testing necesarias para implementar esta iteración están cerradas en esta especificación.
