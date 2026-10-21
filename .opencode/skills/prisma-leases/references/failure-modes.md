# Prisma/reconciler failure checklist

- **Double submit:** condition the update on `status` + `version`; if 0 rows, re-read.
- **Lease stolen:** after claim, re-read `leaseOwner` before every provider call.
- **Crashed assembly:** keep the assembly lease at 240 s; FFmpeg timeout is 180 s.
- **Stuck active scene:** `QUEUED` with `requestId = null` and attempts already at max is a residual crash risk; surface it as failed, don't loop forever.
- **Expired story:** `GET` returns 410; cleanup deletes one hour later.
- **Foreign story:** return 404, never 403, to avoid enumeration.
- **DB down:** 503 `database-unavailable`; do not fake state.
- **Migration deploy:** use `DIRECT_URL`; runtime uses pooled `DATABASE_URL`.
- **Test isolation:** route tests use `event.context.storyRuntime`; DB smoke is opt-in.
