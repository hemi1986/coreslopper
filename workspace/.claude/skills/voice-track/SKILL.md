---
name: voice-track
description: Use when an episode or a meme needs its takes and ambience — generating speech and effects for script lines, copying a meme's library sounds, registering the user's own recordings, or redoing takes after a script change.
license: MIT
---

# Voice Track

Stage `voice-track` of an episode or a meme. It produces one **take** per audible script line (`dialogue`, `voiceover`, `announcement`, `sfx`) and one **ambience** per scene with an `atmo` prompt. Chat and pause lines are silent and have no take. Timing and the mix belong to the next stage, `episode-track`.

## Inputs

- `script.yaml` — the authoritative text; validated against the canon before anything runs.
- The series canon: each speaker's reference voice (`voice.ref`, `voice.transcript` in `projects/<series>/characters.yaml`).
- `takes.json` — the take registry: source (`generated`, `imported`, or `library:<id>`), duration, text hash, file hash.
- A meme's library sounds: a sound line with `sound: <id>` names `library/sounds/<id>/`.
- User recordings in `audio/lines/<line-id>.wav` (or `.mp3`, `.flac`, …).

## Process

1. Register user recordings first, so they are never generated over:
   `npm run cli -- import-takes projects/<slug>` (optionally `--lines l01,l04`). Other formats are converted to a 48 kHz mono WAV next to them.
2. Estimate: `npm run cli -- voice-track projects/<slug> --dry-run`. It lists the takes to generate and checks them against the project budget and batch cap.
3. Generate: `npm run cli -- voice-track projects/<slug>`. Lines with a current take are skipped; a sound line naming a library sound gets the trimmed sound copied as its take, at no cost; speech goes through `audio.voice` with the speaker's reference voice, effects and ambience through `audio.sfx`, all with cache and manifest.
4. Read the summary line: `takes.json: <n> take(s), <m> ambience(s)` must count every audible line and every scene with `atmo`.
5. Mark the stage: `npm run cli -- stage-done <project> voice-track --outputs takes.json`.

## Hard stops

The command lists every blocking take and generates nothing until all are resolved. Each is a hard stop for the autonomous pipeline; report it and stop:

- A take file is not the registered one (`replaced`/`unregistered`): the user swapped or added a recording. The user runs `import-takes`, or deletes the file to have it generated.
- An imported take is stale (its line's text changed): the user records it again and imports it, or deletes it.
- A sound line names a library sound that is not in the library and the line has no take of it: the user adds the sound (`sound add`), or the script names another one.
- A speaker has no reference voice: add `voice` to the canon, or import a recording.
- An effect is longer than `maxDuration` of `audio.sfx` for the selected provider.
- Budget or credentials, as for every paid batch.

## Completion criteria

- Every audible script line has a `current` take in `takes.json`; every scene with `atmo` has an ambience.
- No imported take was overwritten.
- Spend is recorded in `state.json` and every generation is in `assets/manifest.jsonl`.

## Notes

- A take is stale when its text hash changes: the speaker or `text_de` of a spoken line, the prompt or `duration` of an effect, or the file or trim of a library sound. A stale library take is copied again.
- A library sound removed after the meme took it keeps its take; the run warns and goes on. Only stale and missing takes are generated again; everything else comes from the cache.
- Ambience is generated as long as its scene on the first run; the mix loops or trims it, so later re-timing keeps it.
- Spoken `text_de` follows the TTS rule (numbers, years, times, abbreviations, and symbols spelled out); `validate` reports violations before any generation.
- Speech needs ComfyUI (`providers.audio: comfyui`) or imported takes; the mock provider writes silent takes with realistic lengths.
