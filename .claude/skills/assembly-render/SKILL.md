---
name: assembly-render
description: Use when assembling the song timeline in Remotion, rendering a preview or master, adding derivative formats, and checking sync before export.
license: MIT
---

# Assembly & Render

## When to use

- The storyboard is validated and all required assets exist.
- The user asks for a preview, a master, or a 9:16/1:1 derivative.
- A render needs to be resumed after a fix.

## Inputs

- `storyboard.yaml`, `timing.effective.json`, `style.yaml`, `characters.yaml`
- `audio/song.wav` and generated assets
- `packages/remotion` and `packages/cli`
- `docs/glossary.md`

## Process

1. Run `npm run cli -- validate projects/<slug>` and ensure it passes.
2. Render a half-scale preview:
   `npm run cli -- render projects/<slug> --format 16x9 --preview`
3. Inspect the preview at section boundaries, the first and last frame, and every text-heavy shot. Check sync, legibility, and safe areas.
4. If the audio is not normalized, normalize it once to −14 LUFS integrated / −1 dBTP true peak and replace `audio/song.wav`. Do not normalize per render.
5. Render the master:
   `npm run cli -- render projects/<slug> --format 16x9`
6. Render 9:16 and 1:1 only after the master passes. The layouts must be designed for those formats, not naive crops.
   Media layers fill the frame with `cover`, so a 16:9 source loses its sides in 9:16 and 1:1. Before the full render, render one still per shot in the derivative format (`npm run cli -- render <project> --format 9x16 --still <frame> --still-scale 0.5`) and look for a lost subject: a face at the edge, or a mirror reflection out of frame. For each such shot, set `focus: { x: <0–1> }` in `storyboard.yaml` (0 = left edge, 1 = right edge of the source) so that the crop keeps the subject in view. `focus` changes nothing in the master because the source is not cropped there.
   The render runs in segments and resumes from the last finished segment if it is interrupted. Use `--frames <start>-<end>` for a quick test render of one passage.
7. Update the state with `npm run cli -- stage-done <project> assembly --outputs renders/preview-16x9.mp4`.
8. Hand off to `video-qa` for the final report.

## Episodes

- The master format is `formats.master` in `project.yaml` (usually 9:16 for a series); `render` without `--format` renders it, as `renders/<format>.mp4`. Every step above applies with that format in place of 16x9.
- The audio is the episode track `audio/episode.wav` from `episode-track`. Re-timing means running `episode-track` again, never editing the audio.
- Render the burned-in English version after the master: `npm run cli -- render projects/<slug> --subtitles en` writes `renders/<format>.en.mp4`, with the subtitles inside the format's safe area.
- Check every `ChatWindow` shot in the preview: the message types itself out and stays readable at the format's size.
- Record `renders/preview-<format>.mp4` with `stage-done ... assembly`.

## Completion criteria

- The preview exists and plays with the song.
- The master is 1920×1080, 30 fps, H.264, with audio.
- All shots appear on the timeline at the expected times.
- No text is clipped at 16:9, 9:16, or 1:1.
- The state records the render outputs.

## Common failures

- Rendering a derivative by cropping the 16:9 master.
- Rendering before validation, so a missing shot silently becomes a placeholder.
- Normalizing audio on every render, which makes comparisons meaningless.
- Running several full renders at once; render formats one after another.
- Forgetting to mute AI clips or footage that carry their own audio.
