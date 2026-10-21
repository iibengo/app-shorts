# AGENTS.md — Contexto canónico para agentes

Este archivo es el punto de entrada para cualquier agente que trabaje en AI Shorts. La constitución sigue siendo la autoridad máxima; este documento explica cómo aplicarla al código real.

## Orden de lectura

1. `.specify/memory/constitution.md`
2. `AGENTS.md` (este archivo)
3. La spec relevante en `specs/NNN-feature-name/spec.md`
4. El código y los tests que se van a tocar

Para una feature nueva: `/io-plan` → `/io-spec` → aprobación humana → implementación → reviewer → revisión humana → tests.

## Project skills

Los skills de proyecto viven en `.opencode/skills/<skill-id>/SKILL.md` y se cargan bajo demanda. Están versionados en el repositorio y no sustituyen a `AGENTS.md` ni a las specs.

| Skill | Cuándo cargarlo |
|---|---|
| `sdd-spec-guardrails` | Antes de `/io-spec`, `/io-modify` o un cambio de contrato. |
| `fal-deepseek-pipeline` | Trabajo con Fal, DeepSeek, jobs, uploads, polling o coste. |
| `prisma-leases` | Prisma, Story/Scene, transacciones, leases o reconciliador. |
| `ffmpeg-media` | Descarga, normalización, concatenación, ffprobe o subida final. |
| `story-test-harness` | Tests de Story, rutas, stubs, DB/FFmpeg smokes o regresión 004. |

Los skills de `.cursor/skills` son de Cursor y no se descubren desde OpenCode. Cárgalos con `@skill-id` o deja que el agente use la herramienta `skill`.

## No negociables

- **SDD con checkpoints:** no se escribe código sin spec aprobada; no se pasa al tester sin aprobar la implementación.
- **1 a 3 clics:** el camino por defecto no obliga a configurar modelo, duración ni parámetros. Lo avanzado es opcional y colapsable.
- **Secretos solo en servidor:** `NUXT_FAL_KEY` vive en `runtimeConfig.falKey`; nunca en `app/`, HTML, logs, respuestas o tokens.
- **Proveedor solo desde servidor:** las rutas y servicios hablan con Fal; el cliente solo hace el `PUT` firmado de subida.
- **Tipado estricto:** contratos compartidos en `app/models/`; DTOs de proveedor solo en `server/`; sin `any`; `readonly`; uniones discriminadas.
- **Sin dependencias nuevas** sin aprobación explícita.
- **Sin llamadas reales a proveedores** en CI. Smoke real opt-in y con presupuesto.
- **Sin estados falsos:** nada de porcentajes inventados, previews simuladas ni éxito ficticio.

## Stack y despliegue

- Nuxt 4, Vue 3, Tailwind CSS 3.4.x.
- Node.js 22 LTS + Nitro. Producción: `npm run build` y `.output/server/index.mjs`.
- `nuxt generate` solo para páginas estáticas; no sirve para `/api/**`, jobs, uploads firmados ni Composer real.
- PWA sin caché de `/api/**` ni hosts de Fal.

## Mapa del proyecto

```text
app/
  components/ui/          primitivas atómicas
  components/composer/    dominio Composer
  components/shorts/      dominio feed
  composables/            estado/orquestación de cliente
  models/                 contratos compartidos
  data/                   presets, defaults y datos estáticos
  utils/                  helpers puros
  pages/                  rutas
server/
  api/composer/           handlers finos del Composer
  fal/                    transporte Fal compartido: HTTP, queue, storage, tipos y adaptadores
  shared/                 errores, rate limit, job token, request context y validación compartidos
  db/                     Prisma singleton lazy (solo Story)
  composer/               dominio Composer: registry, prompts, orquestador y fachada
prisma/
  schema.prisma           Story/Scene + enums + leases
tests/
  unit/                   lógica y componentes
  acceptance/             SSR, rutas, regresiones
  fixtures/fal/           contratos de proveedor sin secretos
  helpers/                stubs HTTP/H3
specs/                    specs 001–004
```

## Estado actual (2026-10-21)

- **Spec 004 — Composer real:** implementada.
- **Fase 0 de Spec 005:** extracción compartida completada.
  - `server/fal/`: HTTP client, queue, storage, tipos y adaptadores.
  - `server/shared/`: errores, rate limit, job token, request context y validación.
  - `server/composer/` conserva el dominio y mantiene shims de compatibilidad para no romper imports/tests de 004.
