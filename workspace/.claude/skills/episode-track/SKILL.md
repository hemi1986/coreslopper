---
name: episode-track
description: Use when an episode's takes exist and it needs timing.json and its mixed audio, or after a timing override, a pause change, or a new take that must move sound and picture together.
license: MIT
---

# Episode Track

Stage `episode-track` of an episode project. It is deterministic and uses no speech recognition: it places the takes one after another, writes `timing.json`, and mixes `audio/episode.wav` plus one speaker stem per character from the **effective timing**. The episode track takes the place of the song; anchors, coverage, and the storyboard work on it unchanged.

## Inputs

- `script.yaml` — scenes become sections, script lines become lines, in playing order.
- `takes.json` and `audio/lines/*.wav`, `audio/ambience/*.wav` from `voice-track`; every take must be current.
- `timing.overrides.json` — user-owned; read, never written.
- Optional `audio/music.wav`, laid under the whole episode.

## Process

1. Run `npm run cli -- episode-track projects/<slug>`. After the clips exist, `sfx` takes whose action is on screen are replaced by the clips' own sound with `npm run cli -- clip-audio projects/<slug> --line <id>` (see `ai-clips`); run `episode-track` again after that.
2. Read the summary: each speech take's measured loudness and applied gain, then duration, scene and line counts, and the speaker stems written. A gain beyond about ±10 dB points at a take recorded far off level; replace it if it sounds wrong.
3. Validate: `npm run cli -- validate projects/<slug>`. It checks that the timing matches the script and resolves the storyboard against it.
4. Mark the stage: `npm run cli -- stage-done <project> episode-track --outputs timing.json,audio/episode.wav`.

## How the timing is built

- A spoken line lasts as long as its take; an `sfx` or `pause` line as long as its `duration`; a `chat` line its characters divided by `chat.cps`, plus `chat.hold`.
- `pause_after` is silence before the next line. Scenes cover the episode from 0 without gaps; the last scene ends after the last line's pause.
- `bpm` is absent and `beats`, `downbeats`, and `onsets` stay empty, so storyboard anchors use sections and lines. `energy` is the RMS envelope of the finished mix.

## How the mix is levelled

- Every speech take (`dialogue`, `voiceover`, `announcement`) is mixed at the gain that brings its integrated loudness to `render.speech_lufs` in `config/defaults.yaml`; a silent take keeps gain 1. The speaker stems carry the same gains.
- `sfx` takes, ambience, and `audio/music.wav` keep their own levels.
- The gain lives only in the mix: take files and `takes.json` stay as they are, so a take stays `current` and a generated take stays generated. A take never needs levelling by hand.
- The finished mix is levelled to `render.loudness_lufs` last.

## Re-timing

Re-timing an episode means changing the script or an override and running this stage again; takes come from the cache, so it is cheap.

- Longer or shorter gaps: change `pause_after` in `script.yaml`.
- A single line or scene at another time: add it to `timing.overrides.json`. The mix follows the effective timing, so the sound moves with the picture.
- A different reading: replace the take (`voice-track`, or a recording plus `import-takes`).

## Completion criteria

- `timing.json` validates, its sections and lines match `script.yaml`, and `validate` passes.
- `audio/episode.wav` lasts exactly the timing's duration at the project loudness target; each speaker with spoken lines has `audio/stems/<character>.wav` of the same length.
- `timing.overrides.json` was not overwritten.

## Hard stops

A missing, stale, replaced, or unregistered take stops the stage with the list of affected lines. Run `voice-track` (or `import-takes`) and try again; a stale imported take needs the user.
