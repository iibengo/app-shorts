# Feature Specification: Feed de Shorts con datos mock

**Feature Branch**: `002-shorts-feed-mock`

**Created**: 2026-10-18

**Status**: Draft

**Input**: User description: "Diseñar el feed inicial de Shorts con datos mock locales para validar la experiencia visual, sin base de datos, API, autenticación, generación con IA ni video real."

## Contexto y relación con 001

Esta especificación es **aditiva e independiente** de la landing pre-lanzamiento.

- La landing existente en `/` (`app/pages/index.vue`), su especificación `specs/001-brand-construction-landing/spec.md`, sus tests y su contrato visual **no se modifican**.
- El feed se publica en una ruta nueva y aislada: `/feed`.
- `app/app.vue` ya renderiza `<NuxtPage />`; no requiere cambios.
- La promoción del feed a `/` —o la sustitución de la landing— es una **decisión de producto futura y separada**. No forma parte de esta iteración.
- El feed es una demo visual con datos ficticios. No valida la generación real de video.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recorrer un feed vertical de shorts de prueba (Priority: P1)

Una persona abre `/feed` en el móvil y encuentra un feed vertical, a pantalla completa, con seis shorts ficticios. Puede deslizar de uno en uno, ve claramente quién creó cada short, su título, etiquetas y duración, y al final encuentra un cierre honesto que indica que la demo ha terminado.

**Why this priority**: Es el núcleo de la funcionalidad. Sin el feed navegable y su estado final no existe nada que validar visualmente ni que enseñar a producto.

**Independent Test**: Arrancar la app, visitar `/feed` y comprobar que se renderizan exactamente seis shorts y el panel `Fin del feed de prueba`; que cada short ocupa una vista en móvil con CSS scroll-snap; que los títulos y creadores coinciden con el fixture; y que no hay video, autoplay, scroll infinito ni contenido adicional después del final.

**Acceptance Scenarios**:

1. **Given** la app está en ejecución y la persona solicita `/feed`, **When** la página termina de renderizar, **Then** la respuesta es HTTP 200, el documento declara `lang="es"`, existe exactamente un `<h1>` y se renderizan seis `<article>` con los títulos del fixture en orden.
2. **Given** un viewport móvil, **When** la persona desliza verticalmente, **Then** el feed avanza mediante CSS scroll-snap nativo, mostrando un short por vista completa, sin interceptar la rueda, el gesto táctil ni el teclado.
3. **Given** la persona llega al final del sexto short, **When** continúa deslizando, **Then** aparece el panel `Fin del feed de prueba` con el texto normativo y **no** existe ningún centinela de carga, skeleton, `load more` ni scroll infinito.
4. **Given** el feed está visible, **When** se inspecciona el estado activo, **Then** exactamente un short tiene `data-active="true"` y `aria-current="true"`; el primer short es el activo en el render inicial y en SSR.
5. **Given** JavaScript está deshabilitado, **When** se solicita `/feed`, **Then** los seis pósters, títulos, creadores, etiquetas, duraciones y el panel final siguen presentes en el HTML del servidor, y un aviso `noscript` explica que las interacciones necesitan JavaScript.

---

### User Story 2 - Entender que es una demo y que crear todavía no está disponible (Priority: P1)

Una persona ve el feed y entiende de inmediato que los shorts, creadores y métricas son ficticios. Encuentra un CTA visible `Crear short` y, al activarlo, recibe un aviso claro de `Próximamente` con una explicación honesta y una acción para cerrar. No se le pide ningún dato ni se simula una generación.

**Why this priority**: La honestidad es un requisito de producto y de marca. Un feed que parezca real o un CTA que no haga nada destruiría la confianza y convertiría la demo en una promesa falsa.

**Independent Test**: Abrir `/feed`, localizar el badge `DEMO` y el CTA `Crear short`, activarlo una vez y comprobar que aparece un diálogo con el título `Próximamente`, el cuerpo normativo y el botón `Cerrar`; que no hay formulario, input, llamada de red ni generación; y que Escape, el backdrop y el botón cierran el aviso devolviendo el foco al CTA.

**Acceptance Scenarios**:

1. **Given** el feed se ha renderizado, **When** la persona mira la cabecera, **Then** ve la marca `AI Shorts`, el badge visible `DEMO` y el CTA `Crear short`, sin navegación inferior, pestañas ni enlaces muertos.
2. **Given** una persona con lector de pantalla recorre la cabecera y llega al badge `DEMO`, **When** se anuncia, **Then** incluye la explicación `DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.`.
3. **Given** el CTA `Crear short` está enfocado, **When** la persona lo activa con ratón, toque, Enter o Espacio, **Then** se abre un único diálogo modal con `role="dialog"`, `aria-modal="true"`, título `Próximamente` y descripción normativa.
4. **Given** el diálogo está abierto, **When** la persona pulsa Escape, hace clic en el backdrop o activa `Cerrar`, **Then** el diálogo se cierra, el fondo deja de estar inerte y el foco vuelve exactamente al CTA `Crear short`.
5. **Given** el diálogo está abierto, **When** la persona pulsa Tab o Shift+Tab, **Then** el foco permanece dentro del diálogo y no alcanza el feed ni la cabecera.
6. **Given** la persona busca crear un short, **When** inspecciona el flujo, **Then** no existe formulario, campo de texto, subida, llamada a API, spinner de generación ni mensaje de éxito falso; el único resultado es el aviso `Próximamente`.

---

### User Story 3 - Reaccionar y compartir sin persistencia ni efectos secundarios (Priority: P2)

Una persona puede marcar `Me gusta`, `Guardar` y `Compartir` desde cada short. Los toggles responden visual y semánticamente, pero no se guardan en ningún sitio. Compartir usa la Web Share API cuando existe, copia la URL al portapapeles cuando no, y si ninguna opción funciona lo dice con honestidad.

**Why this priority**: Las acciones dan vida a la demo y validan la anatomía de la tarjeta. Sin ellas el feed sigue siendo útil visualmente, pero no se puede evaluar la interacción característica de un feed de shorts.

**Independent Test**: En un short concreto, alternar `Me gusta` y `Guardar` y verificar `aria-pressed` y el estado visual; recargar y verificar que el estado vuelve al fixture. Probar `Compartir` con Web Share disponible, solo con clipboard, con ambos fallando y con cancelación del usuario, comprobando los mensajes exactos.

**Acceptance Scenarios**:

1. **Given** el primer short se renderiza, **When** la persona activa `Me gusta`, **Then** `aria-pressed` cambia a `true`, el icono pasa a estado activo y el contador visible no cambia.
2. **Given** el primer short se renderiza, **When** la persona activa `Guardar`, **Then** `aria-pressed` cambia a `true` y el estado es independiente del like y del resto de shorts.
3. **Given** la persona ha alternado likes y guardados, **When** recarga la página, **Then** todos los estados vuelven a los valores `initialState` del fixture; no se escribe en `localStorage`, `sessionStorage`, cookies ni servidor.
4. **Given** `navigator.share` existe, **When** la persona comparte un short y la promesa se resuelve, **Then** se comparte el título del short, un texto que incluye `AI Shorts (demo)` y la URL absoluta de `/feed`, y aparece `Enlace compartido.`.
5. **Given** `navigator.share` no existe o falla, **When** la persona comparte, **Then** se intenta `navigator.clipboard.writeText` con la URL de `/feed`; si funciona aparece `Enlace copiado al portapapeles.`.
6. **Given** ni Web Share ni clipboard están disponibles o ambos fallan, **When** la persona comparte, **Then** aparece `No se pudo compartir. Copia la dirección del navegador.` y no se simula un éxito.
7. **Given** la persona cancela el diálogo nativo de compartir (`AbortError`), **When** la promesa se rechaza, **Then** no se muestra error ni se intenta el clipboard, y el estado anterior no se altera.