- **Spec 005 — Story Composer:** implementada en `specs/005-story-composer/spec.md`; `/story`, `/story/[id]`, `server/story/`, reconciliador con leases y FFmpeg.
- **Prisma/PostgreSQL:** Prisma 7 + `@prisma/adapter-pg`; migración `20261021001927_init` aplicada; Docker local; `db:generate` es obligatorio antes de build/test cuando Story importe Prisma.
- **Tests:** 1505 passed / 7 skipped opt-in, 96 archivos; los 613 tests de 004 siguen intactos.
- **Build:** `npm run build` correcto.
- **Smoke real Fal:** opt-in (`RUN_FAL_SMOKE=1`), no ejecutado en CI.
- **Spec 003:** histórica; sustituida por 004 para el Composer. No reutilizar su mock.
- **Pendiente:** QA manual de accesibilidad/navegador y validación de CORS/lifecycle/cancelación en el entorno real.
- **Deuda conocida:** `tests/unit/composer-guards.spec.ts` todavía inspecciona las rutas antiguas de `server/composer/` (shims). En Spec 005 hay que ampliar las guardas a `server/fal/**` y `server/shared/**`.
- **Deuda de extracción:** `server/shared/job-token.ts` y `server/shared/validation.ts` todavía contienen piezas específicas del payload/validación de Composer. Antes de reutilizarlos en Story, separar las primitivas genéricas (HMAC, JSON body, idempotency key) de los validadores de dominio.

## Patrones reutilizables de 004

### 1. Capas server-side

```text
server/api/...        ruta fina: validar, autorizar, delegar, serializar
server/<domain>/      fachada de caso de uso
  ├─ orchestrator     coordina pasos del proveedor
  ├─ adapters/*       input/output por modelo; sin env ni HTTP directo
  ├─ queue/storage    transporte del proveedor
  ├─ model-registry   allowlist, presets, capacidades y defaults
  ├─ job-token        HMAC, TTL, verificación
  ├─ rate-limit       ventanas, concurrencia, presupuesto, idempotencia
  ├─ validation       type guards y límites
  └─ errors           taxonomía estable + mensajes en español
```

Regla: la ruta no conoce detalles de Fal; el adaptador no conoce `useRuntimeConfig`; el cliente HTTP es el único que conoce `fetch`, auth y allowlists.

### 2. Job asíncrono

1. La ruta valida y llama al servicio.
2. El servicio crea el job y devuelve un token opaco firmado.
3. El cliente hace polling con `setTimeout` encadenado, backoff y `pollAfterMs`.
4. La ruta de estado verifica el token y consulta `status_url`.
5. La ruta de cancelación verifica el token y usa `cancel_url`.
6. Estados terminales: `succeeded`, `failed`, `cancelled`; el job se libera.
7. Si el vídeo falla tras el keyframe, se devuelve `failed` con `posterUrl` para éxito parcial.

No mantener una petición HTTP abierta durante minutos. No reconstruir URLs de Fal: usar `status_url`, `response_url` y `cancel_url` del submit.

### 3. Upload firmado

1. El servidor valida metadata (MIME, tamaño, nombre) y llama al `initiate` de Fal con la key.
2. El lifecycle (por ejemplo 1 h) se configura en el `initiate`, no en el `PUT`.
3. El ticket devuelve `uploadUrl`, `fileUrl`, `expiresAt` y solo las cabeceras necesarias del `PUT`.
4. El navegador hace `PUT` directo sin `Authorization`, cookies ni `FormData`.
5. El servidor valida que `fileUrl` pertenezca a la allowlist de CDN.
6. El binario nunca pasa por Nitro.

### 4. Keyframe-first para vertical 9:16

- Generar un keyframe 9:16 con FLUX (sin referencia) o FLUX Kontext (una referencia).
- Usar dimensiones válidas: 1152×2048 (múltiplo de 16, área permitida).
- Enviar el keyframe como `image_url` al modelo de vídeo; Kling/MiniMax heredan el aspect ratio.
- Conservar el keyframe como póster y como resultado parcial.
- Reutilizar el keyframe al reintentar el vídeo si el prompt no cambió.

### 5. Seguridad y coste

- Allowlist de modelos/endpoints y hosts de CDN.
- Rate limit por sesión/IP, concurrencia, presupuesto diario e idempotencia.
- Cookie de sesión anónima HttpOnly solo para anti-abuso.
- Token HMAC con TTL, sin prompt completo ni secretos.
- Logs con `promptHash`, `modelId`, `stage`, latencia y error code; nunca key, prompt, archivos, URLs firmadas ni IP en claro.
- Errores de proveedor mapeados a códigos estables; nunca mensajes crudos de Fal.
- Lifecycle explícito para referencias y medios generados.

