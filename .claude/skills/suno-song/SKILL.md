---
name: suno-song
description: Use when generating a song with Suno, importing an existing song, selecting between song variants, or collecting stems for audio analysis.
license: MIT
---

# Suno Song

## When to use

- The lyrics and style prompt are ready and the project needs `audio/song.wav`.
- The user wants to import a finished song instead of generating one.
- Suno stems are available and should be stored for vocal analysis.

## Inputs

- `lyrics.txt`, `suno-style.txt`
- `project.yaml` (budget and song provider)
- The Suno MCP server at `https://api.suno.com/mcp` (OAuth through Claude Code)
- `docs/glossary.md`

## Process

1. Read the lyrics and style prompt. Confirm the section tags and the target duration.
2. If `providers.song` is `suno` and the MCP server is available, generate `song.variants` variants (default 2; 1–4) with the same lyrics and style. Do not invent MCP tool names; use the tools the server exposes and follow their schema.
3. Score the variants on structure, energy, lyric fit, and style fit. Pick the best and record the scores and reasoning in `song.json`. If `song.pinned_variant` is set, respect it.
4. If Suno is unavailable or the user prefers an import, copy the source file to `audio/song.wav` (48 kHz WAV preferred), record source, artist, license, duration, and BPM in `song.json`.
5. Collect stems when the plan provides them. Store vocals at `audio/stems/vocals.wav` and any other stems beside it. If no stems exist, the audio-analysis stage will use Demucs.
6. Never commit the audio or stems. They are gitignored. Record the license and provenance.
7. Update the state with `npm run cli -- stage-done <project> song --outputs song.json,audio/song.wav`.

## Completion criteria

- `audio/song.wav` exists and plays.
- `song.json` records source, license, duration, BPM, variant choice, and stems status.
- The selected variant fits the brief and lyrics.
- No Suno or imported media is committed.
- The project budget was respected (Suno credits are recorded even when they are not USD).

## Common failures

- Generating more variants than the budget allows.
- Selecting a variant because it is louder, not because it fits the brief.
- Forgetting stems and forcing a Demucs pass later.
- Committing copyrighted audio to the open-source repo.
