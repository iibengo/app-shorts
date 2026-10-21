---
name: sdd-spec-guardrails
description: Use before /io-spec, /io-modify or any implementation that changes a contract, to enforce checkpoints, amendment tables, contracts and acceptance criteria.
---

# SDD Spec Guardrails

## Read first

1. `.specify/memory/constitution.md`
2. `AGENTS.md`
3. The relevant specs under `specs/`
4. The current implementation and tests

## Workflow

1. Phase 0: research and alternatives only; no code and no final spec.
2. Phase 1: Architect writes `specs/NNN-feature-name/spec.md`.
3. Checkpoint 1: present the spec and stop. No code before explicit approval.
4. Phase 2: Developer implements only the approved spec.
5. Checkpoint 2: summarize files, architecture, build and limitations; stop.
6. Phase 3: Tester rewrites/adds tests, runs the suite/build and reports.
7. Update spec status only after validation.

## Every spec must define

- Context and explicit amendments/supersessions to prior specs.
- User stories and acceptance scenarios.
- Functional requirements and success criteria.
- Shared data contract in `app/models/`.
- Exact API contract: routes, payloads, codes and errors.
- Server SOLID boundaries and reuse of `server/fal/`, `server/shared/`, `server/story/`.
- UI/copy/testids/ARIA.
- State machine, recovery and cancellation.
- Security, secrets, rate limit, idempotency and lifecycle.
- Cost/latency and hard budget.
- Test plan, opt-in smokes and out-of-scope.
- Implementation phases and open gates.

## Stop conditions

- No spec.
- A contract change without an amendment table.
- A client-side provider key.
- In-memory state where persistence was required.
- Fake progress or dead-end UI.
- A provider cost path without guardrails.
- Tests changed to hide a regression.

## References

- `references/spec-checklist.md`
