# FFmpeg command reference

## Normalize one clip

```bash
DURATION=4  # Shot.durationSeconds, 2–6 s
ffmpeg -nostdin -y -i input.mp4 -t "$DURATION" \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30" \
  -an -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p \
  -map_metadata -1 -movflags +faststart output.mp4
```

Do not use `tpad` to hide a clip shorter than its planned duration. Trim longer provider output; fail a short or unprobeable clip.

## Concatenate

```text
file 'shot-1.mp4'
file 'shot-2.mp4'
...
```

```bash
ffmpeg -nostdin -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart story-final.mp4
```

## Probe

```bash
ffprobe -v error -print_format json -show_streams -show_format story-final.mp4
```

Check every shot and the final file: one video stream, no audio/subtitle streams until 009, h264, 720×1280, yuv420p, 30 fps. Each shot duration is its planned `durationSeconds` ± 0.1 s; the final duration is the sum of shots and must stay within the profile target/max.
