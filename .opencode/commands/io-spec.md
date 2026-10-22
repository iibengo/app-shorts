---
description: Run the full SDD development workflow (Architect -> checkpoint -> Developer -> checkpoint -> Tester)
agent: ionias
---

Execute the Spec-Driven Development workflow for the following feature or request: $ARGUMENTS

Follow these steps sequentially and respect the human checkpoints:

1. Read `.specify/memory/constitution.md`, `AGENTS.md` and the relevant specs under `specs/`.
2. Invoke the **architect** agent to create/update `specs/NNN-feature-name/spec.md`.
3. **CHECKPOINT 1:** present the spec summary and STOP. Wait for explicit human approval before any implementation.
4. Invoke the **developer** agent to implement strictly against the approved spec using Nuxt 4, Vue 3, Tailwind CSS 3.4, `app/models/`, thin `server/api/` routes and `server/<domain>/` services. The developer runs targeted tests and one build, not the full suite.
5. Invoke the read-only **reviewer** agent for spec drift, security, 004–008 regressions, races, config/docs drift and missing tests. Include its findings in the checkpoint.
6. **CHECKPOINT 2:** summarize files, architecture, targeted tests, build result, reviewer findings, config/docs drift and known limitations and STOP. State explicitly if the full suite is pending the tester. Wait for explicit human approval before testing.
7. Invoke the **tester** agent to rewrite/add unit, route, component and acceptance tests, run `npm run test:run` and `npm run build`, and report exact results.
8. **PHASE 4 — CLOSE:** invoke `/io-close` or update the spec status, `AGENTS.md`, README, affected skills, `.env.example`/runtime defaults and changelog; run `git status --short`, `git diff --stat` and `git diff --check`; present the commit proposal and wait for explicit approval. Do not commit automatically.

Do not skip checkpoints. Do not run the full suite after every developer turn. Do not add dependencies or call real AI providers without approval.