---

### User Story 4 - Una composición deliberada en cualquier pantalla (Priority: P2)

La misma persona abre el feed en un teléfono pequeño, un teléfono grande, una tablet, un portátil o un monitor de 1920 px. En móvil el póster es full-bleed; en escritorio el feed se convierte en un escenario 9:16 centrado y limitado en altura. No hay scroll horizontal, contenido cortado ni controles fuera de alcance.

**Why this priority**: El público de shorts es mayoritariamente móvil, pero la demo se revisará también en escritorio. La composición responsive forma parte de la calidad visual y de la credibilidad del producto.

**Independent Test**: Cargar `/feed` a 320, 360, 390, 768, 1024, 1440 y 1920 px; comprobar cero scroll horizontal, póster full-bleed en móvil, escenario centrado de máximo 56 rem de alto en escritorio, safe areas en un dispositivo con notch y objetivos táctiles de al menos 44 × 44 px.

**Acceptance Scenarios**:

1. **Given** un viewport de 320 px, **When** se renderiza el feed, **Then** la cabecera, el CTA, el título, las etiquetas y la action rail caben sin scroll horizontal ni texto cortado; el póster ocupa el ancho completo.
2. **Given** un viewport de 768 px o superior, **When** se renderiza el feed, **Then** cada short se presenta en un escenario 9:16 centrado, con altura máxima de 56 rem y la página oscura alrededor.
3. **Given** un dispositivo con notch o home indicator, **When** se renderiza el feed, **Then** la cabecera respeta `safe-area-inset-top`, el contenido inferior respeta `safe-area-inset-bottom` y la action rail respeta `safe-area-inset-right`; con insets a 0 el layout no se rompe.
4. **Given** un zoom de navegador al 200 % o al 400 % sobre 1280 px, **When** el contenido refluye, **Then** no hay solapamientos, pérdida de información ni scroll horizontal; a 400 % el ancho efectivo es 320 px y el feed sigue siendo legible.
5. **Given** un teléfono en horizontal con altura limitada, **When** el contenido no cabe en una vista, **Then** el short crece a `min-height` y se puede leer completo, sin recortes ni scroll anidado; esta es la única excepción documentada a "un short por vista".

---

### User Story 5 - Una experiencia accesible y respetuosa (Priority: P3)

Una persona que usa teclado, lector de pantalla, zoom, modo de alto contraste o movimiento reducido puede recorrer el feed, entender cada short y usar los controles sin trampas de foco, sin animaciones no deseadas y sin contenido que dependa del color o del movimiento.

**Why this priority**: La accesibilidad es un requisito de calidad de la marca. Se prioriza después del feed y su composición porque el contenido estático ya es comprensible, pero debe cumplirse antes de considerar la demo terminada.

**Independent Test**: Auditar `/feed` con teclado, VoiceOver o TalkBack, `prefers-reduced-motion: reduce`, forced-colors, zoom y un lector de contraste. Confirmar un H1, landmarks, nombres accesibles en artículos y controles, foco visible, contraste AA, ausencia de autoplay y ausencia de animaciones no esenciales.

**Acceptance Scenarios**:

1. **Given** un lector de pantalla abre `/feed`, **When** anuncia la página, **Then** encuentra un `header`, un `main`, un único `h1` (`Feed de shorts de prueba`), seis artículos con nombre accesible y una jerarquía de encabezados sin saltos.
2. **Given** una persona navega solo con teclado, **When** recorre el feed con Tab, PageDown y flechas, **Then** puede desplazar el contenedor, alcanza el CTA, los controles de cada short y el botón de cerrar del diálogo, y todos muestran un foco visible.
3. **Given** el diálogo `Próximamente` no está abierto, **When** la persona recorre la página, **Then** no existe ninguna trampa de foco; la única trampa permitida es la del diálogo modal explícito.
4. **Given** el sistema operativo solicita movimiento reducido, **When** se carga el feed, **Then** no hay animaciones en reproducción ni transiciones no esenciales; el scroll-snap nativo y la composición permanecen intactos.
5. **Given** el feed en modo forced-colors, **When** se inspeccionan controles y foco, **Then** los botones conservan bordes y estados visibles con colores del sistema y el foco sigue siendo perceptible.
6. **Given** los pósters tienen luminosidad variable, **When** se mide el contraste del texto sobre los scrims, **Then** el texto normal alcanza al menos 4.5:1, el texto grande 3:1 y los límites de controles 3:1.

---

### Edge Cases

