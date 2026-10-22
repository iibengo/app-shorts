---
name: ffmpeg-media
description: Use when downloading, normalizing, concatenating, probing or uploading generated video in AI Shorts, especially Story assembly and final MP4 delivery.
---

# FFmpeg Media Assembly

## Read first

1. `specs/005-story-composer/spec.md`
2. `specs/008-tiktok-reel-engine/spec.md`
3. `server/story/shot-assembly-service.ts`
4. `server/story/assembly-service.ts`
5. `server/story/ffmpeg-runner.ts`
6. `server/story/media-downloader.ts`
7. `server/fal/media-storage.ts`

## Non-negotiables

- Use system `ffmpeg`/`ffprobe` via `FFMPEG_PATH`/`FFPROBE_PATH`; fail with `ffmpeg-not-configured` if missing.
- Node long-running only; not edge/serverless.
- Use `spawn` with an argument array, `shell: false`, `-nostdin`, and a unique `cwd` temp directory.
- Never interpolate user text into shell or arguments.
- Download only allowlisted Fal CDN URLs, with `redirect: 'error'`, 60 s timeout, 300 MB per clip and 1.5 GB per story.
- Clean the temp directory in `finally`, including errors and timeouts.
- Normalize each 008 shot to its **planned duration** (2–6 s), 720×1280, 30 fps, `yuv420p`, `libx264`, `-an`, `faststart`.
- Do not use a fixed 6.0 s for every clip. Do not use `tpad` to hide a short clip; trim or fail.
- Concatenate with hard cuts only; no transitions.
- Verify each normalized shot with `ffprobe`: resolution, fps, codec, pixel format, duration ±0.1 s and no audio/subtitle streams.
- Verify the final MP4: 720×1280, 30 fps, expected total duration within the profile target/max, and no audio until 009 explicitly adds it.
- Upload the final MP4 to Fal CDN with `video/mp4` and a 24 h lifecycle; never store the binary in PostgreSQL.
- Kill with `SIGKILL` on timeout; assembly timeout is 420 s and the assembly lease is 480 s.
- 009 adds voice/music/captions **after** video assembly. Do not add audio to per-shot intermediates or reuse the 008 no-audio check unchanged.

## Workflow

1. Validate all clip URLs against the CDN allowlist.
2. Download sequentially to the temp directory.
3. Normalize each shot to its planned duration; delete the source after success.
4. Write a server-generated concat list ordered by `Shot.order` (`shot-1.mp4`…`shot-N.mp4`).
5. Concatenate with `-c copy` only after normalization.
6. Probe and validate every shot and the final file.
7. Upload to Fal CDN; persist only URL and expiry.
8. Cleanup.

## Verification

- Unit tests for exact args and safety.
- `RUN_FFMPEG_SMOKE=1` with synthetic clips only.
- No provider clips in CI.

## References

- `references/ffmpeg-command.md`
