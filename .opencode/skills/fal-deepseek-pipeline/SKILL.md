---
name: fal-deepseek-pipeline
description: Use when designing or changing AI generation in AI Shorts: Fal queue jobs, signed uploads, keyframes, polling, cancellation, DeepSeek scripts/vision, rate limits or cost guards.
---

# Fal + DeepSeek Pipeline

## Read first

1. `.specify/memory/constitution.md`
2. `AGENTS.md`
3. `specs/004-composer-real/spec.md`
4. `specs/005-story-composer/spec.md`
5. `server/fal/`, `server/shared/`, `server/composer/` and `server/story/`

## Non-negotiables

- Provider calls only on the server. Never import Fal or DeepSeek code into `app/`.
- `NUXT_FAL_KEY` and `NUXT_DEEPSEEK_KEY` are private runtime config. Never log, return or bundle them.
- Reuse `server/fal/` and `server/shared/`; do not import the compatibility shims in `server/composer/` from new code.
- Never accept an endpoint, model or provider URL from the client.
- Never hold an HTTP request open for a long video job.
- Every paid route needs rate limit, idempotency, concurrency and a cost guard.
- Media and uploads need an explicit lifecycle.
- No real provider calls in CI. Real smokes are opt-in and budget-aware.

## Fal workflow

1. Resolve the model through a server-side registry or allowlist.
2. Submit through `FalQueueService`; persist `requestId`, `statusUrl`, `responseUrl` and `cancelUrl`.
3. Use the returned URLs exactly; never reconstruct queue URLs.
4. Poll with `setTimeout` chaining and backoff; support cancel and terminal states.
5. Upload references through a server-issued signed ticket. The browser performs the PUT; Nitro does not proxy user binaries.
6. Configure the reference lifecycle at the provider initiate step, not at the browser PUT.
7. Map provider errors to stable domain errors; never leak raw provider messages.
8. For vertical video, generate a 9:16 keyframe first and animate it.
9. Keep the keyframe as poster and partial-success result if the video fails.

## DeepSeek workflow

1. Use the approved model (`deepseek-flash`) and the server-side key.
2. Use `response_format: { type: "json_object" }` and explicitly ask for JSON.
3. Treat JSON mode as valid JSON, not schema compliance: validate in server code.
4. Allow one repair attempt only; then fail with a stable error.
5. Support one optional `image_url` only when the reference path is approved.
6. Use a timeout, no streaming and no raw provider errors.
7. Never log the premise, plan, prompts or narration.

## Verification

- `npm run test:run`
- `npm run build`
- No secrets in `app/`, HTML, logs or API responses.
- Contract tests with Fal/DeepSeek fixtures.
- Real-provider smoke only opt-in and with a budget.

## Stop conditions

- A client needs a provider key.
- A new provider abstraction duplicates `server/fal/`.
- A job is awaited synchronously.
- A model or endpoint comes from the client.
- A paid path has no cost/rate guard.
- A provider URL or `requestId` is exposed to the client.

## References

- `references/fal-endpoints.md`
- `references/deepseek-json.md`
