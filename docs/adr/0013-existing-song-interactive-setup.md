# Start every project from an existing song with an interactive setup

## Status

Accepted — 2026-11-09. Amends [ADR 0002](0002-autonomous-pipeline.md) for the first three stages.

## Context

The pipeline could write lyrics, generate the song through the Suno MCP server, or import a finished song. In practice every project imported a song, and the import path was the least guided one: the user copied files by hand, wrote `song.json` and the brief, and marked the `lyrics` and `song` stages as skipped. The Suno path added an MCP server, OAuth, onboarding flags, and a doctor check that nobody used.

A brief written autonomously from a title was also weak. The grilling that should shape it only happened if the user knew to ask for it.

## Decision

- Every project starts from a finished song. The `lyrics` and `song` stages, the `lyrics-writer` and `suno-song` skills, `suno-style.txt`, `providers.song`, the `song` config block, the Suno MCP server, and the related init and doctor options are removed.
- A new first stage, `setup`, is followed by `brief` and `treatment`. These three are **interactive stages** (`interactive: true` in `STAGES`). The `new-video` skill runs them with the user in the main session: project data, pasted lyrics with confirmed section tags, the song and vocal stem dropped at `audio/song.wav` and `audio/stems/vocals.wav`, then grilling into the brief and treatment.
- `npm run cli -- import-song` does the mechanical import: it uses the WAV files in place (converting another format with the same name), and merges path, duration, and stem status into `song.json`. The file locations are unchanged from earlier versions, so existing habits and projects keep working.
- `/video-next` refuses to run while an interactive stage is open and points to `/new-video <slug>`, which resumes where the project stands. From `audio-analysis` on, the pipeline stays autonomous as in ADR 0002.
- `migrateState` upgrades older `state.json` files: missing stages are added, `lyrics` and `song` are dropped, and a finished `song` stage marks `setup` as done.

## Consequences

- One guided path from an idea and a song to an autonomous run; no stage needs a manual `stage-skip`.
- The creative intent is fixed by the user before any paid generation starts.
- coreslopper can no longer produce a song. Users who want AI music generate it elsewhere and import it.
- Older project files may still contain `providers.song` or `song:`; the schema ignores those keys.
