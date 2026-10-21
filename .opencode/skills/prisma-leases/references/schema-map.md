# Story/Scene persistence map

## Story

- `id`, `sessionId`, `status`, `premise`, `title`, `logline`
- `referenceUrl`, `referenceExpiresAt`
- `preset`, `sceneCount`, `durationSeconds`, `aspectRatio`
- `planJson`
- `finalVideoUrl`, `finalVideoExpiresAt`
- `errorCode`, `errorMessage`
- `idempotencyKey`, `version`
- `leaseOwner`, `leaseUntil`
- `createdAt`, `updatedAt`, `approvedAt`, `completedAt`, `expiresAt`

## Scene

- `id`, `storyId`, `order`
- `visualPrompt`, `narration`, `status`
- keyframe URL/requestId/statusUrl/responseUrl/cancelUrl/error
- video URL/requestId/statusUrl/responseUrl/cancelUrl/error
- `keyframeAttempts`, `videoAttempts`
- timestamps

## Invariants

- `Story.sceneCount` is 4, 5 or 6.
- `Scene.order` is 1..N and unique per story.
- `Story.durationSeconds = 6`; total = `sceneCount * 6`.
- `keyframeAttempts` and `videoAttempts` are 0..2.
- `WAITING_APPROVAL` requires every scene `KEYFRAME_READY`.
- `VIDEOS_READY` requires every scene `VIDEO_READY`.
- A generation attempt is persisted before the provider submit.
- Provider URLs and requestIds never leave the server.