### 6. UI de generación real

- Progreso por etapas reales, sin porcentajes.
- `role="status"` para etapas, `role="alert"` para errores.
- `<video controls playsinline preload="metadata" poster>` sin autoplay/loop.
- `Reintentar` solo si el error es reintentable; `Editar idea` siempre disponible.
- Cancelación best-effort; conservar borrador.
- Pausar polling con pestaña oculta/offline y reanudar al volver.
- Resultado terminal: sin publicar, descargar, compartir ni persistir.

### 7. Testing

- Stubs HTTP locales y fixtures; nunca proveedor real en CI.
- Tests de contrato para input/output de cada adaptador.
- Tests de rutas para 400/401/403/404/409/410/413/415/422/429/502/503/504.
- Tests de token, rate limit, idempotencia y ausencia de fugas.
- Tests de polling con timers falsos: backoff, 429, 404/410, 5xx, cancelación, retry, unmount.
- Tests de componentes para copy, foco, ARIA y estados.
- `npm run test:run` + `npm run build` como gate final.

## Preparación de Spec 005 — micro-relatos

No escribir la spec todavía. Antes de `/io-spec`, resolver estas decisiones:

### Producto
- ¿Qué es un “micro-relato”? ¿3–6 escenas? ¿Duración objetivo? ¿Voz en off, texto en pantalla, música o solo vídeo?
- ¿El usuario escribe una idea y el sistema genera un guion/beats, o el usuario edita beats?
- ¿El resultado es un solo vídeo concatenado o una secuencia de clips?
- ¿Cuál es el camino de 1–3 clics y qué queda en ajustes avanzados?
- ¿Se publica en el feed o sigue siendo terminal?
- ¿Se persiste el proyecto o cada sesión es efímera?

### Arquitectura candidata a evaluar
- Crear `server/story/` y reutilizar directamente `server/fal/` (`FalHttpClient`, `FalQueueService`, `FalStorageService`) y `server/shared/` (`JobTokenService`, `RateLimiter`, `ComposerError`, `request-context`, `validation`). No importar los shims de `server/composer/` desde código nuevo: los shims existen solo para compatibilidad de 004.
- Un `StoryOrchestrator` que componga beats y use el mismo patrón de job asíncrono.
- Un `StoryPlan`/`StoryBeat`/`StoryGenerationJob` en `app/models/`, con uniones discriminadas y sin `File`/`Blob`.
- Si hay varios clips: decidir concatenación server-side, proveedor de edición o reproducción secuencial en cliente. No asumir que Fal devuelve un único vídeo.
- Si hay voz/audio: spec separada o fase posterior; no mezclar con el MVP de micro-relatos.
- Reutilizar el keyframe-first para cada beat vertical; evaluar consistencia de personaje/estilo entre beats.
- Reutilizar upload firmado si hay referencias; decidir límite (1 imagen, multi-referencia, video-referencia) antes de tocar UI.

### Riesgos específicos
- Coste multiplicado por número de beats; presupuesto por job y por historia.
- Latencia acumulada; progreso por beat y cancelación del job completo.
- Consistencia visual entre beats; seeds, referencias y prompts.
- Concatenación/transiciones y duración final.
- Audio, subtítulos y derechos.
- Persistencia si hay edición de beats; no añadir DB sin spec.
- Moderación de contenido en cada beat.

### Entregable de `/io-plan` para 005
- 2–3 alternativas (un solo prompt vs beats; un solo modelo vs pipeline; cliente vs server concatenation).
- Matriz de coste/latencia.
- Decisión de alcance MVP y fuera de alcance.
- Plan de reutilización explícito de los patrones de 004.
- Preguntas que deben cerrarse antes de `/io-spec`.

## Comandos

- `/io-plan` — investigación y alternativas antes de la spec.
- `/io-spec` — flujo completo con checkpoints y reviewer.
- `/io-review` — revisión read-only de spec drift, seguridad y regresiones.
- `/io-modify` — modificar una spec existente con tabla de enmienda.
- `npm run test:run` — suite completa.
- `npm run build` — build Node/Nitro.

## Registro de cambios

- **2026-10-21:** contexto canónico creado tras 004. Se documentan patrones de Fal, subida firmada, job token, keyframe-first, rate limit y testing; se prepara la agenda de Spec 005.
