# Prisma/reconciler failure checklist

- **Double submit:** condition the update on `status` + `version`; if 0 rows, re-read.
- **Lease stolen:** after claim, re-read `leaseOwner` before every provider call.
- **Crashed assembly:** keep the assembly lease at 480 s; FFmpeg total timeout is 420 s.
- **Stuck active shot/scene:** `QUEUED` with `requestId = null` and attempts already at max is a residual crash risk; surface it as failed, don't loop forever.
- **Scene/shot divergence:** derive `Scene.status` from its shots and write both in the same transaction; never leave a scene READY with a failed shot.
- **Batch story→shot writes:** use one transaction; a partial write must roll back or be reconciled, not silently accepted.
- **Expired story:** `GET` returns 410; cleanup deletes one hour later.
- **Foreign story:** return 404, never 403, to avoid enumeration.
- **DB down:** 503 `database-unavailable`; do not fake state.
- **Migration deploy:** use `DIRECT_URL`; runtime uses pooled `DATABASE_URL`.
- **Test isolation:** route tests use `event.context.storyRuntime`; DB smoke is opt-in.
