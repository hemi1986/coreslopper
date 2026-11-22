---
paths:
  - "packages/core/src/timing.ts"
  - "packages/core/src/lyrics.ts"
  - "packages/remotion/src/lib/timing.ts"
  - "packages/remotion/src/hooks/useTiming.ts"
  - "scripts/audio-analysis/**"
  - "workspace/.claude/skills/audio-analysis/SKILL.md"
---

# Timing (BC-Timing)

> Concept slice across core, cli, Python and Remotion. Adopted 2026-11-21, decided by recommendation plus four
> answers from the user; model in `docs/domain/events.yaml` (`AGG-ProjectTiming`, `AGG-Lyrics`), decisions in
> ADR 0039 (proposed), gaps G-49–G-68 in `docs/domain/gap-register.md`.

## Purpose

Turns the user's finished song and section-tagged lyrics into a measured timing, lets the user correct it with
timing overrides, and gives every later stage one effective timing to resolve anchors against.

## Key terms

Lyrics, Song Import, Stem, Lead Stem, Echo Span, Timing, Effective Timing, Timing Override, Timing Report,
Section, Line, Word, Beat, Downbeat, Onset, Energy, Anchor – defined in `docs/glossary.md`. Words in parentheses
are backing vocals, not directions. "Unwritten vocals" and "backing span" are spellings of Echo Span.

## As-is boundary

- `loadProject` merges `timing.json` with `timing.overrides.json` and runs `assertTiming` on every load
  (`packages/core/src/project.ts:237-241`, `timing.ts:61-165`); the renderer gets this merge as props.
- `analyze.py` writes `timing.json` and `timing.report.md` in the `audio-analysis` stage; the stage runner runs it
  through the skill. The contract is `schema/timing.schema.json`, generated from `TimingSchema` (`npm run schema`).
- `timing.overrides.json` is seeded empty by `new` and otherwise edited by hand; `validate` writes the snapshot
  `timing.effective.json`.
- `writeLyrics` (`packages/cli/src/board-wizard.ts:271`) checks and writes `lyrics.txt`; section ids come only
  from the Python parser (`timing_core.py:13-55`).

## Boundaries

- Never let a tool replace `timing.overrides.json`, `lyrics.txt`, or an imported vocal stem; add or change an
  override only at the user's request.
- Keep overrides to times: section and line start and end by id, word start and end by line and index, BPM,
  beats, downbeats. Structure comes from the lyrics.
- Change `TimingSchema` only together with `npm run schema` and the Python writer; Python reads no Zod.
- Resolve anchors only through `resolveAnchor` in core; keep the 0.05 s tolerance in one place.
- Do not add a second lookup (`sectionAt`, `beatAt`, `energyAt`); Remotion's copies are a gap (G-59).

## Typical pitfalls

- Running `analyze.py` without `--vocals` overwrites the imported `audio/stems/vocals.wav` (G-50).
- Run from `scripts/audio-analysis`, the analysis skips its schema check silently (G-52); a missing Demucs falls
  back to the mix (G-51).
- A line in parentheses becomes an untimed cue, and a leading `(…)` is dropped (G-49).
- An override of an unknown id makes every command that loads the project fail (G-54); `validate` needs a
  storyboard, so it fails during `audio-analysis` (G-53).
- An override moves a line but not its words, and nothing checks lines inside their section (G-55).
- `[Verse 1][Chorus][Verse 1][Verse 2]` gives `verse_3` for "Verse 2" (G-56).

## Read next

- `docs/glossary.md`, `docs/adr/0005-symbolic-timing-anchors.md`, `docs/adr/0008-local-audio-analysis.md`,
  `docs/adr/0039-song-timing.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `docs/architecture/data-model.md`, `scripts/audio-analysis/README.md`
