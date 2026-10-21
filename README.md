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
- Suite automatizada: **1505 tests en verde** (7 skips opt-in); los 613 tests de 004 siguen intactos.
- Build Node/Nitro correcto.
- Smoke real de Fal opt-in (`RUN_FAL_SMOKE=1`), no ejecutado en CI.
- Pendiente de QA manual de accesibilidad/navegador y validación de CORS/lifecycle reales en el entorno de despliegue.
- Pendiente de ampliar las guardas estáticas a `server/fal/**` y `server/shared/**` en Spec 005.
