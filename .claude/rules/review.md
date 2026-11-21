---
paths:
  - "packages/core/src/review.ts"
  - "packages/cli/src/board-review.ts"
  - "packages/cli/src/board/review.js"
  - "packages/cli/src/review.ts"
  - "scripts/review-player/**"
  - "workspace/.claude/skills/assembly-render/SKILL.md"
---

# Review (BC-Review)

> Concept slice across `core`, `cli`, the Python desktop player, and the fix pass instructions. Adopted
> 2026-11-21; model in `docs/domain/events.yaml` (`AGG-ProjectReview`), gaps G-17–G-31 in
> `docs/domain/gap-register.md`.

## Purpose

The user's frame-accurate notes on a render, sent to the agent in numbered review rounds and answered note by
note in a fix pass. The art director's verdicts are a different concept that shares the word.

## Key terms

Review Note (draft note, sent), Review Round (open, answered), Fix Pass, reply status (`fixed`, `partly`,
`not-fixed`, `question`) – defined in `docs/glossary.md`. The verb is *send*.

## As-is boundary

- `projects/<slug>/review/`: `notes/<video-stem>.json` per render, `rounds/<NNN>.json` frozen on send,
  `rounds/<NNN>.replies.json` from the fix pass. Schemas in `packages/core/src/schema.ts`, pure helpers in
  `packages/core/src/review.ts`.
- The board writes notes and rounds under `review/.notes.lock` (`packages/cli/src/board-review.ts`); the desktop
  player (`scripts/review-player/`) writes notes without it; the agent writes replies only.
- `validate-file` and the workspace hook check replies; `status` prints a `Review:` line per open round.

## Boundaries

- Keep notes and rounds the user's: the agent writes only the replies file.
- Hold every writer of notes to the same invariants: sent notes unchanged, no lost write, frame =
  floor(seconds × format fps). The desktop player is a fallback writer today breaking them (G-17, G-18, G-23).
- A round is answered by a valid replies file that answers every note; counting open rounds goes through one
  function for the board and `status`.
- Keep the time, frame, and path logic in one place; it is copied today in `core/review.ts`,
  `board/review.js`, and `review_notes.py`.

## Typical pitfalls

- The `review/` folder also holds release and progress files; it is file layout, not this context.
- A note knows its render by file name only; a re-render under the same name moves it (G-29).
- Sending is two writes (round, then note marks) inside one lock (G-21).
- The Python player has its own tests (`npm run python:test`), outside Vitest.

## Read next

- `docs/glossary.md`, `docs/adr/0022-review-player.md`, `docs/adr/0032-web-review-rounds.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
