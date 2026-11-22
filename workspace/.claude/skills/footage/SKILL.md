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

## Pose tracks

A reference clip can also be a **motion source** only: a cut-out figure moves like the person in it, and no frame or sound of the clip reaches the video. Then do not import the clip as footage; extract a pose track:

```bash
npm run cli -- pose-extract projects/<slug> --input assets/references/<clip>.mp4 --name <id> \
  --from 0:12 --to 0:26 --person largest --preview
```

1. Pick one continuous shot of the source per track (`--from`/`--to`, seconds or m:ss). The report lists camera cuts; a cut inside the window makes the figure jump.
2. `--person` picks who: `largest` (default), `center`, or `n`, the n-th person from the left. The report warns when several people are in frame or the person was re-acquired.
3. Read the report: detection rate (aim for 90 % or more), mean confidence per limb (a limb under 0.35 is out of frame or hidden; the rig should hold it still), gaps, jitter before and after smoothing.
4. Look at `assets/poses/<id>.preview.mp4`, the skeleton over the source beside the skeleton alone, at three moments or more (`npm run cli -- frame projects/<slug> --input <preview> --at <s>`): the skeleton must follow the arms and legs. The preview is for review only; never put it or the source clip in a shot.
5. The track lands in `assets/poses/<id>.json`; the motion component that plays it samples it as in the `remotion-motion` skill.

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
