---
id: ST-063
title: Select several library entries in a list and delete them at once
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-060, ST-061, ST-062]
labels: [feature:asset-library]
feature: asset-library
status: in-progress
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Flow `FLOW-LibraryManagement`. It uses the existing single
deletes and adds no command: `CMD-DeleteLibraryCharacter`, `CMD-DeleteLibrarySet`, `CMD-RemoveLibrarySound`
(`POST /api/library/<id>`, `/api/sets/<id>`, `/api/sounds/<id>` with `action: delete`). The productions keep their
copies; takes already copied into memes stay. Guidelines G4, G6.

- **Entry:** the Characters, Sets and Sounds lists (ST-060–ST-062). The job: clear out several entries in one go,
  typically after filtering **unused**.
- **Before acting:** every row has a checkbox; the header checkbox selects every row the current filters show. With
  at least one selected, a bar above the table says "<n> ausgewählt" / "<n> selected" with **Löschen** / **Delete**
  and **Auswahl aufheben** / **Clear selection**. The selection is not part of the hash; changing the filters keeps
  only the selected rows that are still shown.
- **Confirmation:** one dialog names the number of entries and, for every selected entry that is used, where (the
  production titles, for sounds the memes). It says that the productions keep their copies. **Abbrechen** / **Cancel**
  changes nothing.
- **Afterwards:** the board deletes the entries one after the other with the single delete, the delete button showing
  that it is working (ST-022). The list then reloads. If an entry is refused, the bar names it with the reason; the
  others stay deleted, and the refused one stays selected.

## Task
- Checkbox column, header checkbox and selection bar in all three lists, from one shared piece of list code.
- The confirmation dialog with the count and the uses, then sequential single deletes and a reload.
- Partial failure: the refused entries are listed with their reason and remain selected.
- `docs/board.md` and both board guides describe it.

## Acceptance Criteria
- [x] Selecting two characters and confirming deletes both and the list no longer shows them (test with a fixture
      workspace)
- [x] The confirmation names the productions that use a selected set (test)
- [x] **Cancel** in the confirmation deletes nothing (test)
- [x] When one of three deletes is refused, the other two are gone and the refused one is named with its reason and
      stays selected (test with a stubbed refusal)
- [x] The header checkbox selects only the rows the current filters show
