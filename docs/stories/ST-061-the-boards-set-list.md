---
id: ST-061
title: The board's Sets view is a searchable, filterable table
type: task
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [feature:asset-library]
feature: asset-library
status: ready
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Read model `RM-SetLibrary` (**Set Library** in
`docs/glossary.md`, `_UI (de)_: Sets`), flow `FLOW-LibraryManagement`. Guidelines G2, G4 (amended 2026-11-28), G5,
G6, G10. Same pattern as the Characters list (ST-060) and the project list (ST-057).

- **Entry:** **Sets** in the navigation (`#/sets`). Its one job is to find a library set and open it.
- **Before acting:** per row the cover (the first plate, else the first reference; a placeholder otherwise), name,
  tags, number of references and plates, number of productions that use it, and origin.
- **Afterwards:** a click on a row opens `#/sets/<id>`, the detail page as it is today. Back keeps the list state.
- The data comes from `/api/sets` as today; no new server route. The list reads and never writes.

## Task
- `#/sets` shows one table row per library set, sorted by name ascending. Clicking a column header (name, references,
  plates, used in, origin) sorts by it; clicking it again reverses the order.
- **Search** over name, description and tags, case-insensitive substring, applied while typing.
- **Filters:** tag chips (combined with "or"), **unbenutzt** / **unused**, and **Herkunft** / **Origin**. The filters
  combine with "and".
- Search, filters and sort live in the hash (`#/sets?q=…&tag=…&unused=1&origin=…&sort=…&dir=…`). Reload, Back and a
  pasted link restore them; unknown values are ignored.
- An unreadable entry is a row with its error.
- **Empty:** "Noch keine Sets" / "No sets yet"; with no match, "Kein Set passt zu diesen Filtern" / "No set matches
  these filters" and **Filter zurücksetzen** / **Reset filters**.
- Uses the shared list-state logic of ST-060 where it is the same.
- `docs/board.md` and both board guides describe the list.

## Acceptance Criteria
- [ ] The list shows every library set sorted by name, with cover, tags, reference/plate counts, used-in count and
      origin (test with a fixture workspace)
- [ ] Searching "wald" finds a set whose description mentions "Wald" (test)
- [ ] Filter **unused** shows exactly the sets no production names in `library` (test)
- [ ] Filter origin `<slug>` shows only the sets imported from that production (test)
- [ ] `#/sets?tag=nacht&sort=plates&dir=desc` restores filter and sort after a reload
- [ ] A filter with no match shows the no-match text, and **Reset filters** clears search and filters
- [ ] An empty library shows "No sets yet"
