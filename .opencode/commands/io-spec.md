---
description: Run the full SDD development workflow (Architect -> checkpoint -> Developer -> checkpoint -> Tester)
agent: ionias
---

Execute the Spec-Driven Development workflow for the following feature or request: $ARGUMENTS

Follow these steps sequentially and respect the human checkpoints:

1. Read `.specify/memory/constitution.md`, `AGENTS.md` and the relevant specs under `specs/`.
2. Invoke the **architect** agent to create/update `specs/NNN-feature-name/spec.md`.
3. **CHECKPOINT 1:** present the spec summary and STOP. Wait for explicit human approval before any implementation.
4. Invoke the **developer** agent to implement strictly against the approved spec using Nuxt 4, Vue 3, Tailwind CSS 3.4, `app/models/`, thin `server/api/` routes and `server/<domain>/` services.
5. **CHECKPOINT 2:** summarize files, architecture, build result and known limitations and STOP. Wait for explicit human approval before testing.
6. Invoke the **tester** agent to rewrite/add unit, route, component and acceptance tests, run `npm run test:run` and `npm run build`, and report exact results.

Do not skip checkpoints. Do not add dependencies or call real AI providers without approval.
