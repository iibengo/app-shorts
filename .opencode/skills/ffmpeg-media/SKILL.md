---
name: ffmpeg-media
description: Use when downloading, normalizing, concatenating, probing or uploading generated video in AI Shorts, especially Story assembly and final MP4 delivery.
---

# FFmpeg Media Assembly

## Read first

1. `specs/005-story-composer/spec.md`
2. `server/story/assembly-service.ts`
3. `server/story/ffmpeg-runner.ts`
4. `server/story/media-downloader.ts`
5. `server/fal/media-storage.ts`

## Non-negotiables

- Use system `ffmpeg`/`ffprobe` via `FFMPEG_PATH`/`FFPROBE_PATH`; fail with `ffmpeg-not-configured` if missing.
- Node long-running only; not edge/serverless.
- Use `spawn` with an argument array, `shell: false`, `-nostdin`, and a unique `cwd` temp directory.
- Never interpolate user text into shell or arguments.
- Download only allowlisted Fal CDN URLs, with `redirect: 'error'`, 60 s timeout, 300 MB per clip and 1.5 GB per story.
- Clean the temp directory in `finally`, including errors and timeouts.
- Normalize to 720×1280, 30 fps, `yuv420p`, 6.0 s, `libx264`, `-an`, `faststart`.
- Concatenate with hard cuts only; no transitions.
- Verify with `ffprobe`: resolution, fps, codec, pixel format, duration ±0.3 s and zero audio/subtitle streams.
- Upload the final MP4 to Fal CDN with `video/mp4` and a 24 h lifecycle; never store the binary in PostgreSQL.
- Kill with `SIGKILL` on timeout and cap stderr/stdout.

## Workflow

1. Validate all clip URLs against the CDN allowlist.
2. Download sequentially to the temp directory.
3. Normalize each clip; delete the source after success.
4. Write a server-generated concat list (`scene-1.mp4`…`scene-6.mp4`).
5. Concatenate with `-c copy` only after normalization.
6. Probe and validate the final file.
7. Upload to Fal CDN; persist only URL and expiry.
8. Cleanup.

## Verification

- Unit tests for exact args and safety.
- `RUN_FFMPEG_SMOKE=1` with synthetic clips only.
- No provider clips in CI.

## References

- `references/ffmpeg-command.md`
