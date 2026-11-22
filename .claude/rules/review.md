---
paths:
  - "packages/core/src/review.ts"
  - "packages/cli/src/board-review.ts"
  - "packages/cli/src/board/review.js"
  - "workspace/.claude/skills/assembly-render/SKILL.md"
---

# Review (BC-Review)

> Concept slice across `core`, `cli`, and the fix pass instructions. Adopted
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
- The board writes notes and rounds under `review/.notes.lock` (`packages/cli/src/board-review.ts`); the agent
  writes replies only.
- `validate-file` and the workspace hook check replies; `status` prints a `Review:` line per open round.

## Boundaries

- Keep notes and rounds the user's: the agent writes only the replies file.
- Hold every writer of notes to the same invariants: sent notes unchanged, no lost write, frame =
  floor(seconds × format fps). The board is the only writer of notes (ADR 0050).
- A round is answered by a valid replies file that answers every note; counting open rounds goes through one
  function for the board and `status`.
- Keep the time, frame, and path logic in one place; it is copied today in `core/review.ts`
  and `board/review.js`.

## Typical pitfalls

- The `review/` folder also holds release and progress files; it is file layout, not this context.
- A note knows its render by file name only; a re-render under the same name moves it (G-29).
- Sending is two writes (round, then note marks) inside one lock (G-21).

## Read next

- `docs/glossary.md`, `docs/adr/0032-web-review-rounds.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