- **JavaScript deshabilitado o bloqueado**: el feed completo se renderiza en SSR/SSG y sigue siendo legible, pero like/save/share y el diálogo no funcionan. Un bloque `<noscript>` visible informa: `La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. La creación de shorts con IA todavía no está disponible.` No se simula ningún éxito.
- **IntersectionObserver no disponible**: el primer short permanece como activo y el feed sigue siendo navegable; no se lanza ningún error.
- **Web Share no disponible**: se usa clipboard si existe. Si clipboard no existe, está denegado o el contexto no es seguro, se muestra el mensaje de error normativo.
- **Cancelación de Web Share**: un rechazo `AbortError` no se trata como error, no muestra toast y no intenta clipboard.
- **Clipboard denegado**: se trata como fallo y se muestra el mensaje de error normativo; no se usa `document.execCommand`.
- **Póster muy luminoso**: los scrims y el color de texto deben mantener el contraste AA sin depender de la imagen.
- **Viewport de 320 px**: la cabecera puede envolver a dos filas si el texto crece; nunca hay scroll horizontal. Las etiquetas envuelven dentro del ancho disponible.
- **Viewport de 1920 px o superior**: el escenario no supera 56 rem de alto ni su ancho 9:16 correspondiente; el resto de la página es fondo oscuro.
- **Teléfono en horizontal con poca altura**: el short puede superar `100svh` para no recortar contenido; no se usa scroll interno anidado.
- **Zoom 200 % / 400 %**: el contenido refluye, los títulos pueden ocupar más líneas y los controles crecen; nada queda inaccesible.
- **Texto ampliado por el sistema**: los botones usan `min-height` y padding, no alturas fijas que recorten el texto.
- **Movimiento reducido**: se desactivan transiciones y animaciones; no se altera el orden ni la legibilidad.
- **Forced colors / alto contraste**: los controles mantienen bordes y foco visibles con colores del sistema; los scrims decorativos pueden desaparecer sin ocultar información.
- **Hidratación**: el HTML SSR no contiene aleatoriedad ni fechas actuales; el estado inicial de likes/guardados y el short activo son idénticos en servidor y cliente.
- **Doble clic rápido en like/save**: cada activación alterna una sola vez; no se encadenan efectos ni se modifican contadores.
- **Apertura del diálogo con el feed desplazado**: al cerrar, el foco vuelve al CTA y la posición de scroll del feed no cambia.
- **Póster que tarda en cargar**: el hueco 9:16 está reservado por `width`/`height` y `aspect-ratio`; el texto y los controles son utilizables antes de que la imagen termine de decodificar.
- **Red lenta u offline**: no hay peticiones externas; los pósters locales y el CSS/JS de la app son los únicos recursos. Compartir puede fallar y se comunica honestamente.
- **Service worker/PWA existente**: no se modifica su configuración; el feed no depende de comportamiento offline nuevo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST renderizar el feed en la ruta `/feed` mediante `app/pages/feed.vue`, siguiendo el enrutado por archivos de Nuxt 4. MUST permanecer sin cambios: `/`, `app/pages/index.vue`, `app/app.vue`, `specs/001-brand-construction-landing/spec.md`, los tests de la landing, `tailwind.config.ts` y `package.json`.
- **FR-002**: La respuesta SSR de `/feed` MUST incluir el feed completo y el contenido normativo sin depender de JavaScript para mostrarse.
- **FR-003**: La cabecera overlay MUST mostrar la marca `AI Shorts`, un badge visible `DEMO` y el CTA `Crear short`. MUST NOT incluir navegación inferior, pestañas, menús ni enlaces a destinos ficticios.
- **FR-004**: El badge `DEMO` MUST exponer una explicación accesible de que los datos son ficticios. El texto visible es `DEMO`; la explicación completa es `DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.`.
- **FR-005**: El CTA MUST ser un `<button type="button">` con la etiqueta visible exacta `Crear short`, `aria-haspopup="dialog"`, sin `href`, sin formulario, sin input y sin llamada a API. Al activarlo una vez MUST abrir el aviso `Próximamente`.
- **FR-006**: El aviso de creación MUST ser un diálogo modal accesible con `role="dialog"`, `aria-modal="true"`, nombre y descripción asociados, título `Próximamente`, cuerpo normativo y botón `Cerrar`. MUST cerrarse con `Cerrar`, Escape o clic en el backdrop; MUST atrapar el foco mientras está abierto, bloquear el scroll del fondo, marcar el fondo como inerte y restaurar el foco al CTA al cerrar. MUST NOT contener formularios, generación simulada ni éxito falso.
- **FR-007**: El feed MUST renderizar exactamente seis shorts a partir de un fixture local determinista, en el orden definido en el contrato de datos. MUST NOT usar `Math.random`, `Date.now`, `new Date()` para contenido visible, barajado ni datos generados en tiempo de ejecución.
- **FR-008**: El feed MUST ser vertical, mobile-first y usar CSS scroll-snap nativo para mostrar un short por viewport en alturas estándar. El contenedor de scroll MUST ser focusable para teclado y MUST NOT interceptar wheel, touch ni teclado para forzar scroll con JavaScript.
- **FR-009**: El feed MUST ser finito. Después del sexto short MUST aparecer el panel `Fin del feed de prueba` con el texto normativo. MUST NOT existir scroll infinito, centinela, skeleton, paginación ni `load more`.
- **FR-010**: Cada short MUST ser un `<article>` con la anatomía: póster 9:16, scrim superior, scrim inferior, creador, título (máximo dos líneas visuales), etiquetas, badge de duración y action rail.
- **FR-011**: Los pósters MUST ser SVG locales en `public/mock/shorts/`, con proporción 9:16 y dimensiones intrínsecas 1080 × 1920. MUST NOT existir `<video>`, `<audio>`, `autoplay`, controles de reproducción, archivos de video, GIFs, imágenes remotas ni pósters generados en runtime.
- **FR-012**: Los scrims MUST ser degradados oscuros sobre el póster, decorativos, `aria-hidden="true"` y `pointer-events-none`, suficientes para garantizar contraste AA del texto.
- **FR-013**: Cada short MUST mostrar el nombre del creador, su handle ficticio, el título, exactamente dos etiquetas y la duración en formato `m:ss` con nombre accesible `Duración: {n} segundos`.
- **FR-014**: La action rail MUST contener exactamente tres controles: `Me gusta`, `Guardar` y `Compartir`. MUST NOT incluir comentarios, respuestas, follow, regalo, menú ni acciones adicionales.
- **FR-015**: Like y save MUST ser toggles en memoria inicializados desde `initialState`, con `aria-pressed` correcto y etiquetas accesibles estables `Me gusta` y `Guardar`. Los contadores visibles son datos estáticos del fixture y MUST NOT cambiar al alternar. El estado MUST NOT persistir en `localStorage`, `sessionStorage`, cookies, URL ni servidor.
- **FR-016**: Compartir MUST seguir este orden: (1) `navigator.share` si existe; (2) `navigator.clipboard.writeText` si share no existe o falla por una causa distinta de `AbortError`; (3) mensaje de error normativo si ninguna opción funciona. MUST NOT usar SDKs, endpoints, analítica ni `document.execCommand`.
- **FR-017**: El estado activo MUST calcularse en cliente con `IntersectionObserver` sobre los artículos dentro del contenedor de scroll. MUST haber exactamente un artículo con `data-active="true"` y `aria-current="true"`. El primer short MUST ser el activo inicial y en SSR. MUST NOT reproducir medios, auto-scroll ni atenuar el resto.
- **FR-018**: La ruta MUST declarar `lang="es"`, `color-scheme: dark`, `theme-color: #09090b`, title `AI Shorts — Feed de prueba`, description `Feed de demostración de AI Shorts con seis shorts ficticios. La creación de videos con IA estará disponible próximamente.` y `robots: noindex, nofollow`.
- **FR-019**: El layout MUST ser full-bleed en móvil y un escenario 9:16 centrado con altura máxima de 56 rem desde `md` (768 px). MUST funcionar de 320 px a 1920 px sin scroll horizontal ni contenido recortado.
- **FR-020**: La cabecera, el contenido inferior, la action rail y el diálogo MUST respetar las safe-area insets. Todos los controles interactivos MUST tener un objetivo táctil mínimo de 44 × 44 px CSS.
- **FR-021**: La página MUST usar HTML semántico: un `header`, un `main`, un único `<h1>`, artículos con nombre accesible, títulos `h2` y orden de encabezados sin saltos. El panel final MAY ser un `<footer>` dentro de `main`; no se exige un landmark `contentinfo` adicional.
- **FR-022**: MUST existir foco visible en todos los controles y en el contenedor de scroll. MUST NOT existir `tabindex` positivo ni trampas de foco salvo el diálogo modal. El foco MUST restaurarse al CTA al cerrar el diálogo.
- **FR-023**: MUST NOT existir autoplay, animaciones de póster, parallax, zoom automático, scroll animado ni `scroll-behavior: smooth`. Con `prefers-reduced-motion: reduce` MUST desactivarse toda animación y transición no esencial.
- **FR-024**: El texto normal MUST alcanzar 4.5:1, el texto grande 3:1 y los límites/controles significativos 3:1 sobre el peor caso de luminosidad del póster bajo el scrim.
- **FR-025**: El primer póster MUST cargarse con `loading="eager"`, `fetchpriority="high"` y `decoding="async"`; los otros cinco MUST usar `loading="lazy"`. Todas las imágenes MUST declarar `width`, `height` y proporción reservada para evitar CLS.
- **FR-026**: La ruta MUST NOT realizar peticiones a orígenes externos: sin fuentes remotas, imágenes remotas, iconos remotos, analítica, píxeles, CDNs ni APIs. Los iconos MUST ser SVG inline locales.
- **FR-027**: El render MUST ser determinista: dos respuestas consecutivas de `/feed` MUST contener los mismos seis ids, títulos, creadores, pósters, fechas, contadores y estados iniciales, y el mismo primer short activo.
- **FR-028**: La implementación MUST seguir la arquitectura modular de la Constitución: primitivas UI en `app/components/ui/`, componentes de dominio en `app/components/shorts/`, lógica compartida en `app/composables/`, tipos estrictos en `app/types/`, helpers puros en `app/utils/` y fixture en `app/data/`.
- **FR-029**: El modelo de datos MUST ser estricto, sin `any` y sin campos opcionales no especificados. El fixture MUST cumplir las invariantes del contrato de datos.
- **FR-030**: La página MUST exponer los `data-testid` estables definidos en esta especificación. Estos atributos pueden permanecer en producción.
- **FR-031**: El presupuesto de interacción MUST ser: 0 clics para explorar/desplazar, 1 clic para like/save/share, 1 clic para abrir `Crear short`, 2 clics para abrir y cerrar el aviso. Ningún recorrido de esta iteración MUST superar 3 clics.
- **FR-032**: MUST NOT existir enlaces muertos, botones sin efecto en el modo soportado, pestañas ni destinos ficticios. La marca y el badge DEMO no son enlaces. El único CTA de creación es el que abre el aviso.
- **FR-033**: La feature MUST NOT añadir dependencias runtime, rutas de servidor, endpoints, secretos, variables de entorno, autenticación, base de datos ni integración de IA. Debe seguir siendo compatible con `nuxt generate`.
- **FR-034**: Todo el copy visible MUST estar en español (`es-ES`). No se añade i18n, selector de idioma ni contenido en otros idiomas.
- **FR-035**: Todos los archivos de código nuevos, salvo las interfaces planas, MUST tener validación automatizada según la Constitución. Los seis SVG MUST validarse por existencia/contenido local y revisión visual. La ruta `/feed` MUST tener un test de aceptación SSR. Los tests existentes de la landing MUST permanecer sin cambios y en verde.
- **FR-036**: La página MUST incluir un aviso `<noscript>` visible con el texto normativo. Sin JavaScript el contenido es de solo lectura y las interacciones no se simulan.
- **FR-037**: Compartir MUST usar la URL absoluta de `/feed` sin hash ni deep link por short. MUST NOT prometer que el enlace abre un short concreto.
- **FR-038**: El feed MUST iniciar en el primer short, sin desplazamiento automático ni restauración de posición entre recargas.

