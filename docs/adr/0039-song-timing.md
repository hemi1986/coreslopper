---
status: proposed
date: 2026-11-21
---

# Song timing: one effective timing, overrides that move times, a Python analysis behind a schema

## Status

Proposed — 2026-11-21. Records decisions already in the code; amends
[ADR 0005](0005-symbolic-timing-anchors.md) (word anchors carry an edge too) and
[ADR 0008](0008-local-audio-analysis.md) (models, fallbacks, the user's vocal stem, backing vocals). The adoption
of the timing slice recovered it. The user answered four questions about how they work and has not reviewed the
code.

## Context

ADR 0005 makes shot boundaries symbolic anchors resolved against effective timing. ADR 0008 makes the analysis
local: Demucs, WhisperX, and librosa, with the lyrics text winning over speech recognition. Neither ADR says
where the merge happens, what an override may change, how section ids come about, which models and fallbacks
the analysis uses, or what happens to a vocal stem the user imported. The code answers each of these, and the
skill, the glossary, and the code partly disagree (`docs/domain/adoption-report.md`, timing).

## Decision

- **One effective timing, made on load.** `loadProject` merges `timing.json` with `timing.overrides.json` and
  checks the whole result on every load (`packages/core/src/project.ts`, `timing.ts`). Every command and the
  renderer read this merge. `timing.effective.json` is a snapshot that `validate` writes for agents and scripts,
  not a second source.
- **One check for the whole timing.** Sections cover the audio from 0 to its duration without gaps or overlaps.
  Lines lie inside their section and words inside their line, in order. Beats, downbeats, and onsets lie inside
  the audio. Every check uses one tolerance, 0.05 s.
- **Overrides move times, nothing else.** An override replaces BPM, beats, or downbeats, or the start and end
  of a section or line (by id) or of a word (by line and index). To change the sections, change the lyrics and
  analyze again. An override that misses its target is reported by name. The agent enters overrides at the
  user's request. No tool replaces or regenerates the file.
- **Anchors.** Section, line, and word anchors take an edge (`start` or `end`) and an offset. Beat and downbeat
  anchors are points with an offset. A `time` anchor is allowed and warned about. A result outside the audio by
  more than the tolerance is an error; within the tolerance it is clamped.
- **Section ids come from the tag text.** `[Verse 2]` is `verse_2`. A repeated unnumbered tag is numbered in
  order. Intro, outro, bridge, instrumental, and break keep their bare name. Line ids are positional (`l1…ln`).
- **The analysis is Python behind the generated schema.** `scripts/audio-analysis/analyze.py` runs through `uv`
  and validates its output against `schema/timing.schema.json`, which is generated from Zod (ADR 0004).
  Models: Demucs `htdemucs_ft`, WhisperX `large-v3` (float16 on CUDA, int8 on CPU), the MelBand-Roformer
  karaoke checkpoint for the lead stem (ADR 0026). The analysis assumes 4/4 for downbeats. It flags boundaries
  below 0.7 and lines below 0.6 in the timing report.
- **The user's vocal stem is analyzed, never replaced.** When `song.json` names an imported stem, the analysis
  uses it. Vocal separation runs only when no stem was imported. A missing model stops the analysis. The mix or
  energy-based sections are used only when that is asked for, and the report says so.
- **Words in parentheses are backing vocals.** They are sung, timed like any other word, and silenced in a
  lip-sync segment. Only a leading `(Spoken)` marks a spoken line.

## Consequences

- Several of these rules are ahead of the code. Today the analysis turns parenthesized lines into untimed cues.
  It falls back silently and skips its schema check
  when run from its own directory. Section ids drift from the tag text, and the timing check skips lines inside
  sections. An unknown override breaks every command, and `validate` needs a storyboard. Gaps G-49 and later in
  `docs/domain/gap-register.md`.
- The lyrics rules live twice, in `packages/core/src/lyrics.ts` and in the Python parser. Remotion keeps its own
  timing lookups, and `song.json` has no schema. These are gaps, not decisions.
- The alignment constants (similarity, word length, window padding, echo-scan thresholds) stay in code; they
  are tuning, not decisions.
