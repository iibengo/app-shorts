# AI Shorts Wrapper Constitution

## Core Principles

### I. Simplicity First (1-to-3-Clicks UX)
Every feature, screen, or workflow must prioritize absolute simplicity. The default user journey to generate or manage a short video wrapper must not exceed 1 to 3 clicks. Advanced configuration must be optional, collapsed, and unnecessary for the first successful result. Real latency must be communicated honestly: no fake percentages, no invented ETAs, and no dead-end states. The result must always offer a clear next action or a safe recovery path.

### II. Spec-Driven Development (NON-NEGOTIABLE)
No implementation code can be written without a formal technical specification. The workflow is:
- **Phase 0 (optional):** research and strategy with `/io-plan`.
- **Phase 1:** Architect writes or updates `specs/NNN-feature-name/spec.md`.
- **Checkpoint 1:** human approval of the spec. No code before this approval.
- **Phase 2:** Developer implements strictly against the approved spec.
- **Phase 2.5:** read-only Reviewer checks spec drift, security, regressions, races and missing tests.
- **Checkpoint 2:** human review of the implementation, including Reviewer findings.
- **Phase 3:** Tester rewrites/adds tests, runs the full suite and reports regressions.

Specs live under `specs/`, never `.github/spec/`. When a new spec changes an existing contract, it must include an explicit amendment/supersession table. Historical specs remain in the repository as traceability.

### III. Server-Side Security for AI & Secrets
All third-party AI integrations, API keys, provider credentials, and sensitive backend operations must execute exclusively on the server:
- Credentials live in private Nuxt runtime config (for example `runtimeConfig.falKey`) and must never be exposed through `NUXT_PUBLIC_*`, client bundles, HTML, API responses, logs, or job tokens.
- Provider calls must go through server services, never directly from Vue components or client composables.
- The only allowed client-side provider interaction is a **scoped signed upload**: the server authorizes and initiates the upload with the provider key, and the browser performs a short-lived `PUT` to the pre-signed URL without credentials, cookies, or provider authorization headers. Binary files must not be proxied through Nitro unless a spec explicitly approves it.
- Model/endpoint IDs, provider URLs, and upload targets must be allowlisted server-side; the client must never choose an arbitrary endpoint.
- Long-running AI jobs must be asynchronous: submit on the server, return an opaque job handle, poll or receive a webhook, and never hold a request open for video generation.
- Every paid or rate-limited route must define rate limiting, idempotency, concurrency limits, and a cost/budget guardrail.
- Signed media URLs and user uploads must have an explicit lifecycle/expiration policy.

### IV. Modular Architecture & Reusability
Code must be modular and reusable from day one, using Nuxt 4 conventions:
- **UI primitives:** `app/components/ui/`.
- **Domain components:** `app/components/<domain>/` (for example `composer/`, `shorts/`).
- **Pages/routes:** `app/pages/`.
- **Shared state/business orchestration:** `app/composables/`.
- **Global shared models:** `app/models/`.
- **Static feature data/defaults:** `app/data/`.
- **Pure helpers:** `app/utils/`.
- **Server API routes:** `server/api/` — thin handlers only: parse, validate, authorize, call a service, serialize.
- **Server domain services:** `server/<domain>/` — orchestration, adapters, provider clients, tokens, rate limiting and error mapping.
- **Provider DTOs:** server-only files (for example `server/composer/fal-types.ts`); never imported by `app/`.
- **Component-specific types:** keep them local to the SFC/composable; do not export them from `app/models/`.

Rules:
- Shared contracts use strict TypeScript, `readonly` fields, discriminated unions, and no `any`.
- `app/models/` must not contain `File`, `Blob`, `FileList`, provider credentials, or raw provider transport shapes.
- No barrels/index files for models unless a spec explicitly requires one.
- Prefer extending an existing service, adapter, token or rate-limit primitive over creating a parallel abstraction.
- A feature-specific provider integration must expose a domain interface; routes and UI must depend on that interface, not on provider SDK details.

### V. Test-First & Quality Gates
Changes must be verified. The Tester agent must validate implementations with automated tests for every new runtime file, excluding plain type-only files. The expected matrix is:
- Unit tests for pure logic, adapters, token/rate-limit/validation services and composables.
- Route/API tests with provider stubs for status codes, contracts, idempotency, rate limits and secret leakage.
- Component tests for copy, focus, ARIA, states and terminal actions.
- Acceptance tests for SSR, route rendering, PWA behavior and feed/landing regressions.
- A full `npm run test:run` and `npm run build` gate before closing a feature.
- No real provider calls in CI. Real-provider smoke tests must be opt-in, cost-aware and documented.

## Additional Constraints & Tech Stack
- **Framework:** Nuxt 4 with the `app/` directory, auto-imports and standard conventions.
- **Styling:** Tailwind CSS 3.4.x via `@nuxtjs/tailwindcss` 6.14. Tailwind v4 syntax is prohibited until a separate migration spec is approved.
- **Server runtime:** Node.js 22 LTS with Nitro. The production build is `npm run build` and the Node server output. `nuxt generate` is only valid for static pages; it is not a valid deployment for server routes, AI jobs, signed uploads or media assembly.
- **Persistence:** PostgreSQL is the approved persistence store. Prisma 7 with the PostgreSQL driver adapter is the approved ORM, server-only, behind repository interfaces. Migrations use `DIRECT_URL`; runtime uses pooled `DATABASE_URL`. No database access from `app/`.
- **Media:** FFmpeg/ffprobe are the approved assembly engine. They require a persistent Node process, a writable temp directory and explicit timeouts/cleanup. Hard cuts only unless a spec approves transitions.
- **AI providers:** Fal.ai is the approved generation provider (Queue, Storage, FLUX, MiniMax, Kling). DeepSeek is the approved script/JSON provider. New providers require a spec and an explicit security review.
- **PWA:** the service worker must not cache `/api/**` or provider media/queue hosts. Offline behavior must be explicit and must not fake a successful generation.
- **AI provider pattern:** asynchronous queue + opaque job token + polling/webhook + explicit cancellation + terminal failure/partial-success states. Provider errors map to stable domain errors; raw provider messages never reach the client.
- **Vertical video pattern:** when a provider inherits aspect ratio from an input image, generate a 9:16 keyframe first and animate it. Preserve the keyframe as poster/partial result if the video stage fails.
- **Orchestration:** OpenCode v2 with primary Orchestrator and sub-agents Architect, Developer, Reviewer and Tester. Human checkpoints are mandatory.

### Project Skills
- Project skills live in `.opencode/skills/<skill-id>/SKILL.md`; supporting files stay beside them in `references/`, `scripts/` or `templates/`.
- Skills are on-demand instructions, not tools, capabilities or permissions. They must not contain secrets or duplicate entire specs.
- Approved project skills: `fal-deepseek-pipeline`, `prisma-leases`, `ffmpeg-media`, `story-test-harness`, `sdd-spec-guardrails`. A new skill requires a clear owner and a reason it is not already covered by `AGENTS.md` or a spec.
- `.cursor/skills` remain Cursor-specific and must not be copied blindly into `.opencode/skills`.
- `AGENTS.md` remains the canonical entry point; skills must reference it and the relevant specs rather than contradict them.

## Governance
This Constitution supersedes ad-hoc development practices. Every spec, agent prompt and workflow must verify compliance with these principles. Any deviation must be explicit in the spec, justified, and approved at the corresponding checkpoint.

**Version**: 1.2.0 | **Ratified**: 2026-10-18 | **Last Amended**: 2026-10-21
