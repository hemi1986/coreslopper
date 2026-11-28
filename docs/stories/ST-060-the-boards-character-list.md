---
id: ST-060
title: The board's Characters view is a searchable, filterable table
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
Feature `asset-library`, decided by the user on 2026-11-28. Read model `RM-CharacterLibrary` (**Character Library**
in `docs/glossary.md`, `_UI (de)_: Figuren`), flow `FLOW-LibraryManagement`. Guidelines G2, G4 (amended 2026-11-28:
library lists are tables with a cover thumbnail), G5, G6, G10. Pattern: the project list (ST-057,
`packages/cli/src/board/projects.js`).

- **Entry:** **Figuren** in the navigation (`#/characters`). Its one job is to find a library character and open it.
- **Before acting:** per row the cover (about 48 px, the initial as a placeholder), name, display rule, tags, number
  of images and states, voice yes/no, number of productions that use it, and origin ("manuell" or "aus <slug>").
- **Afterwards:** a click on a row opens `#/characters/<id>`, the detail page as it is today. Back returns to the
  list with its search and filters.
- The data comes from `/api/library` as today; no new server route. The list reads and never writes (deleting is
  ST-063, creating is ST-064).

## Task
- `#/characters` shows one table row per library character, sorted by name ascending. Clicking a column header
  (name, images, used in, origin) sorts by it; clicking it again reverses the order.
- **Search** over name, description and tags, case-insensitive substring, applied while typing.
- **Filters:** tag chips (every tag in the library; several tags combine with "or"), **unbenutzt** / **unused** (used
  in no production), and **Herkunft** / **Origin** (manual, or one production). The filters combine with "and".
- Search, filters and sort live in the hash, e.g. `#/characters?q=…&tag=…&unused=1&origin=…&sort=used&dir=desc`.
  Reload, Back and a pasted link restore them; unknown values are ignored.
- An unreadable entry is a row with its error, as the gallery shows it today.
- **Empty:** with no character, "Noch keine Figuren" / "No characters yet". With no match, "Keine Figur passt zu
  diesen Filtern" / "No character matches these filters" and **Filter zurücksetzen** / **Reset filters**.
- The list-state logic (parse, hash, match, sort) is shared with the Sets and Sounds lists (ST-061, ST-062) where
  they are the same; whoever builds the first of the three introduces it.
- `docs/board.md` and both board guides describe the list.

## Acceptance Criteria
- [x] The list shows every library character sorted by name, with cover, tags, image/state count, used-in count and
      origin (test with a fixture workspace)
- [x] Searching "MIRA" finds a character named "Mira" and one whose tags contain "mira" (test)
- [x] Filter **unused** shows exactly the characters no production names in `library` (test)
- [x] Filter tag `held` and origin `manual` together show only manual characters tagged `held` (test)
- [x] `#/characters?unused=1&sort=name&dir=desc` restores filter and sort after a reload
- [x] A filter with no match shows the no-match text, and **Reset filters** clears search and filters
- [x] An empty library shows "No characters yet"
