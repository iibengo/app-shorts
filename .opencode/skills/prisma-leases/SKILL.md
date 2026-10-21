---
name: prisma-leases
description: Use when changing PostgreSQL/Prisma persistence, Story/Scene state, repository transactions, optimistic versions, leases, the reconciler, reconnect polling or Supabase connection settings.
---

# Prisma Leases & Story State

## Read first

1. `.specify/memory/constitution.md`
2. `AGENTS.md`
3. `specs/005-story-composer/spec.md`
4. `prisma/schema.prisma`
5. `server/story/repository.ts`
6. `server/story/prisma-story-repository.ts`
7. `server/story/reconciler.ts`

## Rules

- Prisma only on the server; never in `app/`.
- Routes and UI depend on `StoryRepository`, not Prisma types.
- Create Story + Scenes in one transaction.
- Mutations use conditional `updateMany` with `status` and/or `version`.
- `updateMany` returning 0 means a conflict: return 409 or re-read; never overwrite.
- The reconciler claims with `leaseOwner` + `leaseUntil` atomically.
- Normal lease: 60 s. Assembly lease: 240 s, longer than FFmpeg's 180 s timeout.
- Release the lease in `finally`, including errors.
- `version` increments on writes and is used for optimistic concurrency.
- `DATABASE_URL` is the runtime pool; `DIRECT_URL` is for migrations and introspection.
- Supabase pooled URL: port 6543 with `?pgbouncer=true`; direct URL: port 5432.
- Run `prisma migrate dev --name init` locally and `prisma migrate deploy` in deployment.
- Never use `db push` in production or `migrate reset` outside local.
- `server/generated/` is gitignored; run `npm run db:generate` before build/test.
- Cleanup uses `expiresAt` and cascade deletes; rows are small, media is not stored in DB.

## Workflow for a new state or table

1. Change `prisma/schema.prisma` only with an approved spec.
2. Create a migration and generate the client.
3. Add repository interface methods and Prisma mapping.
4. Add service use cases and guards.
5. Extend the reconciler only if the state needs background progress.
6. Add route contracts and tests.
7. Add an opt-in DB smoke if the change is persistence-critical.

## Failure modes to check

- P2002 unique race → idempotency conflict or replay.
- P2025 record not found → 404, not 500.
- Two workers claim the same story → lease/version.
- Crash between submit and requestId persistence → accepted residual risk; keep attempts/budget.
- Pooler prepared statements → `pgbouncer=true`.
- Stale in-memory concurrency counters → count active jobs in DB.
- Decimal costs truncated by integer parsing → use decimal parsing for USD.
- `GET` with side effects → not allowed; use the reconciler.

## Verification

- `npx prisma validate`
- `npm run db:generate`
- `npm run test:run`
- `RUN_DB_SMOKE=1` only against a test database.
- Never log connection strings or SQL with user content.

## References

- `references/schema-map.md`
- `references/failure-modes.md`