### Data Contract

El contrato es normativo. Todos los campos son obligatorios y de solo lectura en el fixture; el estado reactivo de interacción es una copia mutable en memoria.

```ts
// Contrato, no implementación.
type ShortId = `short-${string}`
type PosterSrc = `/mock/shorts/${string}.svg`

interface ShortCreator {
  readonly name: string
  readonly handle: `@${string}`
}

interface ShortStats {
  readonly likes: number
  readonly saves: number
}

interface ShortPoster {
  readonly src: PosterSrc
  readonly alt: string
  readonly width: 1080
  readonly height: 1920
}

interface ShortMedia {
  readonly type: 'poster'
  readonly poster: ShortPoster
}

interface ShortInitialState {
  readonly isLiked: boolean
  readonly isSaved: boolean
}

interface ShortInteractionState {
  isLiked: boolean
  isSaved: boolean
}

interface Short {
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

type ShareOutcome = 'shared' | 'copied' | 'unavailable' | 'cancelled'
```

**Invariantes**:

- Exactamente seis shorts, ids únicos y orden fijo `short-001` … `short-006`.
- `durationSeconds` es un entero entre 1 y 60.
- Cada short tiene exactamente dos etiquetas no vacías y distintas entre sí.
- `stats.likes` y `stats.saves` son enteros no negativos; se muestran como números enteros y no se mutan.
- `publishedAt` es una fecha ISO 8601 UTC válida y fija, con sufijo `Z`; no se muestra en la interfaz en esta iteración.
- `media.type` es siempre `'poster'`; no existe variante de video.
- `media.poster.src` empieza por `/mock/shorts/` y termina en `.svg`; `width`/`height` son siempre 1080/1920.
- `media.poster.alt` es una descripción breve en español y no está vacía.
- `creator.handle` empieza por `@`, es ficticio y no contiene espacios.
- `initialState` refleja los valores de la tabla y determina el estado SSR.

### Fixture normativo

Base de pósters: `public/mock/shorts/`. Todos los pósters son SVG locales de 1080 × 1920.

| ID | Título exacto | Creador | Handle | Etiquetas | Duración | Likes | Guardados | `publishedAt` | Inicial like/save |
|----|---------------|---------|--------|-----------|----------|-------|-----------|---------------|-------------------|
| `short-001` | `Tu primera idea en un short` | Marina Solís | `@marinasolis` | `IA`, `Guion` | 18 s | 128 | 34 | `2026-10-01T09:00:00.000Z` | no / no |
| `short-002` | `De idea a guion en 60 segundos` | Diego Ferrán | `@diegoferran` | `Guion`, `Productividad` | 24 s | 96 | 21 | `2026-10-02T09:00:00.000Z` | no / sí |
| `short-003` | `El encuadre que arruina tu vertical` | Nuria Vega | `@nuriavega` | `Vertical`, `Cámara` | 15 s | 214 | 58 | `2026-10-03T09:00:00.000Z` | sí / no |
| `short-004` | `Ilumina tu set con una lámpara` | Tomás Riera | `@tomasriera` | `Luz`, `Set` | 21 s | 173 | 47 | `2026-10-04T09:00:00.000Z` | no / no |
| `short-005` | `Ritmo y corte en tres pasos` | Alba Quiroga | `@albaquiroga` | `Edición`, `Ritmo` | 27 s | 302 | 88 | `2026-10-05T09:00:00.000Z` | sí / sí |
| `short-006` | `Publica con intención, no por inercia` | Iker Salas | `@ikersalas` | `Publicación`, `Estrategia` | 19 s | 145 | 39 | `2026-10-06T09:00:00.000Z` | no / no |

| ID | Póster local | Texto alternativo exacto | Dirección visual |
|----|--------------|--------------------------|------------------|
| `short-001` | `/mock/shorts/short-001.svg` | `Póster abstracto violeta con un destello de luz.` | Violeta profundo y destello blanco |
| `short-002` | `/mock/shorts/short-002.svg` | `Póster abstracto fucsia con líneas que convergen.` | Fucsia y líneas finas convergentes |
| `short-003` | `/mock/shorts/short-003.svg` | `Póster abstracto índigo con un marco vertical.` | Índigo y marco 9:16 |
| `short-004` | `/mock/shorts/short-004.svg` | `Póster abstracto ámbar con un haz de luz.` | Ámbar y haz diagonal |
| `short-005` | `/mock/shorts/short-005.svg` | `Póster abstracto violeta con bloques rítmicos.` | Violeta/fucsia y bloques |
| `short-006` | `/mock/shorts/short-006.svg` | `Póster abstracto fucsia con ondas concéntricas.` | Fucsia y ondas concéntricas |

Cualquier parecido de nombres, handles o métricas con personas o cuentas reales es coincidencia. Los seis shorts son ficticios.

