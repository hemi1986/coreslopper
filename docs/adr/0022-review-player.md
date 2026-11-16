# A review player for frame-accurate notes on renders

## Status

Accepted — 2026-11-16. Extends [ADR 0002](0002-autonomous-pipeline.md).

## Context

The pipeline has no creative approval gates, but the user still watches the preview and wants changes: a cut lands a beat early, a face drifts, a sign needs text. Written as chat messages, those requests lose the exact moment ("around the second chorus"), and the agent has to guess the shot. A video player shows a timecode, but copying it by hand is slow and error-prone at 30 fps.

## Decision

- **A small desktop player in `scripts/review-player/`** (Python, uv, PyAV, pygame-ce, sounddevice): plays a render with its audio, steps frame by frame, and saves a typed note on the current frame with Enter.
- **Notes are files**, `review/notes/<video-stem>.json`: video name, fps, and per note frame, seconds, `mm:ss.mmm`, and text. They are written atomically after every change and stay in the project when `renders/` is linked to a media drive.
- **`npm run cli -- review <project>`** opens the newer of `renders/preview-<format>.mp4` and `renders/<format>.mp4`, or `--video <file>`.
- **The player stays outside the pipeline.** No stage waits for notes. When the user asks for a fix pass, the `assembly-render` skill maps each note's time to a shot through the storyboard and the effective timing.

## Alternatives considered

- **A Remotion Studio or browser page.** Remotion Studio previews compositions, not finished renders, and a browser page needs a server and loses frame accuracy on seeking. PyAV decodes exactly the frame on screen.
- **A stock player plus a text file.** No frame numbers, and the time has to be read off and typed by hand.
- **Notes in `state.json` or the storyboard.** Notes are user feedback on one file, not pipeline state, and a storyboard edit would trigger validation for free text.

## Consequences

- The review player brings its own uv environment with native wheels (FFmpeg in PyAV, SDL, PortAudio); `uv run` installs it on first use.
- It needs a display and an audio device, so only the pure note helpers are tested on CI.
- Frames refer to the reviewed file: notes on a Short or a partial `--frames` render must be offset before they are mapped to the song.
