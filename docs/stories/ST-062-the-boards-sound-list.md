---
id: ST-062
title: The board's Sounds view is a searchable, filterable table with playback
type: task
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [feature:asset-library]
feature: asset-library
status: in-progress
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Read model `RM-SoundLibrary` (**Sound Library** in
`docs/glossary.md`, `_UI (de)_: Sounds`), flow `FLOW-LibraryManagement`. Guidelines G2, G4 (amended 2026-11-28), G5,
G6, G10. Same pattern as the Characters list (ST-060). A sound has no origin; the licence filter takes its place
(ST-016: the release check flags sounds of unknown licence).

- **Entry:** **Sounds** in the navigation (`#/sounds`). Its one job is to find a library sound, hear it and open it.
- **Before acting:** per row a play button, title, use-when (one line, clamped), length (trimmed), licence, tags, and
  number of memes that use it.
- **Afterwards:** the play button plays the trimmed sound in the row without leaving the list; a second click
  stops it, and starting another row stops the first. A click elsewhere on the row opens `#/sounds/<id>`, the detail
  page as it is today. Back keeps the list state.
- The data comes from `/api/sounds` and `/sound-files/<id>/sound.wav` as today; no new server route.

## Task
- `#/sounds` shows one table row per library sound, sorted by title ascending. Clicking a column header (title,
  length, licence, used in) sorts by it; clicking it again reverses the order.
- **Search** over title, use-when and tags, case-insensitive substring, applied while typing.
- **Filters:** tag chips (combined with "or"), **unbenutzt** / **unused** (no meme took it), and **Lizenz** /
  **Licence** (each licence value in the library, `unknown` among them). The filters combine with "and".
- Search, filters and sort live in the hash (`#/sounds?q=…&tag=…&unused=1&licence=unknown&sort=…&dir=…`). Reload,
  Back and a pasted link restore them; unknown values are ignored.
- An unreadable entry is a row with its error.
- **Empty:** "Noch keine Sounds" / "No sounds yet"; with no match, "Kein Sound passt zu diesen Filtern" / "No sound
  matches these filters" and **Filter zurücksetzen** / **Reset filters**.
- Uses the shared list-state logic of ST-060 where it is the same.
- `docs/board.md`, both board guides and `docs/sound-library.md` (both languages) describe the list.

## Acceptance Criteria
- [x] The list shows every library sound sorted by title, with length, licence, tags and used-in count (test with a
      fixture workspace)
- [x] Searching "applaus" finds a sound whose use-when mentions "Applaus" (test)
- [x] Filter licence `unknown` shows exactly the sounds of unknown licence (test)
- [x] Filter **unused** shows exactly the sounds no meme took (test)
- [x] The play button plays the sound in the row; starting another row stops the first
- [x] `#/sounds?licence=unknown&sort=length&dir=desc` restores filter and sort after a reload
- [x] A filter with no match shows the no-match text and **Reset filters**; an empty library shows "No sounds yet"
