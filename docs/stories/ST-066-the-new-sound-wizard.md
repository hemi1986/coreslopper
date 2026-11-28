---
id: ST-066
title: A wizard adds a library sound and sets its cue while it plays
type: task
ui: true
priority: must
size: null
risk: null
depends_on: [ST-064]
labels: [feature:asset-library]
feature: asset-library
status: ready
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Flow `FLOW-LibraryManagement` and `FLOW-SoundLibrary`,
commands `CMD-AddLibrarySound` and `CMD-UpdateLibrarySound` (existing routes `/api/upload/sounds` and
`/api/sounds/<id>`; no new route). Guidelines G6, G10. Same shape as the character wizard (ST-064), which brings the
**Bibliothek** group of the `#/new` chooser. A sound has no import path.

- **Entry:** **+ Neu** → **Sound**, or **+ Neu** in the head of the Sounds list (`#/new/sound`).
- **Step 1:** the sound file (required), title (required), use-when (required), tags → **Hochladen** / **Upload**
  creates the sound with its measured length and moves to `#/new/sound/<id>`.
- **Step 2:** the sound plays in a player; **Cue hier setzen** / **Set cue here** and the trim start and end are set
  from the playback position, as on the detail page today. Optional; **Weiter** / **Next** keeps what is set.
- **Step 3:** licence, source and credit, optional; an empty licence stays `unknown`, and the step says that the
  release check flags such a sound (ST-016). The last step links **Zum Sound** / **To the sound** (`#/sounds/<id>`).
- Reloading `#/new/sound/<id>` resumes with what is already set.
- **Rejected:** a missing file, title or use-when, an unreadable audio file, or an invalid cue or trim names its reason
  in its step and keeps what was typed.
- The Sounds list loses its inline upload form; its head gets **+ Neu**, and its empty state links it.

## Task
- The Sound card in the chooser's Library group.
- The sound wizard, routed as `#/new/sound[/<id>]`, reusing the existing sound routes.
- Remove the inline upload form from the Sounds view and add **+ Neu**.
- `docs/board.md`, both board guides and `docs/sound-library.md` (both languages) describe it.

## Acceptance Criteria
- [ ] The chooser's Library group has a Sound card that opens `#/new/sound` (test)
- [ ] Step 1 with a file, title and use-when creates the library sound and the address becomes `#/new/sound/<id>`
      (test with a fixture workspace)
- [ ] A cue and trim set in step 2 are stored on the sound (test)
- [ ] Step 3 without a licence leaves it `unknown` and shows the release-check note
- [ ] A step 1 without a file is refused with its reason and the typed fields keep their text
- [ ] The Sounds view has no inline upload form, and its **+ Neu** opens `#/new/sound`
