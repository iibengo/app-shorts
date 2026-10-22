# Test matrix and commands

## Default gate

```bash
npm run db:generate
npx prisma validate
npm run test:run
npm run build
```

## Current baseline

- 004: 605 reproducible tests, must stay green. The historical 613 count is not reproducible with the current tree.
- Story: unit, route, component and acceptance tests.
- Default skips: DB smoke, FFmpeg smoke, E2E smoke.

## Opt-in

- `RUN_DB_SMOKE=1` + `DATABASE_URL_TEST`: real PostgreSQL migrations/CRUD/claim/cancel.
- `RUN_FFMPEG_SMOKE=1`: synthetic color clips, normalize/concat/probe.
- `RUN_STORY_SMOKE=1` + real keys + DB + FFmpeg: full story; never in CI.

## Fakes

- `story-runtime.ts`: runtime injection.
- `story-route.ts`: H3 event + `event.context.storyRuntime`.
- `story.ts`: fake repository/director/orchestrators/assembler.
- `deepseek-stub.ts`: local HTTP DeepSeek.
- Reuse Fal fixtures from 004.

## Common failures

- Fake timers do not flush the prompt watcher before submit.
- `crypto.randomUUID` / `Date.now` used in SSR.
- Route test accidentally calls DeepSeek/Fal.
- Test weakens a production allowlist.
- Story test modifies a 004 assertion instead of adding a regression.
