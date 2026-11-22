# Retire the desktop review player

## Status

Accepted — 2026-11-22. Review happens only in the board from now on.
Supersedes [ADR 0022](0022-review-player.md); amends [ADR 0032](0032-web-review-rounds.md).

## Context

ADR 0022 added a Python desktop player (`scripts/review-player/`, `npm run cli -- review`) for frame-accurate notes.
ADR 0032 moved review into the board, with review rounds the agent answers, and kept the player as a second writer
of the same notes file. That second writer broke the review invariants: it took no lock and rewrote the notes file
from memory, so a board note or a round mark written while it was open was lost (G-17); it deleted sent notes (G-18);
it computed frames with `round` and the container fps where the board uses `floor` and the format fps (G-23). It also
brought its own uv environment with native wheels and a CI job.

## Decision

- **The board is the only writer of review notes.** The desktop player, its `review` command, its tests and its CI
  job are removed.
- **Notes the player left behind stay readable.** The board still accepts notes without an id and gives each one an
  id on its first write, so an older `review/notes/<video-stem>.json` goes out with the next round.

## Consequences

- G-17, G-18 and G-23 are closed: there is no second writer to hold to the invariants.
- Reviewing needs the board (`npm run cli -- board`), so a browser on the same computer.
- `npm run python:test` covers the audio-analysis helpers only.
