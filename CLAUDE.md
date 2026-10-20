# CLAUDE.md — AI Shorts

El contexto canónico del proyecto está en [`AGENTS.md`](./AGENTS.md). Léelo antes de proponer o implementar cambios.

## Orden de lectura

1. `.specify/memory/constitution.md`
2. `AGENTS.md`
3. La spec relevante en `specs/NNN-feature-name/spec.md`
4. El código y los tests afectados

## Reglas críticas

- No escribir código sin una spec aprobada. Respetar Checkpoint 1 (spec) y Checkpoint 2 (implementación).
- Mantener el flujo por defecto en 1–3 clics; la configuración avanzada es opcional.
- `NUXT_FAL_KEY` y cualquier secreto viven solo en servidor. Nunca en `app/`, HTML, logs, respuestas o tokens.
- Las rutas `server/api/` son finas; la lógica de proveedor vive en `server/<domain>/` con adaptadores e inyección de dependencias.
- Contratos compartidos en `app/models/`; DTOs de proveedor solo en `server/`; sin `any`, sin `File`/`Blob` en modelos compartidos.
- El navegador solo puede hacer el `PUT` scoped de una subida firmada; no llama a Fal directamente.
- Los jobs de vídeo son asíncronos: submit, token opaco, polling/backoff, cancelación y estados terminales.
- Keyframe-first para vertical 9:16; conservar el keyframe como póster y éxito parcial.
- Rate limit, idempotencia, presupuesto y allowlists son obligatorios en rutas que cuestan dinero.
- Tests con stubs; nunca Fal real en CI. Gate final: `npm run test:run` + `npm run build`.
- Despliegue Node/Nitro con `npm run build`; `nuxt generate` no sirve para `/api/**` ni Composer real.

## Estado actual

- Spec 004 implementada; 613 tests en verde y build correcto.
- Spec 003 es histórica y está sustituida por 004 para el Composer.
- Antes de Spec 005 (micro-relatos), revisar la sección “Preparación de Spec 005” de `AGENTS.md`.
