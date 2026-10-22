---
description: Review current changes against the approved spec, security and regression gates
agent: reviewer
---

Review $ARGUMENTS against the approved spec, `.specify/memory/constitution.md` and `AGENTS.md`.

Current working tree (generated when the command runs; untracked files appear only in the status list, read them directly):

!`git status --short && git diff HEAD --stat && git diff HEAD -- . ':(exclude)package-lock.json'`

Load `sdd-spec-guardrails` and any relevant project skill (`fal-deepseek-pipeline`, `prisma-leases`, `ffmpeg-media`, `story-test-harness`).

Report findings by severity with file/line references:
1. Spec drift or missing amendment.
2. Secret/egress or provider-call violations.
3. 004–008 regressions or missing tests.
4. Cost, race, lease or recovery issues, including non-transactional multi-row writes.
5. Config/docs drift: `nuxt.config.ts`, `.env.example`, README, spec status, `AGENTS.md`, skills and test counts.
6. UX dead ends, fake progress or accessibility gaps.
7. Closure readiness: spec status, docs, changelog and commit evidence.

Do not edit files and do not run the test suite. End with a clear verdict: approve, approve with follow-ups, or block.
