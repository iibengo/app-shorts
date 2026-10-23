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
  components/story/       dominio Story (007/008: escenas, shots, QC, resultado)
  composables/            estado/orquestación de cliente
  models/                 contratos compartidos
  data/                   presets, defaults y datos estáticos
  utils/                  helpers puros
  pages/                  rutas
server/
  api/composer/           handlers finos del Composer
  api/story/              handlers finos de Story
  fal/                    transporte Fal compartido: HTTP, queue, storage, tipos y adaptadores
  shared/                 errores, rate limit, job token, request context y validación compartidos
  db/                     Prisma singleton lazy (solo Story)
  composer/               dominio Composer: registry, prompts, orquestador y fachada
  story/                   dominio Story: directores, reels, shots, worker, QC, coste y montaje
prisma/
  schema.prisma           Story/Scene/Shot + enums + leases
tests/
  unit/                   lógica y componentes
  acceptance/             SSR, rutas, regresiones y smokes opt-in
  fixtures/fal/           contratos de proveedor sin secretos
  helpers/                stubs HTTP/H3
specs/                    specs 001–008
```

## Estado actual (2026-10-22)

- **Estados:** `Draft` → `Approved` → `Implemented` → `Validated`. `Implemented` = gate con stubs en verde. `Validated` = además smoke real y QA manual, concedido solo por el humano.
- **Spec 004 — Composer real:** `Implemented`.
- **Spec 005 — Story Composer:** `Implemented`.
- **Spec 006 — Continuidad:** `Implemented`.
- **Spec 007 — Modos/canon:** `Implemented`.
- **Spec 008 — TikTok Reel Engine:** `Implemented` (commit `dff2764` + enmiendas 2026-10-23). No `Validated`: smoke real y QA manual pendientes.
- **Ninguna spec está `Validated`:** no se ha ejecutado ningún smoke real hasta la fecha.
  - Escenas narrativas + `Shot` como unidad de generación.
  - Duraciones 15/30/45/60/90 s y perfiles budget/standard/production.
  - Directores reales, worker por shot, QC técnico/visual, montaje por shot y UI por plano.
  - `legacy: true` sigue como escape hatch explícito para 005–007; es una desviación conocida.
- **Typecheck (2026-10-23):** `npm run typecheck` (`nuxi typecheck` con `vue-tsc` + `typescript`) está instalado y **falla hoy con 268 errores**. No está en el gate. Baseline: 229 en `server/`, 39 en `app/`; predominan `TS2339` (propiedades de `StoryScene`/`StoryBeat` que ya no existen), `TS7006` (parámetros implícitos `any`) y `TS2322`. Cubre `app/`, `server/`, `shared/` y `nuxt.config`, **no** `tests/**`. Se arregla en un pase propio; no entra en el gate hasta llegar a cero.
- **Prisma/PostgreSQL:** Prisma 7 + `@prisma/adapter-pg`; migraciones hasta `20261024010000_story_character_sheet`; Docker local; `db:generate` es obligatorio antes de build/test cuando Story importe Prisma.
- **Tests:** 2169 passed / 21 skipped opt-in, 155 archivos; `npm run build` correcto.
- **DeepSeek thinking (2026-10-23):** el cliente exige `thinking` explícito en cada petición; canon, escenas, planos y QC envían `{ type: 'disabled' }`. Medido: DeepSeek razona por defecto, consume `max_tokens` y `temperature` no tiene efecto con thinking activo. Ver Enmienda B de 005 y la enmienda 2026-10-23 de 008.
- **Estilo visual (2026-10-23, 010a):** `Story.visualStyle` con cinco estilos (`cartoon3d` por defecto, `papercraft`, `clay`, `anime`, `photo`), resueltos en servidor desde un registro en inglés. El bloque de estilo abre los prompts de keyframe y vídeo. Los campos visuales se piden en inglés; título, logline y narración siguen en español. Migración `20261023220000_story_visual_style`.
- **Hoja de personaje (2026-10-24, 011):** con referencia, la historia genera una hoja 2×2 (4 vistas, 0,04 USD) antes del primer keyframe; los planos la envían como identidad y un consistency check con DeepSeek Vision regenera una vez si detecta deriva. Un fallo de la hoja o del check nunca bloquea la historia.
- **Nano Banana (2026-10-23):** con ancla disponible, los keyframes se generan con `fal-ai/nano-banana/edit` (0,0398 USD/imagen, `aspect_ratio: 9:16`, varias referencias). Dos sondas reales confirman identidad y estilo low-poly con escena y ropa distintas. FLUX sigue sembrando el primer keyframe cuando no hay ancla; Kontext queda como fallback.
- **Aspecto vertical (2026-10-23):** el primer keyframe de cada personaje lo genera siempre FLUX a 1152×2048; Kontext solo entra con anclas validadas. Kontext y Kontext multi rechazan al parsear cualquier keyframe fuera de 9:16 (±3 %). Origen: el primer run end-to-end falló con `technical-aspect` porque Kontext heredó un 3:4 del ancla y MiniMax devolvió 4:3.
- **Anclas y consistencia (2026-10-23, 010b):** el primer keyframe de cada personaje se guarda como ancla en `Story.anchorsJson` y se reutiliza con Kontext (1 ancla) o `kontext/max/multi` (2 anclas); sin ancla, FLUX con el bloque de estilo. El selector de 5 estilos está en el formulario y el resultado muestra el estilo usado. Migración `20261023233000_story_anchors`.
- **Keyframe (2026-10-23, B2):** el prompt de FLUX/Kontext va en inglés, empieza por el plano, incluye solo las entidades presentes y se acota a 900 caracteres (límite T5 de ~512 tokens). Sin `Avoid:` en el prompt positivo: ninguno de los dos endpoints admite `negative_prompt`. `StoryBeat` restaurado con `subject`/`framing`.
- **Reconciliador (2026-10-23, B4):** los errores de consulta de estado se clasifican con `StoryError.retryable`; los transitorios no cambian el estado y se reintentan al siguiente tick. Un job activo sin cambios durante 10 min (keyframe) o 20 min (vídeo) se cancela con `cancel_url` y falla con `provider-timeout`. Los submit no se reintentan para no duplicar job ni cobro.
- **004:** sin archivos modificados. La suite 004 reproducible es **605 tests**; la cifra histórica de 613 no es reproducible con el árbol actual.
- **Smoke real:** opt-in (`RUN_STORY_SMOKE=1`, `RUN_FAL_SMOKE=1`, etc.); no ejecutado en esta validación. Fal disponible: ~5 USD; no gastar sin aprobación.
- **Spec 003:** histórica; sustituida por 004 para el Composer. No reutilizar su mock.
- **Pendiente:** QA manual de accesibilidad/navegador, smoke real 15 s budget, validación de CORS/lifecycle/cancelación y gates D1–D10/G1–G8.
- **Deuda 008:**
  - Las escrituras historia→shots de operaciones batch aún no son transaccionales.
  - El fallback de `qc-frames` con `filePath === null` debe reforzarse.
  - Los 007 migrados con shots reales no siempre muestran `Plano heredado`.
  - `legacy: true` debe retirarse o quedar con condición de retirada explícita.
- **Siguiente:** Spec 009 — director eval (DeepSeek, opt-in); Spec 010 — estilo visual y personajes; Spec 011 — consistencia de personaje (hoja + verificación); Spec 012 — audio, voz, música y subtítulos; Spec 013 — gráficos y overlays.

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
- `npm run test:run` + `npm run build` como gate final, una vez por pase de implementación.

## Política de ejecución de tests

- **Developer:** tests dirigidos a los archivos cambiados; un `npm run build` al final del bloque si hay riesgo de compilación. No ejecuta la suite completa en bucle.
- **Orchestrator:** no ejecuta `npm run test:run` después de cada turno del developer ni de cada corrección del reviewer. Verifica tests dirigidos, diff y build; delega el gate completo.
- **Reviewer:** read-only; no ejecuta tests.
- **Tester:** dueño del gate completo. Ejecuta `npm run test:run` + `npm run build` una vez por pase y solo repite si cambian tests o contratos.
- **`npm run test:run:low`:** `vitest run --maxWorkers=2` para trabajar sin saturar la CPU. No sustituye al gate final.
- No se debilitan, omiten ni modifican tests para ocultar una regresión. Un test que consolida un contrato viejo se actualiza con la enmienda.

## Cierre obligatorio de spec

Antes de proponer commit:

1. Spec en `Implemented` con commit, fecha, tests/build y desviaciones. `Validated` solo con smoke real y QA manual aprobados por el humano.
2. `AGENTS.md` con estado real, gates abiertos y siguiente spec.
3. README, `.env.example`, `nuxt.config.ts` y skills sincronizados con los defaults.
4. Recuentos históricos y compatibilidades `legacy` marcados o retirados.
5. `git status --short`, `git diff --stat` y `git diff --check`.
6. Resumen de smokes reales: ejecutados, skipped o pendientes.
7. Aprobación humana antes de commit.

## Preparación de Spec 009 — audio, narración, música y subtítulos

No escribir la spec todavía. La 008 ya genera el vídeo mudo; la 009 añade la capa de audio. Antes de `/io-spec`, resolver estas decisiones:

### Producto
- ¿Voz en off, texto en pantalla, música, efectos o combinación? El objetivo de referencia incluye voz, música y subtítulos quemados.
- ¿Voz por escena o por plano? Recomendación inicial: por escena, alineada después con los planos.
- ¿Idioma/español neutro, variante y presets de velocidad? ¿La voz se elige por historia o hay un default?
- ¿Subtítulos quemados, sidecar SRT/VTT o ambos? ¿Estilo y zona segura vertical?
- ¿La música se elige por tono o se genera? ¿SFX en el MVP o después?
- ¿El resultado final sigue siendo terminal o se publica?

### Arquitectura candidata a evaluar
- `TtsAdapter` y `MusicProvider` server-side; el cliente no conoce proveedores ni claves.
- Reutilizar `server/fal/`, `server/shared/` y el worker/leases de Story; no duplicar el motor.
- Generar voz por escena, medir duración real y ajustar planos si no cabe; no acelerar la voz de forma antinatural.
- Timestamps del TTS si existen; si no, evaluar forced alignment local.
- Subtítulos ASS + FFmpeg/libass; sidecar SRT/VTT.
- Mezcla FFmpeg: voz prioritaria, música con ducking, ~−14 LUFS, ~−1 dBTP, AAC 48 kHz.
- Persistencia de `audioUrl`, `voiceId`, `musicId`, `captionsUrl`, duración de voz y metadatos de mezcla; lifecycle explícito.
- Generar audio en paralelo con keyframes/vídeos cuando sea posible; estado/recovery explícitos.

### Alternativas a comparar
- TTS económico en la nube (OpenAI/Azure/Polly) + música licenciada.
- TTS premium (ElevenLabs) + música licenciada.
- TTS local (Piper/Kokoro) + música local/CC, coste cero por uso.
- Música generativa solo como alternativa futura, con licencia/coste/calidad.

### Riesgos y restricciones
- Fal disponible: ~5 USD. No ejecutar proveedores reales sin aprobación ni cap duro.
- Derechos de voz/música/SFX; nada de clonación no consentida ni voces de famosos.
- La voz no puede romper la duración máxima de 008.
- Si falla TTS/música/alineación, decidir si se entrega vídeo mudo o se bloquea; nunca falsear éxito.
- No añadir dependencias ni proveedores sin aprobación.
- Tests con stubs/audio sintético; ningún proveedor real en CI.

### Entregable de `/io-plan` para 009
- 2–3 alternativas con matriz coste/latencia/calidad/licencias.
- Decisión de alcance MVP y fuera de alcance.
- Plan de reutilización explícito de 004–008.
- Impacto en config/docs/DTO/estado/coste.
- Preguntas que deben cerrarse antes de `/io-spec`.

## Comandos

- `/io-plan` — investigación y alternativas antes de la spec.
- `/io-spec` — flujo completo con checkpoints, reviewer, tester y cierre.
- `/io-review` — revisión read-only de spec drift, seguridad, config/docs y regresiones 004–008.
- `/io-modify` — modificar una spec existente con tabla de enmienda.
- `/io-close` — cierre de una spec validada: estado, docs, gate y propuesta de commit.
- `npm run test:run` — suite completa; solo gate final.
- `npm run test:run:low` — suite completa con `maxWorkers=2` para no saturar la CPU.
- `npm run build` — build Node/Nitro.

## Registro de cambios

- **2026-10-21:** contexto canónico creado tras 004. Se documentan patrones de Fal, subida firmada, job token, keyframe-first, rate limit y testing; se prepara la agenda de Spec 005.
- **2026-10-22:** Spec 008 implementada y validada (`dff2764`); se actualiza el estado canónico, se documenta la política de ejecución de tests y el cierre obligatorio de spec; se prepara la Spec 009 de audio, voz, música y subtítulos.
- **2026-10-23:** Director de 008 endurecido tras la eval: ids normalizados, `forbidden` tolerante, feedback de perfil separado, reparto de planos por escena en código, recorte determinista, `sceneRole` derivado y longitudes ajustadas. Tres corridas: 35/36 válidas (97 %), 0 truncamientos, 0,109 USD. Enmienda en 008.
- **2026-10-23:** Spec 009 (director eval) implementada: 12 premisas versionadas, runner opt-in solo DeepSeek con tope de 1 USD, informe y grabación en `tests/fixtures/eval/`, y replay determinista sin red. Ejecutada contra la API: tres corridas finales dieron 35/36 planes válidos. Gate: 2169 passed / 21 skipped, build correcto.
- **2026-10-23:** A3 aplicado. Estados de spec separados en `Implemented` (gate con stubs) y `Validated` (smoke real + QA manual, solo humano); 004–008 reetiquetadas y ninguna en `Validated`. Añadido `typecheck` con `vue-tsc` + `typescript` como comprobación local; revela 268 errores previos y no entra en el gate hasta llegar a cero.
- **2026-10-23:** B1 confirmado y corregido. DeepSeek razonaba por defecto, consumía `max_tokens` y hacía inerte `temperature`; el cliente exige ahora `thinking` explícito y canon, escenas, planos y QC lo desactivan (`b09584d`). Enmiendas en 005 (B), 006, 007 y 008. Gate: 2090 passed / 13 skipped, build correcto. Smoke real sigue pendiente.
- **2026-10-23:** B2 corregido. El keyframe se compone en inglés, con el plano primero, solo entidades presentes y 900 caracteres (FLUX/Kontext leen ~512 tokens y no admiten `negative_prompt`). Se elimina `Avoid:` del prompt positivo en keyframe y vídeo, y se restaura `StoryBeat` con `subject`/`framing`. Gate: 2103 passed / 13 skipped, build correcto.
- **2026-10-23:** B4 corregido (`d96decc`). Los errores transitorios de consulta de estado se reintentan al siguiente tick en vez de fallar el plano; los terminales siguen fallando. Un job activo sin cambios durante 10/20 min se cancela con `cancel_url` y falla con `provider-timeout`. Enmienda en 008. Gate: 2099 passed / 13 skipped, build correcto.
