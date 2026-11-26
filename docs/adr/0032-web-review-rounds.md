---
status: accepted
date: 2026-11-21
---

# Review in the board, and review rounds the agent answers

## Status

Accepted — 2026-11-21. Amends [ADR 0022](0022-review-player.md); extends [ADR 0030](0030-board-as-hub.md).

## Context

ADR 0022 put frame-accurate review notes into a desktop player and rejected a browser page for losing frame accuracy on seeking. Since then the board became the workspace's page, and the hand-back of notes still ran through chat: the user told Claude Code "work through my notes", and nothing recorded which notes the agent had seen, which it fixed, and which it could not.

Browsers now report the presented frame (`requestVideoFrameCallback`), and a seek to the middle of a frame, `(frame + 0.5) / fps`, lands on that frame in every decoder: a frame's position no longer depends on rounding at its edge.

## Decision

- **The board has a review view** per project: the renders with a player, frame and second steps on the keyboard, a timeline of the song's sections, the storyboard's shots, and the notes, and jumps to the previous or next shot and note. A note sits on a frame or on a range (start and end). The frame shown at time `t` is `floor(t × fps)`; the fps comes from the render's format.
- **Notes stay in the desktop player's format**, `review/notes/<video-stem>.json`, with optional fields: `id`, a range (`end_frame`, `end_seconds`, `end_time`), `round`, and `created`. Both players read and write the same files; the desktop player stays for a release as a fallback.
- **Sending is a review round.** One click sends the render's draft notes: the board freezes them into `review/rounds/<NNN>.json` with each note's id, frames, the shots on screen (a note on a cut belongs to both shots), and its section, and marks the notes with the round. A sent note cannot change; a new note goes into the next round.
- **The agent answers in a separate file**, `review/rounds/<NNN>.replies.json`: per note `fixed`, `partly`, `not-fixed`, or `question`, a short reply, and the render that shows the fixes. Its existence closes the round. The validation hook checks that it answers every note of its round and no other. The user's files (notes and rounds) are never written by the agent.
- **`/video-next` answers open rounds first**, one `review-fix` runner per round following `assembly-render`; `status` prints a `Review:` line for each open round, and the board's next step for such a project is `/video-next`. A fixed project's `qa-export` is reset so QA and the release are built again from the fixed renders.

## Alternatives considered

- **Keep notes in chat.** No record of what was asked and answered; a long chat loses the exact frames.
- **One notes file with a status per note.** The desktop player rewrites its file from memory and would drop the statuses; a round file is also the exact list the agent worked on, unchanged by later notes.
- **The agent edits the notes.** Notes are the user's words; a separate reply keeps them intact and shows both side by side.
- **Start Claude Code from the board on "send".** The user starts sessions (ADR 0030).

## Consequences

- Review rounds are new project files under `review/rounds/`; the JSON schemas are `review-notes`, `review-round`, and `review-replies`.
- Notes on a Short or a `--frames` render still refer to that file's frames; the fix pass offsets them before mapping to the song.
- The board shows shots only when the storyboard validates; otherwise the timeline shows the sections alone and says why.
