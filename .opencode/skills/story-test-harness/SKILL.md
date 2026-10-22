---
name: story-test-harness
description: Use when adding or changing tests for AI Shorts Story, Prisma routes, provider stubs, the reconciler, reconnection, FFmpeg fakes or 004 regression.
---

# Story Test Harness

## Read first

1. `specs/005-story-composer/spec.md` (Test Plan)
2. `specs/008-tiktok-reel-engine/spec.md` (Test Plan)
3. `tests/helpers/story-runtime.ts`
4. `tests/helpers/story-route.ts`
5. `tests/helpers/story.ts`
6. `tests/fixtures/deepseek/`
7. `tests/fixtures/fal/`

## Test matrix

- Unit: models, data, utils, directors, plan validator, duration rules, repository, reel repository, cost, rate limit, session, orchestrators, reconciler, FFmpeg command, downloader, media storage.
- Routes: create/get/uploads/keyframe/approve/retry/assemble/cancel, per-shot keyframe/retry/recover, scene batch operations, status codes, ownership, idempotency, rate limits and no leaks.
- Components: copy, testids, focus, ARIA, 44 px, reduced motion, forced colors, shot review/progress/QC/result and legacy read-only states.
- Acceptance: SSR `/story` and `/story/[id]`, 007 legacy with and without shots, no DB/fetch in SSR, reconnection and PWA.
- Regression: 004–008 contracts. The current 004 suite is 605 tests; the historical 613 count is not reproducible and must be reported as historical.
- Opt-in: `RUN_DB_SMOKE=1`, `RUN_FFMPEG_SMOKE=1`, `RUN_STORY_SMOKE=1`.

## Rules

- Inject `event.context.storyRuntime` with fakes; do not require PostgreSQL for normal route tests.
- Stub DeepSeek/Fal over local HTTP; never call real providers.
- Use fake timers for polling and backoff.
- Do not weaken production allowlists to make tests pass.
- Do not modify 004 tests to fit Story.
- Every new runtime file needs coverage, except type-only files.
- Never claim a real-provider smoke ran if it was skipped.
- Developer runs targeted tests; Tester owns the full suite. Do not run `npm run test:run` after every edit.
- Do not weaken assertions, skip tests or add a production-only escape hatch to make the gate pass.

## Gate

```bash
npm run db:generate
npx prisma validate
npm run test:run
npm run build
```

For local CPU headroom, use `npm run test:run:low`; it does not replace the default final gate. Report exact passed/failed/skipped counts.

## References

- `references/test-matrix.md`
