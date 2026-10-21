---
description: Review current changes against the approved spec, security and regression gates
agent: reviewer
---

Review $ARGUMENTS against the approved spec, `.specify/memory/constitution.md` and `AGENTS.md`.

Load `sdd-spec-guardrails` and any relevant project skill (`fal-deepseek-pipeline`, `prisma-leases`, `ffmpeg-media`, `story-test-harness`).

Report findings by severity with file/line references:
1. Spec drift or missing amendment.
2. Secret/egress or provider-call violations.
3. 004 regressions or missing tests.
4. Cost, race, lease or recovery issues.
5. UX dead ends, fake progress or accessibility gaps.

Do not edit files. End with a clear verdict: approve, approve with follow-ups, or block.
