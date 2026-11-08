---
name: footage
description: Use when importing real footage, trimming a clip, normalizing resolution and frame rate, creating proxies, or mixing footage with motion and AI layers.
license: MIT
---

# Footage

## When to use

- A storyboard shot uses `source: footage` or a mixed shot has a footage layer.
- The user supplies a real clip that needs trimming, scaling, or a proxy.
- A footage clip has the wrong frame rate, resolution, or codec.

## Inputs

- The source clip and its license/provenance.
- `storyboard.yaml`, `style.yaml`, `timing.effective.json`
- `ffmpeg` and `ffprobe` on `PATH`
- `docs/glossary.md`

## Process

1. Confirm the license and provenance of the clip. If it is not cleared for the project, stop.
2. Record the source in `song.json`? No: use the project's `assets/footage/<name>.source.md` with URL, author, license, and download date.
3. Normalize to the master format: 1920×1080 (or the project's master), 30 fps, `yuv420p`, H.264, no audio. Example:
   ```bash
   ffmpeg -i input.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30" \
     -an -c:v libx264 -crf 18 -pix_fmt yuv420p assets/footage/name.mp4
   ```
4. Trim the clip to the shot's symbolic start/end. Prefer a clean in/out that leaves room for a transition.
5. Store the normalized clip in `projects/<slug>/assets/footage/`, not in git. Keep the source file outside the repo or in a gitignored folder.
6. Set `asset` on the footage shot or the footage layer. Re-run `npm run cli -- validate projects/<slug>`.
7. Check the first, middle, and last frame of the shot in the render; the clip must not fight the song's cut points.

## Completion criteria

- The proxy is 1080p/30 fps, yuv420p, silent, and playable.
- The source and license are recorded.
- The storyboard resolves and the shot covers its anchors.
- The render shows no letterboxing, frame-rate judder, or audio bleed.
- No source footage is committed to the open-source repo.

## Common failures

- Using a clip with burned-in text or a watermark.
- Forgetting `-an`, so the footage's audio fights the song.
- Cropping a 4:3 clip to 16:9 without checking the subject.
- Losing the license information.
