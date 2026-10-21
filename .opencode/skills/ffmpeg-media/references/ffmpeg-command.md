# FFmpeg command reference

## Normalize one clip

```bash
ffmpeg -nostdin -y -i input.mp4 -t 6 \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=6" \
  -an -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p \
  -map_metadata -1 -movflags +faststart output.mp4
```

## Concatenate

```text
file 'scene-1.mp4'
file 'scene-2.mp4'
...
```

```bash
ffmpeg -nostdin -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart story-final.mp4
```

## Probe

```bash
ffprobe -v error -print_format json -show_streams -show_format story-final.mp4
```

Check: one video stream, no audio/subtitle streams, h264, 720×1280, yuv420p, 30 fps, duration = `sceneCount * 6` ± 0.3 s.
