---
description: Close a validated spec, synchronize status/docs and prepare a commit proposal
agent: ionias
---

Close the validated specification or change: $ARGUMENTS

Do not commit automatically. Do not invent test results or real-provider smokes.

1. Read `.specify/memory/constitution.md`, `AGENTS.md`, the spec, README, affected skills and the current diff.
2. Verify the final gate reported by the tester or run it once:
   - `npm run test:run`
   - `npm run build`
   - `npx prisma validate`
   - `npx prisma migrate status` when persistence changed
3. Update:
   - Spec status to `Implemented` or `Validated`, with date, commit, exact counts and known deviations.
   - `AGENTS.md` current state, test counts, open gates and next spec.
   - README and `.env.example`/`nuxt.config.ts` defaults that changed.
   - Affected project skills and the changelog.
   - Historical test counts or defaults that would otherwise become stale.
4. Confirm:
   - No 004–008 regression and no unrelated product files.
   - No secrets, provider keys, signed URLs or prompts in client/docs/tests.
   - Skipped tests and real-provider smoke status are explicit.
   - `legacy` or compatibility paths have an owner and removal condition.
5. Run `git status --short`, `git diff --stat` and `git diff --check`.
6. Present a commit proposal with the exact files, gate results and known limitations. Stop and wait for explicit human approval.