### Interaction & State Rules

**Like / save**

- El estado inicial se copia de `initialState` al montar la página.
- Cada toggle afecta únicamente al short activado.
- `aria-pressed` refleja el estado booleano; la etiqueta accesible no cambia (`Me gusta`, `Guardar`).
- El icono cambia entre contorno y relleno, y el color activo usa `brand-fuchsia` para like y `brand-violet` para save.
- Los contadores visibles (`128`, `34`, etc.) son estáticos y no se incrementan ni decrementan.
- No hay persistencia, sincronización entre pestañas ni llamada de red.

**Compartir**

- La URL compartida es la URL absoluta de `/feed`, sin hash ni query: origen + `/feed`.
- El payload de `navigator.share` es `{ title: short.title, text: '<title> — AI Shorts (demo)', url: '<origen>/feed' }`.
- Precedencia: Web Share → clipboard → error.
- `AbortError` no produce toast, no copia y no altera el estado.
- Cualquier otro rechazo de share intenta clipboard.
- Si clipboard no existe, no es seguro o rechaza, se muestra el error.
- El estado de share es global a la página, no por short.
- El mensaje vive en una región `role="status"` con `aria-live="polite"` y `aria-atomic="true"`, visible durante 6 segundos o hasta el siguiente intento. El temporizador se limpia al desmontar.
- Mensajes exactos: `Enlace compartido.`, `Enlace copiado al portapapeles.`, `No se pudo compartir. Copia la dirección del navegador.`.

**Short activo**

- Estado inicial: `short-001`.
- Observación con `IntersectionObserver`, `threshold: 0.6`, root = contenedor de scroll.
- Entre las entradas con `intersectionRatio >= 0.6`, gana la de mayor ratio; en empate, el índice menor.
- Si ninguna alcanza el umbral, se conserva el activo anterior para evitar parpadeos.
- Si `IntersectionObserver` no existe, se conserva el primero.
- Al desmontar se llama a `disconnect()`.
- El estado activo solo marca `data-active` y `aria-current`; no auto-scrollea, no atenúa otras tarjetas ni precarga video. Es el punto de extensión previsto para una futura reproducción, que no forma parte de esta iteración.

**Diálogo**

- Cerrado en SSR: el panel MUST NOT estar en el HTML inicial; se monta solo tras la primera apertura.
- El CTA declara `aria-haspopup="dialog"`; no se usa `aria-expanded`.
- Al abrir: foco inicial en `Cerrar`; fondo `inert`; scroll bloqueado.
- Al cerrar: se retira `inert`, se restaura el scroll y el foco vuelve al CTA.
- El backdrop cierra solo si el clic ocurre fuera del panel.
- No hay cierre automático ni temporizador.
- `Cerrar` es un botón visible de ancho completo en el panel, con altura mínima 44 px.

### Normative Copy Deck

Los siguientes textos son normativos y MUST aparecer exactamente como se escriben (mayúsculas y acentos incluidos).

| Slot | Texto exacto |
|------|--------------|
| Marca | `AI Shorts` |
| Badge visible | `DEMO` |
| Explicación accesible del badge | `DEMO. Datos de prueba: los shorts, creadores, métricas y fechas son ficticios.` |
| H1 (visualmente oculto) | `Feed de shorts de prueba` |
| CTA de cabecera | `Crear short` |
| Título del diálogo | `Próximamente` |
| Cuerpo del diálogo | `La creación de shorts con IA todavía no está disponible. Esta demo usa datos ficticios y no genera videos reales.` |
| Cerrar diálogo | `Cerrar` |
| Acción like | `Me gusta` |
| Acción save | `Guardar` |
| Acción share | `Compartir` |
| Descripción del contador de likes | `{n} me gusta` |
| Descripción del contador de saves | `{n} guardados` |
| Duración accesible | `Duración: {n} segundos` |
| Duración visible | `{m}:{ss}` (por ejemplo, `0:18`) |
| Fin del feed (título) | `Fin del feed de prueba` |
| Fin del feed (cuerpo) | `Estos seis shorts son ficticios y existen solo para validar el diseño. No hay más contenido ni scroll infinito.` |
| Compartido con éxito | `Enlace compartido.` |
| Copiado al portapapeles | `Enlace copiado al portapapeles.` |
| Error al compartir | `No se pudo compartir. Copia la dirección del navegador.` |
| Aviso sin JavaScript | `La demo interactiva necesita JavaScript. Los shorts de prueba siguen visibles. La creación de shorts con IA todavía no está disponible.` |
| Meta title | `AI Shorts — Feed de prueba` |
| Meta description | `Feed de demostración de AI Shorts con seis shorts ficticios. La creación de videos con IA estará disponible próximamente.` |

Los títulos, creadores, handles y etiquetas de los seis shorts se especifican en la tabla del fixture y también son normativos.

### Design Contract (normative)

No hay preguntas de diseño abiertas. Las decisiones siguientes son fijas para esta iteración y reutilizan los tokens existentes de `tailwind.config.ts`. Tailwind es 3.4.x mediante `@nuxtjs/tailwindcss` 6.14: se usa sintaxis v3 (`bg-gradient-to-*`, `from-*`, `to-*`), nunca sintaxis v4.

