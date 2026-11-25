---
id: ST-018
title: The board's Sounds view
type: task
ui: true
priority: could
size: null
risk: null
depends_on: [ST-001, ST-002, ST-003, ST-006]
labels: [feature:meme]
status: in-progress
---

## Task
The second step of Q6: a board view "Sounds" (de: "Sounds") beside the character library, built on the same
commands as the CLI (the board owns no state, ADR 0049): upload a file with title and use when, listen, edit use
when, tags, cue, trim and licence, remove. The screen's one job: keep the library's descriptions right so the meme
skill picks well. Empty state: what a library sound is for and an upload. A rejected upload or edit names the reason
and keeps what was typed (as the character form does).

## Acceptance Criteria
- [ ] `#/sounds` lists every library sound with title, use when, tags, length, licence and "used in"; the board navigation links it
- [ ] Upload, edit and remove go through the commands of ST-001 to ST-003 and show their refusals
- [ ] A sound plays in the page; a cue can be set from the playback position
- [ ] The view speaks the browser's language (de, en) and passes the board's write guard
