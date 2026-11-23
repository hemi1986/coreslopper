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
- A review round is open (`status` prints a `Review:` line), or the user asks for a fix pass on notes in `review/notes/`.

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

## Review rounds

The user reviews renders in the board's review view and sends notes to the agent in **review rounds**. A round is `review/rounds/<NNN>.json`, frozen when sent: the reviewed `video` and its `fps`, and per note an `id`, `frame`, `seconds`, an optional range (`end_frame`, `end_seconds`), the `shots` on screen, the `section`, and the `text`.

A fix pass:

1. Read the round (or, for notes asked for in chat, every notes file whose `video` is a current render). Frames and seconds refer to that file; offset a Short or a `--frames` render to the song time before mapping.
2. Take each note's shots from `shots`; for a note without them, map its `seconds` through `storyboard.yaml` and `timing.effective.json`. A note on a cut belongs to both shots.
3. Sort the notes into timing (anchors in `storyboard.yaml`, never `timing.overrides.json`), motion or text (Remotion components), and generated media (a new batch through `ai-clips`, with its cost estimate). Notes that ask for a provider ("Higgsfield if needed") set the `--provider` of that batch.
4. Fix, re-render only the affected range with `--frames <start>-<end>` first, then the preview.
5. Answer the round in `review/rounds/<NNN>.replies.json`, one reply per note `id`:

   ```json
   { "version": 1, "round": 2, "answered_at": "<ISO time>", "render": "preview-16x9.mp4",
     "notes": [{ "id": "n3fa2c1d0", "status": "fixed", "reply": "Moved the cut to the downbeat at 1:12.40." }] }
   ```

   `status` is `fixed`, `partly`, `not-fixed` (say why), or `question` (say what the user decides); `render` is the render that shows the fixes. The hook checks that every note of the round has a reply. For notes asked for in chat, report the same in your summary.

The round and notes files are the user's: read them, write only the replies file. Done when every note has a reply, the replies file validates, and the preview shows the fixes.

## Episodes

- The master format is `formats.master` in `project.yaml` (usually 9:16 for a series); `render` without `--format` renders it, as `renders/<format>.mp4`. Every step above applies with that format in place of 16x9.
- The audio is the episode track `audio/episode.wav` from `episode-track`. Re-timing means running `episode-track` again, never editing the audio.
- Render the burned-in English version after the master: `npm run cli -- render projects/<slug> --subtitles en` writes `renders/<format>.en.mp4`, with the subtitles inside the format's safe area.
- Check every `ChatWindow` shot in the preview: the message types itself out and stays readable at the format's size.
- Record `renders/preview-<format>.mp4` with `stage-done ... assembly`.

## Memes

- The master is the meme's one format, 9:16 (`renders/9x16.mp4`); every step above applies with that format.
- The render burns in the meme's German subtitles from `subtitles` in `project.yaml` (`de` by default, `off` for none). Do not render a separate `.en.mp4`: English subtitles for a meme are out of scope.

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
