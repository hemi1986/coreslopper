# Storyboard timings use symbolic anchors resolved from timing.json

**Status:** Accepted

## Context

Hard-coded seconds break when the song is regenerated, the mix changes, or the analysis is corrected. The storyboard must remain an editable creative document while staying locked to the audio.

## Decision

Shot boundaries are symbolic anchors: `section`, `line`, `word`, `beat`, `downbeat`, or an explicit `time` escape hatch. Section and line anchors carry an edge (`start` or `end`); the others are points. A resolver maps anchors to seconds using effective timing (`timing.json` merged with `timing.overrides.json`). Validation rejects unresolved anchors, gaps, overlaps, and incomplete coverage.

## Consequences

- Re-running analysis or swapping a song version re-times the storyboard automatically.
- The YAML is slightly less readable; `storyboard.md` renders resolved seconds for humans.
- The explicit `time` anchor is available but discouraged and flagged in review.
