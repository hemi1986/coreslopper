---
status: accepted
date: 2026-11-21
---

# The board wizard may complete the setup stage

## Status

Accepted — 2026-11-21; accepted by the user on 2026-11-26. Amends [ADR 0030](0030-board-as-hub.md) ("the production view is read-only") and
[ADR 0033](0033-board-wizard.md).

## Context

ADR 0030 keeps the board's production view read-only: it derives everything from files and never changes a
project. The wizard of ADR 0033 came later and does the form part of setup on the board: project data, lyrics,
song, stem, and user references. Once they are in, it marks the `setup` stage done
(`finishSetup`, `packages/cli/src/board-wizard.ts:344`, behind `POST /api/new/video/<slug>/finish`, and for an
episode through `createEpisode`), so `/new-video <slug>` or `/new-episode <slug>` starts with the brief or the
script instead of asking for the same data again.

## Decision

- The board writes project state in exactly one case: the wizard completes the `setup` stage, after the same
  checks the setup skill relies on (for a music video, nothing listed as missing by `videoWizardState`).
- It writes through core's transition (`setStageDone`) and `saveState`, like the CLI. It never starts, fails,
  skips, or resets a stage and never records spend.
- The production view stays read-only, as ADR 0030 says.
- Everything else in a project's state is written by the CLI on behalf of the orchestrator, the setup skills,
  and the user.

## Consequences

The board becomes a second writer of `state.json` next to the CLI. `state.json` has no write lock, so a wizard
write and a parallel CLI write can overwrite each other; that question is open (HS-15 in
`docs/domain/events.yaml`).