| Concern | Decisión |
|---------|----------|
| Tema | Dark-only. Sin tema claro ni selector. |
| Fondo de página | `#09090b` (`bg-brand-ink`), también en `html` y `body`. |
| Superficie del escenario/diálogo | `#18181b` (`bg-brand-surface`). |
| Texto primario | `#fafafa` (`text-brand-text` / `text-white` sobre póster). |
| Texto secundario sobre póster | `#e4e4e7` (zinc-200) para handles y metadatos; nunca menos de 4.5:1 sobre el scrim. |
| Texto atenuado en superficie sólida | `#a1a1aa` (`text-brand-muted`) para el cuerpo del panel final y del diálogo. |
| Acento | `#a78bfa` → `#e879f9` (`brand-violet` → `brand-fuchsia`) para foco, badge y estados activos. |
| CTA | Gradiente `#7c3aed` → `#c026d3` (`from-brand-violet-deep to-brand-fuchsia-deep`), texto blanco. |
| Marca | Icono de play/clapper SVG inline con gradiente profundo y wordmark `AI Shorts` en mayúsculas. |
| Tipografía | Solo stack sans-serif del sistema (`font-sans`). Sin fuentes externas ni `@nuxt/fonts` en uso. |
| Iconografía | SVG inline locales; sin `@nuxt/icon`, Iconify, CDN ni librería de iconos. |
| Wordmark | `text-[13px] sm:text-sm font-semibold uppercase tracking-[0.18em] text-brand-text`. |
| Badge DEMO | Pill `rounded-full border border-brand-fuchsia/40 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-fuchsia`. Sin blur. |
| CTA | `min-h-11 rounded-full px-3.5 sm:px-4 text-sm font-semibold text-white shadow-lg shadow-brand-fuchsia/20 whitespace-nowrap`. |
| Título del short | `text-xl sm:text-2xl md:text-3xl font-semibold leading-[1.1] tracking-tight text-white`, limitado visualmente a 2 líneas con `line-clamp-2`. |
| Creador | Nombre `text-sm font-semibold text-white`; handle `text-xs text-zinc-200`. Dos líneas. |
| Etiquetas | Chips `rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white/90`. Lista no interactiva. |
| Duración | Pill `rounded-full bg-black/[0.55] px-2.5 py-1 text-[11px] font-medium tabular-nums text-white`, arriba a la derecha, bajo la cabecera. |
| Action rail | Columna derecha, tres botones circulares de 44 × 44 px (`size-11`), icono 20 px, contador `text-[11px]` debajo para like/save. Fondo `bg-black/[0.45]`, borde `border-white/20`, sin blur. |
| Estado like activo | Icono relleno y color `text-brand-fuchsia`. |
| Estado save activo | Icono relleno y color `text-brand-violet`. |
| Scrim superior | Altura 32 %; `linear-gradient(180deg, rgba(9,9,11,0.88) 0%, rgba(9,9,11,0.45) 55%, rgba(9,9,11,0) 100%)`. |
| Scrim inferior | Altura 68 %; `linear-gradient(0deg, rgba(9,9,11,0.96) 0%, rgba(9,9,11,0.72) 38%, rgba(9,9,11,0.28) 70%, rgba(9,9,11,0) 100%)`. |
| Cabecera | Overlay absoluto, z-40, `pointer-events-none` en el contenedor y `pointer-events-auto` en los controles. Fondo transparente sobre el scrim; sin `backdrop-blur`. |
| Layout móvil | Full-bleed: artículo `h-svh`, póster a sangre, sin radios ni borde. Padding lateral 16 px. |
| Layout desktop | Desde `md`: sección de 100svh con escenario centrado 9:16, altura `calc(100svh - 3rem)` y `max-height: 56rem`, borde `border-white/10`, radio 28 px, sombra sutil. |
| Contenedor de scroll | `main` con `h-svh`, `overflow-y-auto`, `overflow-x-hidden`, `snap-y snap-mandatory`, `overscroll-behavior-y: contain`, `tabindex="0"` y anillo de foco inset visible. |
| Snap | Cada artículo y el panel final: `scroll-snap-align: start`, `scroll-snap-stop: always`. Sin JS de scroll. |
| Espaciado | Base 4 px. Cabecera `px-4 sm:px-6`; contenido inferior `px-4 sm:px-6`, `pr-20 sm:pr-24` para dejar sitio a la rail; rail `right-3 sm:right-5`; huecos 8/12/16/24 px. |
| Radios | Botones y chips: full. Escenario desktop: 28 px. Diálogo: 24 px (24 px arriba en móvil). |
| Diálogo | Overlay `rgba(9,9,11,0.72)`, z-50; panel `max-w-md`, `bg-brand-surface`, borde `border-white/10`, padding 24 px, bottom-sheet en móvil (`items-end`) y centrado desde `sm`. |
| Cerrar | Botón visible de ancho completo, `min-h-11`, borde `border-white/[0.15]`, fondo `bg-white/5`, texto `Cerrar`. |
| Toast de estado | Pill centrada bajo la cabecera, `z-[45]`, `bg-black/[0.75]`, borde `border-white/10`, texto blanco, `pointer-events-none`, sin blur. |
| Fin del feed | Sección/footer dentro del `main`, 100svh, fondo `brand-ink`, contenido centrado, título y cuerpo normativos; sin botones ni enlaces. |
| Foco | Anillo de 2 px `brand-fuchsia` con offset de 2 px sobre `brand-ink`; en forced-colors, color de sistema. |
| Objetivos táctiles | Mínimo 44 × 44 px CSS para CTA, like, save, share y cerrar. |
| Motion | Solo color/opacidad/transform de presión a 150 ms `ease-out`, bajo `motion-safe:`. Entrada del diálogo 180 ms solo con movimiento permitido. Sin animaciones de póster, autoplay, parallax ni smooth scroll. |
| Overflow | La página raíz no scrollea; `main` scrollea verticalmente. Nunca hay scroll horizontal. |
| z-index | Póster 0, scrims 10, contenido 20, rail 30, cabecera 40, toast 45, diálogo 50. |
| Responsive | Base 320 px; `sm` 640; `md` 768 (escenario); `lg` 1024; hasta 1920 px. |
| Pósters | SVG locales, sin texto incrustado, sin scripts, sin referencias externas, sin fuentes ni imágenes raster. Tamaño recomendado ≤ 50 KB por archivo. |

Los valores son normativos. Si un nombre de utilidad de Tailwind difiere, el color, espaciado, contraste y comportamiento renderizados deben coincidir con la tabla.

### Stable data-testid Hooks

Estos hooks son estables y pueden permanecer en producción. Los hooks repetidos se consultan dentro de cada `short-card` mediante `[data-short-id]`.

| `data-testid` | Elemento / uso |
|---------------|----------------|
| `feed-page` | Raíz de la página `/feed`. |
| `feed-header` | `header` overlay. |
| `brand-mark` | Marca `AI Shorts` con icono inline. |
| `demo-badge` | Badge visible `DEMO` con explicación accesible. |
| `feed-cta` | Botón `Crear short`. |
| `shorts-feed` | `main` que actúa como contenedor de scroll. |
| `short-card` | Cada `<article>`; incluye `data-short-id` y el estado activo. |
| `short-poster` | `<img>` del póster local. |
| `short-scrim-top` | Scrim superior decorativo. |
| `short-scrim-bottom` | Scrim inferior decorativo. |
| `short-creator` | Nombre y handle del creador. |
| `short-title` | `h2` del short. |
| `short-tags` | Lista de etiquetas. |
| `short-duration` | Badge de duración. |
| `short-action-rail` | Contenedor de las tres acciones. |
| `short-like` / `short-like-count` | Toggle de like y contador visible. |
| `short-save` / `short-save-count` | Toggle de save y contador visible. |
| `short-share` | Botón de compartir. |
| `share-status` | Región `role="status"` del resultado de compartir. |
| `feed-end` | Panel final del feed. |
| `feed-end-heading` | Título `Fin del feed de prueba`. |
| `nojs-notice` | Aviso visible dentro de `<noscript>`. |
| `create-short-notice` | Panel del diálogo. |
| `notice-overlay` | Backdrop del diálogo. |
| `notice-heading` / `notice-body` / `notice-close` | Título, cuerpo y botón `Cerrar`. |

El artículo activo se identifica además con `data-active="true"` y `aria-current="true"`; no se crea un testid distinto para el estado activo.

### Proposed Component & File Structure

