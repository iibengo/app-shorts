# AI Shorts Wrapper

Aplicación Nuxt 4 para crear y explorar shorts verticales 9:16. Incluye landing, feed de demostración y un Composer con generación real de vídeo mediante Fal.ai (FLUX + MiniMax/Kling).

## Stack

- Nuxt 4 / Vue 3 (`<script setup lang="ts">`)
- Tailwind CSS 3.4.x (sintaxis v3)
- Node.js 22 LTS + Nitro
- Vitest + `@nuxt/test-utils` + happy-dom
- Fal.ai: Queue API, Storage signed uploads, FLUX, MiniMax Hailuo 02 y Kling 2.5 Turbo Pro

## Requisitos

- Node.js 22 LTS
- Una cuenta de Fal.ai con créditos y permisos para Queue, Storage y los modelos configurados
- `NUXT_FAL_KEY` y `NUXT_COMPOSER_JOB_SECRET` (mínimo 32 caracteres)

## Puesta en marcha

```bash
npm ci
cp .env.example .env
# Rellena NUXT_FAL_KEY, NUXT_COMPOSER_JOB_SECRET y NUXT_DEEPSEEK_KEY en .env
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev
```

La app queda en `http://localhost:3000`. `db:migrate` solo es necesario cuando exista la feature Story; el Composer de 004 no usa PostgreSQL.

### Variables de entorno

Las variables están documentadas en `.env.example`. Las principales:

- `NUXT_FAL_KEY`: clave privada de Fal. Solo se usa en servidor.
- `NUXT_COMPOSER_JOB_SECRET`: secreto HMAC para los tokens de job.
- `NUXT_COMPOSER_*`: rate limit, concurrencia, presupuesto, TTL y timeout del keyframe.

No uses variables `NUXT_PUBLIC_*` para secretos. `.env` está ignorado por git.

## Scripts

```bash
npm run dev       # desarrollo
npm run test:run  # suite completa
npm run build     # build de producción Node/Nitro
npm run preview   # previsualización del build
```

`npm run generate` solo es válido para contenido estático. **No sirve para el Composer real ni para las rutas `/api/composer/**`**, porque necesitan un servidor Nitro en ejecución.

## Despliegue

```bash
npm run build
node .output/server/index.mjs
```

Checklist mínima:

- Runtime Node.js 22 LTS.
- Secretos configurados en el entorno (nunca en el repositorio).
- Proxy inverso con timeout suficiente para `/api/composer/generate` (keyframe síncrono, hasta 45 s).
- PWA sin caché de `/api/**` ni de hosts de Fal.
- TLS obligatorio y cookie `Secure` en producción.
- Rate limit y presupuesto revisados antes de abrir al público.

## Rutas principales

- `/` — landing.
- `/feed` — feed de demostración.
- `/composer` — estudio de creación con IA real.
- `POST /api/composer/uploads` — ticket de subida firmado.
- `POST /api/composer/generate` — keyframe + submit a la cola.
- `GET /api/composer/jobs/:id` — polling del job.
- `POST /api/composer/jobs/:id/cancel` — cancelación.

## Arquitectura

```text
app/
  components/ui/          primitivas reutilizables
  components/composer/    UI del Composer
  components/shorts/      UI del feed
  composables/            estado y orquestación de cliente
  models/                 contratos compartidos estrictos
  data/                   presets, defaults y fixtures estáticas
  utils/                  helpers puros
  pages/                  rutas Nuxt
server/
  api/composer/           rutas finas (validar, autorizar, delegar)
  fal/                    transporte Fal compartido: HTTP, queue, storage y adaptadores
  shared/                 errores, rate limit, job token, request context y validación
  composer/               dominio Composer: registry, prompts, orquestador y fachada
tests/
  unit/                   lógica, servicios, adaptadores, componentes y composables
  acceptance/             SSR, rutas y regresión de feed/landing
  fixtures/fal/           contratos de Fal sin claves reales
  helpers/                stubs HTTP y handlers H3
```

Reglas clave:

- La clave de Fal nunca sale del servidor.
- El navegador solo hace un `PUT` scoped a una URL firmada; el binario no pasa por Nitro.
- Los modelos y endpoints se resuelven con una allowlist server-side.
- Los jobs largos son asíncronos; el cliente hace polling con backoff y cancelación.
- El vídeo se construye con un keyframe FLUX 9:16 antes de animarlo.
- Si falla el vídeo, el keyframe se conserva como éxito parcial.
- Sin persistencia de proyectos: el resultado es terminal y temporal.

