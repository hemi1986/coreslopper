# Review player

A frame-accurate player for coreslopper renders. Play a preview with its audio, stop on a frame, type what is wrong, and press Enter: the note is saved with its frame and time. An agent reads the notes later and turns them into fixes.

```bash
npm run cli -- review projects/my-video                 # newer of preview-<master>.mp4 and <master>.mp4
npm run cli -- review projects/my-video --format 9x16
npm run cli -- review projects/my-video --video projects/my-video/renders/shorts/M2-chorus-9x16.mp4
```

The first start creates the uv environment (PyAV, pygame-ce, sounddevice, NumPy). Without the CLI:

```bash
cd scripts/review-player
uv run python review_player.py <video> [--notes <file>] [--frame <n>]
```

Without a video argument a file dialog opens.

## Keys

| Key | Action |
|---|---|
| Space | Play / pause (while typing: a space) |
| ← / → | Previous / next frame (paused) |
| ↑ / ↓ | One second forward / back (paused) |
| PageUp / PageDown | Previous / next note |
| Type + Enter | Save a note on the current frame |
| Delete | Remove the last note on the current frame |
| Backspace | Delete the last character |
| Esc | Discard the input, or quit |

## Notes

The notes of a render are in `review/notes/<video-stem>.json`, in the project even when `renders/` is linked to a media drive. Outside a project they are written next to the video. Every change is saved at once.

```json
{
  "video": "preview-16x9.mp4",
  "fps": 30.0,
  "notes": [
    { "frame": 662, "seconds": 22.067, "time": "00:22.067", "text": "eyes look unnatural; re-render the still" }
  ]
}
```

Frames refer to the reviewed file. A Short starts at its own frame 0, not at the song's.

## Tests

```bash
uv run pytest -q   # pure note helpers; no display or audio device needed
```
