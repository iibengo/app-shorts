---
description: Modify an existing technical specification or refactor requirements
agent: orchestrator
---

Act as the Architect Agent. The user wants to modify an existing technical specification or adjust requirements for the project.

Request / Changes requested: $ARGUMENTS

Your tasks:
1. Locate the existing specification under `specs/NNN-feature-name/spec.md` (never `.github/spec/`).
2. Read `.specify/memory/constitution.md`, `AGENTS.md` and the current implementation.
3. Update requirements, user stories, data/API contracts, UI/copy or architecture boundaries.
4. Add or update an explicit amendment/supersession table when the change affects an existing contract.
5. Summarize what changed, what remains valid and any migration/test impact for the developer and tester.

Do not write implementation code in this phase. Present the change for human approval before implementation.