## Spec-Driven Development

Las specs viven en `specs/`:

- `001-brand-construction-landing`
- `002-shorts-feed-mock`
- `003-composer-mock` — histórica; sustituida por 004 para el Composer.
- `004-composer-real` — Composer real con Fal.ai.

Flujo obligatorio:

1. `/io-plan` — investigación y alternativas.
2. `/io-spec` — Architect escribe la spec.
3. **Checkpoint 1** — aprobación humana de la spec.
4. Developer implementa.
5. Reviewer read-only revisa spec drift, seguridad y regresiones (`/io-review`).
6. **Checkpoint 2** — revisión humana de la implementación y del informe del reviewer.
7. Tester reescribe/añade tests y ejecuta `npm run test:run` + `npm run build`.

Los skills de proyecto viven en `.opencode/skills/`:

- `fal-deepseek-pipeline`
- `prisma-leases`
- `ffmpeg-media`
- `story-test-harness`
- `sdd-spec-guardrails`

Antes de Spec 005 (micro-relatos), lee `AGENTS.md` y la sección de patrones reutilizables de 004.

## Estado actual

- Spec 004 implementada.
- Fase 0 de Spec 005 completada: `server/fal/` y `server/shared/` extraídos con shims de compatibilidad en `server/composer/`.
- Spec 005 implementada: Story Composer con `/story`, `/story/[id]`, reconciliador con leases, FFmpeg y persistencia PostgreSQL.
- Prisma 7 + PostgreSQL preparados: `prisma/schema.prisma` con `Story`/`Scene`, Docker local y migración inicial aplicada.
- Spec 006 implementada: Story Bible, continuidad en prompts, QC de fotogramas y estados `QC`/`WAITING_QC`.
- Spec 007 implementada: modos `faithful`/`creative`, canon con localizaciones y `source`, dos pasadas de DeepSeek y QC por escena.
- Suite automatizada: **1859 tests en verde** (13 skips opt-in, 130 archivos); los 613 tests de 004 siguen intactos.
- Build Node/Nitro correcto.
- Smoke real de Fal opt-in (`RUN_FAL_SMOKE=1`), no ejecutado en CI.
- Pendiente de QA manual de accesibilidad/navegador y validación de CORS/lifecycle reales en el entorno de despliegue.
- Pendiente de ampliar las guardas estáticas a `server/fal/**` y `server/shared/**` en Spec 005.

## Spec 006 — Continuidad de historias

La Spec 006 añade una Story Bible al director, propaga un bloque global idéntico a keyframes y vídeos, y ejecuta un QC de fotogramas antes del montaje.

- Estados nuevos de `StoryStatus`: `QC` (QC en curso) y `WAITING_QC` (revisión humana).
- Columnas nuevas en `Story`: `qcJson` (`JSONB`, nullable) y `qcCheckedAt` (`TIMESTAMP(3)`, nullable). Sin backfill; las filas de 005 siguen válidas.
- Migración: `prisma/migrations/20261021221044_story_qc/migration.sql`.
- La historia no llega a `ASSEMBLING` sin `qc.status = PASSED` o `qc.override.approved = true`.
- Si DeepSeek Vision no está configurado, falla o devuelve JSON inválido dos veces, el QC queda `UNAVAILABLE` y la persona revisa manualmente. Nunca se inventa un `PASSED`.
- Los strips de QC (JPEG) se suben a Fal con prefijo `story-qc-` y lifecycle de 24 h.

### Variables de QC

| Variable | Default | Uso |
|----------|---------|-----|
| `NUXT_STORY_COST_QC_USD` | `0.02` | Coste estimado por evaluación de visión y escena. |
| `NUXT_STORY_QC_ENABLED` | `false` | Interruptor del QC con visión. Desactivado por defecto hasta cerrar G1/G2. |
| `NUXT_STORY_QC_TIMEOUT_MS` | `240000` | Presupuesto total del QC por historia. |
| `NUXT_STORY_QC_LEASE_MS` | `300000` | Lease de la fase `QC`. |
| `NUXT_STORY_QC_CONCURRENCY` | `1` | Historias en QC por instancia. |
| `NUXT_STORY_QC_MIN_CONFIDENCE` | `0.7` | Umbral de confianza para `PASSED`. |
| `NUXT_STORY_QC_RETRY_LIMIT` | `3` | `qc/retry` por hora y por historia. |
| `NUXT_STORY_QC_RETRY_WINDOW_MS` | `3600000` | Ventana de `qc/retry`. |