La estructura es normativa; los nombres de archivo son parte del contrato de modularidad. Los componentes pueden importarse explícitamente o mediante auto-imports de Nuxt con sus prefijos de carpeta.

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/pages/feed.vue` | Ruta `/feed`, metadata, composición de cabecera, feed, aviso y toast. |
| `app/components/ui/BrandMark.vue` | Wordmark `AI Shorts` + icono SVG inline; tamaño compacto. |
| `app/components/ui/ActionIconButton.vue` | Botón de icono reutilizable, 44 × 44 px, etiqueta accesible, `aria-pressed` opcional y contador descrito. |
| `app/components/ui/ModalDialog.vue` | Primitiva de diálogo modal: overlay, foco, Escape, backdrop, `inert`, restauración de foco. |
| `app/components/shorts/FeedHeader.vue` | Overlay con marca, badge DEMO y CTA; emite la apertura del aviso. |
| `app/components/shorts/ShortsFeed.vue` | Contenedor scroll-snap, render de los seis shorts + fin, observación del activo. |
| `app/components/shorts/ShortCard.vue` | `<article>` con póster, scrims, metadatos y action rail; nombre accesible. |
| `app/components/shorts/ShortPoster.vue` | `<img>` local, prioridad/lazy, dimensiones, scrims y badge de duración. |
| `app/components/shorts/ShortActionRail.vue` | Like, save y share; estado `aria-pressed` y contadores. |
| `app/components/shorts/FeedEnd.vue` | Estado final honesto, sin acciones. |
| `app/components/shorts/CreateShortNotice.vue` | Contenido del aviso `Próximamente` y botón `Cerrar`, sobre `ModalDialog`. |
| `app/composables/useShortsFeed.ts` | Estado reactivo de like/save por short, inicializado desde el fixture; toggles puros en memoria. |
| `app/composables/useActiveShort.ts` | `IntersectionObserver`, selección del activo, fallback y limpieza. |
| `app/composables/useShareShort.ts` | Web Share, clipboard, `AbortError`, estado y temporizador del toast. |
| `app/utils/shorts.ts` | Helpers puros: `formatDuration`, `formatCount`, `buildSharePayload`, mapeo de resultado a mensaje. |
| `app/types/short.ts` | `Short`, `ShortId`, `ShortCreator`, `ShortStats`, `ShortPoster`, `ShortMedia`, `ShortInitialState`, `ShortInteractionState`, `ShareOutcome`. Sin tests por ser interfaces planas. |
| `app/data/shorts.ts` | Fixture inmutable de los seis shorts, orden fijo, sin aleatoriedad. |
| `public/mock/shorts/short-001.svg` … `short-006.svg` | Pósters locales 1080 × 1920. |

No se crean `server/`, layouts, plugins, middlewares, stores ni dependencias nuevas.

### Testing Strategy

La validación sigue la Constitución v1.0.1. Cada archivo de código nuevo, excepto `app/types/short.ts` (interfaces planas), debe tener cobertura automatizada directa o mediante integración. Los seis SVG de `public/mock/shorts/` se validan con una comprobación de existencia y contenido local, además de revisión visual. Los tests existentes de la landing no se editan.

| Test | Cobertura mínima |
|------|------------------|
| `tests/unit/feed-page.spec.ts` | Render de `/feed`, un H1, `header`/`main`, seis tarjetas, fin del feed, ausencia de `video`/`audio`/`iframe`, testids y ausencia de enlaces externos. |
| `tests/unit/feed-header.spec.ts` | Marca, badge DEMO y explicación accesible, CTA exacto, `type="button"`, emisión de apertura, sin enlaces. |
| `tests/unit/short-card.spec.ts` | Anatomía, nombre accesible del artículo, título `h2`, creador/handle, dos etiquetas, duración accesible, alt y prioridad de póster. |
| `tests/unit/short-action-rail.spec.ts` | Etiquetas exactas, `aria-pressed` inicial y alternado, independencia entre shorts, contadores estáticos, integración con share. |
| `tests/unit/create-short-notice.spec.ts` | Apertura con un clic, `role="dialog"`, `aria-modal`, labelledby/describedby, foco inicial, Tab atrapado, Escape, backdrop, `Cerrar`, restauración de foco y bloqueo de scroll. |
| `tests/unit/shorts-feed.spec.ts` | Seis artículos + fin, scroll-snap presente, primer activo, exactamente un activo con `IntersectionObserver` mockeado, fallback sin observer y `disconnect()` al desmontar. |
| `tests/unit/ui-primitives.spec.ts` | `BrandMark`, `ActionIconButton` y `ModalDialog` de forma aislada: props, slots, etiquetas, foco y eventos. |
| `tests/unit/shorts-state.spec.ts` | `useShortsFeed` (inicialización, toggles, no persistencia), `useActiveShort` (umbral, empate, limpieza) y `useShareShort` (share, clipboard, AbortError, error, temporizador). |
| `tests/unit/shorts-data.spec.ts` | Fixture de seis, ids únicos, orden, fechas ISO fijas, rutas locales, dimensiones, etiquetas, contadores, estados iniciales, existencia/contenido de los seis SVG y helpers puros. |
| `tests/acceptance/feed-route.spec.ts` | SSR de `/feed`: HTTP 200, `lang="es"`, title, description, robots, un H1, seis títulos/creadores, CTA, DEMO, pósters locales, prioridades de carga, fin del feed, ausencia de video y de hosts externos. |

**Reglas de test**:

- Usar `@nuxt/test-utils` y `mountSuspended` como en la landing.
- Mockear `IntersectionObserver`, `navigator.share`, `navigator.clipboard` y temporizadores donde aplique.
- El test SSR usa `@nuxt/test-utils/e2e` y `setup({ server: true })`.
- No se añade Playwright ni ninguna dependencia nueva.
- `happy-dom` no valida CSS scroll-snap, layout, safe areas, contraste real ni rendimiento. Esos puntos se validan manualmente.

**Comprobaciones manuales obligatorias**:

1. Snap vertical de una vista por short en Chrome Android, Safari iOS, Chrome desktop y Firefox desktop.
2. Anchos 320, 360, 390, 768, 1024, 1440 y 1920 px; sin scroll horizontal ni recortes.
3. Zoom 200 % y 400 % sobre 1280 px; reflow sin pérdida de contenido.
4. Safe areas en un iPhone con notch/home indicator y en Android con gestos.
5. Objetivos táctiles de al menos 44 × 44 px, medidos en DevTools.
6. Teclado: Tab, Shift+Tab, PageDown, flechas, Enter/Espacio, Escape y restauración de foco.
7. VoiceOver o TalkBack: landmarks, H1, artículos, estados `aria-pressed`, diálogo y toast.
8. `prefers-reduced-motion: reduce`: sin animaciones ni transiciones no esenciales.
9. Forced-colors: foco y controles visibles.
10. Compartir en las cuatro rutas: share OK, cancelación, clipboard OK y fallo total.
11. DevTools Network: cero peticiones a orígenes externos; primera imagen eager/high, resto lazy.
12. Lighthouse mobile: LCP, CLS, INP y accesibilidad según los objetivos.

### Out of Scope

- Generación real de shorts con IA, prompts, modelos, inferencia o renderizado.
- Backend, base de datos, ORM, almacenamiento, caché o persistencia.
- Autenticación, cuentas, sesiones, perfiles, follows o mensajería.
- Subida, grabación, edición, reproducción o publicación de video real.
- Comentarios, respuestas, reacciones adicionales, regalos o moderación.
- Scroll infinito, paginación, `load more`, skeletons o datos remotos.
- Navegación inferior, pestañas, menús, búsqueda, explorar, notificaciones o ajustes.
- Pagos, suscripciones, checkout o pricing.
- Analítica, tracking, cookies, A/B testing o píxeles.
- i18n, selector de idioma o copy en otros idiomas.
- PWA: manifest, service worker, offline behavior o instalación.
- Migración a Tailwind v4, plugins nuevos, tokens nuevos o cambios en `tailwind.config.ts`.
- Storybook, Playwright, tests E2E de navegador o nuevas dependencias.
- Deep links por short, historial por short, URLs compartibles de un short concreto o restauración de scroll.
- Cambios en `/`, en la landing, en `app/app.vue`, en `specs/001-brand-construction-landing/` o en sus tests.
- Promover el feed a `/`. Es una decisión futura y separada.

### Key Entities

- **Short**: unidad de contenido ficticia. Contiene id, título, creador, media de tipo póster, duración, etiquetas, estadísticas, fecha fija y estado inicial.
- **ShortCreator**: nombre y handle ficticios; no representa una cuenta real ni tiene perfil navegable.
- **ShortStats**: contadores estáticos de likes y guardados; solo se muestran, no se mutan.
- **ShortPoster**: recurso SVG local 9:16 con ruta, alt y dimensiones intrínsecas.
- **ShortMedia**: contenedor de media; en esta iteración solo admite `type: 'poster'` para impedir video.
- **ShortInitialState**: valores booleanos de like/save que definen el estado SSR y el estado tras recargar.
- **ShortInteractionState** (estado de UI, no persistido): copia mutable en memoria por short.
- **ShareOutcome**: resultado de compartir (`shared`, `copied`, `unavailable`, `cancelled`) que se mapea a copy normativo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Feed completo)**: `/feed` responde HTTP 200 y renderiza exactamente 6 shorts y el panel `Fin del feed de prueba`; cada short muestra póster, creador, título, dos etiquetas, duración y tres acciones.
- **SC-002 (Navegación)**: En Chrome Android, Safari iOS, Chrome desktop y Firefox desktop, el scroll-snap muestra un short por vista en alturas estándar; no hay scroll horizontal en ninguno de los anchos 320, 360, 390, 768, 1024, 1440 y 1920 px.
- **SC-003 (Honestidad)**: Una auditoría manual encuentra cero `<video>`, cero autoplay, cero formularios de creación, cero llamadas a API, cero métricas inventadas fuera del fixture y cero enlaces o botones muertos en el modo soportado. El CTA abre el aviso `Próximamente` y el badge DEMO explica los datos ficticios.
- **SC-004 (Accesibilidad)**: Lighthouse Accessibility = 100; cero violaciones axe críticas o serias; un H1; `lang="es"`; landmarks correctos; contraste normal ≥ 4.5:1, grande/UI ≥ 3:1; foco visible en todos los controles; diálogo con foco atrapado y restaurado.
- **SC-005 (Interacciones)**: Like y save alternan `aria-pressed` en 1 clic, son independientes y vuelven al fixture tras recargar. Los contadores no cambian. Share cubre éxito, clipboard, cancelación y error con los mensajes exactos.
- **SC-006 (Responsive)**: Cero scroll horizontal y cero contenido recortado en 320–1920 px, al 200 % y 400 % de zoom, y con safe areas activas. El escenario desktop no supera 56 rem de alto.
- **SC-007 (Performance)**: En Lighthouse mobile (clase Moto G Power), LCP ≤ 2.0 s, CLS < 0.1 e INP < 200 ms. La primera imagen es eager/high priority; las otras cinco son lazy; no hay blur pesado en la ruta crítica.
- **SC-008 (Sin red externa)**: Cargar `/feed` produce cero peticiones a orígenes externos y cero errores de consola en build de producción.
- **SC-009 (Determinismo)**: Dos respuestas SSR consecutivas contienen los mismos ids, títulos, creadores, pósters, fechas, contadores y estados iniciales; no se usa `Math.random` ni la fecha actual para renderizar.
- **SC-010 (Calidad)**: `npm run test:run`, `npm run build` y `npm run generate` terminan correctamente; todos los archivos de código nuevos tienen cobertura; los seis SVG se validan por existencia/contenido; los tests de la landing siguen pasando sin modificaciones.
- **SC-011 (Presupuesto de clics)**: Explorar requiere 0 clics; like/save/share requieren 1; abrir el aviso requiere 1; abrir y cerrar requiere 2. Ningún recorrido supera 3 clics.
- **SC-012 (Sin JavaScript)**: El HTML entregado contiene los seis shorts, el fin del feed, el CTA, el badge DEMO y el aviso `noscript`; no se simula ninguna interacción.

## Constitution Check

Confirmación explícita contra `.specify/memory/constitution.md` v1.0.1:

- **I. Simplicity First (1-to-3-Clicks UX)**: el feed se explora con 0 clics; cada acción cuesta 1 clic; abrir y cerrar el aviso cuesta 2; ningún recorrido supera 3. No hay configuración ni flujos paralelos.
- **II. Spec-Driven Development**: esta especificación es la Phase 1. No se escribe implementación, `plan.md` ni `tasks.md` hasta la revisión humana y la fase correspondiente.
- **III. Server-Side Security for AI & Secrets**: no hay IA, secretos, API keys, `server/api/`, variables de entorno ni llamadas de red. No se requiere backend.
- **IV. Modular Component Architecture & Reusability**: primitivas en `app/components/ui/`, dominio en `app/components/shorts/`, lógica en `app/composables/`, tipos en `app/types/`, helpers puros en `app/utils/` y fixture en `app/data/`.
- **V. Test-First & Quality Gates**: se especifican tests unitarios/componentes para cada archivo de código nuevo y un test de aceptación SSR para `/feed`; los SVG se validan por existencia/contenido; la landing y sus tests permanecen intactos.
- **Tailwind 3.4.x**: se usa exclusivamente sintaxis v3 y los tokens existentes; no se usa Tailwind v4 ni se modifica la configuración.
- **Nuxt 4**: ruta por archivos en `app/pages/feed.vue`, `useHead`/`useSeoMeta`, auto-imports estándar, sin plugins ni capas adicionales.
- **Sin cambios colaterales**: `/`, la landing, `specs/001-brand-construction-landing/`, `app/app.vue`, `tailwind.config.ts`, `package.json` y los tests existentes no se modifican.

## Assumptions

- El producto sigue siendo **AI Shorts**, en español (`es-ES`), con estética dark premium y acento violeta-fucsia.
- La demo se sirve en `/feed`, sin `baseURL` ni subpath, y se despliega con SSR o `nuxt generate`.
- Los seis creadores, handles, títulos, métricas, fechas y pósters son ficticios y se han definido para esta demo; no requieren licencias externas.
- Los pósters se crean como SVG locales; no se usan fotografías, bancos de imágenes, fuentes ni iconos remotos.
- El estado de like/save es efímero por diseño. No se espera persistencia ni sincronización.
- Web Share y Clipboard tienen soporte variable; el comportamiento degradado se comunica con los mensajes normativos.
- La demo soporta navegadores evergreen modernos (últimas dos versiones de Chrome, Edge, Firefox y Safari). No se garantiza paridad pixel-perfect en navegadores antiguos.
- JavaScript es necesario para las interacciones. El SSR y el aviso `noscript` cubren la lectura sin JS, no la interactividad.
- `100svh` se usa para un layout estable en móvil; el chrome dinámico del navegador puede dejar visible el fondo `brand-ink`, que forma parte del diseño.
- Los tests se ejecutan con Vitest, `@nuxt/test-utils` y `happy-dom`; las limitaciones de layout de `happy-dom` se cubren con comprobaciones manuales.
- No se añaden dependencias, rutas de servidor, secretos, cookies, almacenamiento, analítica ni cambios de PWA.
- La promoción del feed a `/` y la sustitución de la landing quedan fuera de alcance y requieren una especificación futura.
- El nombre `Crear short` se mantiene exacto aunque la función no esté disponible; la honestidad se garantiza con el aviso `Próximamente` y la explicación del diálogo.
