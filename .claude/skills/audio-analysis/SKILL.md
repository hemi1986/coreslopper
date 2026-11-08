---
name: audio-analysis
description: Use after the song exists to produce timing.json with BPM, beats, downbeats, onsets, energy, sections, lyric lines, and word timestamps, then inspect the confidence report.
license: MIT
---

# Audio Analysis

## When to use

- `audio/song.wav` exists and the storyboard needs timing.
- The song changed, the edit changed, or section boundaries feel wrong.
- A user needs to correct a specific line or word timing through `timing.overrides.json`.

## Inputs

- `audio/song.wav` (or an imported song)
- `audio/stems/vocals.wav` when Suno stems exist
- `lyrics.txt` — the authoritative text and section tags
- `timing.overrides.json` — user-owned corrections; never overwrite it

## Process

1. Ensure the Python environment is installed:
   `cd scripts/audio-analysis && uv sync`
   For real word alignment and Demucs stems, install both extras:
   `uv sync --extra asr --extra stems`
2. Run the analyzer from the repository root:
   `cd scripts/audio-analysis && uv run python analyze.py --project ../../projects/<slug>`
   Pass `--vocals ../../projects/<slug>/audio/stems/vocals.wav` when a stem exists. Pass `--device cuda` on the RTX machine.
   Use the vocal stem when one exists (`--vocals ../../projects/<slug>/audio/stems/vocals.wav`). Make sure `song.json` has `language`; pass `--language` otherwise. The analyzer aligns lyrics first: text and order come from `lyrics.txt`, ASR supplies only timestamps, and section boundaries are derived from the aligned lines.
3. Read `timing.report.md`. Check the section table, low-confidence boundaries, low-confidence lines (`meta.lineConfidence` < 0.6), and lines placed without an ASR anchor. Prefer lines ≥ 0.8 for lip-sync.
4. If a boundary or word is wrong, edit `timing.overrides.json`. The loader merges it over `timing.json` and never writes it. Do not edit `timing.json` by hand unless the analysis is fundamentally wrong.
5. Validate with `npm run cli -- validate projects/<slug>`. This writes `timing.effective.json` and resolves the storyboard.
6. Update the state with `npm run cli -- stage-done <project> audio-analysis --outputs timing.json,timing.report.md`.

## Completion criteria

- `timing.json` validates against `schema/timing.schema.json`.
- Sections start at 0, end at the song duration, and have no gaps or overlaps.
- Lines and words lie inside the song and inside their sections.
- Low-confidence boundaries are either acceptable or corrected in overrides.
- `timing.overrides.json` was not overwritten.

## Notes

- Use `--skip-asr` only for fixtures and motion-only demos. A real lyric video needs WhisperX word alignment.
- The script writes only `timing.json` and `timing.report.md`; the TypeScript resolver owns the override merge.
- If Demucs or WhisperX is missing, stop and install the extra rather than silently trusting the mix.