El modelo de visión es fijo (`deepseek-flash`) dentro de `DeepSeekClient`; no existe una variable separada de modelo QC.

La evaluación es **secuencial** por la dependencia de la observación anterior (`previous`). No se promete concurrencia de evaluación: por eso no se expone `NUXT_STORY_QC_EVAL_CONCURRENCY`.

El QC con visión queda desactivado por defecto (`NUXT_STORY_QC_ENABLED=false`) hasta cerrar los gates G1/G2. El QC técnico y la revisión manual siguen disponibles.

Los smokes de visión (`RUN_STORY_QC_VISION_SMOKE=1`) y de FFmpeg (`RUN_FFMPEG_SMOKE=1`) son opt-in y nunca se ejecutan en CI.

## Spec 007 — Modos de historia y canon por escena

La Spec 007 sustituye la historia de una sola localización de 006 por un canon con localizaciones y una puesta en escena por beat. El modo es producto, no prompt: se persiste en `Story.mode` y el plan guarda el canon y el tono.

- `StoryMode = 'faithful' | 'creative'`; `faithful` es el default de UI y `creative` se elige con un clic. El transporte exige `mode`; sin él, `POST /api/story` responde 400 `invalid-mode`.
- `StoryTone = 'humor' | 'aventura' | 'absurdo' | 'heartwarming' | 'dramatic'`, más `neutral` solo para normalizar filas anteriores a 007. El tono vive en `planJson` y se expone como `plan.tone`; no hay columna `Story.tone`.
- `StoryBible` contiene `style`, `tone`, `theme`, `leadCharacterId`, `signaturePropId`, `characters`, `locations`, `props`, `forbidden` y `continuityRules`. Personajes, localizaciones y props declaran `source: 'premise' | 'invented'`.
- `StoryBeat` declara `locationId`, `timeOfDay`, `weather`, `action`, `storyFunction` y `gag`, además de la puesta en escena (`visualPrompt`, `camera`, `continuityFromPrevious`, `transition`).
- Dos pasadas de DeepSeek: el Narrador produce canon y beats narrativos; el Director Visual produce solo `visualPrompt`, `camera`, `continuityFromPrevious` y `transition`. Un ensamblador puro copia la narrativa sin cambios.
- Presupuestos de salida: narrativa 6 000/7 000/7 800 tokens (tope 8 000, reparación +400); visual 2 400/2 800/3 200 (tope 4 000, reparación +300). Temperatura 0.4 en `faithful` y 0.7 en `creative`.
- Límites de prompt: bloque global ≤ 2 600 caracteres; keyframe ≤ 4 000; vídeo compacto ≤ 2 000. El compositor no trunca contenido normativo.
- QC por escena: la expectativa incluye localización, hora, clima, personajes y props de esa escena. Un cambio de escena declarado no es un error; el protagonista y el prop característico solo se exigen cuando la escena los declara.
- Migración: `prisma/migrations/20261022010856_story_mode/migration.sql` añade el enum `StoryMode` y `Story.mode` con default `faithful`; las filas de 006 se normalizan al leer sin llamar a DeepSeek.
- `NUXT_STORY_QC_ENABLED` sigue siendo `false` por defecto.

### Variables del director

| Variable | Default | Uso |
|----------|---------|-----|
| `NUXT_STORY_COST_NARRATIVE_USD` | `0.01` | Coste estimado de la pasada narrativa. |
| `NUXT_STORY_COST_VISUAL_USD` | `0.005` | Coste estimado de la pasada visual. |
| `NUXT_STORY_COST_DIRECTOR_REPAIR_USD` | `0.01` | Coste estimado de una reparación. |
| `NUXT_STORY_NARRATIVE_TIMEOUT_MS` | `40000` | Timeout de la pasada narrativa. |
| `NUXT_STORY_VISUAL_TIMEOUT_MS` | `25000` | Timeout de la pasada visual. |
| `NUXT_STORY_DIRECTOR_TOTAL_TIMEOUT_MS` | `85000` | Timeout total compartido por ambas pasadas. |

Smokes opt-in: `RUN_STORY_NARRATIVE_SMOKE=1`, `RUN_DB_SMOKE=1`, `RUN_STORY_QC_VISION_SMOKE=1`, `RUN_FFMPEG_SMOKE=1` y `RUN_FAL_SMOKE=1`. Nunca se ejecutan en CI.
