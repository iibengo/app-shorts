---
name: story-test-harness
description: Use when adding or changing tests for AI Shorts Story, Prisma routes, provider stubs, the reconciler, reconnection, FFmpeg fakes or 004 regression.
---

# Story Test Harness

## Read first

1. `specs/005-story-composer/spec.md` (Test Plan)
2. `tests/helpers/story-runtime.ts`
3. `tests/helpers/story-route.ts`
4. `tests/helpers/story.ts`
5. `tests/fixtures/deepseek/`
6. `tests/fixtures/fal/`

## Test matrix

- Unit: models, data, utils, director, plan validator, repository, cost, rate limit, session, orchestrators, reconciler, FFmpeg command, downloader, media storage.
- Routes: create/get/uploads/keyframe/approve/retry/assemble/cancel, status codes, ownership, idempotency, rate limits and no leaks.
- Components: copy, testids, focus, ARIA, 44 px, reduced motion and forced colors.
- Acceptance: SSR `/story` and `/story/[id]`, no DB/fetch in SSR, reconnection and PWA.
- Regression: 613 tests of 004 must stay green.
- Opt-in: `RUN_DB_SMOKE=1`, `RUN_FFMPEG_SMOKE=1`, `RUN_STORY_SMOKE=1`.

## Rules

- Inject `event.context.storyRuntime` with fakes; do not require PostgreSQL for normal route tests.
- Stub DeepSeek/Fal over local HTTP; never call real providers.
- Use fake timers for polling and backoff.
- Do not weaken production allowlists to make tests pass.
- Do not modify 004 tests to fit Story.
- Every new runtime file needs coverage, except type-only files.
- Never claim a real-provider smoke ran if it was skipped.

## Gate

```bash
npm run db:generate
npx prisma validate
npm run test:run
npm run build
```

Report exact passed/failed/skipped counts.

## References

- `references/test-matrix.md`
