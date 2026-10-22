# Story/Scene/Shot persistence map

## Story

- `id`, `sessionId`, `status`, `premise`, `title`, `logline`
- `referenceUrl`, `referenceExpiresAt`
- `preset`, `platform`, `costMode`
- `targetDurationSeconds`, `maxDurationSeconds`, `plannedDurationSeconds`, `finalDurationSeconds`
- `shotCount`, legacy `sceneCount`/`durationSeconds` for old rows
- `planJson`
- `finalVideoUrl`, `finalVideoExpiresAt`
- `errorCode`, `errorMessage`
- `idempotencyKey`, `version`
- `leaseOwner`, `leaseUntil`
- `createdAt`, `updatedAt`, `approvedAt`, `completedAt`, `expiresAt`

## Scene

- `id`, `storyId`, `order`
- `narration`, `status`, legacy `visualPrompt` compatibility
- keyframe/video URLs, requestIds, status/response/cancel URLs and errors
- `keyframeAttempts`, `videoAttempts`
- `plannedDurationSeconds`
- timestamps

`Scene.status` is an aggregate derived from its shots via `deriveSceneStatus(shots)`; write it in the same transaction as the shot change.

## Shot (008)

- `id`, `storyId`, `sceneId`, `order`
- `durationSeconds` (2–6 s, profile-dependent)
- `framing`, `camera`, `action`, `locationId`, `visualPrompt`
- `status` (`SceneStatus`), keyframe/video provider fields
- `keyframeAttempts`, `videoAttempts`
- `approvedAt`, timestamps, `version`

## Invariants

- `Scene.order` is 1..N and unique per story; `Shot.order` is 1..N and unique per scene.
- 008 duration follows the profile: budget 15 = 2–5 s; budget 90 = exactly 6 s; standard 15 fast = 2–6 s; standard 30/45/60 = 2–5 s; production 90 fast = 2–6 s.
- `Story.plannedDurationSeconds` is the sum of shot durations and must be within `[target−1, max]`; no MP4 may exceed `max`.
- `shotCount` is derived from the persisted shots, not from `planJson`.
- `keyframeAttempts` and `videoAttempts` are 0..2; budget has one video retry and no reset.
- `WAITING_APPROVAL` requires every shot `KEYFRAME_READY`.
- `VIDEOS_READY` requires every shot `VIDEO_READY`.
- A generation attempt is persisted before the provider submit.
- Provider URLs, requestIds and prompts never leave the server.
- Legacy 007 rows with `Shot` backfill use the 008 worker; rows without shots may use the synthetic legacy shot reading path only.
