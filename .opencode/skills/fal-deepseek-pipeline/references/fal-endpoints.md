# Fal endpoints already used by AI Shorts

## Queue

- Submit: `POST https://queue.fal.run/{endpointId}`
- Status/result/cancel: use the `status_url`, `response_url` and `cancel_url` returned by the submit.
- Never reconstruct those URLs; a URL with the full endpoint path returns 405.
- Status values: `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`.
- Poll with `setTimeout` and backoff; do not use `setInterval`.

## Storage

- Initiate: `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3`
- Body: `{ "content_type": "...", "file_name": "..." }`
- Lifecycle header on initiate: `X-Fal-Object-Lifecycle: {"expiration_duration_seconds":3600}`
- Response: `upload_url` and `file_url`.
- Browser reference upload: direct `PUT` to `upload_url` with the returned headers, without `Authorization`.
- Final server-side MP4 upload: same client, `video/mp4`, lifecycle 86400, no `Authorization` on the signed PUT.

## Keyframes

- `fal-ai/flux/dev`: text-to-image, 1152×2048, JPEG, safety checker.
- `fal-ai/flux-pro/kontext`: one reference image, `aspect_ratio: "9:16"`, JPEG, safety tolerance.

## Videos

- `fal-ai/minimax/hailuo-02/standard/image-to-video`: 6 s, 768P, `prompt_optimizer: false`.
- `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`: 10 s native, trimmed to 6 s by FFmpeg.
- Both accept `image_url` + `prompt`; neither accepts video references in this project.

## Error mapping

- 400/422: `provider-rejected` unless the payload indicates policy/NSFW → `content-blocked`.
- 401/403: `ai-unavailable` or `provider-error`; never expose 401/403 to the client.
- 402: `provider-error` or `ai-credits-exhausted` at the boundary; no raw credit details.
- 429: `provider-busy` with `Retry-After` when available.
- 5xx: `provider-error`; timeout: `provider-timeout`.
